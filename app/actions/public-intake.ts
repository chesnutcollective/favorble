"use server";

/**
 * Public (unauthenticated) intake submission actions.
 *
 * These run without `requireSession()` because the public intake form at
 * /intake/[orgSlug] is used by prospective clients, not logged-in users.
 *
 * Security note: submissions are identified by the org slug only. We do not
 * trust anything in the payload beyond basic validation + length limits.
 */

import { db } from "@/db/drizzle";
import { leads, organizations } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import type { Locale } from "@/lib/i18n/messages";

const MAX_STRING = 2000;

function clean(value: unknown, max = MAX_STRING): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}

export type PublicIntakeSubmission = {
  preferredLanguage: Locale;
  personal: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    ssnLast4?: string;
    email?: string;
    phone?: string;
    preferredContact?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  disability: {
    disabilityStartDate?: string;
    conditions?: string;
    currentlyWorking?: boolean;
    workingHoursPerWeek?: string;
    monthlyEarnings?: string;
    filedBefore?: boolean;
    benefitType?: string;
  };
  providers: Array<{
    name?: string;
    specialty?: string;
    phone?: string;
    city?: string;
    lastVisit?: string;
  }>;
  workHistory: Array<{
    employer?: string;
    jobTitle?: string;
    startDate?: string;
    endDate?: string;
    currentJob?: boolean;
    duties?: string;
  }>;
  consent: boolean;
};

export type PublicIntakeResult =
  | { ok: true; referenceNumber: string }
  | { ok: false; error: string };

/**
 * Resolve an organization by its public slug. Returns null if not found
 * or if the organization has been soft-deleted.
 */
async function findOrgBySlug(slug: string) {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(and(eq(organizations.slug, slug), isNull(organizations.deletedAt)))
    .limit(1);
  return org ?? null;
}

/**
 * Submit a public intake form. Creates a new lead with the submitted data
 * stored in `intakeData`, plus `preferredLanguage` captured at the top level
 * of `sourceData` so it's surfaced in lead list views.
 */
export async function submitPublicIntake(
  orgSlug: string,
  submission: PublicIntakeSubmission,
): Promise<PublicIntakeResult> {
  try {
    if (!submission.consent) {
      return { ok: false, error: "Consent is required" };
    }

    const firstName = clean(submission.personal.firstName, 120);
    const lastName = clean(submission.personal.lastName, 120);
    if (!firstName || !lastName) {
      return { ok: false, error: "First and last name are required" };
    }

    const org = await findOrgBySlug(orgSlug);
    if (!org) {
      return { ok: false, error: "Organization not found" };
    }

    const preferredLanguage: Locale =
      submission.preferredLanguage === "es" ? "es" : "en";

    const intakeData = {
      preferredLanguage,
      personal: {
        firstName,
        lastName,
        dateOfBirth: clean(submission.personal.dateOfBirth, 40),
        ssnLast4: clean(submission.personal.ssnLast4, 4),
        email: clean(submission.personal.email, 240),
        phone: clean(submission.personal.phone, 40),
        preferredContact: clean(submission.personal.preferredContact, 40),
        address: clean(submission.personal.address, 240),
        city: clean(submission.personal.city, 120),
        state: clean(submission.personal.state, 80),
        zip: clean(submission.personal.zip, 20),
      },
      disability: {
        disabilityStartDate: clean(
          submission.disability.disabilityStartDate,
          40,
        ),
        conditions: clean(submission.disability.conditions),
        currentlyWorking: Boolean(submission.disability.currentlyWorking),
        workingHoursPerWeek: clean(
          submission.disability.workingHoursPerWeek,
          20,
        ),
        monthlyEarnings: clean(submission.disability.monthlyEarnings, 40),
        filedBefore: Boolean(submission.disability.filedBefore),
        benefitType: clean(submission.disability.benefitType, 40),
      },
      providers: (submission.providers ?? []).slice(0, 20).map((p) => ({
        name: clean(p.name, 240),
        specialty: clean(p.specialty, 120),
        phone: clean(p.phone, 40),
        city: clean(p.city, 120),
        lastVisit: clean(p.lastVisit, 40),
      })),
      workHistory: (submission.workHistory ?? []).slice(0, 5).map((j) => ({
        employer: clean(j.employer, 240),
        jobTitle: clean(j.jobTitle, 240),
        startDate: clean(j.startDate, 40),
        endDate: clean(j.endDate, 40),
        currentJob: Boolean(j.currentJob),
        duties: clean(j.duties),
      })),
    };

    const [lead] = await db
      .insert(leads)
      .values({
        organizationId: org.id,
        firstName,
        lastName,
        email: intakeData.personal.email ?? undefined,
        phone: intakeData.personal.phone ?? undefined,
        source: "public_intake_form",
        sourceData: {
          preferredLanguage,
          submittedFromPublicForm: true,
        },
        intakeData,
        status: "new",
      })
      .returning({ id: leads.id });

    const referenceNumber = `IN-${lead.id.slice(0, 8).toUpperCase()}`;

    logger.info("Public intake submitted", {
      leadId: lead.id,
      orgSlug,
      preferredLanguage,
    });

    return { ok: true, referenceNumber };
  } catch (error) {
    logger.error("Public intake submission failed", { error });
    return { ok: false, error: "Submission failed. Please try again." };
  }
}
