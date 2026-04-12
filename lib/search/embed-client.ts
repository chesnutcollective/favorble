/**
 * Embedding provider abstraction.
 *
 * Used by:
 *   - The background embedding worker (fills `search_documents.embedding`
 *     for rows where it's NULL)
 *   - The live API route (embeds the user's query for semantic search)
 *
 * Provider selection is controlled by env vars so the same code path
 * works in local dev (self-hosted BGE), staging (Azure OpenAI under
 * BAA), and production.
 *
 * Providers currently supported:
 *   - `azure`     — Azure OpenAI `text-embedding-3-small` (1536 dim).
 *                   Requires a signed BAA. The default for PHI workloads.
 *   - `openai`    — OpenAI `text-embedding-3-small`. BAA only at
 *                   Enterprise tier.
 *   - `bge`       — self-hosted BGE-m3 or similar at an HTTP endpoint.
 *                   Use for local dev or HIPAA-strict deployments where
 *                   no third party may see the content.
 *   - `stub`      — returns a deterministic zero vector. For tests and
 *                   for running the pipeline without an embedding
 *                   provider configured. Semantic search degrades to
 *                   "no hits" but never crashes.
 *
 * On failure, the caller should gracefully degrade to lexical-only
 * search. The worker should retry with exponential backoff and leave
 * `embedding` NULL if all retries fail.
 */

const PROVIDER = (
  process.env.SEARCH_EMBEDDING_PROVIDER ?? "stub"
).toLowerCase();
const DIM = Number(process.env.SEARCH_EMBEDDING_DIM ?? "1536");

/** Short LRU cache so the same query text doesn't pay the provider cost twice in rapid succession. */
const queryCache = new Map<string, { vec: number[]; expiresAt: number }>();
const QUERY_CACHE_TTL_MS = 60_000;
const QUERY_CACHE_MAX = 256;

export function getEmbeddingDimension(): number {
  return DIM;
}

export function isEmbeddingConfigured(): boolean {
  return PROVIDER !== "stub";
}

export async function embedQuery(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const cached = queryCache.get(trimmed);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.vec;

  const vec = await embedOne(trimmed);
  if (vec) {
    if (queryCache.size >= QUERY_CACHE_MAX) {
      // Drop the oldest entry.
      const oldest = queryCache.keys().next().value;
      if (oldest !== undefined) queryCache.delete(oldest);
    }
    queryCache.set(trimmed, { vec, expiresAt: now + QUERY_CACHE_TTL_MS });
  }
  return vec;
}

export async function embedMany(texts: string[]): Promise<(number[] | null)[]> {
  if (!texts.length) return [];
  switch (PROVIDER) {
    case "azure":
      return embedAzureBatch(texts);
    case "openai":
      return embedOpenAIBatch(texts);
    case "bge":
      return embedBgeBatch(texts);
    default:
      return texts.map(() => zeroVector());
  }
}

async function embedOne(text: string): Promise<number[] | null> {
  const [vec] = await embedMany([text]);
  return vec ?? null;
}

// ─── Providers ────────────────────────────────────────────────────

async function embedAzureBatch(texts: string[]): Promise<(number[] | null)[]> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION ?? "2024-02-15-preview";
  if (!endpoint || !deployment || !apiKey) return texts.map(() => null);
  const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/embeddings?api-version=${apiVersion}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({ input: texts }),
    });
    if (!res.ok) return texts.map(() => null);
    const data = (await res.json()) as {
      data: { embedding: number[]; index: number }[];
    };
    const out: (number[] | null)[] = new Array(texts.length).fill(null);
    for (const entry of data.data) out[entry.index] = entry.embedding;
    return out;
  } catch {
    return texts.map(() => null);
  }
}

async function embedOpenAIBatch(texts: string[]): Promise<(number[] | null)[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  if (!apiKey) return texts.map(() => null);
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: texts, model }),
    });
    if (!res.ok) return texts.map(() => null);
    const data = (await res.json()) as {
      data: { embedding: number[]; index: number }[];
    };
    const out: (number[] | null)[] = new Array(texts.length).fill(null);
    for (const entry of data.data) out[entry.index] = entry.embedding;
    return out;
  } catch {
    return texts.map(() => null);
  }
}

async function embedBgeBatch(texts: string[]): Promise<(number[] | null)[]> {
  const endpoint = process.env.BGE_EMBEDDING_URL;
  if (!endpoint) return texts.map(() => null);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: texts }),
    });
    if (!res.ok) return texts.map(() => null);
    const data = (await res.json()) as { embeddings: number[][] };
    return data.embeddings;
  } catch {
    return texts.map(() => null);
  }
}

function zeroVector(): number[] {
  return new Array(DIM).fill(0);
}
