/**
 * Database seed script.
 *
 * Seeds the database with default stage groups, stages, and custom field definitions.
 * Run with: npx tsx db/seed/index.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { defaultStageGroups } from "./stages";
import { defaultCustomFields } from "./custom-fields";

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  console.log("Seeding database...");

  // 1. Create default organization
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: "Hogan & Smith Law",
      slug: "hogan-smith",
    })
    .onConflictDoNothing()
    .returning();

  const orgId = org?.id;
  if (!orgId) {
    console.log("Organization already exists, fetching...");
    const existing = await db.query.organizations.findFirst();
    if (!existing) throw new Error("No organization found");
    console.log(`Using organization: ${existing.name} (${existing.id})`);
    await seedData(db, existing.id);
  } else {
    console.log(`Created organization: ${org.name} (${orgId})`);
    await seedData(db, orgId);
  }

  await client.end();
  console.log("Seeding complete!");
}

async function seedData(
  db: ReturnType<typeof drizzle>,
  organizationId: string,
) {
  // 2. Create demo users
  const demoUsers = [
    {
      email: "admin@hogansmith.com",
      firstName: "Jake",
      lastName: "Admin",
      role: "admin" as const,
      team: "administration" as const,
    },
    {
      email: "attorney@hogansmith.com",
      firstName: "Sarah",
      lastName: "Attorney",
      role: "attorney" as const,
      team: null,
    },
    {
      email: "filing@hogansmith.com",
      firstName: "Apple",
      lastName: "Filing",
      role: "filing_agent" as const,
      team: "filing" as const,
    },
    {
      email: "intake@hogansmith.com",
      firstName: "Maria",
      lastName: "Intake",
      role: "intake_agent" as const,
      team: "intake" as const,
    },
    {
      email: "medrec@hogansmith.com",
      firstName: "James",
      lastName: "MedRec",
      role: "medical_records" as const,
      team: "medical_records" as const,
    },
    {
      email: "casemgr@hogansmith.com",
      firstName: "Lisa",
      lastName: "CaseMgr",
      role: "case_manager" as const,
      team: "case_management" as const,
    },
    {
      email: "hearings@hogansmith.com",
      firstName: "Tom",
      lastName: "Hearings",
      role: "case_manager" as const,
      team: "hearings" as const,
    },
  ];

  for (const user of demoUsers) {
    await db
      .insert(schema.users)
      .values({
        organizationId,
        ...user,
      })
      .onConflictDoNothing();
  }
  console.log(`Seeded ${demoUsers.length} users`);

  // 3. Create stage groups and stages
  let stageCount = 0;
  for (let groupIdx = 0; groupIdx < defaultStageGroups.length; groupIdx++) {
    const group = defaultStageGroups[groupIdx];

    const [stageGroup] = await db
      .insert(schema.caseStageGroups)
      .values({
        organizationId,
        name: group.name,
        displayOrder: groupIdx,
        color: group.color,
        clientVisibleName: group.clientVisibleName,
        clientVisibleDescription: group.clientVisibleDescription,
      })
      .returning();

    for (let stageIdx = 0; stageIdx < group.stages.length; stageIdx++) {
      const stage = group.stages[stageIdx];
      await db.insert(schema.caseStages).values({
        organizationId,
        stageGroupId: stageGroup.id,
        name: stage.name,
        code: stage.code,
        displayOrder: stageIdx,
        owningTeam: stage.owningTeam,
        isInitial: "isInitial" in stage ? stage.isInitial : false,
        isTerminal: "isTerminal" in stage ? stage.isTerminal : false,
      });
      stageCount++;
    }
  }
  console.log(
    `Seeded ${defaultStageGroups.length} stage groups with ${stageCount} stages`,
  );

  // 4. Create custom field definitions
  for (let i = 0; i < defaultCustomFields.length; i++) {
    const field = defaultCustomFields[i];
    await db
      .insert(schema.customFieldDefinitions)
      .values({
        organizationId,
        name: field.name,
        slug: field.slug,
        fieldType: field.fieldType,
        team: field.team,
        section: field.section,
        displayOrder: i,
        options: "options" in field ? field.options : [],
      })
      .onConflictDoNothing();
  }
  console.log(`Seeded ${defaultCustomFields.length} custom field definitions`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
