import logging
from typing import Dict, Any, List, Literal, Optional
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import settings
from app.agent.state import AgentState
from app.agent.personas.registry import PERSONA_REGISTRY

logger = logging.getLogger(__name__)

# Discovery window: the persona must be frozen by this user turn at the latest.
MAX_DISCOVERY_TURNS = 3
# Freeze early once the model is at least this confident in a single archetype.
LOCK_CONFIDENCE = 0.75
# Skip the LLM call for messages too short to carry style signal (e.g. "hi").
MIN_WORDS_FOR_ASSESSMENT = 3

PersonaId = Literal[
    "curious_banter",
    "pragmatic_mentor",
    "empathetic_confidant",
    "analytical_challenger",
]

PROFILER_PROMPT = """You are a conversation-style profiler. Your job is to decide which conversational archetype fits the user best, based only on how they write and what they talk about.

Archetypes:
- curious_banter (Leo): playful humor, casual slang, witty banter, high-energy chat.
- pragmatic_mentor (Marcus): grounded, practical, wants candid advice and calm directness.
- empathetic_confidant (Maya): shares feelings, stress or vulnerability; responds to warmth and validation.
- analytical_challenger (Zane): enjoys debating ideas, dissecting logic, challenging assumptions.

Rules:
- Always return the single best-fitting archetype, even when evidence is weak.
- `confidence` is 0.0-1.0. Use 0.75+ only when the user's messages show a clear, consistent signal. A greeting or one ambiguous message is below 0.5.
- Weigh all user messages, not just the latest one.
- `reasoning` is one short sentence citing the observed signal."""


class PersonaAssessment(BaseModel):
    persona_id: PersonaId = Field(..., description="Best-fitting archetype ID.")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in this archetype, 0.0 to 1.0.")
    reasoning: str = Field(..., description="One short sentence citing the observed signal.")


def should_freeze(confidence: Optional[float], turn_count: int) -> bool:
    """Freeze on a confident assessment, or unconditionally once the discovery window ends."""
    if turn_count >= MAX_DISCOVERY_TURNS:
        return True
    return confidence is not None and confidence >= LOCK_CONFIDENCE


def heuristic_persona(style: Optional[Dict[str, Any]]) -> str:
    """Deterministic fallback used when the LLM is unavailable at the end of the discovery window."""
    style = style if isinstance(style, dict) else {}
    if style.get("slang_level") in ("casual", "heavy") or style.get("energy") in ("playful", "upbeat"):
        return "curious_banter"
    return "pragmatic_mentor"


def _build_transcript(messages: List[Any], limit: int = 6) -> str:
    lines = []
    for m in messages:
        if isinstance(m, HumanMessage):
            lines.append(f"User: {m.content}")
        elif isinstance(m, AIMessage) and isinstance(m.content, str) and m.content.strip():
            lines.append(f"Aura: {m.content}")
    return "\n".join(lines[-limit:])


async def _assess(state: AgentState, api_key: str) -> Optional[PersonaAssessment]:
    messages = state.get("messages", [])
    style = state.get("user_style") or {}
    user_prompt = (
        f"--- CONVERSATION SO FAR ---\n{_build_transcript(messages)}\n\n"
        f"--- SURFACE STYLE SIGNALS (latest message) ---\n{style}\n\n"
        "Which archetype fits this user best?"
    )
    llm = ChatGoogleGenerativeAI(
        model=settings.DEFAULT_PERSONA_MODEL,
        google_api_key=api_key,
        temperature=0.0,
    )
    return await llm.with_structured_output(PersonaAssessment).ainvoke(
        [SystemMessage(content=PROFILER_PROMPT), HumanMessage(content=user_prompt)],
        config={"tags": ["persona_profiler"]},
    )


async def profile_and_freeze_persona(state: AgentState) -> Dict[str, Any]:
    """
    Discovery-phase node. While the persona is unlocked, assesses the user's
    conversational style with an LLM and freezes the archetype once confident,
    or at turn MAX_DISCOVERY_TURNS at the latest. No-op once the persona is locked.
    """
    if state.get("persona_locked"):
        return {}

    messages = state.get("messages", [])
    human_messages = [m for m in messages if isinstance(m, HumanMessage)]
    if not human_messages:
        return {}
    turn_count = len(human_messages)
    latest_words = len(str(human_messages[-1].content).split())

    assessment: Optional[PersonaAssessment] = None
    api_key = settings.get_gemini_key()
    if api_key and (latest_words >= MIN_WORDS_FOR_ASSESSMENT or turn_count >= MAX_DISCOVERY_TURNS):
        try:
            assessment = await _assess(state, api_key)
        except Exception as e:
            logger.warning(f"[Persona Profiler] Assessment failed: {e}")

    chosen: Optional[str] = None
    confidence: Optional[float] = None
    reasoning = ""
    if assessment and assessment.persona_id in PERSONA_REGISTRY:
        chosen = assessment.persona_id
        confidence = assessment.confidence
        reasoning = assessment.reasoning

    if not should_freeze(confidence, turn_count):
        logger.info(f"[Persona Profiler] Undecided (turn={turn_count}, pick={chosen}, conf={confidence})")
        return {}

    if chosen is None:
        chosen = heuristic_persona(state.get("user_style"))
        reasoning = "Heuristic fallback from detected texting style."

    logger.info(f"[Persona Profiler] Froze persona '{chosen}' (turn={turn_count}, conf={confidence})")
    return {
        "persona_id": chosen,
        "persona_locked": True,
        "persona_assessment": {
            "persona_id": chosen,
            "confidence": confidence,
            "reasoning": reasoning,
            "turn": turn_count,
        },
    }
