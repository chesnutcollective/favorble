import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function getConnectionString() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  // Strip any trailing \n that may have been injected by env var tools
  return url.replace(/\\n$/, "").replace(/\n$/, "").trim();
}

const client = postgres(getConnectionString(), {
  prepare: false,
});

export const db = drizzle(client, { schema });
