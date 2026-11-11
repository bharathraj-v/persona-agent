import pytest
from unittest.mock import AsyncMock, patch
from langchain_core.messages import HumanMessage, AIMessage
from app.agent.nodes import persona_profiler as pp
from app.agent.nodes.persona_profiler import (
    PersonaAssessment,
    heuristic_persona,
    profile_and_freeze_persona,
    should_freeze,
)


class _FakeSettings:
    DEFAULT_PERSONA_MODEL = "test-model"

    def __init__(self, key):
        self._key = key

    def get_gemini_key(self):
        return self._key


def _state(*user_msgs, **extra):
    msgs = []
    for i, text in enumerate(user_msgs):
        if i:
            msgs.append(AIMessage(content="ok"))
        msgs.append(HumanMessage(content=text))
    return {"messages": msgs, "user_id": "u", "persona_id": "discovery", **extra}


def test_should_freeze():
    assert should_freeze(0.8, 1)
    assert not should_freeze(0.6, 2)
    assert not should_freeze(None, 2)
    assert should_freeze(0.1, 3)
    assert should_freeze(None, 3)


def test_heuristic_persona():
    assert heuristic_persona({"slang_level": "heavy", "energy": "chill"}) == "curious_banter"
    assert heuristic_persona({"slang_level": "none", "energy": "chill"}) == "pragmatic_mentor"
    assert heuristic_persona(None) == "pragmatic_mentor"


@pytest.mark.asyncio
async def test_noop_when_locked():
    assert await profile_and_freeze_persona(_state("lol yo what's up", persona_locked=True)) == {}


@pytest.mark.asyncio
async def test_freezes_on_confident_assessment():
    assessment = PersonaAssessment(persona_id="curious_banter", confidence=0.9, reasoning="slang and jokes")
    with patch.object(pp, "settings", _FakeSettings("k")), \
         patch.object(pp, "_assess", AsyncMock(return_value=assessment)):
        result = await profile_and_freeze_persona(_state("lol yo that meeting was a total mess"))
    assert result["persona_id"] == "curious_banter"
    assert result["persona_locked"] is True
    assert result["persona_assessment"]["turn"] == 1


@pytest.mark.asyncio
async def test_stays_undecided_on_low_confidence_before_deadline():
    assessment = PersonaAssessment(persona_id="pragmatic_mentor", confidence=0.4, reasoning="unclear")
    with patch.object(pp, "settings", _FakeSettings("k")), \
         patch.object(pp, "_assess", AsyncMock(return_value=assessment)):
        result = await profile_and_freeze_persona(_state("not sure what to say here honestly"))
    assert result == {}


@pytest.mark.asyncio
async def test_forced_freeze_at_deadline_even_when_unsure():
    assessment = PersonaAssessment(persona_id="analytical_challenger", confidence=0.3, reasoning="weak")
    with patch.object(pp, "settings", _FakeSettings("k")), \
         patch.object(pp, "_assess", AsyncMock(return_value=assessment)):
        result = await profile_and_freeze_persona(_state("hm so what", "i guess maybe", "well it depends on the case"))
    assert result["persona_id"] == "analytical_challenger"
    assert result["persona_locked"] is True


@pytest.mark.asyncio
async def test_heuristic_fallback_without_api_key():
    with patch.object(pp, "settings", _FakeSettings(None)):
        result = await profile_and_freeze_persona(
            _state("hey", "ok", "lol idk man", user_style={"slang_level": "heavy", "energy": "playful"})
        )
    assert result["persona_id"] == "curious_banter"
    assert result["persona_locked"] is True


@pytest.mark.asyncio
async def test_short_greeting_skips_llm():
    mock = AsyncMock()
    with patch.object(pp, "settings", _FakeSettings("k")), patch.object(pp, "_assess", mock):
        result = await profile_and_freeze_persona(_state("hi"))
    mock.assert_not_called()
    assert result == {}
