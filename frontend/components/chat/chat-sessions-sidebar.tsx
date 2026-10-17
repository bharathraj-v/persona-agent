"use client";

import React, { useState } from "react";
import {
  Plus,
  MessageSquare,
  Trash2,
  RotateCcw,
  PanelLeftClose,
  AlertTriangle,
  Clock,
  User,
  X,
} from "lucide-react";
import { ChatSession } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatSessionsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  currentSessionId: string;
  onSelectSession: (threadId: string) => void;
  onNewChat: () => void;
  onDeleteSession: (threadId: string, e: React.MouseEvent) => void;
  onResetProfile: () => Promise<void>;
  userId: string;
}

export function ChatSessionsSidebar({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onResetProfile,
  userId,
}: ChatSessionsSidebarProps) {
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleConfirmReset = async () => {
    setIsResetting(true);
    try {
      await onResetProfile();
      setIsResetDialogOpen(false);
    } finally {
      setIsResetting(false);
    }
  };

  const formatActivityTime = (isoString: string | null) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* ── Overlay for mobile ────────────────────────────────────── */}
      <div
        className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* ── Left Sidebar ──────────────────────────────────────────── */}
      <aside
        id="chat-sessions-sidebar"
        className="fixed inset-y-0 left-0 z-40 w-72 sm:w-80 flex flex-col border-r border-white/8 bg-[#09090f]/95 backdrop-blur-xl text-zinc-100 shadow-2xl transition-all duration-300 animate-in slide-in-from-left"
      >
        {/* ── Top Header ────────────────────────────────────────────── */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/6 px-4">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <MessageSquare className="size-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-tight text-zinc-200">
                Chat History
              </h3>
              <p className="text-[10px] text-zinc-500">
                {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
              </p>
            </div>
          </div>
          <button
            id="close-sidebar-btn"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/6 transition-colors"
            title="Close sidebar"
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>

        {/* ── New Chat Action ───────────────────────────────────────── */}
        <div className="p-3 border-b border-white/6">
          <button
            id="new-chat-btn"
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-medium shadow-md shadow-indigo-600/20 active:scale-[0.98] transition-all"
          >
            <Plus className="size-4" />
            <span>New Chat</span>
          </button>
        </div>

        {/* ── Sessions List ─────────────────────────────────────────── */}
        <ScrollArea className="flex-1 min-h-0 px-2 py-3">
          <div className="space-y-1">
            {sessions.length === 0 ? (
              <div className="py-12 text-center space-y-2 px-4">
                <div className="size-8 rounded-full bg-white/4 border border-white/6 mx-auto flex items-center justify-center text-zinc-500">
                  <Clock className="size-4" />
                </div>
                <p className="text-xs text-zinc-400 font-medium">No sessions yet</p>
                <p className="text-[11px] text-zinc-600 leading-relaxed">
                  Start chatting with Aura to record conversation history.
                </p>
              </div>
            ) : (
              sessions.map((s) => {
                const isActive = s.thread_id === currentSessionId;
                return (
                  <div
                    key={s.thread_id}
                    onClick={() => onSelectSession(s.thread_id)}
                    className={`group relative flex items-start justify-between gap-2 p-2.5 rounded-xl cursor-pointer transition-all border ${
                      isActive
                        ? "bg-indigo-600/15 border-indigo-500/30 text-white shadow-sm"
                        : "bg-transparent border-transparent hover:bg-white/4 hover:border-white/6 text-zinc-300 hover:text-zinc-100"
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-6 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`size-1.5 rounded-full shrink-0 ${
                            isActive ? "bg-indigo-400" : "bg-zinc-600"
                          }`}
                        />
                        <p className="text-xs font-medium truncate leading-tight">
                          {s.title || "Conversation"}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-zinc-500 pl-3">
                        <span className="truncate max-w-[120px]">
                          {s.message_count} {s.message_count === 1 ? "msg" : "msgs"}
                        </span>
                        <span>{formatActivityTime(s.last_activity)}</span>
                      </div>
                    </div>

                    {/* Delete button (visible on hover) */}
                    <button
                      onClick={(e) => onDeleteSession(s.thread_id, e)}
                      title="Delete conversation"
                      className="opacity-0 group-hover:opacity-100 absolute right-2 top-2.5 p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* ── Footer / Profile Reset ─────────────────────────────────── */}
        <div className="shrink-0 border-t border-white/6 p-3 space-y-2 bg-[#09090f]/80">
          <div className="flex items-center justify-between px-2 py-1 text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <div className="size-6 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center text-zinc-300">
                <User className="size-3.5" />
              </div>
              <span className="font-mono text-[11px] text-zinc-300 truncate max-w-[120px]">
                {userId}
              </span>
            </div>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              Active
            </span>
          </div>

          <button
            id="reset-profile-btn"
            onClick={() => setIsResetDialogOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/15 text-red-300 hover:text-red-200 text-xs font-medium transition-all group"
          >
            <RotateCcw className="size-3.5 group-hover:-rotate-45 transition-transform" />
            <span>Reset Profile</span>
          </button>
        </div>
      </aside>

      {/* ── Reset Confirmation Modal ──────────────────────────────────── */}
      {isResetDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => !isResetting && setIsResetDialogOpen(false)}
        >
          <div
            className="relative w-full max-w-md flex flex-col rounded-2xl border border-white/10 bg-[#0d0d15] p-5 text-zinc-100 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                  <AlertTriangle className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Reset Profile & Trait Data?
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    This action deletes all collected insights
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isResetting && setIsResetDialogOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-white/6 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              This will permanently remove all your collected trait scores, confidence levels,
              and behavioral evidence quotes from the database.
              <br /><br />
              <strong className="text-zinc-200">Note:</strong> Your past chat message history will
              remain intact. Aura will begin personality discovery anew.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/6">
              <button
                onClick={() => setIsResetDialogOpen(false)}
                disabled={isResetting}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="confirm-reset-profile-btn"
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-medium shadow-md shadow-red-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <span className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Resetting…</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-3.5" />
                    <span>Confirm Reset</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
