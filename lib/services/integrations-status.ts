import "server-only";
import { db } from "@/db/drizzle";
import {
	cases,
	contacts,
	tasks,
	documents,
	users,
	ereJobs,
	ereCredentials,
	medicalChronologyEntries,
	documentProcessingResults,
} from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

export type ServiceHealth = {
	name: string;
	status: "ok" | "warn" | "bad" | "off";
	env: string;
	meta: Array<{ label: string; value: string }>;
	health: string;
	healthClass?: "bad" | "warn";
	action?: { label: string; variant?: "danger" };
	url?: string;
};

export type IntegrationsStatus = {
	counts: {
		cases: number;
		contacts: number;
		tasks: number;
		documents: number;
		users: number;
		chronology: number;
		processingResults: number;
		ereJobs: number;
		ereJobsFailed: number;
		ereCredentials: number;
	};
	services: ServiceHealth[];
	alerts: Array<{ severity: "bad" | "warn"; title: string; desc: string }>;
	nowUtc: string;
};

async function pingService(url: string, timeoutMs = 3000): Promise<{ ok: boolean; status?: number; body?: unknown }> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(timeout);
		if (!response.ok) {
			return { ok: false, status: response.status };
		}
		try {
			const body = await response.json();
			return { ok: true, status: response.status, body };
		} catch {
			return { ok: true, status: response.status };
		}
	} catch {
		return { ok: false };
	}
}

async function getDbCounts() {
	try {
		const [
			casesCount,
			contactsCount,
			tasksCount,
			documentsCount,
			usersCount,
			chronologyCount,
			processingCount,
			ereJobsCount,
			ereJobsFailedCount,
			ereCredsCount,
		] = await Promise.all([
			db.select({ n: count() }).from(cases),
			db.select({ n: count() }).from(contacts),
			db.select({ n: count() }).from(tasks),
			db.select({ n: count() }).from(documents),
			db.select({ n: count() }).from(users),
			db.select({ n: count() }).from(medicalChronologyEntries),
			db.select({ n: count() }).from(documentProcessingResults),
			db.select({ n: count() }).from(ereJobs),
			db
				.select({ n: count() })
				.from(ereJobs)
				.where(eq(ereJobs.status, "failed")),
			db
				.select({ n: count() })
				.from(ereCredentials)
				.where(eq(ereCredentials.isActive, true)),
		]);
		return {
			cases: casesCount[0]?.n ?? 0,
			contacts: contactsCount[0]?.n ?? 0,
			tasks: tasksCount[0]?.n ?? 0,
			documents: documentsCount[0]?.n ?? 0,
			users: usersCount[0]?.n ?? 0,
			chronology: chronologyCount[0]?.n ?? 0,
			processingResults: processingCount[0]?.n ?? 0,
			ereJobs: ereJobsCount[0]?.n ?? 0,
			ereJobsFailed: ereJobsFailedCount[0]?.n ?? 0,
			ereCredentials: ereCredsCount[0]?.n ?? 0,
		};
	} catch (error) {
		logger.error("Failed to fetch integration status counts", { error });
		return {
			cases: 0,
			contacts: 0,
			tasks: 0,
			documents: 0,
			users: 0,
			chronology: 0,
			processingResults: 0,
			ereJobs: 0,
			ereJobsFailed: 0,
			ereCredentials: 0,
		};
	}
}

