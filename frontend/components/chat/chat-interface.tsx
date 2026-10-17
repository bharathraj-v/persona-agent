"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  RotateCcw,
  SlidersHorizontal,
  MessageSquare,
  Compass,
  Sparkles,
} from "lucide-react";
import { ChatMessage, DetectedStyle, PersonaInfo, TraitScore, TraitInsight } from "./types";
import { TraitsModal } from "./traits-modal";
import { LiveInsightsPanel } from "./live-insights-panel";
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
  "Free weekend: do you plan out every detail or just wing it?",
  "Honestly, I hate when people are passive-aggressive at work.",
  "I'm weighing a safe corporate job against a chaotic startup — thoughts?",
  "Late nights with ideas or early morning routine? What's your vibe?",
];

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

// ─── Main Interface ───────────────────────────────────────────────────────────

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
  const [isInsightsOpen, setIsInsightsOpen] = useState(true);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  // Live Personality Trait State
  const [liveTraits, setLiveTraits] = useState<TraitScore[]>([]);
  const [latestInsight, setLatestInsight] = useState<TraitInsight | null>(null);
  const [currentTargetTrait, setCurrentTargetTrait] = useState<{
    trait_id: string;
    name: string;
    domain: string;
  } | null>(null);
  const [toastInsight, setToastInsight] = useState<TraitInsight | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      setServerOnline(res.ok);
    } catch {
      setServerOnline(false);
    }
  }, []);

  const loadInitialTraits = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/profile/${userId}/traits`);
      if (res.ok) {
        const data = await res.json();
        if (data.traits) setLiveTraits(data.traits);
      }
    } catch {
      // Quiet fail if server unreachable
    }
  }, [userId]);

  useEffect(() => {
    setThreadId("thread_" + Math.random().toString(36).substring(2, 9));
    checkHealth();
    loadInitialTraits();
  }, [checkHealth, loadInitialTraits]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleResetSession = () => {
    setThreadId("thread_" + Math.random().toString(36).substring(2, 9));
    setMessages([]);
    setActivePersonaId("discovery");
    setPersonaLocked(false);
    setStreamingMessageId(null);
    setLatestInsight(null);
    setCurrentTargetTrait(null);
    setToastInsight(null);
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
        buffer = rawMessages.pop() ?? "";

        for (const rawMsg of rawMessages) {
          if (!rawMsg.trim()) continue;

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
            } else if (eventType === "persona" && parsed.persona_id) {
              setActivePersonaId(parsed.persona_id);
              if (parsed.locked) setPersonaLocked(true);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === asstId ? { ...m, personaId: parsed.persona_id } : m
                )
              );
            } else if (eventType === "target_trait" && parsed.trait_id) {
              setCurrentTargetTrait(parsed);
            } else if (eventType === "trait_updated" && parsed.trait_id) {
              const insight: TraitInsight = parsed;
              setLatestInsight(insight);
              setToastInsight(insight);
              setTimeout(() => setToastInsight(null), 6000);

              // Update live traits collection
              setLiveTraits((prev) => {
                const idx = prev.findIndex((t) => t.trait_id === insight.trait_id);
                const updated: TraitScore = {
                  trait_id: insight.trait_id,
                  name: insight.name,
                  domain: insight.domain,
                  score: insight.score,
                  confidence: insight.confidence,
                  observation_count: idx >= 0 ? prev[idx].observation_count + 1 : 1,
                  low_anchor: insight.low_anchor,
                  high_anchor: insight.high_anchor,
                  scale_min: insight.scale_min,
                  scale_max: insight.scale_max,
                  last_quote: insight.quote,
                  last_reasoning: insight.reasoning,
                };
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = updated;
                  return copy;
                }
                return [updated, ...prev];
              });
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
            // Partial / non-JSON data chunk
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
  const exploredTraitsCount = liveTraits.filter((t) => (t.observation_count || 0) > 0 || (t.confidence || 0) > 0).length;

  return (
    <div className="flex h-screen w-full flex-col bg-[#09090f] text-zinc-100 font-sans antialiased overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/6 bg-[#09090f]/90 px-4 md:px-6 backdrop-blur-md z-10">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 font-bold text-sm text-white shadow-lg shadow-indigo-500/20">
            A
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-zinc-100 leading-none">
              Aura<span className="text-indigo-400">·</span>Agent
            </span>
            <span className="text-[10px] text-zinc-500 font-medium">personality profiler</span>
          </div>
        </div>

        {/* Active Persona Pill — center */}
        <PersonaPill persona={currentPersona} locked={personaLocked} />

        {/* Right actions */}
        <div className="flex items-center gap-1.5">
          <StatusDot online={serverOnline} />

          {/* Toggle Live Insights Panel */}
          <button
            id="toggle-insights-btn"
            onClick={() => setIsInsightsOpen(!isInsightsOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              isInsightsOpen
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-zinc-300 hover:text-white bg-white/4 hover:bg-white/8 border border-white/6"
            }`}
            title="Toggle Live Personality Map"
          >
            <Compass className="size-3.5" />
            <span className="hidden sm:inline">Map</span>
            <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-black/30">
              {exploredTraitsCount}/8
            </span>
          </button>

          <Tooltip>
            <TooltipTrigger
              id="traits-profile-btn"
              onClick={() => setIsTraitsModalOpen(true)}
              className="flex size-7 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/6 transition-colors"
            >
              <SlidersHorizontal className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Full Profile Rubrics
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

      {/* ── Live Insight Toast Notification Banner ─────────────────────── */}
      {toastInsight && (
        <div className="sticky top-14 z-20 mx-auto w-full max-w-xl px-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-indigo-500/30 bg-indigo-950/80 backdrop-blur-md text-xs text-indigo-200 shadow-xl">
            <div className="flex items-center gap-2 truncate">
              <Sparkles className="size-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">
                New insight: <strong className="text-white font-medium">{toastInsight.name}</strong> ({toastInsight.score.toFixed(1)}/7)
              </span>
            </div>
            <button
              onClick={() => setIsInsightsOpen(true)}
              className="text-[11px] underline text-indigo-300 hover:text-white shrink-0 font-medium"
            >
              View Map →
            </button>
          </div>
        </div>
      )}

      {/* ── Message list ──────────────────────────────────────────────── */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="mx-auto max-w-2xl px-4 py-8 space-y-5">
          {messages.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center pt-16 text-center space-y-6">
              <div className="size-16 rounded-2xl bg-gradient-to-tr from-indigo-500/20 via-violet-500/20 to-emerald-500/20 border border-indigo-500/30 flex items-center justify-center text-3xl shadow-xl shadow-indigo-500/10">
                ✨
              </div>
              <div className="space-y-2 max-w-sm">
                <h2 className="text-lg font-semibold text-zinc-100">
                  Meet Aura
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Talk naturally about your day, how you make decisions, or what matters to you.
                  Aura adapts its vibe to yours while continuously mapping your authentic personality.
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

                return (
                  <div
                    key={message.id}
                    className={`flex gap-3 items-end ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    {/* Assistant avatar */}
                    {!isUser && (
                      <div
                        className="size-8 shrink-0 rounded-xl bg-zinc-900/80 border border-white/8 flex items-center justify-center text-sm shadow-sm"
                        title={persona?.name}
                      >
                        {persona?.avatar ?? "✨"}
                      </div>
                    )}

                    {/* Bubble */}
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] space-y-1 ${
                        isUser ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                          isUser
                            ? "bg-indigo-600 text-white rounded-br-sm"
                            : "bg-zinc-900/80 border border-white/6 text-zinc-100 rounded-bl-sm"
                        }`}
                      >
                        {isCurrentlyStreaming && !message.content ? (
                          <div className="flex gap-1.5 items-center h-4">
                            {[0, 150, 300].map((delay) => (
                              <span
                                key={delay}
                                className="size-1.5 rounded-full bg-zinc-500 animate-bounce"
                                style={{
                                  animationDelay: `${delay}ms`,
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
                        className={`text-[10px] text-zinc-600 px-1 ${
                          isUser ? "text-right" : "text-left"
                        }`}
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
                  : "Message Aura… (Enter to send)"
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
            Aura Profiler · Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>

      {/* ── Live Personality Insights Panel (Slide-out) ───────────────── */}
      <LiveInsightsPanel
        isOpen={isInsightsOpen}
        onClose={() => setIsInsightsOpen(false)}
        traits={liveTraits}
        latestInsight={latestInsight}
        currentTargetTrait={currentTargetTrait}
      />

      {/* ── Full Rubrics Modal ────────────────────────────────────────── */}
      <TraitsModal
        isOpen={isTraitsModalOpen}
        onClose={() => setIsTraitsModalOpen(false)}
        userId={userId}
        apiUrl={BACKEND_URL}
      />
    </div>
  );
}
