import json
import uuid
import datetime
import logging
from typing import Any, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException
from sqlalchemy import select, delete
from sse_starlette.sse import EventSourceResponse
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage, SystemMessage
from app.api.schemas import ChatMessageRequest, ChatMessageResponse
from app.agent.graph import get_app_graph
from app.db.session import AsyncSessionLocal
from app.db.models import ChatMessageRecord

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


async def save_chat_message(
    user_id: str,
    thread_id: str,
    role: str,
    content: str,
    persona_id: Optional[str] = None
) -> None:
    """Persists an individual chat message turn in the PostgreSQL database at message level."""
    if not content or not content.strip():
        return
    try:
        async with AsyncSessionLocal() as session:
            msg = ChatMessageRecord(
                id=f"msg_{uuid.uuid4().hex[:14]}",
                user_id=user_id,
                thread_id=thread_id,
                role=role,
                content=content.strip(),
                persona_id=persona_id,
                created_at=datetime.datetime.utcnow()
            )
            session.add(msg)
            await session.commit()
    except Exception as e:
        logger.error(f"[DB] Failed to save chat message (thread={thread_id}, role={role}): {e}")



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


def extract_text_from_model_output(output: Any) -> str:
    """Extracts text from various LangChain model outputs (AIMessage, ChatResult, etc.)."""
    if output is None:
        return ""
    if hasattr(output, "content") and output.content:
        return extract_text_from_content(output.content)
    if hasattr(output, "generations") and output.generations:
        for gen in output.generations:
            if hasattr(gen, "message") and hasattr(gen.message, "content"):
                text = extract_text_from_content(gen.message.content)
                if text:
                    return text
            if hasattr(gen, "text") and gen.text:
                return gen.text
    return ""


def safe_dict(obj: Any) -> dict:
    """Safely converts object to dict or returns empty dict if not a dict."""
    return obj if isinstance(obj, dict) else {}




