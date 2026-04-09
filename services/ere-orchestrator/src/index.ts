import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { healthRoutes } from "./routes/health.js";
import { jobRoutes } from "./routes/jobs.js";
import { sessionRoutes } from "./routes/sessions.js";

const app = new Hono();

app.route("/", healthRoutes);
app.route("/api/jobs", jobRoutes);
app.route("/api/sessions", sessionRoutes);

const port = parseInt(process.env.PORT || "3000");
console.log(`ere-orchestrator starting on port ${port}`);

serve({ fetch: app.fetch, port });
