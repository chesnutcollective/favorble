import { NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { ereCredentials } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { encrypt } from "@/lib/encryption";

/**
 * POST /api/ere/credentials — Store new ERE credentials (encrypted).
 */
export async function POST(request: Request) {
	try {
		const session = await requireSession();
		const body = await request.json();

		const { label, username, password, totpSecret } = body;

		if (!username || !password) {
			return NextResponse.json(
				{ error: "username and password are required" },
				{ status: 400 },
			);
		}

		const [credential] = await db
			.insert(ereCredentials)
			.values({
				organizationId: session.organizationId,
				label: label ?? null,
				usernameEncrypted: encrypt(username),
				passwordEncrypted: encrypt(password),
				totpSecretEncrypted: totpSecret ? encrypt(totpSecret) : null,
				isActive: true,
				createdBy: session.id,
			})
			.returning({
				id: ereCredentials.id,
				label: ereCredentials.label,
				isActive: ereCredentials.isActive,
				lastUsedAt: ereCredentials.lastUsedAt,
				lastErrorMessage: ereCredentials.lastErrorMessage,
				createdAt: ereCredentials.createdAt,
			});

		logger.info("ERE credential created", {
			credentialId: credential.id,
		});

		return NextResponse.json({ credential });
	} catch (error) {
		logger.error("ERE credential creation error", { error });
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

/**
 * GET /api/ere/credentials — List ERE credentials (never returns decrypted values).
 */
export async function GET() {
	try {
		const session = await requireSession();

		const credentials = await db
			.select({
				id: ereCredentials.id,
				label: ereCredentials.label,
				isActive: ereCredentials.isActive,
				lastUsedAt: ereCredentials.lastUsedAt,
				lastErrorMessage: ereCredentials.lastErrorMessage,
				createdAt: ereCredentials.createdAt,
				updatedAt: ereCredentials.updatedAt,
			})
			.from(ereCredentials)
			.where(
				and(
					eq(ereCredentials.organizationId, session.organizationId),
					eq(ereCredentials.isActive, true),
				),
			);

		return NextResponse.json({ credentials });
	} catch (error) {
		logger.error("ERE credentials list error", { error });
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
