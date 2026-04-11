import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { cases, contacts, leads, organizations, caseStages } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * POST /api/sync/mycase
 *
 * Bulk upsert endpoint hit by n8n's "MyCase → Favorble Incremental Sync"
 * workflow. Accepts arrays of cases, contacts, and leads from the MyCase
 * API and upserts them into the Favorble database, deduping by external ID.
 *
 * Auth: X-Sync-Token header must match FAVORBLE_SYNC_TOKEN env var.
 *
 * Body shape:
 * {
 *   entityType: "cases" | "contacts" | "leads",
 *   records: Array<MyCase entity>
 * }
 */
export async function POST(request: NextRequest) {
	const expectedToken = process.env.FAVORBLE_SYNC_TOKEN;
	if (!expectedToken) {
		return NextResponse.json(
			{ error: "Sync endpoint not configured (FAVORBLE_SYNC_TOKEN missing)" },
			{ status: 500 },
		);
	}

	const providedToken = request.headers.get("x-sync-token");
	if (providedToken !== expectedToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: { entityType?: string; records?: unknown[] };
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const { entityType, records } = body;
	if (!entityType || !Array.isArray(records)) {
		return NextResponse.json(
			{ error: "Missing entityType or records" },
			{ status: 400 },
		);
	}

	// Find the default organization (Hogan Smith Law)
	const [org] = await db
		.select({ id: organizations.id })
		.from(organizations)
		.limit(1);

	if (!org) {
		return NextResponse.json(
			{ error: "No organization found" },
			{ status: 500 },
		);
	}

	let upserted = 0;
	let skipped = 0;
	const errors: string[] = [];

	try {
		switch (entityType) {
			case "contacts": {
				for (const record of records) {
					const r = record as Record<string, unknown>;
					const mycaseId = String(r.id);
					try {
						await db
							.insert(contacts)
							.values({
								organizationId: org.id,
								firstName: String(r.first_name ?? ""),
								lastName: String(r.last_name ?? ""),
								email: r.email ? String(r.email) : null,
								phone: r.phone ? String(r.phone) : null,
								contactType: "claimant",
								metadata: { mycaseId, source: "mycase" },
							})
							.onConflictDoNothing();
						upserted++;
					} catch (err: any) {
						errors.push(`contact ${mycaseId}: ${err.message}`);
						skipped++;
					}
				}
				break;
			}

			case "leads": {
				for (const record of records) {
					const r = record as Record<string, unknown>;
					const mycaseId = String(r.id);
					try {
						await db
							.insert(leads)
							.values({
								organizationId: org.id,
								firstName: String(r.first_name ?? ""),
								lastName: String(r.last_name ?? ""),
								email: r.email ? String(r.email) : null,
								phone: r.phone ? String(r.phone) : null,
								status: "new",
								source: "mycase",
								sourceData: { mycaseId, ...r },
							})
							.onConflictDoNothing();
						upserted++;
					} catch (err: any) {
						errors.push(`lead ${mycaseId}: ${err.message}`);
						skipped++;
					}
				}
				break;
			}

			case "cases": {
				// Cases require an initial stage. Find one for this org.
				const [initialStage] = await db
					.select({ id: caseStages.id })
					.from(caseStages)
					.where(
						and(
							eq(caseStages.organizationId, org.id),
							eq(caseStages.isInitial, true),
						),
					)
					.limit(1);

				if (!initialStage) {
					return NextResponse.json(
						{
							error:
								"No initial case stage configured. Set up stages in /admin/stages first.",
						},
						{ status: 500 },
					);
				}

				for (const record of records) {
					const r = record as Record<string, unknown>;
					const mycaseId = String(r.id);
					const caseNumber = String(r.case_number ?? mycaseId);
					try {
						await db
							.insert(cases)
							.values({
								organizationId: org.id,
								caseNumber,
								currentStageId: initialStage.id,
								status: "active",
								caseStatusExternalId: `mycase:${mycaseId}`,
							})
							.onConflictDoNothing();
						upserted++;
					} catch (err: any) {
						errors.push(`case ${mycaseId}: ${err.message}`);
						skipped++;
					}
				}
				break;
			}

			default:
				return NextResponse.json(
					{ error: `Unknown entityType: ${entityType}` },
					{ status: 400 },
				);
		}

		logger.info("MyCase sync completed", {
			entityType,
			upserted,
			skipped,
			errorCount: errors.length,
		});

		return NextResponse.json({
			success: true,
			entityType,
			upserted,
			skipped,
			errors: errors.slice(0, 10),
		});
	} catch (error) {
		logger.error("MyCase sync failed", { error });
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function GET() {
	return NextResponse.json({
		status: "ok",
		endpoint: "mycase-sync",
		configured: Boolean(process.env.FAVORBLE_SYNC_TOKEN),
	});
}
