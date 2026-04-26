import type { BrainwaveSnapshot } from "../features/eeg/types";

type Props = {
  snapshot: BrainwaveSnapshot | null;
  history: BrainwaveSnapshot[];
};

const BAND_ORDER = ["theta", "alpha", "beta", "gamma"] as const;
const BAND_LABELS: Record<(typeof BAND_ORDER)[number], string> = {
  theta: "Theta (Sleepy)",
  alpha: "Alpha (Relaxed)",
  beta: "Beta (Focused)",
  gamma: "Gamma (Flow State)",
};
const BAND_COLORS: Record<(typeof BAND_ORDER)[number], string> = {
  theta: "#2563eb",
  alpha: "#06b6d4",
  beta: "#22c55e",
  gamma: "#f59e0b",
};

function formatValue(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return "0.00";
  return v.toFixed(2);
}

export function EEGVisualizer({ snapshot, history }: Props) {
  const maxBand = Math.max(
    0.001,
    ...(snapshot
      ? BAND_ORDER.map((b) => snapshot[b] ?? snapshot.bands?.[b] ?? 0)
      : [1]),
  );
  const gammaSeries = history.map((h) => h.gamma ?? h.bands?.gamma ?? 0);
  const chartHeight = 90;
  const chartWidth = 320;
  const maxGamma = Math.max(0.001, ...gammaSeries, 1);
  const points = gammaSeries
    .map((value, i) => {
      const x = (i / Math.max(1, gammaSeries.length - 1)) * chartWidth;
      const y = chartHeight - (value / maxGamma) * chartHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "grid", gap: 8 }}>
        {BAND_ORDER.map((band) => {
          const raw = snapshot?.[band] ?? snapshot?.bands?.[band] ?? 0;
          const pct = Math.max(0, Math.min(100, (raw / maxBand) * 100));
          return (
            <div key={band} style={{ display: "grid", gridTemplateColumns: "132px 1fr 56px", gap: 8 }}>
              <span className="muted">{BAND_LABELS[band]}</span>
              <div style={{ background: "#1f2937", borderRadius: 999, overflow: "hidden", height: 10 }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: BAND_COLORS[band],
                    transition: "width 180ms linear",
                  }}
                />
              </div>
              <span className="muted" style={{ textAlign: "right" }}>
                {formatValue(raw)}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10 }}>
        <div className="muted" style={{ marginBottom: 4 }}>
          Gamma trend (last {history.length} samples)
        </div>
        <svg width={chartWidth} height={chartHeight} style={{ width: "100%", maxWidth: chartWidth }}>
          <rect x={0} y={0} width={chartWidth} height={chartHeight} fill="#111827" rx={6} />
          {points ? (
            <polyline fill="none" stroke="#f59e0b" strokeWidth={2} points={points} />
          ) : null}
        </svg>
      </div>
    </div>
  );
}
