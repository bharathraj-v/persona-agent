from typing import Dict, Any, Optional
from langchain_core.tools import tool
from langchain_core.messages import ToolMessage, AIMessage
from app.agent.state import AgentState
from app.agent.personas.registry import PERSONA_REGISTRY, get_persona


@tool
def switch_persona(persona_id: str, reasoning: str = "") -> str:
    """Switch the conversation personality to a specialized persona archetype that best matches the user.

    Args:
        persona_id: The ID of the persona archetype to activate. Must be one of:
            - 'curious_banter' (Leo): Best if the user uses casual slang, quick humor, playful sarcasm, or wants a fun, energetic friend.
            - 'pragmatic_mentor' (Marcus): Best if the user is grounded, focused, seeks candid advice, or values practical wisdom and calm directness.
            - 'empathetic_confidant' (Maya): Best if the user shares personal feelings, vulnerability, stress, or values deep emotional warmth and validation.
            - 'analytical_challenger' (Zane): Best if the user is intellectual, loves debating ideas, dissects logic, or challenges assumptions.
        reasoning: Brief explanation of why this persona matches the user's communication style.
    """
    if persona_id in PERSONA_REGISTRY and persona_id != "discovery":
        target = PERSONA_REGISTRY[persona_id]
        return f"Successfully switched persona to '{target.name}' ({persona_id}). Reason: {reasoning}"
    return f"Persona '{persona_id}' not recognized. Remaining in current persona."


def handle_persona_switch(state: AgentState) -> Dict[str, Any]:
    """Processes tool calls to `switch_persona` from the generator node and updates persona state."""
    messages = state.get("messages", [])
    if not messages:
        return {}

    last_message = messages[-1]
    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        return {}

    # Find switch_persona tool call
    switch_call = None
    for tc in last_message.tool_calls:
        if tc.get("name") == "switch_persona":
            switch_call = tc
            break

    if not switch_call:
        return {}

    args = switch_call.get("args", {})
    chosen_persona_id = args.get("persona_id")
    reasoning = args.get("reasoning", "")
    tool_call_id = switch_call.get("id", "call_switch_persona")

    if chosen_persona_id in PERSONA_REGISTRY and chosen_persona_id != "discovery":
        tool_content = f"Successfully switched to persona '{chosen_persona_id}' ({PERSONA_REGISTRY[chosen_persona_id].name})."
        tool_msg = ToolMessage(
            content=tool_content,
            tool_call_id=tool_call_id,
            name="switch_persona"
        )
        return {
            "persona_id": chosen_persona_id,
            "persona_locked": True,
            "messages": [tool_msg]
        }

    # Fallback if invalid persona requested
    tool_msg = ToolMessage(
        content=f"Persona '{chosen_persona_id}' is invalid. Keeping current persona.",
        tool_call_id=tool_call_id,
        name="switch_persona"
    )
    return {
        "persona_locked": False,
        "messages": [tool_msg]
    }
