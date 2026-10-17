import pytest
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from app.agent.nodes.persona_selector import switch_persona, handle_persona_switch
from app.agent.graph import build_persona_graph, route_after_generator
from app.agent.prompts.loader import load_prompt


def test_prompt_loader():
    base = load_prompt("base_aura.md")
    assert "Aura" in base
    assert "Core Principles" in base

    elicitation = load_prompt("elicitation.md")
    assert "Elicitation Rules" in elicitation

    extraction = load_prompt("extraction.md")
    assert "Trait Profiler Subagent" in extraction


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
    # When switch_persona was called and persona is not locked -> route to persona_tools
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

    # When persona is already locked -> routes to trait_evaluator subagent
    state_locked = {
        "messages": [
            AIMessage(
                content="",
                tool_calls=[{"name": "switch_persona", "args": {"persona_id": "curious_banter"}}]
            )
        ],
        "persona_locked": True
    }
    assert route_after_generator(state_locked) == "trait_evaluator"

    # When normal conversational message without tool calls -> routes to trait_evaluator subagent
    state_normal = {
        "messages": [AIMessage(content="Hello there!")],
        "persona_locked": False
    }
    assert route_after_generator(state_normal) == "trait_evaluator"


def test_build_persona_graph():
    compiled = build_persona_graph()
    assert compiled is not None
    assert "generator" in compiled.nodes
    assert "persona_tools" in compiled.nodes
    assert "style_analyzer" in compiled.nodes
    assert "elicitation_selector" in compiled.nodes
    assert "trait_evaluator" in compiled.nodes
