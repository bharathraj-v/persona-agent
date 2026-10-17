import pytest
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from app.agent.nodes.persona_selector import switch_persona, handle_persona_switch
from app.agent.graph import build_persona_graph, route_after_generator
from langgraph.graph import END


def test_switch_persona_tool():
    # Valid persona switch
    res = switch_persona.invoke({"persona_id": "curious_banter", "reasoning": "Playful banter"})
    assert "Successfully switched persona" in res
    assert "curious_banter" in res

    # Invalid persona switch
    invalid_res = switch_persona.invoke({"persona_id": "nonexistent_persona"})
    assert "not recognized" in invalid_res


def test_handle_persona_switch_valid():
    state = {
        "messages": [
            HumanMessage(content="yo bro lol"),
            AIMessage(
                content="",
                tool_calls=[{
                    "name": "switch_persona",
                    "args": {"persona_id": "curious_banter", "reasoning": "Slang detected"},
                    "id": "call_123"
                }]
            )
        ],
        "user_id": "test_user",
        "persona_id": "discovery",
        "persona_locked": False
    }

    result = handle_persona_switch(state)
    assert result["persona_id"] == "curious_banter"
    assert result["persona_locked"] is True
    assert len(result["messages"]) == 1
    assert isinstance(result["messages"][0], ToolMessage)
    assert result["messages"][0].tool_call_id == "call_123"


def test_route_after_generator():
    # When switch_persona was called and persona is not locked
    state_switch = {
        "messages": [
            AIMessage(
                content="",
                tool_calls=[{"name": "switch_persona", "args": {"persona_id": "curious_banter"}}]
            )
        ],
        "persona_locked": False
    }
    assert route_after_generator(state_switch) == "persona_tools"

    # When persona is already locked
    state_locked = {
        "messages": [
            AIMessage(
                content="",
                tool_calls=[{"name": "switch_persona", "args": {"persona_id": "curious_banter"}}]
            )
        ],
        "persona_locked": True
    }
    assert route_after_generator(state_locked) == END

    # When normal conversational message without tool calls
    state_normal = {
        "messages": [AIMessage(content="Hello there!")],
        "persona_locked": False
    }
    assert route_after_generator(state_normal) == END


def test_build_persona_graph():
    compiled = build_persona_graph()
    assert compiled is not None
    assert "generator" in compiled.nodes
    assert "persona_tools" in compiled.nodes
    assert "style_analyzer" in compiled.nodes
    assert "elicitation_selector" in compiled.nodes
