"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  CockpitPageData,
  IntegrationCardData,
} from "./page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STATUS_CONFIG = {
  connected: {
    label: "Connected",
    className:
      "bg-[rgba(29,114,184,0.08)] text-[#1d72b8] border-[rgba(29,114,184,0.2)] hover:bg-[rgba(29,114,184,0.08)]",
    dot: "bg-[#1d72b8]",
  },
  configured: {
    label: "Configured",
    className:
      "bg-[rgba(38,60,148,0.08)] text-[#263c94] border-[rgba(38,60,148,0.2)] hover:bg-[rgba(38,60,148,0.08)]",
    dot: "bg-[#263c94]",
  },
  missing_config: {
    label: "Missing config",
    className:
      "bg-[rgba(207,138,0,0.10)] text-[#cf8a00] border-[rgba(207,138,0,0.2)] hover:bg-[rgba(207,138,0,0.10)]",
    dot: "bg-[#cf8a00]",
  },
  error: {
    label: "Error",
    className:
      "bg-[rgba(209,69,59,0.10)] text-[#d1453b] border-[rgba(209,69,59,0.2)] hover:bg-[rgba(209,69,59,0.10)]",
    dot: "bg-[#d1453b]",
  },
  sunset: {
    label: "Sunset — native portal active",
    className:
      "bg-[rgba(100,100,112,0.08)] text-[#52525e] border-[rgba(100,100,112,0.2)] hover:bg-[rgba(100,100,112,0.08)]",
    dot: "bg-[#8b8b97]",
  },
} as const;

// ---------------------------------------------------------------------------
// IntegrationCard
// ---------------------------------------------------------------------------

