"use client";

import { useState } from "react";
import { COLORS } from "@/lib/design-tokens";

export type HeatmapCell = {
  /** 0-1 scale used to lerp between low/high colours */
  intensity: number;
  /** Optional categorical state — overrides intensity color */
  state?: "ok" | "warn" | "bad" | "muted";
  /** Tooltip / hover label */
  tooltip?: string;
  /** Display value inside the cell when size is large enough */
  display?: string;
  /** Optional click handler */
  onClick?: () => void;
};

type Props = {
  /** 2D matrix [row][col] */
  cells: HeatmapCell[][];
  /** Row labels (left side) */
  rowLabels?: string[];
  /** Column labels (top) */
  colLabels?: string[];
  /** Cell size in px */
  cellSize?: number;
  /** Gap between cells in px */
  cellGap?: number;
  /** Low-intensity color (when intensity = 0) */
  lowColor?: string;
  /** High-intensity color (when intensity = 1) */
  highColor?: string;
  /** Show display values inside cells */
  showValues?: boolean;
  className?: string;
};

const STATE_COLORS = {
  ok: COLORS.emerald,
  warn: COLORS.warn,
  bad: COLORS.bad,
  muted: COLORS.text4,
};

function lerp(low: string, high: string, t: number): string {
  // Simple hex lerp; assumes both inputs are #RRGGBB
  const parse = (h: string) =>
    h.length === 7
      ? [
          parseInt(h.slice(1, 3), 16),
          parseInt(h.slice(3, 5), 16),
          parseInt(h.slice(5, 7), 16),
        ]
      : [255, 255, 255];
  const [lr, lg, lb] = parse(low);
  const [hr, hg, hb] = parse(high);
  const r = Math.round(lr + (hr - lr) * t);
  const g = Math.round(lg + (hg - lg) * t);
  const b = Math.round(lb + (hb - lb) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * A grid of color-coded cells. Used by:
 *   - reviewer (ALJ × quarter win-rate matrix)
 *   - pre-hearing (hearings × prep artifacts)
 *   - MR (hearing-date band × completeness)
 *   - admin (uptime ribbon, audit log spark grid)
 */
export function HeatmapMatrix({
  cells,
  rowLabels,
  colLabels,
  cellSize = 28,
  cellGap = 3,
  lowColor = "#F0F4FA",
  highColor = COLORS.brand,
  showValues = false,
  className,
}: Props) {
  const [hover, setHover] = useState<{
    row: number;
    col: number;
    cell: HeatmapCell;
  } | null>(null);

  if (cells.length === 0) return null;
  const colCount = cells[0]?.length ?? 0;

  return (
    <div className={`relative inline-block ${className ?? ""}`}>
      <table
        className="border-separate"
        style={{ borderSpacing: cellGap }}
      >
        {colLabels && (
          <thead>
            <tr>
              {rowLabels && <th />}
              {colLabels.map((label, i) => (
                <th
                  key={i}
                  className="text-[10px] font-medium uppercase tracking-[0.06em] pb-1"
                  style={{ color: COLORS.text3, minWidth: cellSize }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {cells.map((row, rIdx) => (
            <tr key={rIdx}>
              {rowLabels && (
                <td
                  className="text-[11px] text-right pr-2 align-middle"
                  style={{ color: COLORS.text2 }}
                >
                  {rowLabels[rIdx]}
                </td>
              )}
              {row.map((cell, cIdx) => {
                const bg =
                  cell.state !== undefined
                    ? STATE_COLORS[cell.state]
                    : lerp(lowColor, highColor, cell.intensity);
                return (
                  <td
                    key={cIdx}
                    onMouseEnter={() => setHover({ row: rIdx, col: cIdx, cell })}
                    onMouseLeave={() => setHover(null)}
                    onClick={cell.onClick}
                    className="rounded-[3px] transition-transform hover:scale-110"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: bg,
                      cursor: cell.onClick ? "pointer" : "default",
                      textAlign: "center",
                      verticalAlign: "middle",
                      fontSize: cellSize >= 24 ? 10 : 0,
                      color:
                        cell.intensity > 0.5 || cell.state === "bad"
                          ? "#fff"
                          : COLORS.text1,
                      fontVariantNumeric: "tabular-nums",
                    }}
                    title={cell.tooltip}
                  >
                    {showValues ? cell.display : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {hover && hover.cell.tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-[11px] shadow"
          style={{
            background: COLORS.text1,
            color: "#fff",
            top: -36 + hover.row * (cellSize + cellGap),
            left:
              (rowLabels ? 56 : 0) +
              hover.col * (cellSize + cellGap) +
              cellSize +
              cellGap,
            whiteSpace: "nowrap",
          }}
        >
          {hover.cell.tooltip}
        </div>
      )}
      {/* legend */}
      {colCount > 0 && (
        <div className="mt-3 flex items-center gap-2 text-[10px]" style={{ color: COLORS.text3 }}>
          <span>Low</span>
          <span
            className="inline-block h-[8px] w-[64px] rounded-full"
            style={{
              background: `linear-gradient(to right, ${lowColor}, ${highColor})`,
            }}
          />
          <span>High</span>
        </div>
      )}
    </div>
  );
}
