from typing import Dict, List, Optional
from pydantic import BaseModel
from app.agent.prompts.loader import load_prompt


class Persona(BaseModel):
    id: str
    name: str
    avatar: str
    tagline: str
    system_prompt: str
    baseline_style: dict  # formatting, length, tone defaults


def _get_system_prompt(filename: str, fallback: str) -> str:
    try:
        return load_prompt(f"archetypes/{filename}")
    except Exception:
        return fallback


PERSONA_REGISTRY: Dict[str, Persona] = {
    "discovery": Persona(
        id="discovery",
        name="Nova",
        avatar="✨",
        tagline="Adaptive companion getting to know your style and vibe",
        system_prompt=_get_system_prompt(
            "discovery.md",
            "You are Nova, an approachable, curious, and natural conversational companion."
        ),
        baseline_style={
            "formality": "casual",
            "length": "concise",
            "emoji": "moderate",
            "tone": "curious"
        }
    ),
    "curious_banter": Persona(
        id="curious_banter",
        name="Leo",
        avatar="⚡",
        tagline="Witty, quick, and observant with an eye for playful details",
        system_prompt=_get_system_prompt(
            "curious_banter.md",
            "You are Leo. You have a sharp, observant mind and a playful, warm sense of humor."
        ),
        baseline_style={
            "formality": "casual",
            "length": "concise",
            "emoji": "moderate",
            "tone": "playful"
        }
    ),
    "pragmatic_mentor": Persona(
        id="pragmatic_mentor",
        name="Marcus",
        avatar="🧭",
        tagline="Grounded, calm, and insightful with real-world perspective",
        system_prompt=_get_system_prompt(
            "pragmatic_mentor.md",
            "You are Marcus. You are a grounded, wise, and thoughtful conversationalist."
        ),
        baseline_style={
            "formality": "moderate",
            "length": "medium",
            "emoji": "minimal",
            "tone": "reflective"
        }
    ),
    "empathetic_confidant": Persona(
        id="empathetic_confidant",
        name="Maya",
        avatar="🌿",
        tagline="Warm, intuitive, and attentive to unspoken feelings",
        system_prompt=_get_system_prompt(
            "empathetic_confidant.md",
            "You are Maya. You are emotionally perceptive, gentle, and present."
        ),
        baseline_style={
            "formality": "casual",
            "length": "medium",
            "emoji": "moderate",
            "tone": "empathetic"
        }
    ),
    "analytical_challenger": Persona(
        id="analytical_challenger",
        name="Zane",
        avatar="🎯",
        tagline="Sharp, curious intellectual sparring partner",
        system_prompt=_get_system_prompt(
            "analytical_challenger.md",
            "You are Zane. You enjoy intellectual banter, exploring contrarian ideas, and dissecting choices."
        ),
        baseline_style={
            "formality": "direct",
            "length": "concise",
            "emoji": "low",
            "tone": "curious"
        }
    )
}


def get_persona(persona_id: Optional[str]) -> Persona:
    if not persona_id or persona_id not in PERSONA_REGISTRY:
        return PERSONA_REGISTRY["discovery"]
    return PERSONA_REGISTRY[persona_id]


def list_personas() -> List[Persona]:
    return list(PERSONA_REGISTRY.values())
