import { Hono } from "hono";
import { requireApiKey } from "../lib/auth.js";

export const sessionRoutes = new Hono();

// All session routes require API key auth
sessionRoutes.use("*", requireApiKey);

interface SessionInfo {
  id: string;
  credentialId: string;
  status: "active" | "idle" | "expired";
  lastActivity: string;
  createdAt: string;
}

// In-memory session tracking (will be replaced with persistent storage)
const activeSessions = new Map<string, SessionInfo>();

// GET /api/sessions — List active sessions
sessionRoutes.get("/", (c) => {
  const sessions = Array.from(activeSessions.values());
  return c.json({
    sessions,
    count: sessions.length,
  });
});

// POST /api/sessions/keepalive — Trigger manual keepalive for all active sessions
sessionRoutes.post("/keepalive", (c) => {
  const now = new Date().toISOString();
  let refreshedCount = 0;

  for (const [id, session] of activeSessions) {
    if (session.status === "active") {
      session.lastActivity = now;
      activeSessions.set(id, session);
      refreshedCount++;
    }
  }

  console.log(`Keepalive triggered: ${refreshedCount} sessions refreshed`);

  return c.json({
    refreshed: refreshedCount,
    timestamp: now,
  });
});

// GET /api/sessions/status — Current session state summary
sessionRoutes.get("/status", (c) => {
  const sessions = Array.from(activeSessions.values());
  const active = sessions.filter((s) => s.status === "active").length;
  const idle = sessions.filter((s) => s.status === "idle").length;
  const expired = sessions.filter((s) => s.status === "expired").length;

  return c.json({
    total: sessions.length,
    active,
    idle,
    expired,
    timestamp: new Date().toISOString(),
  });
});

// Exported for use by other modules (e.g., the job processor)
export function registerSession(session: SessionInfo): void {
  activeSessions.set(session.id, session);
  console.log(
    `Session registered: ${session.id} (credential=${session.credentialId})`,
  );
}

export function removeSession(sessionId: string): boolean {
  const removed = activeSessions.delete(sessionId);
  if (removed) {
    console.log(`Session removed: ${sessionId}`);
  }
  return removed;
}

export function getSession(sessionId: string): SessionInfo | undefined {
  return activeSessions.get(sessionId);
}

export function updateSessionActivity(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  session.lastActivity = new Date().toISOString();
  activeSessions.set(sessionId, session);
  return true;
}
