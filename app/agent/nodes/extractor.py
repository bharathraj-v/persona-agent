import logging
import datetime
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from sqlalchemy import select
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import settings
from app.agent.state import AgentState, TargetedTrait
from app.agent.prompts.loader import load_prompt
from app.db.session import AsyncSessionLocal
from app.db.models import UserTraitScore, TraitObservation

logger = logging.getLogger(__name__)


class SingleTraitEvaluation(BaseModel):
    has_sufficient_evidence: bool = Field(
        ...,
        description="True if the user's latest statement provides concrete, observable behavioral evidence on the targeted trait."
    )
    observed_score: Optional[float] = Field(
        None,
        description="Estimated score on the trait's scale (e.g. 1.0 to 7.0). Must align strictly with the low and high anchors."
    )
    confidence_delta: float = Field(
        0.2,
        description="Confidence gain for this turn, typically between 0.15 and 0.30."
    )
    quote: Optional[str] = Field(
        None,
        description="Exact verbatim user excerpt demonstrating this tendency."
    )
    reasoning: Optional[str] = Field(
        None,
        description="Concise deduction linking the quote to the specific score on the anchor rubric."
    )


async def evaluate_and_extract_trait(state: AgentState) -> Dict[str, Any]:
    """
    Stage 4 Subagent: Inspects the conversation so far on the currently targeted trait.
    If sufficient evidence is present, extracts the score, quote, and reasoning,
    persists to PostgreSQL, and clears current_target_trait so the next turn selects a new trait.
    """
    target = state.get("current_target_trait")
    if not target:
        return {}

    user_id = state.get("user_id", "default_user")
    thread_id = state.get("thread_id")
    messages = state.get("messages", [])

    human_messages = [m for m in messages if isinstance(m, HumanMessage)]
    if not human_messages:
        return {}

    latest_user_msg = str(human_messages[-1].content).strip()
    if len(latest_user_msg.split()) < 2:
        # Too brief (e.g. single word greeting) to provide reliable trait evidence
        return {}

    api_key = settings.get_gemini_key()
    if not api_key:
        return {}

    try:
        extraction_template = load_prompt("extraction.md")
    except Exception:
        extraction_template = (
            "Analyze whether the user's latest message provides concrete behavioral evidence for '{name}'."
        )

    system_prompt = extraction_template.format(
        trait_id=target.get("trait_id", ""),
        name=target.get("name", ""),
        domain=target.get("domain", ""),
        scale_min=target.get("scale_min", 1.0),
        scale_max=target.get("scale_max", 7.0),
        low_anchor=target.get("low_anchor", ""),
        high_anchor=target.get("high_anchor", "")
    )

    # Format last 4 turns for context
    convo_window = []
    for m in messages[-4:]:
        role = "User" if isinstance(m, HumanMessage) else "Aura"
        if m.content:
            text = m.content if isinstance(m.content, str) else str(m.content)
            convo_window.append(f"{role}: {text}")
    convo_context = "\n".join(convo_window)

    user_prompt = (
        f"--- CONVERSATION CONTEXT ---\n{convo_context}\n\n"
        f"--- TARGETED TRAIT ---\n"
        f"Trait: {target.get('name')} (Spectrum: '{target.get('low_anchor')}' vs '{target.get('high_anchor')}')\n\n"
        f"Latest User Statement to Evaluate: \"{latest_user_msg}\"\n\n"
        "Did the user provide sufficient concrete evidence on this trait?"
    )

    try:
        llm = ChatGoogleGenerativeAI(
            model=settings.DEFAULT_EXTRACTOR_MODEL,
            google_api_key=api_key,
            temperature=0.0
        )
        subagent = llm.with_structured_output(SingleTraitEvaluation)
        eval_result: SingleTraitEvaluation = await subagent.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ], config={"tags": ["trait_extractor"]})

        if eval_result and eval_result.has_sufficient_evidence and eval_result.observed_score is not None:
            # Bound observed score within scale
            min_s = float(target.get("scale_min", 1.0))
            max_s = float(target.get("scale_max", 7.0))
            bounded_score = max(min_s, min(max_s, float(eval_result.observed_score)))
            quote = eval_result.quote or latest_user_msg
            reasoning = eval_result.reasoning or "Direct behavioral signal observed."
            conf_delta = max(0.1, min(0.35, float(eval_result.confidence_delta)))

            # Persist to database
            final_conf, final_score = await persist_single_observation(
                user_id=user_id,
                thread_id=thread_id,
                trait_id=target["trait_id"],
                observed_score=bounded_score,
                confidence_delta=conf_delta,
                quote=quote,
                reasoning=reasoning
            )

            logger.info(
                f"[Trait Profiler] Extracted '{target['trait_id']}': score={bounded_score:.1f}, "
                f"conf={final_conf:.2f} | quote='{quote[:40]}...'"
            )

            trait_insight = {
                "trait_id": target["trait_id"],
                "name": target["name"],
                "domain": target["domain"],
                "score": final_score,
                "confidence": final_conf,
                "quote": quote,
                "reasoning": reasoning,
                "low_anchor": target.get("low_anchor", ""),
                "high_anchor": target.get("high_anchor", ""),
                "scale_min": min_s,
                "scale_max": max_s
            }

            # Return insight and clear current_target_trait so next turn selects a different trait!
            return {
                "latest_extracted_trait": trait_insight,
                "current_target_trait": None,
                "trait_turns_count": 0
            }

        return {}

    except Exception as e:
        logger.warning(f"[Trait Profiler] Evaluation fallback: {e}")
        return {}


async def persist_single_observation(
    user_id: str,
    thread_id: Optional[str],
    trait_id: str,
    observed_score: float,
    confidence_delta: float,
    quote: str,
    reasoning: str
) -> tuple[float, float]:
    """Persists a single trait observation and updates user's score in PostgreSQL. Returns (new_confidence, new_score)."""
    async with AsyncSessionLocal() as session:
        # 1. Add Observation record
        obs = TraitObservation(
            user_id=user_id,
            trait_id=trait_id,
            thread_id=thread_id,
            observed_score=observed_score,
            quote=quote,
            reasoning=reasoning,
            created_at=datetime.datetime.utcnow()
        )
        session.add(obs)

        # 2. Update or insert UserTraitScore
        stmt = select(UserTraitScore).where(
            UserTraitScore.user_id == user_id,
            UserTraitScore.trait_id == trait_id
        )
        existing = (await session.execute(stmt)).scalars().first()

        if existing:
            count = existing.observation_count
            new_count = count + 1
            new_score = round(((existing.score * count) + observed_score) / new_count, 2)
            new_conf = min(0.95, round(existing.confidence + confidence_delta, 2))
            existing.score = new_score
            existing.confidence = new_conf
            existing.observation_count = new_count
            existing.last_updated = datetime.datetime.utcnow()
        else:
            new_score = round(observed_score, 2)
            new_conf = min(0.95, round(confidence_delta, 2))
            record = UserTraitScore(
                user_id=user_id,
                trait_id=trait_id,
                score=new_score,
                confidence=new_conf,
                observation_count=1,
                last_updated=datetime.datetime.utcnow()
            )
            session.add(record)

        await session.commit()
        return (new_conf, new_score)
