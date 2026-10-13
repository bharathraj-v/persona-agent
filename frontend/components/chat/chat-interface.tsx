"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Send, 
  RotateCcw, 
  Sparkles, 
  Moon, 
  Sun, 
  SlidersHorizontal, 
  MessageSquare, 
  CheckCircle2, 
  AlertCircle,
  Terminal,
  ChevronDown,
  Info
} from "lucide-react";
import { ChatMessage, DetectedStyle, PersonaInfo } from "./types";
import { TraitsModal } from "./traits-modal";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const DEFAULT_PERSONAS: Record<string, PersonaInfo> = {
  discovery: {
    id: "discovery",
    name: "Nova",
    avatar: "✨",
    tagline: "Adaptive companion discovering your vibe"
  },
  curious_banter: {
    id: "curious_banter",
    name: "Leo",
    avatar: "⚡",
    tagline: "Witty, quick, and observant friend"
  },
  pragmatic_mentor: {
    id: "pragmatic_mentor",
    name: "Marcus",
    avatar: "🧭",
    tagline: "Grounded, calm, and candid mentor"
  },
  empathetic_confidant: {
    id: "empathetic_confidant",
    name: "Maya",
    avatar: "🌿",
    tagline: "Warm, intuitive, and attentive listener"
  },
  analytical_challenger: {
    id: "analytical_challenger",
    name: "Zane",
    avatar: "🎯",
    tagline: "Sharp intellectual sparring partner"
  }
};

