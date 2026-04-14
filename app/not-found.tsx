import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(16px, 5vw, 24px)",
        background: "#FAFAFA",
        fontFamily:
          "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#18181B",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 28,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            background: "#18181B",
          }}
        />
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.3px",
            color: "#18181B",
          }}
        >
          Favorble
        </span>
      </div>

      <div
        style={{
          fontSize: 13,
          fontFamily: "var(--font-mono, 'Geist Mono', 'SF Mono', monospace)",
          color: "#71717A",
          marginBottom: 8,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        404
      </div>
      <h1
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#18181B",
          margin: 0,
          marginBottom: 6,
        }}
      >
        Page not found
      </h1>
      <p
        style={{
          fontSize: 13,
          color: "#71717A",
          margin: 0,
          marginBottom: 24,
          maxWidth: 360,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        The page you&apos;re looking for doesn&apos;t exist or may have been
        moved.
      </p>

      <Link
        href="/dashboard"
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "#FFF",
          background: "#18181B",
          padding: "8px 14px",
          borderRadius: 6,
          textDecoration: "none",
          border: "1px solid #18181B",
        }}
      >
        Back to dashboard
      </Link>
    </main>
  );
}