@router.post("/message", response_model=ChatMessageResponse)
async def send_chat_message(req: ChatMessageRequest, background_tasks: BackgroundTasks):
    """Executes a chat message turn through the LangGraph persona pipeline."""
    logger.info(f"[chat/message] Request | thread={req.thread_id} user={req.user_id}")
    config = {"configurable": {"thread_id": req.thread_id}}
    agent_graph = get_app_graph()

    # Persist user message in DB
    await save_chat_message(
        user_id=req.user_id,
        thread_id=req.thread_id,
        role="user",
        content=req.message,
        persona_id=req.persona_id
    )

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

    # Persist assistant reply in DB
    if reply_content:
        await save_chat_message(
            user_id=req.user_id,
            thread_id=req.thread_id,
            role="assistant",
            content=reply_content,
            persona_id=active_persona
        )

    target_trait = result.get("current_target_trait")
    if isinstance(target_trait, str):
        from app.agent.traits.catalog import SEED_TRAITS
        target_trait = next((t for t in SEED_TRAITS if t["id"] == target_trait), None)
    targeted_list = [target_trait] if isinstance(target_trait, dict) else []

    detected_style = result.get("user_style") if isinstance(result.get("user_style"), dict) else {}

    return ChatMessageResponse(
        reply=reply_content,
        persona_id=active_persona,
        detected_style=detected_style,
        targeted_traits=targeted_list,
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

        # Persist incoming user message in DB
        await save_chat_message(
            user_id=req.user_id,
            thread_id=req.thread_id,
            role="user",
            content=req.message,
            persona_id=req.persona_id
        )

        try:
            async for event in agent_graph.astream_events(input_state, config, version="v2"):
                if not isinstance(event, dict):
                    continue

                event_type = event.get("event")
                raw_tags = event.get("tags")
                tags = raw_tags if isinstance(raw_tags, list) else []
                raw_metadata = safe_dict(event.get("metadata"))
                node_name = raw_metadata.get("langgraph_node")
                is_extractor = ("trait_extractor" in tags) or (node_name == "trait_evaluator")

                # Stream LLM tokens ONLY from conversational generator (never from trait_evaluator subagent)
                if event_type == "on_chat_model_stream" and not is_extractor:
                    raw_data = safe_dict(event.get("data"))
                    chunk = raw_data.get("chunk")
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

                # Fallback if chat model completed in a single chunk or buffered (generator only)
                elif event_type == "on_chat_model_end" and not is_extractor:
                    if token_count == 0:
                        raw_data = safe_dict(event.get("data"))
                        output = raw_data.get("output")
                        if output:
                            has_tool_call = bool(
                                getattr(output, "tool_calls", None) or
                                (hasattr(output, "generations") and output.generations and getattr(getattr(output.generations[0], "message", None), "tool_calls", None))
                            )
                            if not has_tool_call:
                                content_str = extract_text_from_model_output(output)
                                if content_str:
                                    logger.info(f"[SSE] Content delivered from on_chat_model_end | thread={req.thread_id}")
                                    token_count += 1
                                    accumulated_text.append(content_str)
                                    yield {
                                        "event": "delta",
                                        "data": json.dumps({"token": content_str})
                                    }

                elif event_type == "on_chain_end" and event.get("name") == "style_analyzer":
                    raw_data = safe_dict(event.get("data"))
                    output_data = safe_dict(raw_data.get("output"))
                    style = output_data.get("user_style")
                    if isinstance(style, dict):
                        logger.info(f"[SSE] Style detected | thread={req.thread_id} | style={style}")
                        yield {
                            "event": "style",
                            "data": json.dumps(style)
                        }

                elif event_type == "on_chain_end" and event.get("name") == "elicitation_selector":
                    raw_data = safe_dict(event.get("data"))
                    output_data = safe_dict(raw_data.get("output"))
                    target = output_data.get("current_target_trait")
                    if isinstance(target, str):
                        from app.agent.traits.catalog import SEED_TRAITS
                        target = next((t for t in SEED_TRAITS if t["id"] == target), None)
                    if isinstance(target, dict):
                        yield {
                            "event": "target_trait",
                            "data": json.dumps({
                                "trait_id": target.get("trait_id", ""),
                                "name": target.get("name", ""),
                                "domain": target.get("domain", "")
                            })
                        }

                elif event_type == "on_chain_end" and event.get("name") == "persona_tools":
                    raw_data = safe_dict(event.get("data"))
                    output_data = safe_dict(raw_data.get("output"))
                    if "persona_id" in output_data:
                        resolved_persona = output_data["persona_id"]
                        logger.info(f"[SSE] Persona switched via tool | thread={req.thread_id} | persona={resolved_persona}")
                        yield {
                            "event": "persona",
                            "data": json.dumps({
                                "persona_id": resolved_persona,
                                "locked": output_data.get("persona_locked", True)
                            })
                        }

                elif event_type == "on_chain_end" and (event.get("name") == "generator" or node_name == "generator"):
                    # Chain-level fallback: ensure UI receives message if generator produced output
                    if token_count == 0:
                        raw_data = safe_dict(event.get("data"))
                        output_data = safe_dict(raw_data.get("output"))
                        msgs = output_data.get("messages")
                        if isinstance(msgs, list) and msgs:
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

                elif event_type == "on_chain_end" and event.get("name") == "trait_evaluator":
                    raw_data = safe_dict(event.get("data"))
                    output_data = safe_dict(raw_data.get("output"))
                    extracted = output_data.get("latest_extracted_trait")
                    if isinstance(extracted, dict):
                        logger.info(f"[SSE] Trait updated | thread={req.thread_id} | trait={extracted.get('trait_id')}")
                        yield {
                            "event": "trait_updated",
                            "data": json.dumps(extracted)
                        }


            # Safety recovery: if 0 tokens were streamed across the pipeline, execute a fresh LLM generation retry
            if token_count == 0:
                logger.warning(f"[SSE] Zero tokens streamed for thread={req.thread_id}. Retrying fresh LLM generation...")
                try:
                    from app.agent.nodes.generator import get_llm
                    from app.agent.prompts.loader import load_prompt
                    from app.agent.personas.registry import get_persona
                    llm = get_llm()
                    if llm:
                        state = await agent_graph.aget_state(config)
                        state_vals = state.values if (state and isinstance(state.values, dict)) else {}
                        active_pid = state_vals.get("persona_id") or resolved_persona
                        persona_obj = get_persona(active_pid)
                        directive = state_vals.get("elicitation_directive")

                        try:
                            base_aura = load_prompt("base_aura.md")
                        except Exception:
                            base_aura = "You are Aura, an engaging conversational companion mapping the user's authentic personality and vibe."

                        sys_prompt = (
                            f"{base_aura}\n\n"
                            f"--- ACTIVE ARCHETYPE MODALITY: {persona_obj.name} ({persona_obj.id}) ---\n"
                            f"{persona_obj.system_prompt}\n\n"
                            f"--- CONVERSATIONAL MISSION & ELICITATION ---\n"
                            f"{directive or 'Keep the conversation organic, entertaining, and attentive.'}\n"
                        )

                        # Collect past conversation messages
                        prior_msgs = []
                        raw_msgs = state_vals.get("messages")
                        if isinstance(raw_msgs, list):
                            for m in raw_msgs:
                                if isinstance(m, (HumanMessage, AIMessage)):
                                    if isinstance(m, AIMessage) and getattr(m, "tool_calls", None):
                                        continue
                                    prior_msgs.append(m)

                        if not any(isinstance(m, HumanMessage) and str(m.content) == req.message for m in prior_msgs):
                            prior_msgs.append(HumanMessage(content=req.message))

                        retry_messages = [SystemMessage(content=sys_prompt)] + prior_msgs


                        try:
                            async for chunk in llm.astream(retry_messages, config={"tags": ["agent_conversation"]}):
                                if hasattr(chunk, "content"):
                                    c_str = extract_text_from_content(chunk.content)
                                    if c_str:
                                        token_count += 1
                                        accumulated_text.append(c_str)
                                        yield {
                                            "event": "delta",
                                            "data": json.dumps({"token": c_str})
                                        }
                        except Exception as astream_err:
                            logger.warning(f"[SSE] Retry astream failed, falling back to ainvoke: {astream_err}")
                            resp = await llm.ainvoke(retry_messages, config={"tags": ["agent_conversation"]})
                            if resp and hasattr(resp, "content"):
                                c_str = extract_text_from_content(resp.content)
                                if c_str:
                                    token_count += 1
                                    accumulated_text.append(c_str)
                                    yield {
                                        "event": "delta",
                                        "data": json.dumps({"token": c_str})
                                    }

                        # Commit newly generated response to graph checkpointer state
                        if accumulated_text:
                            fresh_reply = "".join(accumulated_text)
                            await agent_graph.aupdate_state(config, {"messages": [AIMessage(content=fresh_reply)]})

                except Exception as recovery_err:
                    logger.error(f"[SSE] Recovery generation error: {recovery_err}", exc_info=True)


            full_reply = "".join(accumulated_text)
            logger.info(f"[SSE] Stream complete | thread={req.thread_id} | persona={resolved_persona} | tokens={token_count}")

            # Persist generated assistant message in DB
            if full_reply:
                await save_chat_message(
                    user_id=req.user_id,
                    thread_id=req.thread_id,
                    role="assistant",
                    content=full_reply,
                    persona_id=resolved_persona
                )

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


@router.get("/sessions")
async def get_chat_sessions(user_id: str = "user_default"):
    """Lists distinct chat sessions for a user with preview titles and activity timestamps."""
    async with AsyncSessionLocal() as session:
        stmt = (
            select(ChatMessageRecord)
            .where(ChatMessageRecord.user_id == user_id)
            .order_by(ChatMessageRecord.created_at.asc())
        )
        result = await session.execute(stmt)
        messages = result.scalars().all()

    threads_map: dict[str, list[ChatMessageRecord]] = {}
    for m in messages:
        if m.thread_id not in threads_map:
            threads_map[m.thread_id] = []
        threads_map[m.thread_id].append(m)

    sessions_out = []
    for tid, t_msgs in threads_map.items():
        first_user_msg = next((m.content for m in t_msgs if m.role == "user"), None)
        title = (first_user_msg[:50] + "...") if first_user_msg and len(first_user_msg) > 50 else (first_user_msg or "New Conversation")
        last_msg = t_msgs[-1]
        active_persona = next((m.persona_id for m in reversed(t_msgs) if m.persona_id), "discovery")

        sessions_out.append({
            "thread_id": tid,
            "title": title,
            "last_message": last_msg.content[:80] + ("..." if len(last_msg.content) > 80 else ""),
            "last_activity": last_msg.created_at.isoformat() if last_msg.created_at else None,
            "message_count": len(t_msgs),
            "persona_id": active_persona
        })

    # Sort sessions by latest activity descending
    sessions_out.sort(key=lambda s: s["last_activity"] or "", reverse=True)
    return sessions_out


@router.get("/sessions/{thread_id}/messages")
async def get_session_messages(thread_id: str):
    """Retrieves all stored database messages for a specific session thread."""
    async with AsyncSessionLocal() as session:
        stmt = (
            select(ChatMessageRecord)
            .where(ChatMessageRecord.thread_id == thread_id)
            .order_by(ChatMessageRecord.created_at.asc())
        )
        result = await session.execute(stmt)
        records = result.scalars().all()

    return {
        "thread_id": thread_id,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "persona_id": m.persona_id,
                "created_at": m.created_at.isoformat() if m.created_at else None
            }
            for m in records
        ]
    }


@router.delete("/sessions/{thread_id}")
async def delete_chat_session(thread_id: str):
    """Deletes all stored chat messages for a specific session thread."""
    async with AsyncSessionLocal() as session:
        await session.execute(delete(ChatMessageRecord).where(ChatMessageRecord.thread_id == thread_id))
        await session.commit()
    return {"status": "success", "thread_id": thread_id}

