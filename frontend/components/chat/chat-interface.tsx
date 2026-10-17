"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  RotateCcw,
  Compass,
} from "lucide-react";
import { ChatMessage, TraitScore, TraitInsight, ChatSession } from "./types";
import { SignalsDrawer } from "./signals-drawer";
import { ChatSessionsSidebar } from "./chat-sessions-sidebar";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const createThreadId = () => "thread_" + Math.random().toString(36).substring(2, 9);

const PERSONA_TYPES: Record<string, string> = {
  curious_banter: "curious banter",
  pragmatic_mentor: "pragmatic mentor",
  empathetic_confidant: "empathetic confidant",
  analytical_challenger: "analytical challenger",
};

// ─── Components ───────────────────────────────────────────────────────────────

function PersonaPill({ personaId, locked }: { personaId: string; locked: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-medium text-[var(--foreground)]">Aura</span>
      {locked ? (
        <span className="rounded-full border border-[var(--moss)]/40 bg-[var(--moss)]/10 px-2 py-1 text-[10px] text-[var(--moss)]">
          Type · {PERSONA_TYPES[personaId] ?? "adaptive"}
        </span>
      ) : (
        <span className="text-[10px] text-[var(--muted-foreground)]">listening</span>
      )}
    </div>
  );
}

function StatusDot({ online }: { online: boolean | null }) {
  const color =
    online === true
      ? "bg-[var(--moss)]"
      : online === false
      ? "bg-[var(--destructive)]"
      : "bg-[var(--gold)]";
  const label =
    online === true ? "API online" : online === false ? "API offline" : "Checking…";
  return (
    <Tooltip>
      <TooltipTrigger
        className="flex size-7 cursor-default items-center justify-center rounded-full transition-colors hover:bg-[var(--muted)]"
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
  return <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-[var(--primary)] align-middle" />;
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
  const [isInsightsOpen, setIsInsightsOpen] = useState(true);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  // Chat Sessions History State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
  const messageSequenceRef = useRef(0);

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

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/chat/sessions?user_id=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // Quiet fail if server unreachable
    }
  }, [userId]);

  useEffect(() => {
    // These calls synchronize the UI with the remote chat/profile services on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThreadId(createThreadId());
    checkHealth();
    loadInitialTraits();
    loadSessions();
  }, [checkHealth, loadInitialTraits, loadSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleResetSession = () => {
    setThreadId(createThreadId());
    setMessages([]);
    setActivePersonaId("discovery");
    setPersonaLocked(false);
    setStreamingMessageId(null);
    setLatestInsight(null);
    setCurrentTargetTrait(null);
    setToastInsight(null);
  };

  const handleSelectSession = async (selectedThreadId: string) => {
    if (isStreaming) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/chat/sessions/${selectedThreadId}/messages`);
      if (res.ok) {
        const data = await res.json();
        const formatted: ChatMessage[] = (data.messages || []).map((m: {
          id: string;
          role: "user" | "assistant";
          content: string;
          created_at?: string;
          persona_id?: string;
        }) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: m.created_at ? new Date(m.created_at) : new Date(),
          personaId: m.persona_id || "discovery",
        }));
        setMessages(formatted);
        setThreadId(selectedThreadId);

        // Resolve active persona from last message
        const lastAsst = [...formatted].reverse().find((m) => m.role === "assistant");
        if (lastAsst?.personaId && lastAsst.personaId !== "discovery") {
          setActivePersonaId(lastAsst.personaId);
          setPersonaLocked(true);
        } else {
          setActivePersonaId("discovery");
          setPersonaLocked(false);
        }
      }
    } catch (err) {
      console.error("Failed to load session messages:", err);
    }
  };

  const handleDeleteSession = async (deletedThreadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${BACKEND_URL}/api/chat/sessions/${deletedThreadId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.thread_id !== deletedThreadId));
        if (deletedThreadId === threadId) {
          handleResetSession();
        }
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const handleResetProfile = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/profile/${userId}/reset`, {
        method: "POST",
      });
      if (res.ok) {
        setLiveTraits([]);
        setLatestInsight(null);
        setCurrentTargetTrait(null);
        setToastInsight(null);
        await loadInitialTraits();
      }
    } catch (err) {
      console.error("Failed to reset profile:", err);
    }
  };


  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isStreaming) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMessage: ChatMessage = {
      id: `usr_${messageSequenceRef.current++}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    const asstId = `ast_${messageSequenceRef.current++}`;
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
      loadSessions();
    }
  };


  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const exploredTraitsCount = liveTraits.filter((t) => (t.observation_count || 0) > 0 || (t.confidence || 0) > 0).length;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[var(--background)] font-sans text-[var(--foreground)] antialiased">
      <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/90 px-4 backdrop-blur-md md:px-7">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="aura-mark" aria-hidden="true" />
            <span className="font-serif text-lg tracking-[-0.04em]">Aura</span>
          </div>
        </div>

        <PersonaPill personaId={activePersonaId} locked={personaLocked} />

        <div className="flex items-center gap-1.5">
          <StatusDot online={serverOnline} />
          <button
            id="toggle-insights-btn"
            onClick={() => setIsInsightsOpen(!isInsightsOpen)}
            aria-pressed={isInsightsOpen}
            className={`flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors ${
              isInsightsOpen
                ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
            title="Open signals"
          >
            <Compass className="size-3.5" />
            <span className="hidden sm:inline">Signals</span>
            <span className="text-[10px] opacity-70">{exploredTraitsCount}/8</span>
          </button>

          <Tooltip>
            <TooltipTrigger
              id="reset-session-btn"
              onClick={handleResetSession}
              className="flex size-9 items-center justify-center rounded-full border border-transparent text-[var(--muted-foreground)] transition-colors hover:border-[var(--border)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <RotateCcw className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">New chat</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {toastInsight && (
        <div className="signal-in sticky top-16 z-20 mx-auto w-full max-w-2xl px-4 pt-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--primary)]/30 bg-[var(--surface-strong)] px-3 py-2.5 text-xs shadow-[0_8px_24px_rgba(48,40,30,0.08)]">
            <div className="flex min-w-0 items-center gap-2 truncate">
              <span className="size-2 shrink-0 rounded-full bg-[var(--primary)]" />
              <span className="truncate">
                New signal: <strong className="font-semibold">{toastInsight.name}</strong>
              </span>
            </div>
            <button
              onClick={() => setIsInsightsOpen(true)}
              className="shrink-0 text-[11px] font-semibold text-[var(--primary)] hover:underline"
            >
              Open signals
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 lg:flex">
      <ChatSessionsSidebar
        isOpen={isSidebarOpen}
        onOpen={() => setIsSidebarOpen(true)}
        onClose={() => setIsSidebarOpen(false)}
        sessions={sessions}
        currentSessionId={threadId}
        onSelectSession={handleSelectSession}
        onNewChat={handleResetSession}
        onDeleteSession={handleDeleteSession}
        onResetProfile={handleResetProfile}
        userId={userId}
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-12">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-24 text-center md:pt-32">
              <div className="mb-7 flex size-20 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
                <div className="aura-mark scale-125" aria-hidden="true" />
              </div>
              <h1 className="font-serif text-4xl tracking-[-0.045em] md:text-5xl">Hello, I’m Aura.</h1>
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">What’s on your mind?</p>
            </div>
          ) : (
            <div>
              {messages.map((message, index) => {
                const isUser = message.role === "user";
                const isCurrentlyStreaming =
                  message.isStreaming && message.id === streamingMessageId;
                const previousMessage = messages[index - 1];
                const isGrouped = previousMessage?.role === message.role;

                return (
                  <div
                    key={message.id}
                    className={`flex items-end gap-3 ${
                      isGrouped ? "mt-1" : "mt-7 first:mt-0"
                    } ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      isGrouped ? <div className="w-8 shrink-0" /> : <div className="aura-mark shrink-0" aria-hidden="true" />
                    )}

                    <div className={`max-w-[88%] space-y-1 sm:max-w-[76%] ${isUser ? "items-end" : "items-start"}`}>
                      <div
                        className={`px-4 py-3 text-sm leading-relaxed ${
                          isUser
                            ? "rounded-2xl rounded-br-md bg-[var(--primary)] text-[var(--primary-foreground)]"
                            : "rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
                        }`}
                      >
                        {isCurrentlyStreaming && !message.content ? (
                          <div className="flex h-4 items-center gap-1.5">
                            {[0, 150, 300].map((delay) => (
                              <span
                                key={delay}
                                className="size-1.5 animate-bounce rounded-full bg-[var(--muted-foreground)]"
                                style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
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
                      {!isGrouped && (
                        <div className={`px-1 text-[10px] text-[var(--muted-foreground)] ${isUser ? "text-right" : "text-left"}`}>
                          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
          {messages.length === 0 && <div ref={messagesEndRef} />}
        </div>
      </ScrollArea>

      <div className="border-t border-[var(--border)] bg-[var(--background)]/90 px-4 pb-5 pt-3 backdrop-blur-md md:px-6">
        <div className="mx-auto max-w-3xl">
          <div
            className={`relative flex items-end gap-2 rounded-2xl border bg-[var(--surface-strong)] p-2 transition-all duration-200 ${
              isStreaming
                ? "border-[var(--primary)]/50 ring-2 ring-[var(--primary)]/10"
                : "border-[var(--border)] focus-within:border-[var(--primary)]/60 focus-within:ring-2 focus-within:ring-[var(--primary)]/10"
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
              placeholder={isStreaming ? "Aura is responding…" : "Say something to Aura…"}
              className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              id="send-message-btn"
              onClick={() => handleSendMessage()}
              disabled={!input.trim() || isStreaming}
              aria-label="Send message"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] transition-transform hover:brightness-105 active:scale-95 disabled:bg-[var(--muted)] disabled:text-[var(--muted-foreground)]"
            >
              <Send className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-[var(--muted-foreground)]">
            Enter to send · Shift + Enter for a new line
          </p>
        </div>
      </div>

      </main>

      <SignalsDrawer
        isOpen={isInsightsOpen}
        onClose={() => setIsInsightsOpen(false)}
        onRefresh={loadInitialTraits}
        traits={liveTraits}
        latestInsight={latestInsight}
        currentTargetTrait={currentTargetTrait}
      />
      </div>
    </div>
  );
}
