"use client";

type EventType = "Hearing" | "CE" | "Deadline" | "Consult" | "Deposition" | "Court";

type CalendarEvent = {
  id: string;
  time: string;
  type: EventType;
  title: string;
  caseLink: string;
};

export interface CalendarPanelProps {
  events?: CalendarEvent[];
}

const typeStyles: Record<string, { bg: string; color: string }> = {
  Hearing: { bg: "#ECFDF5", color: "#059669" },
  CE: { bg: "#ECFDF5", color: "#059669" },
  Consult: { bg: "#ECFDF5", color: "#059669" },
  Deadline: { bg: "#FEF3C7", color: "#D97706" },
  Deposition: { bg: "#FEF3C7", color: "#D97706" },
  Court: { bg: "#EDE9FE", color: "#7C3AED" },
};

const defaultEvents: CalendarEvent[] = [
  {
    id: "e1",
    time: "09:00 AM",
    type: "Consult",
    title: "Martinez Initial Consult",
    caseLink: "#4201",
  },
  {
    id: "e2",
    time: "01:30 PM",
    type: "Hearing",
    title: "Thompson ALJ Hearing",
    caseLink: "#4187",
  },
  {
    id: "e3",
    time: "03:00 PM",
    type: "Court",
    title: "Chen Status Conference",
    caseLink: "#4156",
  },
];

export function CalendarPanel({ events = defaultEvents }: CalendarPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Section label */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#9CA3AF",
          marginBottom: 8,
          padding: "0 8px",
        }}
      >
        Today&apos;s Schedule
      </div>

      {events.map((event) => {
        const style = typeStyles[event.type] ?? typeStyles.Hearing;
        const isWarning =
          event.type === "Deadline" || event.type === "Deposition";

        return (
          <div
            key={event.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              padding: 8,
              borderLeft: `3px solid ${isWarning ? "#F59E0B" : "#10B981"}`,
              background: "#FFF",
              borderRadius: "0 6px 6px 0",
              marginBottom: 8,
              cursor: "pointer",
              transition: "background 0.12s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#ECFDF5";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#FFF";
            }}
          >
            {/* Time */}
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#999",
                fontFamily:
                  "'Geist Mono', 'SF Mono', 'Menlo', monospace",
              }}
            >
              {event.time}
            </span>

            {/* Title */}
            <span
              style={{
                fontSize: 12,
                color: "#1C1C1E",
                fontWeight: 500,
              }}
            >
              {event.title}
            </span>

            {/* Meta: type badge + case link */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                  padding: "1px 5px",
                  borderRadius: 3,
                  background: style.bg,
                  color: style.color,
                }}
              >
                {event.type}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily:
                    "'Geist Mono', 'SF Mono', 'Menlo', monospace",
                  color: "#999",
                }}
              >
                {event.caseLink}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