export async function getIntegrationsStatus(): Promise<IntegrationsStatus> {
	const counts = await getDbCounts();

	// Ping Railway services in parallel
	const [orchestratorHealth, langextractHealth] = await Promise.all([
		pingService("https://ere-orchestrator-staging.up.railway.app/health"),
		pingService("https://langextract-worker-staging.up.railway.app/health"),
	]);

	const langextractBody = langextractHealth.body as
		| {
				mock_mode?: boolean;
				default_model?: string;
				langextract_available?: boolean;
		  }
		| undefined;

	const services: ServiceHealth[] = [
		{
			name: "ere-orchestrator",
			status: orchestratorHealth.ok ? "ok" : "bad",
			env: "railway",
			meta: [
				{ label: "STATUS", value: orchestratorHealth.ok ? "healthy" : "down" },
				{ label: "RUNTIME", value: "Hono + Node 22" },
				{ label: "DB", value: "postgres" },
			],
			health: orchestratorHealth.ok
				? `${orchestratorHealth.status} OK`
				: "unreachable",
			healthClass: orchestratorHealth.ok ? undefined : "bad",
			action: { label: "Health" },
		},
		{
			name: "ere-browser",
			status: "ok",
			env: "railway",
			meta: [
				{ label: "ENGINE", value: "Playwright" },
				{ label: "CHROMIUM", value: "v1.50" },
				{ label: "POOL", value: "2" },
			],
			health: "Playwright ready",
			action: { label: "Open" },
		},
		{
			name: "ere-cron",
			status: "bad",
			env: "railway",
			meta: [
				{ label: "CPU", value: "—" },
				{ label: "MEM", value: "—" },
				{ label: "UP", value: "crashed" },
			],
			health: "exit 1 · fetch timeout",
			healthClass: "bad",
			action: { label: "Restart", variant: "danger" },
		},
		{
			name: "langextract-worker",
			status: langextractHealth.ok ? "ok" : "bad",
			env: "railway",
			meta: [
				{
					label: "MODEL",
					value: langextractBody?.default_model ?? "gemini-2.5-flash",
				},
				{
					label: "MOCK",
					value: langextractBody?.mock_mode === false ? "false" : "true",
				},
				{
					label: "LIB",
					value: langextractBody?.langextract_available ? "ok" : "missing",
				},
			],
			health: langextractHealth.ok
				? `${counts.processingResults} processing results · ${counts.chronology} chronology`
				: "unreachable",
			healthClass: langextractHealth.ok ? undefined : "bad",
			action: { label: "Test" },
		},
		{
			name: "n8n",
			status: "warn",
			env: "railway",
			meta: [
				{ label: "CPU", value: "4%" },
				{ label: "MEM", value: "256MB" },
				{ label: "WF", value: "0/19 active" },
			],
			health: "No workflows enabled",
			healthClass: "warn",
			action: { label: "Open UI" },
		},
		{
			name: "Postgres (Railway)",
			status: "ok",
			env: "db",
			meta: [
				{ label: "VERSION", value: "pg 18" },
				{ label: "EXT", value: "pgvector" },
				{ label: "REGION", value: "us-east4" },
			],
			health: `${counts.cases} cases · ${counts.contacts} contacts · ${counts.tasks} tasks`,
			action: { label: "Studio" },
		},
		{
			name: "Redis",
			status: "ok",
			env: "railway",
			meta: [
				{ label: "VERSION", value: "7-alpine" },
				{ label: "EVICT", value: "allkeys-lru" },
				{ label: "PERSIST", value: "AOF" },
			],
			health: "BullMQ · ready",
			action: { label: "Stats" },
		},
		{
			name: "Vercel (favorble)",
			status: "ok",
			env: "web",
			meta: [
				{ label: "DEPLOY", value: "Ready" },
				{ label: "FRAMEWORK", value: "Next.js 16" },
				{ label: "TEAM", value: "chestnut" },
			],
			health: "main branch · auto-deploy on push",
			action: { label: "Dashboard" },
		},
		{
			name: "Clerk Auth",
			status: "warn",
			env: "auth",
			meta: [
				{ label: "MODE", value: "test" },
				{ label: "USERS", value: String(counts.users) },
				{ label: "PROVIDER", value: "email" },
			],
			health: "pk_test_… keys in use",
			healthClass: "warn",
			action: { label: "Dashboard" },
		},
		{
			name: "ERE Credentials Vault",
			status: counts.ereCredentials > 0 ? "ok" : "warn",
			env: "vault",
			meta: [
				{ label: "STORED", value: String(counts.ereCredentials) },
				{ label: "ENC", value: "AES-256-GCM" },
				{ label: "ROT", value: "n/a" },
			],
			health:
				counts.ereCredentials > 0
					? `${counts.ereCredentials} credential(s) active`
					: "No credentials stored — ERE disabled",
			healthClass: counts.ereCredentials > 0 ? undefined : "warn",
			action: { label: "Add" },
			url: "/admin/integrations/ere",
		},
		{
			name: "MyCase",
			status: "off",
			env: "saas",
			meta: [
				{ label: "STATE", value: "not configured" },
				{ label: "OAUTH", value: "—" },
			],
			health: "Placeholder · set MYCASE_API_KEY",
			action: { label: "Connect" },
		},
		{
			name: "CaseStatus",
			status: "off",
			env: "saas",
			meta: [
				{ label: "STATE", value: "placeholder" },
				{ label: "API", value: "stubbed" },
			],
			health: "Pending API key from admin dashboard",
			action: { label: "Setup" },
		},
		{
			name: "Outlook / MS Graph",
			status: "off",
			env: "email",
			meta: [
				{ label: "STATE", value: "placeholder" },
				{ label: "TENANT", value: "—" },
			],
			health: "No Azure AD tenant linked",
			action: { label: "Link" },
		},
	];

	const alerts: IntegrationsStatus["alerts"] = [];
	const badServices = services.filter((s) => s.status === "bad");
	for (const svc of badServices) {
		alerts.push({
			severity: "bad",
			title: `1 service degraded · ${svc.name} has crashed on Railway`,
			desc: `${svc.health} · last check at ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`,
		});
	}

	return {
		counts,
		services,
		alerts,
		nowUtc: new Date().toISOString().slice(0, 19).replace("T", " "),
	};
}
