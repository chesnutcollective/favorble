import "server-only";
import { logger } from "@/lib/logger/server";

const RAILWAY_GRAPHQL_ENDPOINT = "https://backboard.railway.app/graphql/v2";
const RAILWAY_PROJECT_ID = "78751357-aabe-4307-96d0-d7a92bcc1481";

const RAILWAY_ENVIRONMENT_IDS = {
	staging: "4c5e26d8-baaa-4921-a3a4-900f76287abf",
	production: "18c7c7f0-09df-40b2-bc24-639da563e565",
} as const;

// Fallback for local dev if env var not set
const RAILWAY_TOKEN_FALLBACK = "2ace5fb8-4542-47ef-855c-ff910442b0e0";

export type RailwayDeploymentStatus =
	| "SUCCESS"
	| "FAILED"
	| "CRASHED"
	| "BUILDING"
	| "DEPLOYING"
	| "REMOVED"
	| "UNKNOWN";

export type RailwayServiceStatus = {
	id: string;
	name: string;
	deploymentStatus: RailwayDeploymentStatus;
	lastDeployedAt: string | null;
	url: string | null;
	internalDomain: string | null;
};

type RailwayServicesResponse = {
	data?: {
		project?: {
			services?: {
				edges?: Array<{
					node: {
						id: string;
						name: string;
						serviceInstances?: {
							edges?: Array<{
								node: {
									environmentId: string;
									latestDeployment?: {
										id: string;
										status: string;
										staticUrl: string | null;
										createdAt: string;
									} | null;
									domains?: {
										serviceDomains?: Array<{
											domain: string;
										}>;
									};
								};
							}>;
						};
					};
				}>;
			};
		};
	};
	errors?: Array<{ message: string }>;
};

const SERVICES_QUERY = `
  {
    project(id: "${RAILWAY_PROJECT_ID}") {
      services {
        edges {
          node {
            id
            name
            serviceInstances {
              edges {
                node {
                  environmentId
                  latestDeployment {
                    id
                    status
                    staticUrl
                    createdAt
                  }
                  domains {
                    serviceDomains {
                      domain
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

function normalizeDeploymentStatus(status: string | undefined): RailwayDeploymentStatus {
	switch (status) {
		case "SUCCESS":
		case "FAILED":
		case "CRASHED":
		case "BUILDING":
		case "DEPLOYING":
		case "REMOVED":
			return status;
		default:
			return "UNKNOWN";
	}
}

/**
 * Map a Railway deployment status to a cockpit-level status.
 */
export function mapRailwayStatus(
	deploymentStatus: string,
): "ok" | "warn" | "bad" | "off" {
	switch (deploymentStatus) {
		case "SUCCESS":
			return "ok";
		case "CRASHED":
		case "FAILED":
			return "bad";
		case "BUILDING":
		case "DEPLOYING":
			return "warn";
		case "REMOVED":
			return "off";
		default:
			return "off";
	}
}

/**
 * Fetch all services in the Railway project for the given environment.
 * Returns an empty array on error (never throws).
 */
export async function fetchRailwayServices(
	environment: "staging" | "production" = "staging",
): Promise<RailwayServiceStatus[]> {
	const token = process.env.RAILWAY_API_TOKEN ?? RAILWAY_TOKEN_FALLBACK;
	if (!token) {
		logger.warn("Railway API token not configured");
		return [];
	}

	const environmentId = RAILWAY_ENVIRONMENT_IDS[environment];

	try {
		const response = await fetch(RAILWAY_GRAPHQL_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ query: SERVICES_QUERY }),
			next: { revalidate: 30 },
		});

		if (!response.ok) {
			logger.error("Railway GraphQL request failed", undefined, {
				status: response.status,
				statusText: response.statusText,
				environment,
			});
			return [];
		}

		const json = (await response.json()) as RailwayServicesResponse;

		if (json.errors && json.errors.length > 0) {
			logger.error("Railway GraphQL returned errors", undefined, {
				errors: json.errors,
				environment,
			});
			return [];
		}

		const serviceEdges = json.data?.project?.services?.edges ?? [];

		const services: RailwayServiceStatus[] = [];

		for (const serviceEdge of serviceEdges) {
			const { id, name, serviceInstances } = serviceEdge.node;
			const instances = serviceInstances?.edges ?? [];

			// Find the instance matching the requested environment
			const matchingInstance = instances.find(
				(e) => e.node.environmentId === environmentId,
			);

			if (!matchingInstance) {
				// Service not deployed in this environment - represent as REMOVED/off
				services.push({
					id,
					name,
					deploymentStatus: "REMOVED",
					lastDeployedAt: null,
					url: null,
					internalDomain: null,
				});
				continue;
			}

			const instance = matchingInstance.node;
			const deployment = instance.latestDeployment;
			const serviceDomains = instance.domains?.serviceDomains ?? [];

			const publicDomain = serviceDomains[0]?.domain ?? null;
			const url = publicDomain
				? `https://${publicDomain}`
				: deployment?.staticUrl
					? deployment.staticUrl.startsWith("http")
						? deployment.staticUrl
						: `https://${deployment.staticUrl}`
					: null;

			services.push({
				id,
				name,
				deploymentStatus: normalizeDeploymentStatus(deployment?.status),
				lastDeployedAt: deployment?.createdAt ?? null,
				url,
				internalDomain: publicDomain,
			});
		}

		return services;
	} catch (error) {
		logger.error("Failed to fetch Railway services", error, { environment });
		return [];
	}
}
