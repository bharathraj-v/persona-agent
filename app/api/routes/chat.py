import json
import logging
from typing import Any
from fastapi import APIRouter, BackgroundTasks, HTTPException
from sse_starlette.sse import EventSourceResponse
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from app.api.schemas import ChatMessageRequest, ChatMessageResponse
from app.agent.graph import get_app_graph
# NOTE: Extractor is intentionally commented out for now to plan triggering strategy
# from app.agent.nodes.extractor import run_trait_extraction

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


def extract_text_from_content(raw: Any) -> str:
    """Extracts a clean string from AIMessage content, supporting str or multipart lists."""
    if isinstance(raw, str):
        return raw
    if isinstance(raw, list):
        parts = []
        for p in raw:
            if isinstance(p, str):
                parts.append(p)
            elif isinstance(p, dict):
                if p.get("type") == "text" and "text" in p:
                    parts.append(p["text"])
                elif "text" in p:
                    parts.append(p["text"])
        return "".join(parts)
    return ""


@router.post("/message", response_model=ChatMessageResponse)
async def send_chat_message(req: ChatMessageRequest, background_tasks: BackgroundTasks):
    """Executes a chat message turn through the LangGraph persona pipeline."""
    logger.info(f"[chat/message] Request | thread={req.thread_id} user={req.user_id}")
    config = {"configurable": {"thread_id": req.thread_id}}
    agent_graph = get_app_graph()

    explicit_persona = req.persona_id and req.persona_id not in ["discovery", "unassigned"]
    input_state = {
        "messages": [HumanMessage(content=req.message)],
        "user_id": req.user_id,
        "persona_id": req.persona_id or "discovery",
        "persona_locked": True if explicit_persona else None,
        "thread_id": req.thread_id
    }

    result = await agent_graph.ainvoke(input_state, config)

    # Extract last conversational AI message with content
    reply_content = ""
    for msg in reversed(result.get("messages", [])):
        if isinstance(msg, AIMessage) and msg.content:
            reply_content = extract_text_from_content(msg.content)
            if reply_content:
                break

    active_persona = result.get("persona_id", req.persona_id or "discovery")
    logger.info(f"[chat/message] Done | thread={req.thread_id} persona={active_persona}")

    return ChatMessageResponse(
        reply=reply_content,
        persona_id=active_persona,
        detected_style=result.get("user_style", {}),
        targeted_traits=result.get("targeted_traits", []),
        thread_id=req.thread_id
    )


