import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy import select
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from app.config import settings
from app.agent.state import AgentState
from app.agent.traits.schema import TurnExtractionResult
from app.agent.traits.catalog import SEED_TRAITS
from app.db.session import AsyncSessionLocal
from app.db.models import UserTraitScore, TraitObservation, TraitCatalog


EXTRACTION_SYSTEM_PROMPT = """You are an expert psychological and behavioral trait profiler.
Your task is to analyze the user's latest statement in the conversation and identify if it provides concrete behavioral evidence for ANY of the following personality traits:

{trait_rubrics}

SCORING RULES:
1. ONLY extract a trait if the user's statement provides genuine, observable evidence of their behavior, choices, or clear preferences. Do NOT make wild guesses from superficial greetings.
2. For each extracted trait:
   - Provide the exact `trait_id` from the list.
   - Assign an `observed_score` on that trait's specific scale (e.g., 1.0 to 7.0, or 1.0 to 5.0). Use the low/high anchor definitions strictly.
   - Quote the exact user excerpt in `quote`.
   - Provide a concise `reasoning` trace explaining why this score matches the anchor.
   - Assign `confidence_delta` between 0.1 and 0.25 based on how direct the evidence is.
3. If no trait evidence is found, return an empty observations list.
"""


def _format_rubrics() -> str:
    lines = []
    for t in SEED_TRAITS:
        lines.append(f"- ID: '{t['id']}' | {t['name']} (Scale: {t['scale_min']}-{t['scale_max']}). 1 Anchor: {t['low_anchor']}. Top Anchor: {t['high_anchor']}.")
    return "\n".join(lines)


async def run_trait_extraction(user_id: str, thread_id: Optional[str], user_message: str, ai_response: str) -> TurnExtractionResult:
    """Analyzes a single user-AI exchange for trait signals and persists observations to PostgreSQL."""
    if not settings.OPENAI_API_KEY:
        # Mock/Rule-based sample extraction for local testing without active API key
        return TurnExtractionResult(observations=[])

    try:
        llm = ChatOpenAI(
            model=settings.DEFAULT_EXTRACTOR_MODEL,
            api_key=settings.OPENAI_API_KEY,
            temperature=0.0
        )
        extractor = llm.with_structured_output(TurnExtractionResult)

        prompt_text = (
            f"User statement: \"{user_message}\"\n"
            f"AI response: \"{ai_response}\"\n\n"
            "Analyze the user's statement for trait signals:"
        )

        result: TurnExtractionResult = await extractor.ainvoke([
            SystemMessage(content=EXTRACTION_SYSTEM_PROMPT.format(trait_rubrics=_format_rubrics())),
            HumanMessage(content=prompt_text)
        ])

        # Persist extracted observations to PostgreSQL
        if result and result.observations:
            await persist_extracted_observations(user_id, thread_id, result)

        return result
    except Exception as e:
        print(f"Error during trait extraction: {e}")
        return TurnExtractionResult(observations=[])


async def persist_extracted_observations(user_id: str, thread_id: Optional[str], result: TurnExtractionResult):
    """Saves observations and updates user trait scores in PostgreSQL."""
    async with AsyncSessionLocal() as session:
        for obs in result.observations:
            # 1. Add Observation record
            observation_record = TraitObservation(
                user_id=user_id,
                trait_id=obs.trait_id,
                thread_id=thread_id,
                observed_score=obs.observed_score,
                quote=obs.quote,
                reasoning=obs.reasoning,
                created_at=datetime.datetime.utcnow()
            )
            session.add(observation_record)

            # 2. Update or insert UserTraitScore
            score_stmt = select(UserTraitScore).where(
                UserTraitScore.user_id == user_id,
                UserTraitScore.trait_id == obs.trait_id
            )
            existing = (await session.execute(score_stmt)).scalars().first()

            if existing:
                count = existing.observation_count
                new_count = count + 1
                # Weighted moving average
                existing.score = round(((existing.score * count) + obs.observed_score) / new_count, 2)
                existing.confidence = min(0.95, round(existing.confidence + obs.confidence_delta, 2))
                existing.observation_count = new_count
                existing.last_updated = datetime.datetime.utcnow()
            else:
                new_score = UserTraitScore(
                    user_id=user_id,
                    trait_id=obs.trait_id,
                    score=round(obs.observed_score, 2),
                    confidence=min(0.95, round(obs.confidence_delta, 2)),
                    observation_count=1,
                    last_updated=datetime.datetime.utcnow()
                )
                session.add(new_score)

        await session.commit()
