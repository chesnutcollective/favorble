import postgres from "postgres";

export type JobType = "ere_pull" | "ere_status_check" | "ere_submit";
export type JobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface Job {
  id: string;
  caseId: string;
  credentialId: string;
  jobType: JobType;
  ssaClaimNumber: string;
  callbackUrl: string | null;
  status: JobStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface EnqueueParams {
  caseId: string;
  credentialId: string;
  jobType: JobType;
  ssaClaimNumber: string;
  callbackUrl: string | null;
}

interface ListParams {
  status?: string;
  caseId?: string;
  limit: number;
  offset: number;
}

function getConnectionString(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  return url.replace(/\\n$/, "").replace(/\n$/, "").trim();
}

let sql: ReturnType<typeof postgres> | null = null;

function getClient(): ReturnType<typeof postgres> {
  if (!sql) {
    const connectionString = getConnectionString();
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL or POSTGRES_URL environment variable is required",
      );
    }
    sql = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

/**
 * Enqueue a new job. Inserts a row into ere_jobs with status "pending".
 */
export async function enqueueJob(params: EnqueueParams): Promise<Job> {
  const db = getClient();
  const [job] = await db<Job[]>`
    INSERT INTO ere_jobs (case_id, credential_id, job_type, ssa_claim_number, callback_url, status, attempts)
    VALUES (
      ${params.caseId},
      ${params.credentialId},
      ${params.jobType},
      ${params.ssaClaimNumber},
      ${params.callbackUrl},
      'pending',
      0
    )
    RETURNING
      id,
      case_id AS "caseId",
      credential_id AS "credentialId",
      job_type AS "jobType",
      ssa_claim_number AS "ssaClaimNumber",
      callback_url AS "callbackUrl",
      status,
      result,
      error,
      attempts,
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      started_at AS "startedAt",
      completed_at AS "completedAt"
  `;

  return job;
}

/**
 * Dequeue the next pending job using SELECT ... FOR UPDATE SKIP LOCKED.
 * Returns null if no jobs are available.
 */
export async function dequeueJob(): Promise<Job | null> {
  const db = getClient();
  const [job] = await db<Job[]>`
    UPDATE ere_jobs
    SET
      status = 'running',
      started_at = NOW(),
      attempts = attempts + 1,
      updated_at = NOW()
    WHERE id = (
      SELECT id FROM ere_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      id,
      case_id AS "caseId",
      credential_id AS "credentialId",
      job_type AS "jobType",
      ssa_claim_number AS "ssaClaimNumber",
      callback_url AS "callbackUrl",
      status,
      result,
      error,
      attempts,
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      started_at AS "startedAt",
      completed_at AS "completedAt"
  `;

  return job ?? null;
}

/**
 * Mark a job as completed with its result payload.
 */
export async function completeJob(
  jobId: string,
  result: Record<string, unknown>,
): Promise<Job | null> {
  const db = getClient();
  const [job] = await db<Job[]>`
    UPDATE ere_jobs
    SET
      status = 'completed',
      result = ${JSON.stringify(result)}::jsonb,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${jobId} AND status = 'running'
    RETURNING
      id,
      case_id AS "caseId",
      credential_id AS "credentialId",
      job_type AS "jobType",
      ssa_claim_number AS "ssaClaimNumber",
      callback_url AS "callbackUrl",
      status,
      result,
      error,
      attempts,
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      started_at AS "startedAt",
      completed_at AS "completedAt"
  `;

  return job ?? null;
}

/**
 * Mark a job as failed with an error message.
 */
export async function failJob(
  jobId: string,
  errorMessage: string,
): Promise<Job | null> {
  const db = getClient();
  const [job] = await db<Job[]>`
    UPDATE ere_jobs
    SET
      status = 'failed',
      error = ${errorMessage},
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${jobId} AND status = 'running'
    RETURNING
      id,
      case_id AS "caseId",
      credential_id AS "credentialId",
      job_type AS "jobType",
      ssa_claim_number AS "ssaClaimNumber",
      callback_url AS "callbackUrl",
      status,
      result,
      error,
      attempts,
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      started_at AS "startedAt",
      completed_at AS "completedAt"
  `;

  return job ?? null;
}

/**
 * Cancel a pending job.
 */
export async function cancelJob(jobId: string): Promise<Job | null> {
  const db = getClient();
  const [job] = await db<Job[]>`
    UPDATE ere_jobs
    SET
      status = 'cancelled',
      updated_at = NOW()
    WHERE id = ${jobId} AND status = 'pending'
    RETURNING
      id,
      case_id AS "caseId",
      credential_id AS "credentialId",
      job_type AS "jobType",
      ssa_claim_number AS "ssaClaimNumber",
      callback_url AS "callbackUrl",
      status,
      result,
      error,
      attempts,
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      started_at AS "startedAt",
      completed_at AS "completedAt"
  `;

  return job ?? null;
}

/**
 * Get a single job by ID.
 */
export async function getJob(jobId: string): Promise<Job | null> {
  const db = getClient();
  const [job] = await db<Job[]>`
    SELECT
      id,
      case_id AS "caseId",
      credential_id AS "credentialId",
      job_type AS "jobType",
      ssa_claim_number AS "ssaClaimNumber",
      callback_url AS "callbackUrl",
      status,
      result,
      error,
      attempts,
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      started_at AS "startedAt",
      completed_at AS "completedAt"
    FROM ere_jobs
    WHERE id = ${jobId}
  `;

  return job ?? null;
}

/**
 * List jobs with optional status and caseId filters.
 */
export async function listJobs(params: ListParams): Promise<Job[]> {
  const db = getClient();

  const conditions: string[] = [];
  const statusFilter = params.status;
  const caseIdFilter = params.caseId;

  // Build query dynamically based on filters
  if (statusFilter && caseIdFilter) {
    return db<Job[]>`
      SELECT
        id,
        case_id AS "caseId",
        credential_id AS "credentialId",
        job_type AS "jobType",
        ssa_claim_number AS "ssaClaimNumber",
        callback_url AS "callbackUrl",
        status,
        result,
        error,
        attempts,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        started_at AS "startedAt",
        completed_at AS "completedAt"
      FROM ere_jobs
      WHERE status = ${statusFilter} AND case_id = ${caseIdFilter}
      ORDER BY created_at DESC
      LIMIT ${params.limit}
      OFFSET ${params.offset}
    `;
  }

  if (statusFilter) {
    return db<Job[]>`
      SELECT
        id,
        case_id AS "caseId",
        credential_id AS "credentialId",
        job_type AS "jobType",
        ssa_claim_number AS "ssaClaimNumber",
        callback_url AS "callbackUrl",
        status,
        result,
        error,
        attempts,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        started_at AS "startedAt",
        completed_at AS "completedAt"
      FROM ere_jobs
      WHERE status = ${statusFilter}
      ORDER BY created_at DESC
      LIMIT ${params.limit}
      OFFSET ${params.offset}
    `;
  }

  if (caseIdFilter) {
    return db<Job[]>`
      SELECT
        id,
        case_id AS "caseId",
        credential_id AS "credentialId",
        job_type AS "jobType",
        ssa_claim_number AS "ssaClaimNumber",
        callback_url AS "callbackUrl",
        status,
        result,
        error,
        attempts,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        started_at AS "startedAt",
        completed_at AS "completedAt"
      FROM ere_jobs
      WHERE case_id = ${caseIdFilter}
      ORDER BY created_at DESC
      LIMIT ${params.limit}
      OFFSET ${params.offset}
    `;
  }

  return db<Job[]>`
    SELECT
      id,
      case_id AS "caseId",
      credential_id AS "credentialId",
      job_type AS "jobType",
      ssa_claim_number AS "ssaClaimNumber",
      callback_url AS "callbackUrl",
      status,
      result,
      error,
      attempts,
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      started_at AS "startedAt",
      completed_at AS "completedAt"
    FROM ere_jobs
    ORDER BY created_at DESC
    LIMIT ${params.limit}
    OFFSET ${params.offset}
  `;
}

/**
 * Get the count of pending jobs in the queue.
 */
export async function getQueueDepth(): Promise<number> {
  const db = getClient();
  const [row] = await db<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM ere_jobs WHERE status = 'pending'
  `;

  return parseInt(row.count, 10);
}
