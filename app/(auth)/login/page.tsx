import { SignIn } from "@clerk/nextjs";
import { signInAsDemo } from "@/actions/auth";

const AUTH_ENABLED = process.env.ENABLE_CLERK_AUTH === "true";

export default function LoginPage() {
  return (
    <main
      aria-label="Sign in"
      style={{
        fontFamily:
          "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: [
          "radial-gradient(ellipse 600px 400px at 20% 30%, rgba(16, 78, 96, 0.7) 0%, transparent 70%)",
          "radial-gradient(ellipse 500px 500px at 75% 20%, rgba(30, 58, 95, 0.65) 0%, transparent 65%)",
          "radial-gradient(ellipse 400px 350px at 60% 70%, rgba(20, 90, 80, 0.5) 0%, transparent 60%)",
          "radial-gradient(ellipse 700px 300px at 40% 80%, rgba(40, 50, 70, 0.6) 0%, transparent 70%)",
          "radial-gradient(ellipse 900px 600px at 50% 50%, rgba(18, 52, 72, 0.8) 0%, transparent 70%)",
          "linear-gradient(160deg, #0f1923 0%, #162a3a 25%, #1a3345 45%, #14292e 65%, #101c26 85%, #0b1218 100%)",
        ].join(", "),
        backgroundAttachment: "fixed",
        padding: "clamp(12px, 5vw, 20px)",
      }}
    >
      {AUTH_ENABLED ? (
        <SignIn
          routing="hash"
          forceRedirectUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: {
                width: "100%",
                maxWidth: "min(400px, 100%)",
              },
              card: {
                background: "rgba(255, 255, 255, 0.85)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.5)",
                borderRadius: 16,
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
              },
            },
          }}
        />
      ) : (
        <DemoSignInCard />
      )}
      <p
        style={{
          marginTop: 24,
          fontSize: 12,
          /* Phase 7a — bump from 0.5 opacity (~3.0:1 on dark gradient, FAIL)
           * to 0.75 opacity (~6.5:1) so the footer is readable on the dark
           * teal background. */
          color: "rgba(255,255,255,0.75)",
        }}
      >
        Favorble — Powered by Hogan Smith
      </p>
    </main>
  );
}

function DemoSignInCard() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "min(400px, 100%)",
        background: "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.5)",
        borderRadius: 16,
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
        padding: 28,
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: "#18181a",
          margin: 0,
          marginBottom: 8,
          letterSpacing: "-0.02em",
        }}
      >
        Signed out
      </h1>
      <p
        style={{
          fontSize: 13,
          color: "#595959", /* AAA — was #666 (AA 5.7:1) */
          margin: 0,
          marginBottom: 20,
          lineHeight: 1.5,
        }}
      >
        This environment runs in demo mode — no password required. Click
        below to continue as the demo admin user.
      </p>
      <form action={signInAsDemo}>
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: "#263c94",
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            transition: "background 0.15s ease",
          }}
        >
          Sign in as demo admin
        </button>
      </form>
      <p
        style={{
          marginTop: 16,
          fontSize: 11,
          /* Phase 7a — bump from #8b8b97 (3.6:1 FAIL) to #6b6b75 (5.4:1 AA).
           * Tertiary helper copy on the card; still visibly lighter than the
           * #595959 body copy above. */
          color: "#6b6b75",
          lineHeight: 1.5,
        }}
      >
        Set <code style={{ fontFamily: "'Geist Mono', monospace" }}>ENABLE_CLERK_AUTH=true</code> in
        your env vars to enable real authentication.
      </p>
    </div>
  );
}
