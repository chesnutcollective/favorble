import Link from "next/link";
import { and, count, desc, eq, gte, isNull } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { outboundMail } from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { COLORS, PERSONA_ACCENTS } from "@/lib/design-tokens";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardEmptyState } from "@/components/dashboard/empty-state";
import { StatHero } from "@/components/dashboard/primitives/stat-hero";
import { TriageCard } from "@/components/dashboard/primitives/triage-card";
import { LiveTicker, type TickerItem } from "@/components/dashboard/primitives/live-ticker";
import {
  getInboundMailQueue,
  type InboundMailItem,
} from "@/app/actions/mail";
import type { SessionUser } from "@/lib/auth/session";

type Props = { actor: SessionUser };
const accent = PERSONA_ACCENTS.mail_clerk.accent;

// ── Loaders ────────────────────────────────────────────────────────────────

async function loadInbound(): Promise<InboundMailItem[]> {
  try {
    return await getInboundMailQueue();
  } catch (e) {
    logger.error("mail clerk inbound failed", { error: e });
    return [];
  }
}

async function loadOutboundCounters(orgId: string) {
  const start = new Date(Date.now() - 7 * 86400000);
  try {
    const [sentRow, deliveredRow, pendingRow] = await Promise.all([
      db
        .select({ n: count() })
        .from(outboundMail)
        .where(
          and(
            eq(outboundMail.organizationId, orgId),
            gte(outboundMail.sentAt, start),
          ),
        ),
      db
        .select({ n: count() })
        .from(outboundMail)
        .where(
          and(
            eq(outboundMail.organizationId, orgId),
            gte(outboundMail.deliveredAt, start),
          ),
        ),
      db
        .select({ n: count() })
        .from(outboundMail)
        .where(
          and(
            eq(outboundMail.organizationId, orgId),
            isNull(outboundMail.deliveredAt),
            gte(outboundMail.sentAt, start),
          ),
        ),
    ]);
    return {
      sent7d: sentRow[0]?.n ?? 0,
      delivered7d: deliveredRow[0]?.n ?? 0,
      inTransit: pendingRow[0]?.n ?? 0,
    };
  } catch (e) {
    logger.error("mail clerk outbound failed", { error: e, orgId });
    return { sent7d: 0, delivered7d: 0, inTransit: 0 };
  }
}

async function loadTicker(orgId: string): Promise<TickerItem[]> {
  try {
    const rows = await db
      .select({
        id: outboundMail.id,
        recipient: outboundMail.recipientName,
        mailType: outboundMail.mailType,
        sentAt: outboundMail.sentAt,
        deliveredAt: outboundMail.deliveredAt,
      })
      .from(outboundMail)
      .where(
        and(
          eq(outboundMail.organizationId, orgId),
          gte(outboundMail.sentAt, new Date(Date.now() - 24 * 3600000)),
        ),
      )
      .orderBy(desc(outboundMail.sentAt))
      .limit(30);
    return rows.map((r) => ({
      id: r.id,
      tone: r.deliveredAt ? ("ok" as const) : ("info" as const),
      label: `${r.mailType.toUpperCase()} · ${r.recipient}`,
      detail: r.deliveredAt ? "delivered" : "in transit",
    }));
  } catch (e) {
    logger.error("mail clerk ticker failed", { error: e });
    return [];
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export async function MailClerkDashboard({ actor }: Props) {
  const [inbound, outbound, ticker] = await Promise.all([
    loadInbound(),
    loadOutboundCounters(actor.organizationId),
    loadTicker(actor.organizationId),
  ]);

  const oldest = inbound.length > 0 ? Math.max(...inbound.map((i) => i.ageInDays)) : 0;
  const urgent = inbound.filter((i) => i.ageInDays >= 7).length;
  const unmatched = inbound.filter((i) => !i.caseId).length;

  return (
    <div className="space-y-6">
      {ticker.length > 0 && (
        <LiveTicker
          items={ticker}
          height={28}
          background="rgba(20,30,50,0.92)"
          className="rounded-[8px] overflow-hidden"
        />
      )}

      {/* Hero — dispatch-floor compound */}
      <StatHero
        eyebrow="Dispatch Floor · Live"
        stats={[
          {
            label: "Pieces in inbound queue",
            value: inbound.length,
            subtitle:
              inbound.length === 0
                ? "Inbox zero — pipeline clear."
                : `Oldest piece is ${oldest}d old · ${urgent} urgent · ${unmatched} unmatched`,
            accent,
          },
          { label: "Outbound 7d", value: outbound.sent7d },
          { label: "Delivered 7d", value: outbound.delivered7d },
          { label: "In transit", value: outbound.inTransit },
        ]}
      />

      {/* 3-column worklist: inbound oldest-first | unmatched | outbound */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <h3
              className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
              style={{ color: COLORS.text2 }}
            >
              Inbound · Oldest First
            </h3>
            {inbound.length === 0 ? (
              <DashboardEmptyState
                icon="📬"
                title="Inbox zero"
                body="Pipeline is clear. New scans land here as they arrive."
                accent={accent}
                compact
              />
            ) : (
              <ul className="space-y-2">
                {inbound.slice(0, 8).map((m) => {
                  const tone =
                    m.ageInDays >= 7
                      ? COLORS.bad
                      : m.ageInDays >= 3
                        ? COLORS.warn
                        : COLORS.text2;
                  return (
                    <li key={m.id} className="text-[12px] flex items-start gap-2">
                      <span
                        className="font-mono shrink-0 tabular-nums"
                        style={{ color: tone, width: 32 }}
                      >
                        {m.ageInDays}d
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/mail`}
                          className="block truncate hover:underline"
                          style={{ color: COLORS.text1 }}
                        >
                          {m.fileName}
                        </Link>
                        <div className="text-[10px]" style={{ color: COLORS.text3 }}>
                          {m.caseNumber
                            ? `Case ${m.caseNumber}`
                            : "Unmatched · needs case"}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3
              className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
              style={{ color: COLORS.text2 }}
            >
              Unmatched
            </h3>
            <div
              className="text-[40px] font-semibold leading-none tabular-nums mb-2"
              style={{ color: unmatched > 0 ? COLORS.warn : COLORS.text1 }}
            >
              {unmatched}
            </div>
            <p className="text-[12px]" style={{ color: COLORS.text2 }}>
              {unmatched === 0
                ? "Everything is matched to a case."
                : "Pieces with no case match — review and assign."}
            </p>
            <Link
              href="/mail"
              className="inline-block mt-3 text-[12px] hover:underline"
              style={{ color: accent }}
            >
              Open mail workspace →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3
              className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
              style={{ color: COLORS.text2 }}
            >
              Outbound · This Week
            </h3>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.10em]" style={{ color: COLORS.text3 }}>
                  Sent
                </div>
                <div className="text-[24px] font-semibold tabular-nums" style={{ color: COLORS.text1 }}>
                  {outbound.sent7d}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.10em]" style={{ color: COLORS.text3 }}>
                  Delivered
                </div>
                <div className="text-[24px] font-semibold tabular-nums" style={{ color: COLORS.emerald }}>
                  {outbound.delivered7d}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.10em]" style={{ color: COLORS.text3 }}>
                  In transit
                </div>
                <div className="text-[24px] font-semibold tabular-nums" style={{ color: COLORS.ok }}>
                  {outbound.inTransit}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