const STARTER_PROMPTS = [
  "Hey! What's something interesting you've been thinking about lately?",
  "I'm working on a tricky project and need someone to bounce ideas off of.",
  "When you have a completely free weekend, do you plan it out or just wing it?",
  "Tell me your hottest take on modern tech."
];

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [userId, setUserId] = useState("user_default");
  const [threadId, setThreadId] = useState("");
  const [activePersonaId, setActivePersonaId] = useState("discovery");
  const [personaLocked, setPersonaLocked] = useState(false);
  const [detectedStyle, setDetectedStyle] = useState<DetectedStyle | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [isTraitsModalOpen, setIsTraitsModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize unique session thread
  useEffect(() => {
    const randomId = "thread_" + Math.random().toString(36).substring(2, 9);
    setThreadId(randomId);

    // Initial check of backend health
    checkHealth();
  }, []);

  // Sync dark mode class with root html
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const checkHealth = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/health`, { method: "GET" });
      setServerOnline(res.ok);
    } catch {
      setServerOnline(false);
    }
  };

  const handleResetSession = () => {
    const newThread = "thread_" + Math.random().toString(36).substring(2, 9);
    setThreadId(newThread);
    setMessages([]);
    setActivePersonaId("discovery");
    setPersonaLocked(false);
    setDetectedStyle(null);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isStreaming) return;

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMessage: ChatMessage = {
      id: "usr_" + Date.now(),
      role: "user",
      content: text,
      timestamp: new Date()
    };

    const assistantPlaceholderId = "ast_" + Date.now();
    const assistantMessage: ChatMessage = {
      id: assistantPlaceholderId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
      personaId: activePersonaId
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream"
        },
        body: JSON.stringify({
          message: text,
          user_id: userId,
          thread_id: threadId,
          persona_id: activePersonaId === "discovery" ? null : activePersonaId
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      setServerOnline(true);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "message";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith("event:")) {
            currentEvent = trimmed.replace("event:", "").trim();
          } else if (trimmed.startsWith("data:")) {
            const rawData = trimmed.replace("data:", "").trim();
            try {
              const parsed = JSON.parse(rawData);

              if (currentEvent === "delta" && parsed.token) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantPlaceholderId
                      ? { ...m, content: m.content + parsed.token }
                      : m
                  )
                );
              } else if (currentEvent === "style") {
                setDetectedStyle(parsed);
              } else if (currentEvent === "persona" && parsed.persona_id) {
                setActivePersonaId(parsed.persona_id);
                if (parsed.locked) setPersonaLocked(true);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantPlaceholderId
                      ? { ...m, personaId: parsed.persona_id }
                      : m
                  )
                );
              } else if (currentEvent === "done") {
                if (parsed.persona_id) {
                  setActivePersonaId(parsed.persona_id);
                }
              }
            } catch (e) {
              // Ignore partial chunk parse error
            }
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantPlaceholderId ? { ...m, isStreaming: false } : m
        )
      );
    } catch (err: any) {
      console.error("Chat error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantPlaceholderId
            ? {
                ...m,
                content:
                  m.content ||
                  `[Connection Error]: Unable to reach ${BACKEND_URL}. Ensure the FastAPI server is running with 'uvicorn app.main:app'.`,
                isStreaming: false
              }
            : m
        )
      );
      setServerOnline(false);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const currentPersona = DEFAULT_PERSONAS[activePersonaId] || DEFAULT_PERSONAS["discovery"];

  return (
    <div className="flex h-screen w-full flex-col bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Header Bar */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/80 px-4 md:px-8 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 font-bold text-white shadow-lg shadow-indigo-500/20">
            P
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-zinc-100">persona-agent</h1>
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                v0.1.0
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 hidden sm:block">
              Continuous Memory • Dynamic Persona • Trait Elicitation
            </p>
          </div>
        </div>

        {/* Center: Active Persona Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 text-xs shadow-sm">
          <span className="text-sm">{currentPersona.avatar}</span>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-zinc-200">{currentPersona.name}</span>
            <span className="text-zinc-500">•</span>
            <span className="text-zinc-400 truncate max-w-[140px] md:max-w-xs">
              {personaLocked ? currentPersona.tagline : "Discovery Mode"}
            </span>
          </div>
          {personaLocked && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              Locked
            </span>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Backend Status indicator */}
          <div 
            onClick={checkHealth}
            title={serverOnline ? "Backend Connected (FastAPI)" : "Backend Offline - click to retry"}
            className="cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono border border-zinc-850 bg-zinc-900/40 hover:bg-zinc-900 transition-colors"
          >
            <span className={`size-2 rounded-full ${serverOnline === true ? "bg-emerald-400 animate-pulse" : serverOnline === false ? "bg-red-500" : "bg-amber-400"}`} />
            <span className="text-zinc-400 hidden md:inline">{serverOnline ? "API Online" : "API Offline"}</span>
          </div>

          {/* Traits Profile Button */}
          <button
            onClick={() => setIsTraitsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-xs font-medium text-zinc-200 transition-colors"
          >
            <SlidersHorizontal className="size-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Profile Traits</span>
          </button>

          {/* Reset Session */}
          <button
            onClick={handleResetSession}
            title="Start new thread"
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg transition-colors"
          >
            <RotateCcw className="size-4" />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            title="Toggle theme"
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg transition-colors"
          >
            {isDarkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </header>

      {/* Main Conversation Container */}
      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center pt-16 md:pt-24 text-center space-y-6">
              <div className="size-16 rounded-3xl bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-3xl shadow-xl shadow-indigo-500/5">
                ✨
              </div>
              <div className="space-y-2 max-w-md">
                <h2 className="text-xl font-semibold tracking-tight text-zinc-100">
                  Ready to chat with Nova
                </h2>
                <p className="text-sm text-zinc-400">
                  Speak naturally in your everyday texting style. As you chat, the agent adapts its tone and matches you with a specialized companion persona.
                </p>
              </div>

              {/* Starter Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl text-left pt-2">
                {STARTER_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(prompt)}
                    className="p-3.5 rounded-xl border border-zinc-850 bg-zinc-900/50 hover:bg-zinc-900 hover:border-zinc-700/80 text-xs text-zinc-300 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-start gap-2 group"
                  >
                    <MessageSquare className="size-3.5 text-zinc-500 group-hover:text-indigo-400 shrink-0 mt-0.5 transition-colors" />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Message Stream */
            messages.map((message) => {
              const isUser = message.role === "user";
              const personaForMsg = message.personaId ? DEFAULT_PERSONAS[message.personaId] : currentPersona;

              return (
                <div
                  key={message.id}
                  className={`flex gap-3 text-sm ${isUser ? "justify-end" : "justify-start"} animate-in fade-in duration-150`}
                >
                  {!isUser && (
                    <div className="size-8 shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm shadow-sm">
                      {personaForMsg?.avatar || "🤖"}
                    </div>
                  )}

                  <div className={`space-y-1.5 max-w-[85%] md:max-w-[75%]`}>
                    {!isUser && (
                      <div className="flex items-center gap-2 text-xs text-zinc-400 px-1 font-medium">
                        <span>{personaForMsg?.name || "Assistant"}</span>
                        {message.isStreaming && (
                          <span className="size-1.5 rounded-full bg-indigo-400 animate-ping" />
                        )}
                      </div>
                    )}

                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        isUser
                          ? "bg-indigo-600 text-white rounded-tr-sm shadow-md shadow-indigo-600/10 font-normal"
                          : "bg-zinc-900/90 text-zinc-100 border border-zinc-800/80 rounded-tl-sm shadow-sm"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      {message.isStreaming && !message.content && (
                        <span className="inline-block h-4 w-1 animate-pulse bg-zinc-400 rounded-full" />
                      )}
                    </div>

                    <div className={`text-[10px] text-zinc-500 px-1 flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                      <span>
                        {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>

                  {isUser && (
                    <div className="size-8 shrink-0 rounded-xl bg-indigo-950 border border-indigo-800/60 flex items-center justify-center text-xs font-semibold text-indigo-300">
                      U
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="border-t border-zinc-850 bg-zinc-950/90 p-4 md:px-8">
        <div className="mx-auto max-w-3xl space-y-2">
          {/* Subtle Dynamic Style Feedback Pill */}
          {detectedStyle && (
            <div className="flex items-center gap-2 text-[11px] text-zinc-500 px-1 animate-in fade-in">
              <Sparkles className="size-3 text-indigo-400" />
              <span>Detected style:</span>
              <span className="font-mono text-zinc-400 capitalize">{detectedStyle.length_preference || "concise"}</span>
              <span>•</span>
              <span className="font-mono text-zinc-400 capitalize">{detectedStyle.slang_level || "casual"} slang</span>
              <span>•</span>
              <span className="font-mono text-zinc-400 capitalize">{detectedStyle.energy || "chill"} vibe</span>
            </div>
          )}

          <div className="relative flex items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-2 shadow-xl focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-700 transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="Send a message... (Enter to send, Shift+Enter for newline)"
              className="flex-1 max-h-40 resize-none bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!input.trim() || isStreaming}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white disabled:text-zinc-500 transition-colors shadow-md shadow-indigo-600/20"
            >
              <Send className="size-4" />
            </button>
          </div>

          <div className="flex justify-between items-center text-[11px] text-zinc-500 px-1">
            <span>Powered by LangGraph & Google Gemini</span>
            <span>Thread: <span className="font-mono">{threadId || "..."}</span></span>
          </div>
        </div>
      </footer>

      {/* Profile Traits Slide-over Modal */}
      <TraitsModal
        isOpen={isTraitsModalOpen}
        onClose={() => setIsTraitsModalOpen(false)}
        userId={userId}
        apiUrl={BACKEND_URL}
      />
    </div>
  );
}
