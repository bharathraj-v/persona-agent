from app.agent.graph import build_persona_graph
from app.agent.prompts.loader import load_prompt


def test_prompt_loader():
    base = load_prompt("base_aura.md")
    assert "Aura" in base
    assert "Core Principles" in base

    elicitation = load_prompt("elicitation.md")
    assert "Elicitation Rules" in elicitation

    extraction = load_prompt("extraction.md")
    assert "Trait Profiler Subagent" in extraction


def test_build_persona_graph():
    compiled = build_persona_graph()
    assert compiled is not None
    for node in ("style_analyzer", "persona_profiler", "elicitation_selector", "generator", "trait_evaluator"):
        assert node in compiled.nodes
    assert "persona_tools" not in compiled.nodes
