import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArtificialIntelligence04Icon,
  DollarCircleIcon,
  Clock01Icon,
  Folder01Icon,
} from "@hugeicons/core-free-icons";

import { COLORS } from "@/lib/design-tokens";
import type { AiSavings } from "@/lib/services/ai-savings";

type Props = {
  data: AiSavings;
  sinceDays?: number;
};

const dollarFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatHours(hours: number): string {
  if (hours === 0) return "0";
  if (hours < 10) return hours.toFixed(1);
  return Math.round(hours).toString();
}

export function AiAdoptionTile({ data, sinceDays = 7 }: Props) {
  const periodLabel =
    sinceDays === 7
      ? "this week"
      : sinceDays === 1
        ? "today"
        : `last ${sinceDays} days`;

  const empty = data.approvedDraftCount === 0;

  return (
    <div>
      <h2
        className="text-[13px] font-semibold mb-3 uppercase tracking-[0.06em]"
        style={{ color: COLORS.text2 }}
      >
        AI Adoption
      </h2>
      <div
        className="bg-white border rounded-[10px] p-5"
        style={{ borderColor: "#EAEAEA" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-[7px]"
              style={{
                backgroundColor: COLORS.brandSubtle,
                color: COLORS.brand,
              }}
            >
              <HugeiconsIcon
                icon={ArtificialIntelligence04Icon}
                size={16}
                color={COLORS.brand}
                aria-hidden="true"
              />
            </div>
            <div>
              <p
                className="text-[13px] font-semibold"
                style={{ color: COLORS.text1 }}
              >
                AI-assisted work {periodLabel}
              </p>
              <p
                className="text-[11px]"
                style={{ color: COLORS.text3 }}
              >
                {empty
                  ? "No approved AI drafts in this window yet."
                  : `${data.approvedDraftCount} approved draft${data.approvedDraftCount === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <Metric
            icon={Clock01Icon}
            label="Hours saved"
            value={formatHours(data.hoursSaved)}
            accent={COLORS.brand}
          />
          <Metric
            icon={DollarCircleIcon}
            label="Dollars saved"
            value={dollarFmt.format(data.dollarsSaved)}
            accent={COLORS.ok}
          />
          <Metric
            icon={Folder01Icon}
            label="AI-enabled cases"
            value={data.aiEnabledCases.toString()}
            accent={COLORS.warn}
          />
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  accent,
}: {
  icon: unknown;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-[8px] p-3 flex items-start gap-3"
      style={{ backgroundColor: "#FAFAF8" }}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-[7px] shrink-0"
        style={{ backgroundColor: "white", color: accent }}
      >
        <HugeiconsIcon
          icon={icon as Parameters<typeof HugeiconsIcon>[0]["icon"]}
          size={15}
          color={accent}
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0">
        <p
          className="text-[11px] uppercase tracking-[0.05em] font-medium"
          style={{ color: COLORS.text3 }}
        >
          {label}
        </p>
        <p
          className="text-[22px] font-semibold tabular-nums leading-[1.1] tracking-[-0.5px]"
          style={{ color: COLORS.text1 }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
