import logging
from typing import Optional
from langchain_core.messages import AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from app.config import settings
from app.agent.state import AgentState
from app.agent.nodes.style_analyzer import analyze_user_style
from app.agent.nodes.persona_selector import handle_persona_switch
from app.agent.nodes.elicitation import select_elicitation_target
from app.agent.nodes.generator import generate_persona_response

logger = logging.getLogger(__name__)

# --- Singleton state ---
_app_graph = None
_pool = None


def route_after_generator(state: AgentState) -> str:
    """Routes to persona_tools if switch_persona was invoked and persona is unlocked; otherwise ends turn."""
    messages = state.get("messages", [])
    if not messages:
        return END

    last_message = messages[-1]
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        has_switch = any(tc.get("name") == "switch_persona" for tc in last_message.tool_calls)
        if has_switch and not state.get("persona_locked"):
            return "persona_tools"

    return END


def build_persona_graph(checkpointer=None):
    """Constructs the persona agent state graph with style adaptation, tool-based persona switching, and elicitation."""
    builder = StateGraph(AgentState)

    # Add Nodes
    builder.add_node("style_analyzer", analyze_user_style)
    builder.add_node("elicitation_selector", select_elicitation_target)
    builder.add_node("generator", generate_persona_response)
    builder.add_node("persona_tools", handle_persona_switch)

    # Add Edges
    builder.add_edge(START, "style_analyzer")
    builder.add_edge("style_analyzer", "elicitation_selector")
    builder.add_edge("elicitation_selector", "generator")

    # Conditional routing after generation
    builder.add_conditional_edges(
        "generator",
        route_after_generator,
        {
            "persona_tools": "persona_tools",
            END: END
        }
    )
    # Loop back to generator after persona switch tool execution
    builder.add_edge("persona_tools", "generator")

    return builder.compile(checkpointer=checkpointer)


# Global graph instance with in-memory checkpointer for testing/fallbacks
default_memory_checkpointer = MemorySaver()
graph = build_persona_graph(checkpointer=default_memory_checkpointer)


async def init_app_graph():
    """
    Called once at application startup (lifespan) to initialize the persistent
    Postgres-backed graph. Falls back to the in-memory graph if unavailable.
    """
    global _app_graph, _pool
    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        from psycopg_pool import AsyncConnectionPool

        logger.info("Initializing PostgreSQL connection pool for graph checkpointer...")
        _pool = AsyncConnectionPool(
            conninfo=settings.CHECKPOINTER_DB_URL,
            max_size=10,
            open=False,
        )
        await _pool.open()
        checkpointer = AsyncPostgresSaver(_pool)
        await checkpointer.setup()
        _app_graph = build_persona_graph(checkpointer=checkpointer)
        logger.info("Postgres-backed graph initialized successfully.")
    except Exception as e:
        logger.warning(
            f"PostgreSQL checkpointer unavailable, falling back to MemorySaver: {e}"
        )
        _app_graph = graph


async def close_app_graph():
    """Called at shutdown to cleanly close the connection pool."""
    global _pool
    if _pool is not None:
        try:
            await _pool.close()
            logger.info("PostgreSQL connection pool closed.")
        except Exception as e:
            logger.warning(f"Error closing pool: {e}")


def get_app_graph():
    """Returns the singleton compiled graph (Postgres-backed or in-memory fallback)."""
    return _app_graph or graph


# NOTE: Kept for backward compatibility with any direct imports
async def get_postgres_graph():
    """Deprecated: use get_app_graph() instead. Returns the singleton graph."""
    return get_app_graph()
