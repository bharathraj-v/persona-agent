import logging
from typing import Dict, Any, List
from langchain_core.messages import SystemMessage, AIMessage, HumanMessage, AnyMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import settings
from app.agent.state import AgentState
from app.agent.personas.registry import get_persona
from app.agent.nodes.persona_selector import switch_persona
from app.agent.prompts.loader import load_prompt

logger = logging.getLogger(__name__)


def get_llm():
    """Initializes Google Gemini chat model with fallback support for local testing."""
    api_key = settings.get_gemini_key()
    if api_key:
        return ChatGoogleGenerativeAI(
            model=settings.DEFAULT_CHAT_MODEL,
            google_api_key=api_key,
            temperature=0.7
        )
    return None


async def generate_persona_response(state: AgentState) -> Dict[str, Any]:
    """Generates the AI response as Aura in character, paced to the user's texting style and weaving in elicitation."""
    persona = get_persona(state.get("persona_id"))
    style = state.get("user_style", {})
    directive = state.get("elicitation_directive")
    persona_locked = bool(state.get("persona_locked"))
    messages_list = list(state.get("messages", []))
    turn_count = len([m for m in messages_list if isinstance(m, HumanMessage)])

    # Construct style pacing directives
    style_guidance = []
    length_pref = style.get("length_preference", "concise")
    if length_pref == "micro":
        style_guidance.append("Keep response brief and conversational (1-2 sentences). Match their fast texting cadence.")
    elif length_pref == "concise":
        style_guidance.append("Keep response concise and conversational (under 50 words). Avoid over-explaining.")
    else:
        style_guidance.append("Provide a thoughtful, engaging response (2-3 sentences).")

    if style.get("capitalization") == "lowercase":
        style_guidance.append("Casual texting style: lowercase punctuation and light formatting are welcome.")

    if style.get("slang_level") == "heavy":
        style_guidance.append("Match their relaxed slang, casual tone, and easy banter naturally.")

    try:
        base_aura = load_prompt("base_aura.md")
    except Exception:
        base_aura = "You are Aura, an engaging conversational companion mapping the user's authentic personality and vibe."

    system_content = (
        f"{base_aura}\n\n"
        f"--- ACTIVE ARCHETYPE MODALITY: {persona.name} ({persona.id}) ---\n"
        f"{persona.system_prompt}\n\n"
        f"--- ADAPTIVE TEXTING CADENCE ---\n"
        f"{' '.join(style_guidance)}\n\n"
        f"--- CONVERSATIONAL MISSION & ELICITATION ---\n"
        f"{directive or 'Keep the conversation organic, entertaining, and attentive.'}\n"
    )

    # First turn greeting instruction: establish Aura identity and mission
    if turn_count <= 1:
        system_content += (
            "\n\n--- FIRST TURN GREETING & CONTEXT ---\n"
            "This is your opening turn with the user.\n"
            "You MUST introduce yourself as Aura and set the context for the conversation:\n"
            "Explain that you're here to help map out their exact personality and communication vibe as you chat.\n"
            "Then ask warmly how their day is going so far or what they're up to.\n"
            "Example direction: 'Hey! I\'m Aura, I\'m here to help you map out your personality and vibe as we chat. How\'s your day going so far?'\n"
            "Deliver this naturally in character so the user immediately understands why you'll be having fun exploring questions together."
        )

    # If persona is not yet locked, guide the LLM to assess style and optionally switch
    if not persona_locked:
        discovery_instructions = (
            "\n\n--- PERSONALITY DISCOVERY & HANDOFF ---\n"
            "You are currently in discovery mode assessing the user's communication style.\n"
            "If you detect a clear match with one of the specialized archetypes below, call the tool `switch_persona`:\n"
            "- 'curious_banter' (Leo): Playful humor, casual slang, witty banter, or energetic vibe.\n"
            "- 'pragmatic_mentor' (Marcus): Grounded, seeking candid advice, calm directness, practical wisdom.\n"
            "- 'empathetic_confidant' (Maya): Sharing vulnerability, stress, emotional feelings, needs warmth.\n"
            "- 'analytical_challenger' (Zane): Intellectual debates, logic dissection, contrarian ideas.\n\n"
            "Guidelines:\n"
            "- If the user's message is an initial greeting (e.g. just 'hi'), do NOT switch yet; introduce yourself warmly as Aura and keep observing.\n"
            "- If you see a clear stylistic or thematic signal, invoke `switch_persona(persona_id=..., reasoning=...)` immediately.\n"
            "- Do NOT mention tool calls or archetype names in plain user text."
        )
        if turn_count >= 3:
            discovery_instructions += "\n- This is turn 3+: You must select and switch to the best matching archetype now via `switch_persona`."
        system_content += discovery_instructions

    messages: List[AnyMessage] = [SystemMessage(content=system_content)] + messages_list

    llm = get_llm()
    if llm:
        if not persona_locked:
            llm_to_call = llm.bind_tools([switch_persona])
        else:
            llm_to_call = llm

        response = None
        run_config = {"tags": ["agent_conversation"]}
        try:
            async for chunk in llm_to_call.astream(messages, config=run_config):
                if response is None:
                    response = chunk
                else:
                    response = response + chunk
        except Exception as stream_err:
            logger.warning(f"astream streaming fallback to ainvoke: {stream_err}")
            response = await llm_to_call.ainvoke(messages, config=run_config)

        if response is None or not (response.content or getattr(response, "tool_calls", None)):
            logger.warning("Empty response received from astream/ainvoke, retrying ainvoke...")
            response = await llm_to_call.ainvoke(messages, config=run_config)

        if response is None:
            response = AIMessage(content="Hey! I'm Aura, here to map your personality and vibe. How is your day going so far?")

        return {"messages": [response]}
    else:
        # Fallback simulation if GEMINI_API_KEY is not yet populated
        last_user_msg = ""
        for m in reversed(messages):
            if isinstance(m, HumanMessage):
                last_user_msg = str(m.content)
                break
        fallback_text = (
            f"Hey! I'm Aura. I'm here to map out your personality and communication vibe as we chat. "
            f"Hearing '{last_user_msg}' got me wondering—are you more of an impulsive planner or a structured one?"
        )
        return {"messages": [AIMessage(content=fallback_text)]}
