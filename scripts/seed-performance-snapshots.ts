/**
 * Seed historical performance snapshots for the Team Performance / Leaderboards
 * pages so they have data to render before the nightly cron has run.
 *
 * Walks backward from yesterday for the last `DAYS_BACK` days, and for
 * each day calls the rollup logic directly (same code path as the
 * /api/cron/performance-rollup route).
 *
 * Run (the shell preload + react-server condition are BOTH required):
 *
 *   env $(cat .env.local | grep -v '^#' | xargs) \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     pnpm tsx scripts/seed-performance-snapshots.ts
 *
 * Or with an explicit DATABASE_URL:
 *
 *   DATABASE_URL="postgresql://..." \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     pnpm tsx scripts/seed-performance-snapshots.ts
 *
 * Why the shell preload: `@/db/drizzle` reads DATABASE_URL at module
 * load time, and static imports hoist above any dotenv.config() call.
 *
 * Why the react-server condition: the rollup code imports server-only
 * modules, which throws unless Node resolves the `react-server` export
 * condition.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const DAYS_BACK = 7;

async function main() {
  const { runPerformanceRollup } = await import(
    "../app/api/cron/performance-rollup/route"
  );

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  let totalUsers = 0;
  let totalMetrics = 0;
  let totalTeams = 0;

  for (let i = 1; i <= DAYS_BACK; i++) {
    const periodEnd = new Date(todayStart.getTime() - (i - 1) * 86_400_000);
    const periodStart = new Date(periodEnd.getTime() - 86_400_000);
    const label = periodStart.toISOString().slice(0, 10);

    process.stdout.write(`→ rollup for ${label}... `);

    try {
      const res = await runPerformanceRollup({
        periodStart,
        periodEnd,
        startedAt: Date.now(),
      });
      const body = (await res.json()) as {
        usersProcessed: number;
        teamsProcessed: number;
        metricsWritten: number;
        errors: unknown[];
      };
      console.log(
        `users=${body.usersProcessed} teams=${body.teamsProcessed} metrics=${body.metricsWritten} errors=${body.errors.length}`,
      );
      totalUsers += body.usersProcessed;
      totalMetrics += body.metricsWritten;
      totalTeams = Math.max(totalTeams, body.teamsProcessed);
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`  Days seeded:     ${DAYS_BACK}`);
  console.log(`  User-rollups:    ${totalUsers}`);
  console.log(`  Metrics written: ${totalMetrics}`);
  console.log(`  Teams seen:      ${totalTeams}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
