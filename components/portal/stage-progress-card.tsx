import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { getTranslation } from "@/lib/i18n/getTranslation";
import { type Locale } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export type StageDot = {
  id: string;
  name: string;
  clientVisibleName: string | null;
  displayOrder: number;
};

export type StageTransitionEntry = {
  id: string;
  toStageName: string;
  toStageClientVisibleName: string | null;
  transitionedAt: Date;
};

export type StageProgressCardProps = {
  locale: Locale;
  /** The ordered list of stages for the case's current pipeline (up to 12). */
  stages: StageDot[];
  currentStageId: string | null;
  currentStageName: string;
  currentStageClientVisibleName: string | null;
  currentStageDescription: string | null;
  nextStageName: string | null;
  nextStageClientVisibleName: string | null;
  nextStageEstimatedDays: number | null;
  stageEnteredAt: Date | null;
  transitions: StageTransitionEntry[];
};

/**
 * Server component — presents a 12-dot pipeline, current-stage narrative,
 * what's-next line, and a compact timeline sidebar. All strings are sourced
 * from the portal i18n namespace so an ES-reading claimant sees Spanish copy.
 */
export function StageProgressCard(props: StageProgressCardProps) {
  const t = getTranslation(props.locale);
  const dfnsLocale = props.locale === "es" ? esLocale : undefined;

  const currentIndex = props.currentStageId
    ? props.stages.findIndex((s) => s.id === props.currentStageId)
    : -1;
  const totalStages = Math.max(props.stages.length, 1);

  const lastUpdated = props.stageEnteredAt
    ? t("portal.home.lastUpdated", {
        time: formatDistanceToNow(props.stageEnteredAt, {
          addSuffix: true,
          locale: dfnsLocale,
        }),
      })
    : null;

  const currentDescription =
    props.currentStageDescription?.trim() ||
    t("portal.home.defaultStageDescription");
  const currentStageLabel =
    props.currentStageClientVisibleName?.trim() || props.currentStageName;
  const nextLabel =
    props.nextStageClientVisibleName?.trim() || props.nextStageName;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <section
        aria-labelledby="stage-card-heading"
        className="space-y-6 rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] sm:p-8"
      >
        <header>
          <p className="text-[13px] font-medium uppercase tracking-wide text-[#104e60]/80">
            {currentStageLabel}
          </p>
          <h1
            id="stage-card-heading"
            className="mt-1 text-[24px] font-semibold tracking-tight text-foreground sm:text-[28px]"
          >
            {t("portal.home.heading")}
          </h1>
          {lastUpdated ? (
            <p className="mt-1 text-[13px] text-foreground/60">{lastUpdated}</p>
          ) : null}
        </header>

        <StageDotRow
          stages={props.stages}
          currentIndex={currentIndex}
          totalStages={totalStages}
          t={t}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-[#F7F5F2] p-4 ring-1 ring-[#E8E2D8]">
            <p className="text-[12px] font-medium uppercase tracking-wide text-foreground/60">
              {t("portal.home.whatsHappening")}
            </p>
            <p className="mt-2 text-[17px] leading-relaxed text-foreground">
              {currentDescription}
            </p>
          </div>

          <div className="rounded-2xl bg-[#F7F5F2] p-4 ring-1 ring-[#E8E2D8]">
            <p className="text-[12px] font-medium uppercase tracking-wide text-foreground/60">
              {t("portal.home.whatsNext")}
            </p>
            {nextLabel ? (
              <>
                <p className="mt-2 text-[17px] leading-relaxed text-foreground">
                  {nextLabel}
                </p>
                {props.nextStageEstimatedDays ? (
                  <p className="mt-1 text-[13px] text-foreground/60">
                    {t("portal.home.expectedTimeline", {
                      days: props.nextStageEstimatedDays,
                    })}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-[17px] leading-relaxed text-foreground">
                {t("portal.home.whatsNextNone")}
              </p>
            )}
          </div>
        </div>

        <Link
          href="/portal/messages"
          className="inline-flex items-center gap-2 rounded-full bg-[#104e60] px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0d3f4e]"
        >
          <MessageSquare className="size-4" />
          {t("portal.home.sendMessage")}
        </Link>
      </section>

      <aside
        aria-labelledby="stage-timeline-heading"
        className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]"
      >
        <h2
          id="stage-timeline-heading"
          className="text-[13px] font-semibold uppercase tracking-wide text-foreground/70"
        >
          {t("portal.home.timelineTitle")}
        </h2>
        {props.transitions.length === 0 ? (
          <p className="mt-3 text-[14px] text-foreground/60">
            {t("portal.home.timelineEmpty")}
          </p>
        ) : (
          <ol className="mt-4 space-y-4">
            {props.transitions.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-1 inline-block size-2 shrink-0 rounded-full bg-[#104e60]"
                />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-foreground">
                    {entry.toStageClientVisibleName?.trim() ||
                      entry.toStageName}
                  </p>
                  <p className="text-[12px] text-foreground/60">
                    {formatDistanceToNow(entry.transitionedAt, {
                      addSuffix: true,
                      locale: dfnsLocale,
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}

function StageDotRow({
  stages,
  currentIndex,
  totalStages,
  t,
}: {
  stages: StageDot[];
  currentIndex: number;
  totalStages: number;
  t: ReturnType<typeof getTranslation>;
}) {
  // Always render 12 slots so the visual is consistent regardless of how many
  // real stages the org configured. Fill missing slots with placeholder dots.
  const slotCount = 12;
  const slots = Array.from({ length: slotCount }, (_, i) => {
    const stage = stages[i] ?? null;
    const slotPosition =
      totalStages <= 1 ? 0 : Math.round((i * (totalStages - 1)) / (slotCount - 1));
    const refIndex = stage ? i : slotPosition;
    const state: "complete" | "current" | "upcoming" =
      currentIndex < 0
        ? "upcoming"
        : refIndex < currentIndex
          ? "complete"
          : refIndex === currentIndex
            ? "current"
            : "upcoming";
    return { stage, state };
  });

  return (
    <div
      role="list"
      aria-label={t("portal.home.timelineTitle")}
      className="flex items-center gap-1.5 sm:gap-2"
    >
      {slots.map((slot, i) => {
        const label =
          slot.stage?.clientVisibleName?.trim() || slot.stage?.name || "";
        const stateLabel =
          slot.state === "complete"
            ? t("portal.home.stageComplete")
            : slot.state === "current"
              ? t("portal.home.stageCurrent")
              : t("portal.home.stageUpcoming");
        return (
          <span
            key={`${slot.stage?.id ?? "slot"}-${i}`}
            role="listitem"
            aria-label={label ? `${label} — ${stateLabel}` : stateLabel}
            className={cn(
              "relative inline-flex h-2.5 flex-1 items-center rounded-full sm:h-3",
              slot.state === "complete" && "bg-[#104e60]",
              slot.state === "current" &&
                "bg-[#104e60]/30 ring-2 ring-[#104e60]",
              slot.state === "upcoming" && "bg-[#E8E2D8]",
            )}
          />
        );
      })}
    </div>
  );
}
