"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  RotateCcw,
  SlidersHorizontal,
  MessageSquare,
} from "lucide-react";
import { ChatMessage, DetectedStyle, PersonaInfo } from "./types";
import { TraitsModal } from "./traits-modal";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const DEFAULT_PERSONAS: Record<string, PersonaInfo> = {
  discovery: {
    id: "discovery",
    name: "Nova",
    avatar: "✨",
    tagline: "Adaptive companion discovering your vibe",
  },
  curious_banter: {
    id: "curious_banter",
    name: "Leo",
    avatar: "⚡",
    tagline: "Witty, quick, and observant friend",
  },
  pragmatic_mentor: {
    id: "pragmatic_mentor",
    name: "Marcus",
    avatar: "🧭",
    tagline: "Grounded, calm, and candid mentor",
  },
  empathetic_confidant: {
    id: "empathetic_confidant",
    name: "Maya",
    avatar: "🌿",
    tagline: "Warm, intuitive, and attentive listener",
  },
  analytical_challenger: {
    id: "analytical_challenger",
    name: "Zane",
    avatar: "🎯",
    tagline: "Sharp intellectual sparring partner",
  },
};

const STARTER_PROMPTS = [
  "What's something interesting you've been thinking about lately?",
  "I need someone to bounce ideas off of — got a minute?",
  "Free weekend: do you plan it out or just wing it?",
  "Give me your hottest take on modern tech.",
];

// ─── SSE parser helper ────────────────────────────────────────────────────────
function parseSSEMessages(raw: string): { event: string; data: string }[] {
  const results: { event: string; data: string }[] = [];
  // SSE messages are delimited by double newline
  const messages = raw.split(/\r?\n\r?\n/);
  for (const msg of messages) {
    if (!msg.trim()) continue;
    let event = "message";
    let data = "";
    for (const line of msg.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data = line.slice(5).trim();
    }
    if (data) results.push({ event, data });
  }
  return results;
}

// ─── Components ───────────────────────────────────────────────────────────────

function PersonaPill({
  persona,
  locked,
}: {
  persona: PersonaInfo;
  locked: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/8 bg-white/4 backdrop-blur-sm text-xs transition-all">
      <span className="text-base leading-none">{persona.avatar}</span>
      <span className="font-medium text-zinc-200">{persona.name}</span>
      {locked ? (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-4 border-emerald-500/40 text-emerald-400 bg-emerald-500/10 font-mono"
        >
          locked
        </Badge>
      ) : (
        <span className="text-zinc-500 text-[11px]">discovering…</span>
      )}
    </div>
  );
}

