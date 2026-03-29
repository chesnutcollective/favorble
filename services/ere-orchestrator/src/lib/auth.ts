import { Context, Next } from "hono";

export async function requireApiKey(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  const expectedKey = process.env.ORCHESTRATOR_API_KEY;

  if (!expectedKey) {
    console.error("ORCHESTRATOR_API_KEY environment variable is not set");
    return c.json({ error: "Server misconfigured" }, 500);
  }

  if (authHeader !== `Bearer ${expectedKey}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
}
