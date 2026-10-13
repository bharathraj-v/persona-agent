"use client";

import React, { useState, useEffect } from "react";
import { X, RefreshCw, Activity, ShieldCheck, HelpCircle } from "lucide-react";
import { TraitScore } from "./types";

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
      if (!res.ok) {
        throw new Error(`Failed to load traits: ${res.statusText}`);
      }
      const data = await res.json();
      setTraits(data.traits || []);
    } catch (err: any) {
      setError(err.message || "Failed to load traits profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTraits();
    }
  }, [isOpen, userId, apiUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-850 px-6 py-4 bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Activity className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-100">User Personality Profile</h2>
              <p className="text-xs text-zinc-400">Live behavioral observations & confidence metrics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchTraits}
              disabled={loading}
              title="Refresh traits"
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-lg transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && traits.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 text-sm">
              <RefreshCw className="size-6 animate-spin mx-auto mb-2 text-zinc-400" />
              Loading profile data from PostgreSQL...
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-sm">
              {error}
            </div>
          ) : traits.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 space-y-2">
              <HelpCircle className="size-8 mx-auto text-zinc-600" />
              <p className="text-sm font-medium text-zinc-400">No trait observations recorded yet</p>
              <p className="text-xs max-w-sm mx-auto text-zinc-600">
                Continue chatting with the agent. Observations will be recorded here as behavioral signals accumulate.
              </p>
            </div>
          ) : (
            traits.map((t) => {
              const progressPct = ((t.score - t.scale_min) / (t.scale_max - t.scale_min)) * 100;
              const confPct = Math.round(t.confidence * 100);

              return (
                <div 
                  key={t.trait_id}
                  className="p-4 rounded-xl border border-zinc-850 bg-zinc-900/40 hover:bg-zinc-900/70 transition-colors space-y-3"
                >
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-xs uppercase tracking-wider font-mono text-zinc-500 mr-2">{t.domain}</span>
                      <span className="font-medium text-zinc-200">{t.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                        Score: {t.score.toFixed(1)} / {t.scale_max}
                      </span>
                      <span className={`text-xs font-mono px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        confPct >= 75 ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                      }`}>
                        <ShieldCheck className="size-3" />
                        {confPct}% conf
                      </span>
                    </div>
                  </div>

                  {/* Score Spectrum Bar */}
                  <div className="space-y-1">
                    <div className="relative h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, Math.min(100, progressPct))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-zinc-500">
                      <span className="truncate max-w-[45%] text-left">{t.low_anchor}</span>
                      <span className="truncate max-w-[45%] text-right">{t.high_anchor}</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-zinc-600 flex justify-between pt-1 border-t border-zinc-800/40">
                    <span>{t.observation_count} observation{t.observation_count === 1 ? "" : "s"} collected</span>
                    <span>Scale: {t.scale_min} – {t.scale_max}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-850 px-6 py-3 bg-zinc-900/30 flex justify-between items-center text-xs text-zinc-500">
          <span>Target Confidence: 75%+</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
