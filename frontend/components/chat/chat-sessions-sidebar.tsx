"use client";

import React, { useState } from "react";
import { AlertTriangle, Clock, PanelLeftClose, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { ChatSession } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatSessionsSidebarProps {
  isOpen: boolean;
  onOpen: () => void;
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
  onOpen,
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

  const formatActivityTime = (isoString: string | null) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "now";
      if (diffMins < 60) return `${diffMins}m`;
      if (diffHours < 24) return `${diffHours}h`;
      if (diffDays === 1) return "yesterday";
      if (diffDays < 7) return `${diffDays}d`;
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const handleConfirmReset = async () => {
    setIsResetting(true);
    try {
      await onResetProfile();
      setIsResetDialogOpen(false);
    } finally {
      setIsResetting(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        id="open-sidebar-btn"
        onClick={onOpen}
        aria-label="Open chat history"
        title="Open chat history"
        className="fixed left-4 top-20 z-20 flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted-foreground)] shadow-lg transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <PanelLeftClose className="size-4 rotate-180" />
      </button>
    );
  }

  return (
    <>
      <button
        aria-label="Close history"
        className="fixed inset-0 z-30 cursor-default bg-[#24231f]/20 backdrop-blur-[2px] lg:hidden"
        onClick={onClose}
      />

      <aside
        id="chat-sessions-sidebar"
        className="fixed inset-y-0 left-0 z-40 flex w-full max-w-[22rem] flex-col border-r border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-[18px_0_50px_rgba(0,0,0,0.24)] animate-in slide-in-from-left duration-300 lg:static lg:w-72 lg:max-w-none lg:shrink-0 lg:shadow-none"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Chats</h2>
          <button
            id="close-sidebar-btn"
            onClick={onClose}
            aria-label="Close history"
            className="flex size-8 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>

        <div className="border-b border-[var(--border)] p-3">
          <button
            id="new-chat-btn"
            onClick={onNewChat}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-full bg-[var(--foreground)] px-3 text-xs font-semibold text-[var(--surface-strong)] transition-colors hover:bg-[var(--primary)]"
          >
            <Plus className="size-4" />
            New chat
          </button>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-3 py-4">
          {sessions.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <Clock className="mx-auto mb-3 size-5 text-[var(--muted-foreground)]" />
              <p className="text-sm font-semibold">No conversations yet</p>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">Start a chat to see it here.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => {
                const isActive = session.thread_id === currentSessionId;
                return (
                  <div
                    key={session.thread_id}
                    onClick={() => onSelectSession(session.thread_id)}
                    className={`group relative flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 transition-colors ${
                      isActive
                        ? "border-[var(--primary)]/30 bg-[var(--primary)]/8"
                        : "border-transparent hover:bg-[var(--muted)]"
                    }`}
                  >
                    <span className={`size-1.5 shrink-0 rounded-full ${isActive ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{session.title || "Conversation"}</p>
                      <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                        {formatActivityTime(session.last_activity)}
                      </p>
                    </div>
                    <button
                      onClick={(event) => onDeleteSession(session.thread_id, event)}
                      title="Delete conversation"
                      aria-label={`Delete ${session.title || "conversation"}`}
                      className="invisible flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors group-hover:visible hover:bg-[var(--destructive)]/10 hover:text-[var(--destructive)]"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="shrink-0 border-t border-[var(--border)] p-4">
          <div className="mb-3 flex items-center justify-between px-1 text-[10px] text-[var(--muted-foreground)]">
            <span>{userId}</span>
            <span className="flex items-center gap-1.5 text-[var(--moss)]">
              <span className="size-1.5 rounded-full bg-[var(--moss)]" />
              active
            </span>
          </div>
          <button
            id="reset-profile-btn"
            onClick={() => setIsResetDialogOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-transparent px-3 py-2 text-xs text-[var(--muted-foreground)] transition-colors hover:border-[var(--destructive)]/20 hover:bg-[var(--destructive)]/5 hover:text-[var(--destructive)]"
          >
            <RotateCcw className="size-3.5" />
            Reset profile
          </button>
        </div>
      </aside>

      {isResetDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#24231f]/35 p-4 backdrop-blur-sm"
          onClick={() => !isResetting && setIsResetDialogOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5 text-[var(--foreground)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--destructive)]/10 text-[var(--destructive)]">
                  <AlertTriangle className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Reset your profile?</h3>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
                    Collected signals will be removed. Your chat history stays intact.
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isResetting && setIsResetDialogOpen(false)}
                aria-label="Close reset dialog"
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
              <button
                onClick={() => setIsResetDialogOpen(false)}
                disabled={isResetting}
                className="rounded-full px-3.5 py-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
              <button
                id="confirm-reset-profile-btn"
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="flex items-center gap-1.5 rounded-full bg-[var(--destructive)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {isResetting ? "Resetting…" : "Reset profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
