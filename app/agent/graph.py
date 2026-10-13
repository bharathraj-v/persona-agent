from typing import Optional
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from app.config import settings
from app.agent.state import AgentState
from app.agent.nodes.style_analyzer import analyze_user_style
from app.agent.nodes.persona_selector import select_persona
from app.agent.nodes.elicitation import select_elicitation_target
from app.agent.nodes.generator import generate_persona_response


def build_persona_graph(checkpointer=None):
    """Constructs the persona agent state graph with style adaptation, LLM persona selection, and elicitation."""
    builder = StateGraph(AgentState)

    # Add Nodes
    builder.add_node("style_analyzer", analyze_user_style)
    builder.add_node("persona_selector", select_persona)
    builder.add_node("elicitation_selector", select_elicitation_target)
    builder.add_node("generator", generate_persona_response)

    # Add Edges
    builder.add_edge(START, "style_analyzer")
    builder.add_edge("style_analyzer", "persona_selector")
    builder.add_edge("persona_selector", "elicitation_selector")
    builder.add_edge("elicitation_selector", "generator")
    builder.add_edge("generator", END)

    return builder.compile(checkpointer=checkpointer)


# Global graph instance with in-memory checkpointer for testing/fallbacks
default_memory_checkpointer = MemorySaver()
graph = build_persona_graph(checkpointer=default_memory_checkpointer)


async def get_postgres_graph():
    """Returns a compiled graph backed by PostgreSQL checkpointer if available."""
    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        from psycopg_pool import AsyncConnectionPool

        # Create connection pool for checkpointer
        pool = AsyncConnectionPool(conninfo=settings.CHECKPOINTER_DB_URL, max_size=10)
        checkpointer = AsyncPostgresSaver(pool)
        await checkpointer.setup()
        return build_persona_graph(checkpointer=checkpointer)
    except Exception as e:
        print(f"[Warning] PostgreSQL checkpointer unavailable, falling back to memory saver: {e}")
        return graph
