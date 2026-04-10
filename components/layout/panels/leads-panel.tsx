"use client";

type PipelineStage = {
  name: string;
  count: number;
  color: string;
};

export interface LeadsPanelProps {
  pipeline?: PipelineStage[];
  conversionRate?: string;
}

const defaultPipeline: PipelineStage[] = [
  { name: "New", count: 5, color: "#1d72b8" },
  { name: "Contacted", count: 3, color: "#3B82F6" },
  { name: "Intake", count: 2, color: "#F59E0B" },
  { name: "Signed", count: 1, color: "#185f9b" },
];

export function LeadsPanel({
  pipeline = defaultPipeline,
  conversionRate = "9.1%",
}: LeadsPanelProps) {
  const maxCount = Math.max(...pipeline.map((s) => s.count), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Pipeline */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#9CA3AF",
          marginBottom: 6,
          padding: "0 8px",
        }}
      >
        Pipeline
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          marginBottom: 12,
        }}
      >
        {pipeline.map((stage, i) => (
          <div key={stage.name}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 8px",
                borderRadius: 6,
                cursor: "pointer",
                transition: "background 0.12s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#F3F4F6";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: stage.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1, fontSize: 12, color: "#374151" }}>
                {stage.name}
              </span>
              <span
                style={{
                  fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#1d72b8",
                  background: "transparent",
                  border: "1px solid #1d72b8",
                  padding: "0 5px",
                  borderRadius: 8,
                  lineHeight: 1.6,
                }}
              >
                {stage.count}
              </span>
            </div>

            {/* Bar */}
            <div style={{ padding: "0 8px 0 20px" }}>
              <div
                style={{
                  height: 4,
                  background: "#EAEAEA",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(stage.count / maxCount) * 100}%`,
                    background: stage.color,
                    borderRadius: 2,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>

            {/* Arrow between stages */}
            {i < pipeline.length - 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  color: "#D1D5DB",
                  fontSize: 10,
                  padding: "0 0 0 12px",
                }}
              >
                &#8595;
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Conversion Rate */}
      <div
        style={{
          fontSize: 12,
          fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
          color: "#9CA3AF",
          padding: "6px 8px",
          marginTop: 4,
          borderTop: "1px solid #E5E7EB",
        }}
      >
        Conversion:{" "}
        <strong style={{ color: "#1d72b8", fontWeight: 600 }}>
          {conversionRate}
        </strong>{" "}
        this month
      </div>
    </div>
  );
}
