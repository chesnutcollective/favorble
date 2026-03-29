import { Hono } from "hono";
import { browserPool } from "../browser/pool.js";

export const healthRoutes = new Hono();

const startTime = Date.now();

healthRoutes.get("/health", (c) => {
  const stats = browserPool.getStats();
  const uptimeMs = Date.now() - startTime;
  const mem = process.memoryUsage();

  return c.json({
    status: "ok",
    service: "ere-browser",
    uptime: {
      ms: uptimeMs,
      human: formatUptime(uptimeMs),
    },
    browser: {
      connected: stats.browserConnected,
      activeContexts: stats.activeContexts,
    },
    memory: {
      rss: formatBytes(mem.rss),
      heapUsed: formatBytes(mem.heapUsed),
      heapTotal: formatBytes(mem.heapTotal),
      external: formatBytes(mem.external),
    },
    activeJobs: stats.activeContexts,
  });
});

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}
