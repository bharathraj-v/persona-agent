from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import settings
from app.agent.state import AgentState
from app.agent.personas.registry import PERSONA_REGISTRY


class PersonaDecision(BaseModel):
    chosen_persona_id: str = Field(
        ...,
        description="Must be one of: 'curious_banter', 'pragmatic_mentor', 'empathetic_confidant', 'analytical_challenger', or 'discovery' if still assessing"
    )
    confidence: float = Field(..., description="Confidence between 0.0 and 1.0 in this persona match")
    reasoning: str = Field(..., description="Short explanation of why this persona matches the user's communication style")


SELECTOR_PROMPT = """You are an expert AI persona selector.
Your job is to observe the user's conversation messages and texting style, and choose the AI personality archetype that will create the most engaging, complementary connection with them.

AVAILABLE PERSONAS:
- 'curious_banter' (Leo): Best if the user uses casual slang, quick humor, playful sarcasm, or wants a fun, energetic friend.
- 'pragmatic_mentor' (Marcus): Best if the user is grounded, focused, seeks candid advice, or values practical wisdom and calm directness.
- 'empathetic_confidant' (Maya): Best if the user shares personal feelings, vulnerability, stress, or values deep emotional warmth and validation.
- 'analytical_challenger' (Zane): Best if the user is intellectual, loves debating ideas, dissects logic, or challenges assumptions.

DECISION GUIDELINES:
- If this is only the 1st turn and the user's message is ambiguous (e.g. just 'hey' or 'hello'), return 'discovery' (confidence < 0.5) to keep observing.
- Once you detect sufficient stylistic or thematic signal (usually turn 1-3), select the best matching persona with high confidence (>= 0.7).
"""


async def select_persona(state: AgentState) -> Dict[str, Any]:
    """Evaluates user input in the initial turns to dynamically decide which personality archetype to activate."""
    # If a persona has already been locked in, skip evaluation
    if state.get("persona_locked"):
        return {}

    current_persona = state.get("persona_id", "discovery")
    messages = state.get("messages", [])
    human_messages = [m for m in messages if isinstance(m, HumanMessage)]
    turn_count = len(human_messages)

    # If already explicit persona passed from client or previous lock
    if current_persona and current_persona not in ["discovery", "unassigned"] and turn_count > 3:
        return {"persona_locked": True}

    api_key = settings.get_gemini_key()
    if not api_key:
        # Fallback when key is not yet set
        return {"persona_id": current_persona or "discovery"}

    try:
        llm = ChatGoogleGenerativeAI(
            model=settings.DEFAULT_CHAT_MODEL,
            google_api_key=api_key,
            temperature=0.0
        )
        decision_llm = llm.with_structured_output(PersonaDecision)

        convo_history = "\n".join([f"User: {m.content}" for m in human_messages[-4:]])
        style = state.get("user_style", {})

        prompt = (
            f"Detected User Style: {style}\n"
            f"Recent User Turns (Count: {turn_count}):\n{convo_history}\n\n"
            "Choose the most fitting persona:"
        )

        decision: PersonaDecision = await decision_llm.ainvoke([
            SystemMessage(content=SELECTOR_PROMPT),
            HumanMessage(content=prompt)
        ])

        if decision and decision.chosen_persona_id in PERSONA_REGISTRY:
            # If high confidence or we reached turn 3, lock it in
            should_lock = decision.confidence >= 0.7 or turn_count >= 3
            if decision.chosen_persona_id != "discovery":
                return {
                    "persona_id": decision.chosen_persona_id,
                    "persona_locked": should_lock
                }

        return {"persona_id": current_persona}
    except Exception as e:
        print(f"[Notice] Persona selector fallback: {e}")
        return {"persona_id": current_persona}
