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
import {
	fetchRailwayServices,
	mapRailwayStatus,
	type RailwayServiceStatus,
} from "./railway-status";
import { fetchN8nStatus, type N8nStatus } from "./n8n-status";
import { fetchActivityFeed, type ActivityItem } from "./activity-feed";

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
	n8n: N8nStatus;
	activity: ActivityItem[];
	nowUtc: string;
};

async function pingService(
	url: string,
	timeoutMs = 3000,
): Promise<{ ok: boolean; status?: number; body?: unknown }> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		const response = await fetch(url, {
			signal: controller.signal,
			next: { revalidate: 30 },
		});
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

function findRailwayService(
	services: RailwayServiceStatus[],
	name: string,
): RailwayServiceStatus | undefined {
	const lower = name.toLowerCase();
	return services.find((s) => s.name.toLowerCase() === lower);
}

function formatRelativeTime(iso: string | null): string {
	if (!iso) return "—";
	const then = new Date(iso).getTime();
	const now = Date.now();
	const diffMs = now - then;
	if (diffMs < 0) return "just now";
	const seconds = Math.floor(diffMs / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export async function getIntegrationsStatus(): Promise<IntegrationsStatus> {
	const [
		counts,
		railwayServices,
		n8nStatus,
		activity,
		orchestratorHealth,
		langextractHealth,
	] = await Promise.all([
		getDbCounts(),
		fetchRailwayServices("staging"),
		fetchN8nStatus(),
		fetchActivityFeed(12),
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

	// Build service health from real Railway data + ping checks
	const services: ServiceHealth[] = [];

	// Helper to build a service from Railway data
	const railwayService = (
		displayName: string,
		railwayName: string,
		options: {
			env?: string;
			extraMeta?: Array<{ label: string; value: string }>;
			extraHealth?: string;
			pingOk?: boolean;
		} = {},
	): ServiceHealth => {
		const rs = findRailwayService(railwayServices, railwayName);
		const status = rs
			? options.pingOk === false
				? "bad"
				: mapRailwayStatus(rs.deploymentStatus)
			: "off";
		const meta: Array<{ label: string; value: string }> = [
			{ label: "STATUS", value: rs?.deploymentStatus.toLowerCase() ?? "unknown" },
			{ label: "DEPLOY", value: formatRelativeTime(rs?.lastDeployedAt ?? null) },
			...(options.extraMeta ?? []),
		];
		const health =
			options.extraHealth ??
			(status === "ok"
				? "Healthy"
				: status === "bad"
					? "Service unhealthy"
					: status === "warn"
						? "Building/deploying"
						: "Not deployed");
		return {
			name: displayName,
			status,
			env: options.env ?? "railway",
			meta,
			health,
			healthClass:
				status === "bad" ? "bad" : status === "warn" ? "warn" : undefined,
			action: rs?.url ? { label: "Open" } : { label: "Health" },
			url: rs?.url ?? undefined,
		};
	};

	services.push(
		railwayService("ere-orchestrator", "ere-orchestrator", {
			extraMeta: [
				{
					label: "PING",
					value: orchestratorHealth.ok ? `${orchestratorHealth.status}` : "down",
				},
			],
			extraHealth: orchestratorHealth.ok
				? `${orchestratorHealth.status} OK · pinged`
				: "Health endpoint unreachable",
			pingOk: orchestratorHealth.ok,
		}),
	);

	services.push(railwayService("ere-browser", "ere-browser"));

	services.push(railwayService("ere-cron", "ere-cron"));

	services.push(
		railwayService("langextract-worker", "langextract-worker", {
			extraMeta: [
				{
					label: "MODEL",
					value: langextractBody?.default_model ?? "unknown",
				},
				{
					label: "MOCK",
					value: langextractBody?.mock_mode === false ? "false" : "true",
				},
			],
			extraHealth: langextractHealth.ok
				? `${counts.processingResults} extractions · ${counts.chronology} chronology`
				: "Health endpoint unreachable",
			pingOk: langextractHealth.ok,
		}),
	);

	const n8nWarn = n8nStatus.reachable && n8nStatus.active === 0;
	services.push(
		railwayService("n8n", "n8n", {
			extraMeta: [
				{
					label: "WF",
					value: n8nStatus.reachable
						? `${n8nStatus.active}/${n8nStatus.total}`
						: "?",
				},
				{
					label: "TODO",
					value: String(n8nStatus.placeholders),
				},
			],
			extraHealth: n8nStatus.reachable
				? n8nWarn
					? "No workflows active"
					: `${n8nStatus.active} workflow(s) running`
				: "n8n API unreachable",
		}),
	);

	// Override n8n status to warn if no workflows active
	const n8nServiceIndex = services.findIndex((s) => s.name === "n8n");
	if (n8nWarn && n8nServiceIndex >= 0 && services[n8nServiceIndex].status === "ok") {
		services[n8nServiceIndex].status = "warn";
		services[n8nServiceIndex].healthClass = "warn";
	}

	services.push(
		railwayService("Postgres", "Postgres", {
			env: "db",
			extraMeta: [
				{ label: "VERSION", value: "pg 18" },
				{ label: "EXT", value: "pgvector" },
			],
			extraHealth: `${counts.cases} cases · ${counts.contacts} contacts · ${counts.tasks} tasks`,
		}),
	);

	services.push(
		railwayService("Redis", "redis", {
			extraMeta: [
				{ label: "VERSION", value: "7-alpine" },
				{ label: "EVICT", value: "allkeys-lru" },
			],
			extraHealth: "BullMQ ready",
		}),
	);

	// Vercel - we know it's deployed because we're rendering this page
	services.push({
		name: "Vercel (favorble)",
		status: "ok",
		env: "web",
		meta: [
			{ label: "FRAMEWORK", value: "Next.js 16" },
			{ label: "TEAM", value: "chestnut" },
			{ label: "BRANCH", value: "main" },
		],
		health: "Auto-deploy on push to main",
		action: { label: "Dashboard" },
		url: "https://vercel.com/chestnutcollective/favorble",
	});

	// Clerk - check via env vars
	const clerkConfigured = Boolean(
		process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	);
	const clerkEnabled = process.env.ENABLE_CLERK_AUTH === "true";
	const clerkTestMode =
		process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ??
		false;
	services.push({
		name: "Clerk Auth",
		status: clerkConfigured ? (clerkTestMode || !clerkEnabled ? "warn" : "ok") : "off",
		env: "auth",
		meta: [
			{ label: "MODE", value: clerkTestMode ? "test" : "live" },
			{ label: "USERS", value: String(counts.users) },
			{ label: "ENFORCED", value: clerkEnabled ? "yes" : "no" },
		],
		health: clerkEnabled
			? clerkTestMode
				? "pk_test_… keys in use"
				: "Production mode active"
			: "Auth disabled (demo mode)",
		healthClass: clerkConfigured ? "warn" : undefined,
		action: { label: "Dashboard" },
	});

	// ERE Credentials Vault - real DB count
	services.push({
		name: "ERE Credentials Vault",
		status: counts.ereCredentials > 0 ? "ok" : "warn",
		env: "vault",
		meta: [
			{ label: "STORED", value: String(counts.ereCredentials) },
			{ label: "ENC", value: "AES-256-GCM" },
		],
		health:
			counts.ereCredentials > 0
				? `${counts.ereCredentials} credential(s) active`
				: "No credentials stored — ERE disabled",
		healthClass: counts.ereCredentials > 0 ? undefined : "warn",
		action: { label: "Manage" },
		url: "/admin/integrations/ere",
	});

	// External SaaS placeholders - check env vars
	const mycaseConfigured = Boolean(
		process.env.MYCASE_API_KEY &&
			process.env.MYCASE_API_KEY !== "pending-from-mycase",
	);
	services.push({
		name: "MyCase",
		status: mycaseConfigured ? "ok" : "off",
		env: "saas",
		meta: [
			{
				label: "STATE",
				value: mycaseConfigured ? "configured" : "not configured",
			},
		],
		health: mycaseConfigured
			? "API key set"
			: "Placeholder · set MYCASE_API_KEY",
		action: { label: "Connect" },
	});

	const caseStatusConfigured = Boolean(
		process.env.CASE_STATUS_API_KEY &&
			!process.env.CASE_STATUS_API_KEY.startsWith("pending"),
	);
	services.push({
		name: "CaseStatus",
		status: caseStatusConfigured ? "ok" : "off",
		env: "saas",
		meta: [
			{
				label: "STATE",
				value: caseStatusConfigured ? "configured" : "placeholder",
			},
		],
		health: caseStatusConfigured
			? "API key set"
			: "Pending real API key",
		action: { label: "Setup" },
	});

	const outlookConfigured = Boolean(
		process.env.MICROSOFT_CLIENT_ID &&
			!process.env.MICROSOFT_CLIENT_ID.startsWith("pending"),
	);
	services.push({
		name: "Outlook / MS Graph",
		status: outlookConfigured ? "ok" : "off",
		env: "email",
		meta: [
			{
				label: "STATE",
				value: outlookConfigured ? "configured" : "placeholder",
			},
		],
		health: outlookConfigured
			? "Azure AD tenant linked"
			: "No Azure AD tenant linked",
		action: { label: "Link" },
	});

	// Build alerts from any bad services
	const alerts: IntegrationsStatus["alerts"] = [];
	const badServices = services.filter((s) => s.status === "bad");
	for (const svc of badServices) {
		alerts.push({
			severity: "bad",
			title: `${svc.name} is degraded`,
			desc: `${svc.health} · checked ${new Date().toISOString().slice(11, 19)} UTC`,
		});
	}

	return {
		counts,
		services,
		alerts,
		n8n: n8nStatus,
		activity,
		nowUtc: new Date().toISOString().slice(0, 19).replace("T", " "),
	};
}
