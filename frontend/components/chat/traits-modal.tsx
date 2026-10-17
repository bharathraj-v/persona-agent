"use client";

import React, { useState, useEffect } from "react";
import { X, RefreshCw, Activity, ShieldCheck, HelpCircle } from "lucide-react";
import { TraitScore } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface TraitsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  apiUrl: string;
}

export function TraitsModal({ isOpen, onClose, userId, apiUrl }: TraitsModalProps) {
  const [traits, setTraits] = useState<TraitScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTraits = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/profile/${userId}/traits`);
      if (!res.ok) throw new Error(`Failed to load traits: ${res.statusText}`);
      const data = await res.json();
      setTraits(data.traits || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load traits profile";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchTraits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId, apiUrl]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl flex flex-col rounded-2xl border border-white/8 bg-[#0f0f17] text-zinc-100 shadow-2xl overflow-hidden max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Activity className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Personality Profile</h2>
              <p className="text-[11px] text-zinc-500">Live behavioral observations</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              id="refresh-traits-btn"
              onClick={fetchTraits}
              disabled={loading}
              title="Refresh"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/6 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              id="close-traits-modal-btn"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/6 transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        <Separator className="bg-white/6" />

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-5 space-y-3">
            {loading && traits.length === 0 ? (
              <div className="py-16 text-center text-zinc-600 text-sm flex flex-col items-center gap-2">
                <RefreshCw className="size-5 animate-spin text-zinc-500" />
                <span>Loading profile…</span>
              </div>
            ) : error ? (
              <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/8 text-red-400 text-sm">
                {error}
              </div>
            ) : traits.length === 0 ? (
              <div className="py-16 text-center text-zinc-600 space-y-2 flex flex-col items-center">
                <HelpCircle className="size-7 text-zinc-700" />
                <p className="text-sm font-medium text-zinc-500">No observations yet</p>
                <p className="text-xs text-zinc-600 max-w-xs">
                  Keep chatting — behavioral signals will appear here as the agent observes your style.
                </p>
              </div>
            ) : (
              traits.map((t) => {
                const progressPct =
                  ((t.score - t.scale_min) / (t.scale_max - t.scale_min)) * 100;
                const confPct = Math.round(t.confidence * 100);
                const isHighConf = confPct >= 75;

                return (
                  <div
                    key={t.trait_id}
                    className="p-4 rounded-xl border border-white/6 bg-white/2 hover:bg-white/4 transition-colors space-y-2.5"
                  >
                    {/* Trait header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase tracking-wider font-mono text-zinc-600 mr-1.5">
                          {t.domain}
                        </span>
                        <span className="text-sm font-medium text-zinc-200">{t.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white/6 text-zinc-400">
                          {t.score.toFixed(1)}
                        </span>
                        <span
                          className={`text-[11px] font-mono px-2 py-0.5 rounded-md flex items-center gap-1 ${
                            isHighConf
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          <ShieldCheck className="size-3" />
                          {confPct}%
                        </span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="relative h-1.5 w-full rounded-full bg-white/6 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(4, Math.min(100, progressPct))}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-zinc-600">
                        <span className="truncate max-w-[45%]">{t.low_anchor}</span>
                        <span className="truncate max-w-[45%] text-right">{t.high_anchor}</span>
                      </div>
                    </div>

                    {/* Footer */}
                    <p className="text-[10px] text-zinc-700">
                      {t.observation_count} observation{t.observation_count === 1 ? "" : "s"}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <Separator className="bg-white/6" />
        <div className="px-5 py-3 flex justify-between items-center text-[11px] text-zinc-600">
          <span>Confidence target: 75%+</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-white/6 hover:bg-white/10 text-zinc-300 text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
