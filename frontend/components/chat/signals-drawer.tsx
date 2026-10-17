"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  Check,
  Compass,
  RefreshCw,
  Quote,
  X,
} from "lucide-react";
import { TraitScore, TraitInsight } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SignalsDrawerProps {
  traits: TraitScore[];
  latestInsight: TraitInsight | null;
  currentTargetTrait: { trait_id: string; name: string; domain: string } | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  isOpen: boolean;
}

function shortAnchor(anchor: string) {
  return anchor.split(",")[0].trim();
}

function getSignalRead(trait: TraitScore, position: number) {
  const low = shortAnchor(trait.low_anchor);
  const high = shortAnchor(trait.high_anchor);

  if (position <= 44) {
    return { prefix: "You are leaning towards", values: [low] };
  }

  if (position >= 56) {
    return { prefix: "You are leaning towards", values: [high] };
  }

  return { prefix: "Your read is between", values: [low, high] };
}

export function SignalsDrawer({
  traits,
  latestInsight,
  currentTargetTrait,
  onClose,
  onRefresh,
  isOpen,
}: SignalsDrawerProps) {
  const [expandedTraitId, setExpandedTraitId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!isOpen) return null;

  const exploredCount = traits.filter(
    (trait) => (trait.observation_count || 0) > 0 || (trait.confidence || 0) > 0
  ).length;

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <>
      <button
        aria-label="Close signals"
        className="fixed inset-0 z-30 cursor-default bg-[#24231f]/20 backdrop-blur-[2px] lg:hidden"
        onClick={onClose}
      />

      <aside
        id="live-insights-panel"
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[27rem] flex-col border-l border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-[-18px_0_50px_rgba(0,0,0,0.24)] animate-in slide-in-from-right duration-300 lg:static lg:w-[25rem] lg:max-w-none lg:shrink-0 lg:shadow-none"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="aura-mark" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold tracking-[-0.02em]">Signals</h2>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {exploredCount} of 8 noticed so far
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              id="refresh-traits-btn"
              onClick={refresh}
              disabled={isRefreshing}
              title="Refresh signals"
              className="flex size-8 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
            <button
              id="close-insights-btn"
              onClick={onClose}
              title="Close signals"
              className="flex size-8 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 p-5">
            {currentTargetTrait && (
              <div className="flex items-start gap-2.5 border-b border-[var(--border)] pb-5 text-xs text-[var(--muted-foreground)]">
                <Compass className="mt-0.5 size-4 shrink-0 text-[var(--moss)]" />
                <span>
                  Listening for <strong className="font-semibold text-[var(--foreground)]">{currentTargetTrait.name}</strong>
                </span>
              </div>
            )}

            {latestInsight && (
              <div className="signal-in border-l-2 border-[var(--primary)] pl-3">
                <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
                  <span className="size-1.5 rounded-full bg-[var(--primary)]" />
                  New signal
                </div>
                <p className="text-sm font-semibold">{latestInsight.name}</p>
                {latestInsight.reasoning && (
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
                    {latestInsight.reasoning}
                  </p>
                )}
              </div>
            )}

            {traits.length === 0 ? (
              <div className="py-20 text-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)]">
                  <Compass className="size-5 text-[var(--muted-foreground)]" />
                </div>
                <p className="text-sm font-semibold">Nothing noticed yet</p>
                <p className="mx-auto mt-2 max-w-[15rem] text-xs leading-relaxed text-[var(--muted-foreground)]">
                  Keep talking naturally. Signals will appear as Aura gets to know your point of view.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {traits.map((trait) => {
                  const position = Math.max(
                    4,
                    Math.min(
                      96,
                      ((trait.score - trait.scale_min) / (trait.scale_max - trait.scale_min)) * 100
                    )
                  );
                  const confidence = Math.round(trait.confidence * 100);
                  const isExpanded = expandedTraitId === trait.trait_id;
                  const isSettled = confidence >= 75;
                  const signalRead = getSignalRead(trait, position);

                  return (
                    <div
                      key={trait.trait_id}
                      className="border-b border-[var(--border)] pb-4 last:border-b-0"
                    >
                      <button
                        className="group flex w-full items-start justify-between gap-3 text-left"
                        onClick={() => setExpandedTraitId(isExpanded ? null : trait.trait_id)}
                        aria-expanded={isExpanded}
                      >
                        <div className="min-w-0">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="size-2 rounded-full bg-[var(--moss)]" />
                            <span className="truncate text-sm font-semibold">{trait.name}</span>
                          </div>
                          <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                            {trait.domain}
                          </span>
                        </div>
                        <span className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                          <span className={`flex items-center gap-1 ${isSettled ? "text-[var(--moss)]" : ""}`}>
                            <Check className="size-3" />
                            {confidence}%
                          </span>
                          <ChevronDown className={`size-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </span>
                      </button>

                      <div className="mt-3 px-1">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="flex min-w-0 flex-wrap items-center gap-1 text-sm leading-5">
                            <span className="font-medium normal-case tracking-normal text-[var(--muted-foreground)]">
                              {signalRead.prefix}
                            </span>
                            <span className="flex flex-wrap items-center gap-1.5 font-semibold text-[var(--primary)]">
                              {signalRead.values.map((value, index) => (
                                <React.Fragment key={value}>
                                  {index > 0 && <span className="text-sm font-normal text-[var(--muted-foreground)]">and</span>}
                                  <span className="rounded-md bg-[var(--primary)]/12 px-1 py-0.5 leading-5">{value}</span>
                                </React.Fragment>
                              ))}
                            </span>
                          </p>
                          {isSettled && (
                            <span className="shrink-0 rounded-full bg-[var(--moss)]/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--moss)]">
                              clear signal
                            </span>
                          )}
                        </div>
                        <div className="signal-axis">
                          <span className="signal-marker" style={{ left: `${position}%` }} />
                        </div>
                        <div className="flex justify-between gap-4 text-[10px] text-[var(--muted-foreground)]">
                          <span className="max-w-[48%] truncate">{trait.low_anchor}</span>
                          <span className="max-w-[48%] truncate text-right">{trait.high_anchor}</span>
                        </div>
                      </div>

                      {isExpanded && (trait.last_quote || trait.last_reasoning) && (
                        <div className="mt-3 space-y-2 rounded-lg bg-[var(--background)] p-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
                          {trait.last_quote && (
                            <p className="flex gap-2">
                              <Quote className="mt-0.5 size-3 shrink-0 text-[var(--primary)]" />
                              <span className="italic">“{trait.last_quote}”</span>
                            </p>
                          )}
                          {trait.last_reasoning && <p>{trait.last_reasoning}</p>}
                          <p className="text-[10px] text-[var(--muted-foreground)]">
                            {trait.observation_count} observation{trait.observation_count === 1 ? "" : "s"}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

       
      </aside>
    </>
  );
}