function StatusDot({ online }: { online: boolean | null }) {
  const color =
    online === true
      ? "bg-emerald-400"
      : online === false
      ? "bg-red-500"
      : "bg-amber-400";
  const label =
    online === true ? "API online" : online === false ? "API offline" : "Checking…";
  return (
    <Tooltip>
      <TooltipTrigger
        className="cursor-default flex items-center justify-center size-7 rounded-lg hover:bg-white/5 transition-colors"
      >
        <span className={`size-2 rounded-full ${color} ${online ? "animate-pulse" : ""}`} />
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function StreamingCursor() {
  return (
    <span className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 rounded-full animate-pulse align-middle" />
  );
}

function TypingIndicator({ persona }: { persona: PersonaInfo }) {
  return (
    <div className="flex gap-3 items-end animate-in fade-in duration-200">
      <div className="size-8 shrink-0 rounded-xl bg-zinc-900/80 border border-white/8 flex items-center justify-center text-sm shadow-sm">
        {persona.avatar}
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-zinc-900/60 border border-white/6 shadow-sm">
        <div className="flex gap-1.5 items-center h-4">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="size-1.5 rounded-full bg-zinc-500 animate-bounce"
              style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [userId] = useState("user_default");
  const [threadId, setThreadId] = useState("");
  const [activePersonaId, setActivePersonaId] = useState("discovery");
  const [personaLocked, setPersonaLocked] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [isTraitsModalOpen, setIsTraitsModalOpen] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setThreadId("thread_" + Math.random().toString(36).substring(2, 9));
    checkHealth();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      setServerOnline(res.ok);
    } catch {
      setServerOnline(false);
    }
  }, []);

  const handleResetSession = () => {
    setThreadId("thread_" + Math.random().toString(36).substring(2, 9));
    setMessages([]);
    setActivePersonaId("discovery");
    setPersonaLocked(false);
    setStreamingMessageId(null);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isStreaming) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMessage: ChatMessage = {
      id: "usr_" + Date.now(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    const asstId = "ast_" + Date.now();
    const assistantMessage: ChatMessage = {
      id: asstId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
      personaId: activePersonaId,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setStreamingMessageId(asstId);
    setIsStreaming(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          message: text,
          user_id: userId,
          thread_id: threadId,
          persona_id: activePersonaId === "discovery" ? null : activePersonaId,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      setServerOnline(true);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      console.group("[SSE] Stream started");
      console.log("thread:", threadId, "persona:", activePersonaId);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double-newline boundaries (SSE message separator)
        const rawMessages = buffer.split(/\r?\n\r?\n/);
        // Keep last potentially incomplete chunk in the buffer
        buffer = rawMessages.pop() ?? "";

        for (const rawMsg of rawMessages) {
          if (!rawMsg.trim()) continue;

          // Parse event type and data from this discrete SSE message
          let eventType = "message";
          let dataLine = "";
          for (const line of rawMsg.split(/\r?\n/)) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
          }

          if (!dataLine) continue;

          try {
            const parsed = JSON.parse(dataLine);
            console.log(`[SSE] ${eventType}`, parsed);

            if (eventType === "delta" && parsed.token) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === asstId
                    ? { ...m, content: m.content + parsed.token }
                    : m
                )
              );
            } else if (eventType === "style") {
              // Style info received — no UI update needed, just logged
            } else if (eventType === "persona" && parsed.persona_id) {
              setActivePersonaId(parsed.persona_id);
              if (parsed.locked) setPersonaLocked(true);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === asstId ? { ...m, personaId: parsed.persona_id } : m
                )
              );
            } else if (eventType === "done") {
              if (parsed.persona_id) setActivePersonaId(parsed.persona_id);
            } else if (eventType === "error") {
              console.error("[SSE] Server error:", parsed.error);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === asstId
                    ? {
                        ...m,
                        content: m.content || `[Server Error]: ${parsed.error}`,
                        isStreaming: false,
                      }
                    : m
                )
              );
            }
          } catch {
            // Partial / non-JSON data chunk — silently skip
          }
        }
      }

      console.log("[SSE] Stream complete");
      console.groupEnd();

      setMessages((prev) =>
        prev.map((m) => (m.id === asstId ? { ...m, isStreaming: false } : m))
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("[SSE] Connection error:", errorMsg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === asstId
            ? {
                ...m,
                content:
                  m.content ||
                  `Unable to reach ${BACKEND_URL}. Make sure the FastAPI server is running.`,
                isStreaming: false,
              }
            : m
        )
      );
      setServerOnline(false);
    } finally {
      setIsStreaming(false);
      setStreamingMessageId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const currentPersona = DEFAULT_PERSONAS[activePersonaId] ?? DEFAULT_PERSONAS["discovery"];

  return (
    <div className="flex h-screen w-full flex-col bg-[#09090f] text-zinc-100 font-sans antialiased">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/6 bg-[#09090f]/90 px-4 md:px-6 backdrop-blur-md z-10">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 font-bold text-sm text-white shadow-lg shadow-indigo-500/20">
            P
          </div>
          <span className="text-sm font-semibold tracking-tight text-zinc-100">
            persona<span className="text-indigo-400">·</span>agent
          </span>
        </div>

        {/* Active Persona Pill — center */}
        <PersonaPill persona={currentPersona} locked={personaLocked} />

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <StatusDot online={serverOnline} />

          <Tooltip>
            <TooltipTrigger
              id="traits-profile-btn"
              onClick={() => setIsTraitsModalOpen(true)}
              className="flex size-7 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/6 transition-colors"
            >
              <SlidersHorizontal className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Profile traits
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              id="reset-session-btn"
              onClick={handleResetSession}
              className="flex size-7 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/6 transition-colors"
            >
              <RotateCcw className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              New session
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* ── Message list ──────────────────────────────────────────────── */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="mx-auto max-w-2xl px-4 py-8 space-y-5">
          {messages.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center pt-20 text-center space-y-7">
              <div className="size-14 rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center text-2xl">
                ✨
              </div>
              <div className="space-y-2 max-w-sm">
                <h2 className="text-lg font-semibold text-zinc-100">
                  Chat with Nova
                </h2>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Just talk naturally. The agent will adapt its tone and match
                  you with the right persona as you chat.
                </p>
              </div>
              {/* Starter prompts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg text-left">
                {STARTER_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    id={`starter-prompt-${idx}`}
                    onClick={() => handleSendMessage(prompt)}
                    className="group p-3 rounded-xl border border-white/6 bg-white/3 hover:bg-white/6 hover:border-white/10 text-xs text-zinc-400 hover:text-zinc-200 transition-all text-left flex items-start gap-2"
                  >
                    <MessageSquare className="size-3.5 shrink-0 mt-0.5 text-zinc-600 group-hover:text-indigo-400 transition-colors" />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Messages */
            <>
              {messages.map((message) => {
                const isUser = message.role === "user";
                const persona = message.personaId
                  ? DEFAULT_PERSONAS[message.personaId]
                  : currentPersona;
                const isCurrentlyStreaming =
                  message.isStreaming && message.id === streamingMessageId;
                const hasContent = message.content.length > 0;

                return (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-1 duration-200`}
                  >
                    {/* Assistant avatar */}
                    {!isUser && (
                      <div
                        className={`size-8 shrink-0 rounded-xl bg-zinc-900/80 border border-white/8 flex items-center justify-center text-sm shadow-sm transition-opacity ${isCurrentlyStreaming ? "opacity-100" : "opacity-90"}`}
                      >
                        {persona?.avatar ?? "🤖"}
                      </div>
                    )}

                    <div className={`space-y-1 max-w-[82%] md:max-w-[72%]`}>
                      {/* Persona name label */}
                      {!isUser && (
                        <div className="text-[11px] text-zinc-500 px-1 font-medium flex items-center gap-1.5">
                          {persona?.name ?? "Assistant"}
                          {isCurrentlyStreaming && hasContent && (
                            <span className="size-1.5 rounded-full bg-indigo-400 animate-pulse" />
                          )}
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          isUser
                            ? "bg-indigo-600 text-white rounded-tr-sm shadow-md shadow-indigo-900/30"
                            : "bg-zinc-900/60 text-zinc-100 border border-white/6 rounded-tl-sm shadow-sm"
                        }`}
                      >
                        {isCurrentlyStreaming && !hasContent ? (
                          /* Show typing dots while waiting for first token */
                          <div className="flex gap-1.5 items-center py-0.5">
                            {[0, 150, 300].map((d) => (
                              <span
                                key={d}
                                className="size-1.5 rounded-full bg-zinc-500 animate-bounce"
                                style={{
                                  animationDelay: `${d}ms`,
                                  animationDuration: "1s",
                                }}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words">
                            {message.content}
                            {isCurrentlyStreaming && <StreamingCursor />}
                          </p>
                        )}
                      </div>

                      {/* Timestamp */}
                      <div
                        className={`text-[10px] text-zinc-600 px-1 ${isUser ? "text-right" : "text-left"}`}
                      >
                        {message.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>

                    {/* User avatar */}
                    {isUser && (
                      <div className="size-8 shrink-0 rounded-xl bg-indigo-950/80 border border-indigo-800/40 flex items-center justify-center text-xs font-semibold text-indigo-300">
                        U
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
          {/* Scroll anchor for empty state */}
          {messages.length === 0 && <div ref={messagesEndRef} />}
        </div>
      </ScrollArea>

      {/* ── Input area ────────────────────────────────────────────────── */}
      <div className="border-t border-white/6 bg-[#09090f]/90 px-4 pb-5 pt-3 md:px-6">
        <div className="mx-auto max-w-2xl">
          <div
            className={`relative flex items-end gap-2 rounded-2xl border bg-zinc-900/50 p-2 shadow-xl transition-all duration-200 ${
              isStreaming
                ? "border-indigo-500/30 ring-1 ring-indigo-500/20"
                : "border-white/8 focus-within:border-white/14 focus-within:ring-1 focus-within:ring-white/10"
            }`}
          >
            <textarea
              id="chat-input"
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder={
                isStreaming
                  ? `${currentPersona.name} is responding…`
                  : "Message… (Enter to send)"
              }
              className="flex-1 max-h-40 resize-none bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <button
              id="send-message-btn"
              onClick={() => handleSendMessage()}
              disabled={!input.trim() || isStreaming}
              className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:bg-zinc-800 text-white disabled:text-zinc-600 transition-all shadow-md shadow-indigo-900/30"
            >
              <Send className="size-4" />
            </button>
          </div>
          <p className="text-[11px] text-zinc-600 text-center mt-2">
            Powered by LangGraph &amp; Gemini · Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>

      {/* ── Traits modal ─────────────────────────────────────────────── */}
      <TraitsModal
        isOpen={isTraitsModalOpen}
        onClose={() => setIsTraitsModalOpen(false)}
        userId={userId}
        apiUrl={BACKEND_URL}
      />
    </div>
  );
}
