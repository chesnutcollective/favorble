"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    router.push("/dashboard");
  }

  return (
    <div
      style={{
        fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
          "radial-gradient(ellipse 300px 500px at 85% 60%, rgba(55, 75, 90, 0.45) 0%, transparent 55%)",
          "radial-gradient(ellipse 350px 250px at 10% 75%, rgba(25, 65, 75, 0.5) 0%, transparent 60%)",
          "radial-gradient(ellipse 900px 600px at 50% 50%, rgba(18, 52, 72, 0.8) 0%, transparent 70%)",
          "radial-gradient(ellipse 1200px 800px at 30% 40%, rgba(12, 36, 54, 0.6) 0%, transparent 80%)",
          "radial-gradient(ellipse 200px 200px at 65% 45%, rgba(80, 100, 90, 0.3) 0%, transparent 70%)",
          "linear-gradient(160deg, #0f1923 0%, #162a3a 25%, #1a3345 45%, #14292e 65%, #101c26 85%, #0b1218 100%)",
        ].join(", "),
        backgroundAttachment: "fixed",
        padding: 20,
      }}
    >
      {/* Inline font import */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* Glass panel */}
      <div
        style={{
          width: 400,
          maxWidth: "calc(100vw - 40px)",
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.5)",
          borderRadius: 16,
          padding: 36,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
          animation: "fadeIn 0.6s ease-out both",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 }}>
          <div
            style={{
              width: 28,
              height: 28,
              background: "#000",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>F</span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 600, color: "#171717", letterSpacing: "-0.3px" }}>
            Favorble
          </span>
        </div>

        {/* Heading */}
        <h1 style={{ textAlign: "center", fontSize: 22, fontWeight: 600, color: "#171717", marginBottom: 6 }}>
          Welcome back
        </h1>
        <p style={{ textAlign: "center", fontSize: 13, color: "#666", marginBottom: 20 }}>
          Sign in to manage your cases
        </p>

        {/* Separator */}
        <div style={{ height: 1, background: "#EAEAEA", marginBottom: 24 }} />

        {/* Form */}
        <form onSubmit={handleSignIn}>
          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="email"
              style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#666", marginBottom: 6 }}
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              defaultValue="admin@hogansmith.com"
              readOnly
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                color: "#171717",
                background: "rgba(255,255,255,0.7)",
                border: "1px solid #EAEAEA",
                borderRadius: 8,
                outline: "none",
                transition: "border-color 0.2s",
                fontFamily: "inherit",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#10B981"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#EAEAEA"; }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 8 }}>
            <label
              htmlFor="password"
              style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#666", marginBottom: 6 }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                defaultValue="demo123!"
                readOnly
                style={{
                  width: "100%",
                  padding: "10px 40px 10px 12px",
                  fontSize: 14,
                  color: "#171717",
                  background: "rgba(255,255,255,0.7)",
                  border: "1px solid #EAEAEA",
                  borderRadius: 8,
                  outline: "none",
                  transition: "border-color 0.2s",
                  fontFamily: "inherit",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#10B981"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#EAEAEA"; }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#999",
                  fontSize: 13,
                  padding: 4,
                }}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Remember + Forgot */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#666", cursor: "pointer" }}>
              <input
                type="checkbox"
                defaultChecked
                style={{ width: 14, height: 14, accentColor: "#10B981", cursor: "pointer" }}
              />
              Remember me
            </label>
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                fontSize: 12,
                color: "#10B981",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Forgot password?
            </button>
          </div>

          {/* Sign in button */}
          <button
            type="submit"
            disabled={isPending}
            style={{
              width: "100%",
              padding: "11px 16px",
              fontSize: 14,
              fontWeight: 500,
              color: "#fff",
              background: isPending ? "#555" : "#1C1C1E",
              border: "none",
              borderRadius: 8,
              cursor: isPending ? "not-allowed" : "pointer",
              transition: "background 0.2s",
              fontFamily: "inherit",
              marginBottom: 20,
            }}
            onMouseEnter={(e) => { if (!isPending) e.currentTarget.style.background = "#333"; }}
            onMouseLeave={(e) => { if (!isPending) e.currentTarget.style.background = "#1C1C1E"; }}
          >
            {isPending ? "Signing in..." : "Sign in"}
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: "#EAEAEA" }} />
            <span style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              or sign in with
            </span>
            <div style={{ flex: 1, height: 1, background: "#EAEAEA" }} />
          </div>

          {/* Social buttons */}
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "9px 12px",
                fontSize: 13,
                fontWeight: 500,
                color: "#171717",
                background: "rgba(255,255,255,0.6)",
                border: "1px solid #EAEAEA",
                borderRadius: 8,
                cursor: "pointer",
                transition: "border-color 0.2s, background 0.2s",
                fontFamily: "inherit",
                backdropFilter: "blur(4px)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#CCC"; e.currentTarget.style.background = "rgba(255,255,255,0.9)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#EAEAEA"; e.currentTarget.style.background = "rgba(255,255,255,0.6)"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Google
            </button>
            <button
              type="button"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "9px 12px",
                fontSize: 13,
                fontWeight: 500,
                color: "#171717",
                background: "rgba(255,255,255,0.6)",
                border: "1px solid #EAEAEA",
                borderRadius: 8,
                cursor: "pointer",
                transition: "border-color 0.2s, background 0.2s",
                fontFamily: "inherit",
                backdropFilter: "blur(4px)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#CCC"; e.currentTarget.style.background = "rgba(255,255,255,0.9)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#EAEAEA"; e.currentTarget.style.background = "rgba(255,255,255,0.6)"; }}
            >
              <svg width="16" height="16" viewBox="0 0 23 23">
                <path fill="#f25022" d="M1 1h10v10H1z" />
                <path fill="#00a4ef" d="M1 12h10v10H1z" />
                <path fill="#7fba00" d="M12 1h10v10H12z" />
                <path fill="#ffb900" d="M12 12h10v10H12z" />
              </svg>
              Microsoft
            </button>
          </div>
        </form>
      </div>

      {/* Footer */}
      <p style={{ marginTop: 24, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
        Favorble — Powered by Hogan Smith
      </p>

      {/* Keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
