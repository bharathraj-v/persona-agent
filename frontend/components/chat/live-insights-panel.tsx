"use client";

import React from "react";
import { Sparkles, ShieldCheck, Compass, Target, X, HelpCircle, CheckCircle2 } from "lucide-react";
import { TraitScore, TraitInsight } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface LiveInsightsPanelProps {
  traits: TraitScore[];
  latestInsight: TraitInsight | null;
  currentTargetTrait: { trait_id: string; name: string; domain: string } | null;
  onClose: () => void;
  isOpen: boolean;
}

export function LiveInsightsPanel({
  traits,
  latestInsight,
  currentTargetTrait,
  onClose,
  isOpen,
}: LiveInsightsPanelProps) {
  if (!isOpen) return null;

  // Calculate running profile confidence across all 8 traits
  const totalTracked = 8;
  const totalConfidenceSum = traits.reduce((sum, t) => sum + (t.confidence || 0), 0);
  const targetConfidenceTotal = totalTracked * 0.75; // 8 traits * 75% target
  const overallConfidencePct = Math.min(
    100,
    Math.round((totalConfidenceSum / targetConfidenceTotal) * 100)
  );

  const exploredCount = traits.filter(
    (t) => (t.observation_count || 0) > 0 || (t.confidence || 0) > 0
  ).length;

  return (
    <aside
      id="live-insights-panel"
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 flex flex-col border-l border-white/8 bg-[#0d0d15]/95 backdrop-blur-xl text-zinc-100 shadow-2xl transition-all duration-300 animate-in slide-in-from-right"
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/6 px-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 text-indigo-400">
            <Compass className="size-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold tracking-tight text-zinc-100">
              Aura · Personality Map
            </h3>
            <p className="text-[10px] text-zinc-500">Live behavioral insights</p>
          </div>
        </div>
        <button
          id="close-insights-btn"
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/6 transition-colors"
          title="Close panel"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* ── Completion meter ─────────────────────────────────────────── */}
      <div className="p-4 border-b border-white/6 bg-white/[0.015] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400 font-medium">Profile Confidence</span>
          <span className="font-mono text-zinc-300 font-semibold">
            {overallConfidencePct}% · {exploredCount}/{totalTracked} explored
          </span>
        </div>
        <div className="relative h-2 w-full rounded-full bg-white/6 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${Math.max(4, overallConfidencePct)}%` }}
          />
        </div>

        {/* Currently exploring badge */}
        {currentTargetTrait && (
          <div className="mt-2.5 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-[11px] text-indigo-300">
            <Target className="size-3.5 shrink-0 text-indigo-400 animate-pulse" />
            <span className="truncate">
              Aura is exploring: <strong className="font-medium text-white">{currentTargetTrait.name}</strong>
            </span>
          </div>
        )}
      </div>

      {/* ── Latest Derived Insight Highlight ──────────────────────────── */}
      {latestInsight && (
        <div className="p-3.5 border-b border-white/6 bg-gradient-to-br from-indigo-500/10 to-violet-500/5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="flex items-center gap-1 font-semibold text-indigo-300">
              <Sparkles className="size-3 text-indigo-400" />
              Latest Signal Derived
            </span>
            <span className="font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 text-[10px]">
              Score {latestInsight.score.toFixed(1)}/7
            </span>
          </div>
          <p className="text-xs font-medium text-zinc-200 mb-1">{latestInsight.name}</p>
          {latestInsight.quote && (
            <p className="text-[11px] italic text-zinc-400 line-clamp-2 border-l-2 border-indigo-500/40 pl-2 mb-1">
              &ldquo;{latestInsight.quote}&rdquo;
            </p>
          )}
          {latestInsight.reasoning && (
            <p className="text-[10px] text-zinc-500 line-clamp-2">
              {latestInsight.reasoning}
            </p>
          )}
        </div>
      )}

      {/* ── Traits List ──────────────────────────────────────────────── */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-3">
          {traits.length === 0 ? (
            <div className="py-16 text-center space-y-2 flex flex-col items-center">
              <HelpCircle className="size-8 text-zinc-700" />
              <p className="text-xs font-medium text-zinc-400">No signals mapped yet</p>
              <p className="text-[11px] text-zinc-600 max-w-[240px] leading-relaxed">
                Chat naturally with Aura. As you answer and banter, personality dimensions will light up here in real time.
              </p>
            </div>
          ) : (
            traits.map((t) => {
              const progressPct =
                ((t.score - t.scale_min) / (t.scale_max - t.scale_min)) * 100;
              const confPct = Math.round(t.confidence * 100);
              const isLocked = confPct >= 75;

              return (
                <div
                  key={t.trait_id}
                  className="p-3 rounded-xl border border-white/6 bg-white/[0.02] hover:bg-white/[0.04] transition-all space-y-2"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="min-w-0">
                      <span className="text-[9px] uppercase tracking-wider font-mono text-zinc-500 mr-1.5">
                        {t.domain}
                      </span>
                      <h4 className="text-xs font-semibold text-zinc-200 truncate">
                        {t.name}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/6 text-zinc-300">
                        {t.score.toFixed(1)}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                          isLocked
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                        title={isLocked ? "Confident profile match" : "Exploring signal"}
                      >
                        {isLocked ? (
                          <CheckCircle2 className="size-2.5" />
                        ) : (
                          <ShieldCheck className="size-2.5" />
                        )}
                        {confPct}%
                      </span>
                    </div>
                  </div>

                  {/* Spectrum Bar */}
                  <div className="space-y-1">
                    <div className="relative h-1.5 w-full rounded-full bg-white/6 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(4, Math.min(100, progressPct))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-zinc-500 font-sans">
                      <span className="truncate max-w-[48%]">{t.low_anchor}</span>
                      <span className="truncate max-w-[48%] text-right">{t.high_anchor}</span>
                    </div>
                  </div>

                  {/* Observation snippet if available */}
                  {t.last_quote && (
                    <p className="text-[10px] italic text-zinc-500 line-clamp-1 border-l border-white/10 pl-1.5">
                      &ldquo;{t.last_quote}&rdquo;
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div className="p-3 border-t border-white/6 bg-white/[0.015] flex items-center justify-between text-[10px] text-zinc-500">
        <span>Target: 75%+ confidence</span>
        <span>{traits.length} dimensions cataloged</span>
      </div>
    </aside>
  );
}
