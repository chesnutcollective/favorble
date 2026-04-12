import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div
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
      <p
        style={{
          marginTop: 24,
          fontSize: 12,
          color: "rgba(255,255,255,0.5)",
        }}
      >
        Favorble — Powered by Hogan Smith
      </p>
    </div>
  );
}