@router.post("/stream")
async def stream_chat_message(req: ChatMessageRequest, background_tasks: BackgroundTasks):
    """Streams the persona response token-by-token via Server-Sent Events (SSE)."""
    logger.info(f"[SSE] Stream request | thread={req.thread_id} | user={req.user_id} | persona={req.persona_id or 'discovery'}")

    config = {"configurable": {"thread_id": req.thread_id}}
    agent_graph = get_app_graph()

    explicit_persona = req.persona_id and req.persona_id not in ["discovery", "unassigned"]
    input_state = {
        "messages": [HumanMessage(content=req.message)],
        "user_id": req.user_id,
        "persona_id": req.persona_id or "discovery",
        "persona_locked": True if explicit_persona else None,
        "thread_id": req.thread_id
    }

    async def event_generator():
        accumulated_text = []
        resolved_persona = req.persona_id or "discovery"
        token_count = 0

        try:
            async for event in agent_graph.astream_events(input_state, config, version="v2"):
                event_type = event.get("event")

                # Stream LLM tokens (filter out tool calls / tool chunks)
                if event_type == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    has_tool_call = bool(
                        getattr(chunk, "tool_call_chunks", None) or
                        getattr(chunk, "tool_calls", None)
                    )
                    if not has_tool_call and chunk and hasattr(chunk, "content"):
                        content_str = extract_text_from_content(chunk.content)
                        if content_str:
                            if token_count == 0:
                                logger.info(f"[SSE] First token received | thread={req.thread_id}")
                            token_count += 1
                            accumulated_text.append(content_str)
                            yield {
                                "event": "delta",
                                "data": json.dumps({"token": content_str})
                            }

                # Fallback if chat model completed in a single chunk or buffered
                elif event_type == "on_chat_model_end":
                    if token_count == 0:
                        output = event.get("data", {}).get("output")
                        if output:
                            has_tool_call = bool(getattr(output, "tool_calls", None))
                            if not has_tool_call and hasattr(output, "content"):
                                content_str = extract_text_from_content(output.content)
                                if content_str:
                                    logger.info(f"[SSE] Content delivered from on_chat_model_end | thread={req.thread_id}")
                                    token_count += 1
                                    accumulated_text.append(content_str)
                                    yield {
                                        "event": "delta",
                                        "data": json.dumps({"token": content_str})
                                    }

                elif event_type == "on_chain_end" and event.get("name") == "style_analyzer":
                    data = event.get("data", {}).get("output", {})
                    style = data.get("user_style", {})
                    logger.info(f"[SSE] Style detected | thread={req.thread_id} | style={style}")
                    yield {
                        "event": "style",
                        "data": json.dumps(style)
                    }

                elif event_type == "on_chain_end" and event.get("name") == "persona_tools":
                    data = event.get("data", {}).get("output", {})
                    if "persona_id" in data:
                        resolved_persona = data["persona_id"]
                        logger.info(f"[SSE] Persona switched via tool | thread={req.thread_id} | persona={resolved_persona}")
                        yield {
                            "event": "persona",
                            "data": json.dumps({
                                "persona_id": resolved_persona,
                                "locked": data.get("persona_locked", True)
                            })
                        }

                elif event_type == "on_chain_end" and event.get("name") == "generator":
                    # Chain-level fallback: ensure UI never receives empty message if generator produced output
                    if token_count == 0:
                        data = event.get("data", {}).get("output", {})
                        msgs = data.get("messages", [])
                        if msgs:
                            last = msgs[-1]
                            has_tool_call = bool(getattr(last, "tool_calls", None))
                            if not has_tool_call and hasattr(last, "content"):
                                content_str = extract_text_from_content(last.content)
                                if content_str:
                                    logger.info(f"[SSE] Content delivered from generator chain end | thread={req.thread_id}")
                                    token_count += 1
                                    accumulated_text.append(content_str)
                                    yield {
                                        "event": "delta",
                                        "data": json.dumps({"token": content_str})
                                    }

            full_reply = "".join(accumulated_text)
            logger.info(f"[SSE] Stream complete | thread={req.thread_id} | persona={resolved_persona} | tokens={token_count}")
            yield {
                "event": "done",
                "data": json.dumps({
                    "thread_id": req.thread_id,
                    "persona_id": resolved_persona,
                    "done": True
                })
            }

        except Exception as e:
            logger.error(
                f"[SSE] Stream error | thread={req.thread_id} | error={e}",
                exc_info=True
            )
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(
        event_generator(),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        }
    )


@router.get("/threads/{thread_id}/history")
async def get_thread_history(thread_id: str):
    """Retrieve message history for a given conversation thread."""
    config = {"configurable": {"thread_id": thread_id}}
    agent_graph = get_app_graph()

    state = await agent_graph.aget_state(config)
    if not state or not state.values or "messages" not in state.values:
        return {"thread_id": thread_id, "messages": []}

    formatted_messages = []
    for msg in state.values["messages"]:
        if isinstance(msg, HumanMessage):
            content_str = extract_text_from_content(msg.content)
            formatted_messages.append({
                "role": "user",
                "content": content_str
            })
        elif isinstance(msg, AIMessage) and msg.content:
            content_str = extract_text_from_content(msg.content)
            if content_str:
                formatted_messages.append({
                    "role": "assistant",
                    "content": content_str
                })

    return {
        "thread_id": thread_id,
        "messages": formatted_messages
    }
