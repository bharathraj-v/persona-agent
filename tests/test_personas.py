import pytest
from app.agent.personas.registry import list_personas, get_persona


def test_personas_registry():
    personas = list_personas()
    assert len(personas) >= 4

    p_ids = [p.id for p in personas]
    assert "curious_banter" in p_ids
    assert "pragmatic_mentor" in p_ids
    assert "empathetic_confidant" in p_ids
    assert "analytical_challenger" in p_ids

    leo = get_persona("curious_banter")
    assert leo.name == "Leo"
    assert leo.avatar == "⚡"
    assert "sharp" in leo.system_prompt.lower()