function IntegrationCard({
  card,
  onVerify,
  isPinging,
  customLogoUrls,
}: {
  card: IntegrationCardData;
  onVerify: (id: string) => void;
  isPinging: boolean;
  customLogoUrls?: {
    tech: { url: string; storagePath: string } | null;
    host: { url: string; storagePath: string } | null;
  };
}) {
  const router = useRouter();
  const config = STATUS_CONFIG[card.status];
  const [imgError, setImgError] = useState(false);
  const [hostImgError, setHostImgError] = useState(false);
  const imgSrc = customLogoUrls?.tech?.url ?? `/${card.logoPath}`;
  const hostImgSrc = card.hostLogoPath
    ? customLogoUrls?.host?.url ?? `/${card.hostLogoPath}`
    : null;

  return (
    <Card
      className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:border-[#BBBBBB] rounded-[10px]"
      onClick={() => router.push(`/admin/integrations/${card.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Logo */}
          <div className="relative flex-shrink-0 w-12 h-12">
            <div className="w-12 h-12 rounded-lg border border-[rgba(0,0,0,0.06)] bg-white flex items-center justify-center overflow-hidden">
              {!imgError ? (
                <Image
                  src={imgSrc}
                  alt={card.name}
                  width={48}
                  height={48}
                  className="object-contain p-1"
                  unoptimized={imgSrc.startsWith("data:") || imgSrc.startsWith("http")}
                  onError={() => setImgError(true)}
                />
              ) : (
                <span className="text-xl">{card.fallbackIcon}</span>
              )}
            </div>
            {hostImgSrc && !hostImgError && (
              <div
                className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-md bg-white ring-2 ring-white flex items-center justify-center overflow-hidden shadow-sm"
                title={card.hostName ? `Hosted on ${card.hostName}` : undefined}
              >
                <Image
                  src={hostImgSrc}
                  alt={card.hostName ?? "Host platform"}
                  width={18}
                  height={18}
                  className="object-contain"
                  unoptimized={hostImgSrc.startsWith("data:") || hostImgSrc.startsWith("http")}
                  onError={() => setHostImgError(true)}
                />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-[#18181a] truncate">
                {card.name}
              </h3>
            </div>
            <p className="text-[11px] text-[#8b8b97] mt-0.5 line-clamp-1">
              {card.tagline}
            </p>

            {/* Tags */}
            {card.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {card.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="inline-block text-[9px] font-medium px-1.5 py-0.5 rounded bg-[rgba(38,60,148,0.06)] text-[#52525e]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Status + Verify row */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-2">
            <Badge
              className={`text-[10px] font-semibold px-2 py-0.5 border ${config.className}`}
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${config.dot}`}
              />
              {config.label}
            </Badge>
            {card.lastVerifiedAt && (
              <span className="text-[10px] text-[#8b8b97] font-mono">
                {formatTimeAgo(card.lastVerifiedAt)}
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px] font-medium"
            disabled={isPinging}
            onClick={(e) => {
              e.stopPropagation();
              onVerify(card.id);
            }}
          >
            {isPinging ? (
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 border-2 border-[#8b8b97] border-t-transparent rounded-full animate-spin" />
                Pinging
              </span>
            ) : (
              "Verify"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SummaryBar
// ---------------------------------------------------------------------------

function SummaryBar({
  summary,
  onVerifyAll,
  isVerifyingAll,
  verifyProgress,
}: {
  summary: CockpitPageData["summary"];
  onVerifyAll: () => void;
  isVerifyingAll: boolean;
  verifyProgress: { done: number; total: number };
}) {
  return (
    <Card className="rounded-[10px]">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
          {/* Stat pills */}
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="flex items-center gap-1.5 font-medium text-[#1d72b8]">
              <span className="inline-block w-2 h-2 rounded-full bg-[#1d72b8]" />
              {summary.connected} connected
            </span>
            <span className="flex items-center gap-1.5 font-medium text-[#263c94]">
              <span className="inline-block w-2 h-2 rounded-full bg-[#263c94]" />
              {summary.configured} configured
            </span>
            {summary.warnings > 0 && (
              <span className="flex items-center gap-1.5 font-medium text-[#cf8a00]">
                <span className="inline-block w-2 h-2 rounded-full bg-[#cf8a00]" />
                {summary.warnings} warnings
              </span>
            )}
            {summary.errors > 0 && (
              <span className="flex items-center gap-1.5 font-medium text-[#d1453b]">
                <span className="inline-block w-2 h-2 rounded-full bg-[#d1453b]" />
                {summary.errors} errors
              </span>
            )}
            <span className="text-[#8b8b97] text-[12px]">
              {summary.total} total
            </span>
          </div>

          <div className="flex-1" />

          {/* Verify All */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-[12px] font-medium shrink-0"
            disabled={isVerifyingAll}
            onClick={onVerifyAll}
          >
            {isVerifyingAll ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3.5 h-3.5 border-2 border-[#8b8b97] border-t-transparent rounded-full animate-spin" />
                Verifying {verifyProgress.done}/{verifyProgress.total}
              </span>
            ) : (
              "Verify All"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function IntegrationsCockpitClient({
  data,
}: {
  data: CockpitPageData;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pingingIds, setPingingIds] = useState<Set<string>>(new Set());
  const [isVerifyingAll, setIsVerifyingAll] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState({ done: 0, total: 0 });

  const pingIntegration = useCallback(
    async (integrationId: string) => {
      setPingingIds((prev) => new Set(prev).add(integrationId));
      try {
        await fetch("/api/admin/integrations/ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ integrationId }),
        });
        startTransition(() => {
          router.refresh();
        });
      } finally {
        setPingingIds((prev) => {
          const next = new Set(prev);
          next.delete(integrationId);
          return next;
        });
      }
    },
    [router, startTransition],
  );

  const verifyAll = useCallback(async () => {
    // Gather all integrations that have a health check or env vars
    const allIntegrations = data.categories.flatMap((c) => c.integrations);
    const verifiable = allIntegrations.filter(
      (i) => i.hasHealthCheck || i.status !== "missing_config",
    );

    setIsVerifyingAll(true);
    setVerifyProgress({ done: 0, total: verifiable.length });

    // Fire them in batches of 4 to avoid overwhelming the server
    const batchSize = 4;
    let done = 0;
    for (let i = 0; i < verifiable.length; i += batchSize) {
      const batch = verifiable.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (integration) => {
          await fetch("/api/admin/integrations/ping", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ integrationId: integration.id }),
          });
          done++;
          setVerifyProgress({ done, total: verifiable.length });
        }),
      );
    }

    setIsVerifyingAll(false);
    startTransition(() => {
      router.refresh();
    });
  }, [data.categories, router, startTransition]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Monitor and manage every service powering Favorble."
      />

      <SummaryBar
        summary={data.summary}
        onVerifyAll={verifyAll}
        isVerifyingAll={isVerifyingAll}
        verifyProgress={verifyProgress}
      />

      {data.categories.map((section) => (
        <div key={section.category}>
          {/* Category header */}
          <div className="mb-3">
            <h2 className="text-[15px] font-semibold tracking-[-0.3px] text-[#18181a]">
              {section.label}
            </h2>
            <p className="text-[12px] text-[#8b8b97] mt-0.5">
              {section.description}
            </p>
          </div>

          {/* Integration grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {section.integrations.map((card) => (
              <IntegrationCard
                key={card.id}
                card={card}
                onVerify={pingIntegration}
                isPinging={pingingIds.has(card.id)}
                customLogoUrls={data.customLogoUrls[card.id]}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
