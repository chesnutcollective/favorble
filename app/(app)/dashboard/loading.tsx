import { COLORS } from "@/lib/design-tokens";

/**
 * Dashboard loading skeleton. Rendered while the server resolves the effective
 * persona + runs the persona-specific data loaders. Shape mirrors the
 * persona-aware dashboard — PageHeader, hero-shaped block, a two- or three-column
 * content area — so the layout doesn't jump when content lands.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* PageHeader skeleton */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <SkeletonBar width={220} height={28} />
          <SkeletonBar width={360} height={14} />
        </div>
        <SkeletonBar width={180} height={32} radius={7} />
      </div>

      {/* Hero shimmer */}
      <div
        className="rounded-[14px] border p-8"
        style={{ borderColor: COLORS.borderDefault, background: "#fff" }}
      >
        <div className="flex items-start justify-between gap-8 flex-wrap">
          <div className="min-w-0 flex-1 space-y-4">
            <SkeletonBar width={140} height={12} />
            <SkeletonBar width={280} height={72} />
            <SkeletonBar width={320} height={14} />
            <SkeletonBar width={260} height={14} />
          </div>
          <SkeletonCircle size={128} />
        </div>
      </div>

      {/* Secondary grid shimmer */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <SkeletonCard height={180} />
          <SkeletonCard height={140} />
        </div>
        <div className="space-y-4">
          <SkeletonCard height={180} />
          <SkeletonCard height={140} />
        </div>
      </div>
    </div>
  );
}

function SkeletonBar({
  width,
  height,
  radius = 6,
}: {
  width: number | string;
  height: number;
  radius?: number;
}) {
  return (
    <div
      className="animate-pulse"
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: "#EEF0F4",
      }}
    />
  );
}

function SkeletonCircle({ size }: { size: number }) {
  return (
    <div
      className="animate-pulse shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "#EEF0F4",
      }}
    />
  );
}

function SkeletonCard({ height }: { height: number }) {
  return (
    <div
      className="animate-pulse rounded-[10px] border"
      style={{
        height,
        borderColor: COLORS.borderDefault,
        background: "linear-gradient(180deg, #F8F9FC 0%, #F0F3F8 100%)",
      }}
    />
  );
}
