import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { healthRoutes } from "./routes/health.js";
import { scrapeRoutes } from "./routes/scrape.js";

const app = new Hono();
app.route("/", healthRoutes);
app.route("/api/scrape", scrapeRoutes);

const port = parseInt(process.env.PORT || "3001");
console.log(`ere-browser starting on port ${port}`);
serve({ fetch: app.fetch, port });
