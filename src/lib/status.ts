/**
 * Status vocabulary for the monotone theme. There is no hue, so meaning is
 * carried by inversion and border style instead. Documented in DESIGN.md —
 * keep the two in sync.
 *
 *   COMPLETED  inverted (white on black)   terminal, success
 *   FAILED     solid outline               terminal, broke
 *   STOPPED    muted outline               terminal, cancelled
 *   RUNNING    filled + pulse              active now
 *   PENDING    dashed outline              queued, not started
 */
export const STATUS_BADGE: Record<string, string> = {
  COMPLETED: "bg-white text-black border-white",
  FAILED: "bg-black text-white border-white",
  STOPPED: "bg-transparent text-slate-400 border-slate-600",
  RUNNING: "bg-white/15 text-white border-white animate-pulse",
  PENDING: "bg-transparent text-slate-500 border-slate-700 border-dashed",
};

/** Tone only — callers add their own padding/shape chrome. */
export function statusTone(status: string): string {
  return STATUS_BADGE[status] ?? STATUS_BADGE.PENDING;
}
