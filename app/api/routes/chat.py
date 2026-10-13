import json
import asyncio
from fastapi import APIRouter, BackgroundTasks, HTTPException
from sse_starlette.sse import EventSourceResponse
from langchain_core.messages import HumanMessage, AIMessage
from app.api.schemas import ChatMessageRequest, ChatMessageResponse
from app.agent.graph import graph, get_postgres_graph
from app.agent.nodes.extractor import run_trait_extraction

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/message", response_model=ChatMessageResponse)
async def send_chat_message(req: ChatMessageRequest, background_tasks: BackgroundTasks):
    """Executes a chat message turn through the LangGraph persona pipeline."""
    config = {"configurable": {"thread_id": req.thread_id}}
    agent_graph = await get_postgres_graph()

    input_state = {
        "messages": [HumanMessage(content=req.message)],
        "user_id": req.user_id,
        "persona_id": req.persona_id,
        "thread_id": req.thread_id
    }

    result = await agent_graph.ainvoke(input_state, config)

    # Extract last AI message
    last_message = result["messages"][-1]
    reply_content = last_message.content if isinstance(last_message, AIMessage) else str(last_message)

    # Trigger background trait extraction without blocking the response
    background_tasks.add_task(
        run_trait_extraction,
        user_id=req.user_id,
        thread_id=req.thread_id,
        user_message=req.message,
        ai_response=reply_content
    )

    return ChatMessageResponse(
        reply=reply_content,
        persona_id=req.persona_id,
        detected_style=result.get("user_style", {}),
        targeted_traits=result.get("targeted_traits", []),
        thread_id=req.thread_id
    )


@router.post("/stream")
async def stream_chat_message(req: ChatMessageRequest, background_tasks: BackgroundTasks):
    """Streams the persona response token-by-token via Server-Sent Events (SSE)."""
    config = {"configurable": {"thread_id": req.thread_id}}
    agent_graph = await get_postgres_graph()

    input_state = {
        "messages": [HumanMessage(content=req.message)],
        "user_id": req.user_id,
        "persona_id": req.persona_id,
        "thread_id": req.thread_id
    }

    async def event_generator():
        accumulated_text = []
        try:
            async for event in agent_graph.astream_events(input_state, config, version="v2"):
                event_type = event.get("event")
                # Stream LLM tokens
                if event_type == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        accumulated_text.append(chunk.content)
                        yield {
                            "event": "delta",
                            "data": json.dumps({"token": chunk.content})
                        }
                elif event_type == "on_chain_end" and event.get("name") == "style_analyzer":
                    # Send detected style event
                    data = event.get("data", {}).get("output", {})
                    yield {
                        "event": "style",
                        "data": json.dumps(data.get("user_style", {}))
                    }

            full_reply = "".join(accumulated_text)
            yield {
                "event": "done",
                "data": json.dumps({"thread_id": req.thread_id, "done": True})
            }

            # Queue background extraction
            if full_reply:
                asyncio.create_task(
                    run_trait_extraction(
                        user_id=req.user_id,
                        thread_id=req.thread_id,
                        user_message=req.message,
                        ai_response=full_reply
                    )
                )
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(event_generator())


@router.get("/threads/{thread_id}/history")
async def get_thread_history(thread_id: str):
    """Retrieve message history for a given conversation thread."""
    config = {"configurable": {"thread_id": thread_id}}
    agent_graph = await get_postgres_graph()

    state = await agent_graph.aget_state(config)
    if not state or not state.values or "messages" not in state.values:
        return {"thread_id": thread_id, "messages": []}

    formatted_messages = []
    for msg in state.values["messages"]:
        role = "user" if isinstance(msg, HumanMessage) else "assistant"
        formatted_messages.append({
            "role": role,
            "content": msg.content
        })

    return {
        "thread_id": thread_id,
        "messages": formatted_messages
    }
