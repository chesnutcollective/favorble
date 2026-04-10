import "server-only";
import { logger } from "@/lib/logger/server";

export type N8nWorkflow = {
	id: string;
	name: string;
	active: boolean;
	isPlaceholder: boolean;
	trigger: string;
	lastExecution: string | null;
	createdAt: string;
	updatedAt: string;
};

export type N8nStatus = {
	total: number;
	active: number;
	placeholders: number;
	reachable: boolean;
	workflows: N8nWorkflow[];
};

type N8nNode = {
	id?: string;
	name?: string;
	type?: string;
	parameters?: Record<string, unknown>;
};

type N8nWorkflowRaw = {
	id: string;
	name: string;
	active: boolean;
	createdAt: string;
	updatedAt: string;
	nodes?: N8nNode[];
};

type N8nWorkflowsResponse = {
	data: N8nWorkflowRaw[];
	nextCursor: string | null;
};

type N8nExecutionRaw = {
	id: string;
	workflowId: string;
	startedAt?: string | null;
	stoppedAt?: string | null;
	finished?: boolean;
	mode?: string;
};

type N8nExecutionsResponse = {
	data: N8nExecutionRaw[];
	nextCursor: string | null;
};

const EMPTY_STATUS: N8nStatus = {
	total: 0,
	active: 0,
	placeholders: 0,
	reachable: false,
	workflows: [],
};

function getConfig(): { baseUrl: string; apiKey: string } | null {
	const baseUrl = process.env.N8N_BASE_URL;
	const apiKey = process.env.N8N_API_KEY;
	if (!baseUrl || !apiKey) {
		return null;
	}
	return {
		baseUrl: baseUrl.replace(/\/+$/, ""),
		apiKey,
	};
}

/**
 * Detect the trigger type of a workflow by inspecting its nodes.
 * Returns a short label such as "webhook", "cron", "manual", etc.
 */
function detectTrigger(nodes: N8nNode[] | undefined): string {
	if (!nodes || nodes.length === 0) return "unknown";

	// Prefer well-known trigger node types
	const triggerNode = nodes.find((node) => {
		const type = node.type ?? "";
		return (
			type.endsWith("Trigger") ||
			type === "n8n-nodes-base.webhook" ||
			type === "n8n-nodes-base.cron" ||
			type === "n8n-nodes-base.scheduleTrigger" ||
			type === "n8n-nodes-base.manualTrigger" ||
			type === "n8n-nodes-base.start"
		);
	});

	if (!triggerNode?.type) return "unknown";

	const type = triggerNode.type;
	switch (type) {
		case "n8n-nodes-base.scheduleTrigger":
		case "n8n-nodes-base.cron":
			return "cron";
		case "n8n-nodes-base.webhook":
			return "webhook";
		case "n8n-nodes-base.manualTrigger":
			return "manual";
		case "n8n-nodes-base.start":
			return "manual";
		default: {
			// Examples:
			//  n8n-nodes-base.emailReadImapTrigger -> emailReadImap
			//  n8n-nodes-base.redisTrigger -> redis (queue-ish)
			//  n8n-nodes-base.rabbitmqTrigger -> rabbitmq
			const shortName = type.replace(/^.*\./, "").replace(/Trigger$/, "");
			if (!shortName) return "unknown";
			if (
				shortName.toLowerCase().includes("queue") ||
				shortName.toLowerCase().includes("rabbitmq") ||
				shortName.toLowerCase().includes("kafka") ||
				shortName.toLowerCase().includes("redis") ||
				shortName.toLowerCase().includes("sqs")
			) {
				return "queue";
			}
			return shortName;
		}
	}
}

async function fetchWorkflows(
	baseUrl: string,
	apiKey: string,
): Promise<N8nWorkflowRaw[]> {
	const response = await fetch(`${baseUrl}/api/v1/workflows`, {
		headers: {
			"X-N8N-API-KEY": apiKey,
			Accept: "application/json",
		},
		next: { revalidate: 30 },
	});

	if (!response.ok) {
		throw new Error(
			`n8n workflows request failed: ${response.status} ${response.statusText}`,
		);
	}

	const json = (await response.json()) as N8nWorkflowsResponse;
	return Array.isArray(json?.data) ? json.data : [];
}

async function fetchRecentExecutions(
	baseUrl: string,
	apiKey: string,
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	try {
		const response = await fetch(
			`${baseUrl}/api/v1/executions?limit=50`,
			{
				headers: {
					"X-N8N-API-KEY": apiKey,
					Accept: "application/json",
				},
				next: { revalidate: 30 },
			},
		);

		if (!response.ok) {
			logger.warn("n8n executions request failed", {
				status: response.status,
				statusText: response.statusText,
			});
			return map;
		}

		const json = (await response.json()) as N8nExecutionsResponse;
		const executions = Array.isArray(json?.data) ? json.data : [];

		for (const exec of executions) {
			if (!exec?.workflowId) continue;
			const ts = exec.stoppedAt ?? exec.startedAt ?? null;
			if (!ts) continue;
			const existing = map.get(exec.workflowId);
			if (!existing || new Date(ts).getTime() > new Date(existing).getTime()) {
				map.set(exec.workflowId, ts);
			}
		}
	} catch (error) {
		logger.warn("Failed to fetch n8n executions", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
	return map;
}

export async function fetchN8nStatus(): Promise<N8nStatus> {
	const config = getConfig();
	if (!config) {
		logger.warn("n8n status requested but N8N_BASE_URL/N8N_API_KEY not set");
		return EMPTY_STATUS;
	}

	try {
		const [rawWorkflows, executionsByWorkflowId] = await Promise.all([
			fetchWorkflows(config.baseUrl, config.apiKey),
			fetchRecentExecutions(config.baseUrl, config.apiKey),
		]);

		const workflows: N8nWorkflow[] = rawWorkflows.map((wf) => {
			const name = wf.name ?? "";
			return {
				id: wf.id,
				name,
				active: Boolean(wf.active),
				isPlaceholder: name.startsWith("[TODO]"),
				trigger: detectTrigger(wf.nodes),
				lastExecution: executionsByWorkflowId.get(wf.id) ?? null,
				createdAt: wf.createdAt,
				updatedAt: wf.updatedAt,
			};
		});

		const active = workflows.filter((wf) => wf.active).length;
		const placeholders = workflows.filter((wf) => wf.isPlaceholder).length;

		return {
			total: workflows.length,
			active,
			placeholders,
			reachable: true,
			workflows,
		};
	} catch (error) {
		logger.error("Failed to fetch n8n status", error, {
			baseUrl: config.baseUrl,
		});
		return EMPTY_STATUS;
	}
}
