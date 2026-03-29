import { Hono } from "hono";
import { requireApiKey } from "../lib/auth.js";
import {
  enqueueJob,
  getJob,
  listJobs,
  cancelJob,
  type JobType,
} from "../lib/queue.js";

export const jobRoutes = new Hono();

// All job routes require API key auth
jobRoutes.use("*", requireApiKey);

interface CreateJobBody {
  caseId: string;
  credentialId: string;
  jobType: JobType;
  ssaClaimNumber: string;
  callbackUrl?: string;
}

// POST /api/jobs — Create a new job
jobRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json<CreateJobBody>();

    if (
      !body.caseId ||
      !body.credentialId ||
      !body.jobType ||
      !body.ssaClaimNumber
    ) {
      return c.json(
        {
          error:
            "Missing required fields: caseId, credentialId, jobType, ssaClaimNumber",
        },
        400,
      );
    }

    const validJobTypes: JobType[] = [
      "ere_pull",
      "ere_status_check",
      "ere_submit",
    ];
    if (!validJobTypes.includes(body.jobType)) {
      return c.json(
        {
          error: `Invalid jobType. Must be one of: ${validJobTypes.join(", ")}`,
        },
        400,
      );
    }

    const job = await enqueueJob({
      caseId: body.caseId,
      credentialId: body.credentialId,
      jobType: body.jobType,
      ssaClaimNumber: body.ssaClaimNumber,
      callbackUrl: body.callbackUrl ?? null,
    });

    console.log(
      `Job created: ${job.id} (type=${body.jobType}, case=${body.caseId})`,
    );

    return c.json({ jobId: job.id, status: "pending" }, 201);
  } catch (err) {
    console.error("Failed to create job:", err);
    return c.json({ error: "Failed to create job" }, 500);
  }
});

// GET /api/jobs — List jobs with optional filters
jobRoutes.get("/", async (c) => {
  try {
    const status = c.req.query("status");
    const caseId = c.req.query("caseId");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    const jobs = await listJobs({
      status: status as string | undefined,
      caseId: caseId as string | undefined,
      limit: Math.min(limit, 200),
      offset: Math.max(offset, 0),
    });

    return c.json({ jobs, count: jobs.length });
  } catch (err) {
    console.error("Failed to list jobs:", err);
    return c.json({ error: "Failed to list jobs" }, 500);
  }
});

// GET /api/jobs/:id — Get single job
jobRoutes.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const job = await getJob(id);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    return c.json({ job });
  } catch (err) {
    console.error("Failed to get job:", err);
    return c.json({ error: "Failed to get job" }, 500);
  }
});

// POST /api/jobs/:id/cancel — Cancel a pending job
jobRoutes.post("/:id/cancel", async (c) => {
  try {
    const id = c.req.param("id");
    const result = await cancelJob(id);

    if (!result) {
      return c.json(
        { error: "Job not found or not in a cancellable state" },
        404,
      );
    }

    console.log(`Job cancelled: ${id}`);
    return c.json({ jobId: id, status: "cancelled" });
  } catch (err) {
    console.error("Failed to cancel job:", err);
    return c.json({ error: "Failed to cancel job" }, 500);
  }
});
