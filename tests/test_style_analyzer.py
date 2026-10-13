import pytest
from langchain_core.messages import HumanMessage
from app.agent.nodes.style_analyzer import analyze_user_style


def test_style_analyzer_casual_slang():
    state = {
        "messages": [HumanMessage(content="yo lol idk if that works tbh")],
        "user_id": "test_user",
        "persona_id": "curious_banter"
    }
    result = analyze_user_style(state)
    style = result["user_style"]

    assert style["length_preference"] == "micro"
    assert style["capitalization"] == "lowercase"
    assert style["slang_level"] == "heavy"
    assert style["energy"] == "playful"


def test_style_analyzer_formal_detailed():
    state = {
        "messages": [HumanMessage(content="I believe we should carefully review the documentation before proceeding with any deployment decisions. This ensures stability and reliability.")],
        "user_id": "test_user",
        "persona_id": "pragmatic_mentor"
    }
    result = analyze_user_style(state)
    style = result["user_style"]

    assert style["length_preference"] == "concise" or style["length_preference"] == "detailed"
    assert style["capitalization"] == "standard"
    assert style["slang_level"] == "none"
