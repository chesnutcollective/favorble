/**
 * Seed script for Team Chat channels and sample messages.
 *
 * Creates 3 default channels (#general, #case-updates, #random) if none exist,
 * adds all org users as members, and inserts 10 sample messages in #general.
 *
 * Run with: npx tsx scripts/seed-team-chat.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../db/schema";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  console.log("=== Team Chat Seed ===\n");

  // Find organization
  const org = await db.query.organizations.findFirst();
  if (!org) {
    throw new Error(
      "No organization found. Run the base seed first: pnpm db:seed",
    );
  }
  console.log(`Organization: ${org.name} (${org.id})`);

  // Find users
  const orgUsers = await db.query.users.findMany({
    where: eq(schema.users.organizationId, org.id),
  });
  if (orgUsers.length === 0) {
    throw new Error("No users found. Run the base seed first: pnpm db:seed");
  }
  console.log(`Found ${orgUsers.length} users`);

  // Check for existing channels
  const existingChannels = await db.query.chatChannels.findMany({
    where: eq(schema.chatChannels.organizationId, org.id),
  });
  if (existingChannels.length > 0) {
    console.log(
      `\nFound ${existingChannels.length} existing chat channels. Skipping seed.`,
    );
    console.log("To re-seed, delete existing channels first.");
    await client.end();
    return;
  }

  // Create default channels
  const channelDefs = [
    {
      name: "general",
      description: "General team discussions and announcements",
      channelType: "team" as const,
    },
    {
      name: "case-updates",
      description: "Case status updates and milestone notifications",
      channelType: "team" as const,
    },
    {
      name: "random",
      description: "Water cooler chat, off-topic fun",
      channelType: "team" as const,
    },
  ];

  const createdChannels = [];
  for (const def of channelDefs) {
    const [channel] = await db
      .insert(schema.chatChannels)
      .values({
        organizationId: org.id,
        name: def.name,
        description: def.description,
        channelType: def.channelType,
        isPrivate: false,
        createdBy: orgUsers[0].id,
      })
      .returning();
    createdChannels.push(channel);
    console.log(`Created channel: #${channel.name}`);
  }

  // Add all users as members of all channels
  for (const channel of createdChannels) {
    for (const user of orgUsers) {
      await db.insert(schema.chatChannelMembers).values({
        channelId: channel.id,
        userId: user.id,
        lastReadAt: new Date(),
      });
    }
    console.log(`Added ${orgUsers.length} members to #${channel.name}`);
  }

  // Insert sample messages in #general
  const general = createdChannels.find((c) => c.name === "general");
  if (!general) {
    console.log("Warning: #general channel not found. Skipping messages.");
    await client.end();
    return;
  }

  // Pick a few users for the conversation
  const userPool = orgUsers.slice(0, Math.min(orgUsers.length, 4));
  function pickUser(idx: number) {
    return userPool[idx % userPool.length];
  }

  const sampleMessages = [
    {
      userIdx: 0,
      content: "Good morning team! Hope everyone had a great weekend.",
      minutesAgo: 120,
    },
    {
      userIdx: 1,
      content:
        "Morning! Quick heads up - I finished the Johnson case medical records review yesterday.",
      minutesAgo: 115,
    },
    {
      userIdx: 2,
      content:
        "Nice work! I saw that come through. The chronology looks thorough.",
      minutesAgo: 108,
    },
    {
      userIdx: 0,
      content:
        "Reminder: we have the all-hands meeting at 2 PM today. Please have your weekly updates ready.",
      minutesAgo: 90,
    },
    {
      userIdx: 3 % userPool.length,
      content:
        "Has anyone heard back from SSA on the Martinez reconsideration? It has been 45 days.",
      minutesAgo: 75,
    },
    {
      userIdx: 1,
      content:
        "Not yet. I will follow up with the field office this afternoon.",
      minutesAgo: 70,
    },
    {
      userIdx: 2,
      content:
        "I just uploaded the new intake checklist template to the shared drive. Let me know if you have feedback.",
      minutesAgo: 45,
    },
    {
      userIdx: 0,
      content:
        "Thanks! I will review it before the meeting. Also, we got two new leads from the website this morning.",
      minutesAgo: 30,
    },
    {
      userIdx: 3 % userPool.length,
      content:
        "Great, I can take the initial screening calls if you assign them to me.",
      minutesAgo: 15,
    },
    {
      userIdx: 1,
      content:
        "Perfect. I will route them to you in the system. Thanks everyone for staying on top of things!",
      minutesAgo: 5,
    },
  ];

  for (const msg of sampleMessages) {
    const user = pickUser(msg.userIdx);
    const createdAt = new Date(Date.now() - msg.minutesAgo * 60 * 1000);
    await db.insert(schema.chatMessages).values({
      channelId: general.id,
      userId: user.id,
      content: msg.content,
      createdAt,
    });
  }
  console.log(`Inserted ${sampleMessages.length} sample messages in #general`);

  // Also add a couple messages in #case-updates
  const caseUpdates = createdChannels.find((c) => c.name === "case-updates");
  if (caseUpdates) {
    const caseUpdateMessages = [
      {
        userIdx: 0,
        content:
          "Case #2024-0147 (Williams) moved to Hearing Scheduled stage. ALJ hearing set for March 15.",
        minutesAgo: 200,
      },
      {
        userIdx: 1,
        content:
          "Case #2024-0089 (Davis) - Favorable decision received! Fee agreement processing started.",
        minutesAgo: 150,
      },
      {
        userIdx: 2,
        content:
          "New case intake: #2024-0201 (Thompson) - Initial application stage. Assigned to intake team.",
        minutesAgo: 60,
      },
    ];
    for (const msg of caseUpdateMessages) {
      const user = pickUser(msg.userIdx);
      const createdAt = new Date(Date.now() - msg.minutesAgo * 60 * 1000);
      await db.insert(schema.chatMessages).values({
        channelId: caseUpdates.id,
        userId: user.id,
        content: msg.content,
        createdAt,
      });
    }
    console.log(
      `Inserted ${caseUpdateMessages.length} sample messages in #case-updates`,
    );
  }

  console.log("\nTeam Chat seed complete!");
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
