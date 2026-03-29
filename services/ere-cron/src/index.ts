/**
 * ERE Cron Service
 *
 * Runs on a schedule (default: 7AM + 2PM ET weekdays) and triggers
 * the ERE orchestrator to start a scrape batch.
 *
 * This service starts, sends HTTP requests to the orchestrator,
 * then exits. Railway's cron scheduler handles the timing.
 */

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ||
  "http://ere-orchestrator.railway.internal:3000";
const API_KEY = process.env.ORCHESTRATOR_API_KEY;

interface TriggerResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

async function triggerStatusReportScrape(): Promise<TriggerResult> {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jobType: "status_check",
        priority: 50, // NORMAL
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `Orchestrator returned ${response.status}: ${text}`,
      };
    }

    const data = await response.json();
    return { success: true, jobId: data.jobId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function triggerDocumentPickupCheck(): Promise<TriggerResult> {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jobType: "document_download",
        priority: 80, // LOW
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `Orchestrator returned ${response.status}: ${text}`,
      };
    }

    const data = await response.json();
    return { success: true, jobId: data.jobId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function main() {
  console.log(
    `[ere-cron] Starting scheduled run at ${new Date().toISOString()}`
  );
  console.log(`[ere-cron] Orchestrator URL: ${ORCHESTRATOR_URL}`);

  const statusResult = await triggerStatusReportScrape();
  console.log(`[ere-cron] Status report trigger:`, statusResult);

  const pickupResult = await triggerDocumentPickupCheck();
  console.log(`[ere-cron] Document pickup trigger:`, pickupResult);

  const allSucceeded = statusResult.success && pickupResult.success;
  console.log(`[ere-cron] Completed. All succeeded: ${allSucceeded}`);

  process.exit(allSucceeded ? 0 : 1);
}

main().catch((error) => {
  console.error(`[ere-cron] Fatal error:`, error);
  process.exit(1);
});
