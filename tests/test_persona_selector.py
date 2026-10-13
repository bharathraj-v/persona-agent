import pytest
from langchain_core.messages import HumanMessage
from app.agent.nodes.persona_selector import select_persona


@pytest.mark.asyncio
async def test_persona_selector_preserves_locked():
    state = {
        "messages": [HumanMessage(content="Hey there!")],
        "user_id": "test_user",
        "persona_id": "curious_banter",
        "persona_locked": True
    }
    result = await select_persona(state)
    assert result == {}  # No change when locked


@pytest.mark.asyncio
async def test_persona_selector_starts_discovery():
    state = {
        "messages": [HumanMessage(content="Hi")],
        "user_id": "test_user",
        "persona_id": "discovery",
        "persona_locked": False
    }
    result = await select_persona(state)
    # When no API key is provided, should default cleanly without crashing
    assert "persona_id" in result
