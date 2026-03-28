"use server";

import { askClaude } from "@/lib/ai/client";
import { getCaseById, getCaseActivity } from "@/app/actions/cases";
import { getCaseTasks } from "@/app/actions/tasks";
import { getCaseNotes } from "@/app/actions/notes";
import { logger } from "@/lib/logger/server";

/**
 * Summarize a case using AI. Fetches case data, stage transitions,
 * recent notes, and tasks, then asks the AI for a concise summary.
 */
export async function summarizeCase(caseId: string): Promise<string> {
	try {
		const [caseData, activity, tasks, notes] = await Promise.all([
			getCaseById(caseId),
			getCaseActivity(caseId),
			getCaseTasks(caseId),
			getCaseNotes(caseId),
		]);

		if (!caseData) {
			return "Case not found.";
		}

		const claimantName = caseData.claimant
			? `${caseData.claimant.firstName} ${caseData.claimant.lastName}`
			: "Unknown claimant";

		const stageHistory = activity
			.slice(0, 10)
			.map(
				(a) =>
					`${a.transitionedAt.toLocaleDateString()}: ${a.fromStageId ? "Stage changed" : "Case created"}${a.notes ? ` - ${a.notes}` : ""}`,
			)
			.join("\n");

		const openTasks = tasks
			.filter((t) => t.status !== "completed" && t.status !== "skipped")
			.map(
				(t) =>
					`- ${t.title} (${t.priority}${t.dueDate ? `, due ${t.dueDate.toLocaleDateString()}` : ""})`,
			)
			.join("\n");

		const recentNotes = notes
			.slice(0, 5)
			.map(
				(n) =>
					`- ${n.createdAt.toLocaleDateString()}: ${(n.body ?? "").slice(0, 200)}`,
			)
			.join("\n");

		const prompt = `You are a legal case management assistant for a Social Security disability law firm. Summarize this case in one clear paragraph.

Case: ${caseData.caseNumber}
Claimant: ${claimantName}
Status: ${caseData.status}
Current Stage: ${caseData.stageName ?? "Unknown"}
Stage Group: ${caseData.stageGroupName ?? "Unknown"}
Application Type: ${caseData.applicationTypePrimary ?? "Not specified"}
SSA Office: ${caseData.ssaOffice ?? "Not specified"}
Hearing Office: ${caseData.hearingOffice ?? "Not specified"}
ALJ: ${caseData.adminLawJudge ?? "Not assigned"}

Stage History:
${stageHistory || "No transitions recorded."}

Open Tasks:
${openTasks || "No open tasks."}

Recent Notes:
${recentNotes || "No recent notes."}

Write a concise summary paragraph that captures the current status, key details, and any notable items a case manager should be aware of.`;

		return await askClaude(prompt);
	} catch (error) {
		logger.error("Failed to summarize case", { caseId, error });
		return "Failed to generate case summary. Please try again.";
	}
}

/**
 * Suggest next steps for a case based on its current stage and history.
 */
export async function suggestNextSteps(caseId: string): Promise<string> {
	try {
		const [caseData, activity, tasks] = await Promise.all([
			getCaseById(caseId),
			getCaseActivity(caseId),
			getCaseTasks(caseId),
		]);

		if (!caseData) {
			return "Case not found.";
		}

		const openTasks = tasks
			.filter((t) => t.status !== "completed" && t.status !== "skipped")
			.map((t) => `- ${t.title} (${t.priority}, ${t.status})`)
			.join("\n");

		const completedTasks = tasks
			.filter((t) => t.status === "completed")
			.map(
				(t) =>
					`- ${t.title} (completed${t.completedAt ? ` ${t.completedAt.toLocaleDateString()}` : ""})`,
			)
			.join("\n");

		const stageHistory = activity
			.slice(0, 10)
			.map(
				(a) =>
					`${a.transitionedAt.toLocaleDateString()}: ${a.fromStageId ? "Stage transition" : "Case created"}${a.notes ? ` - ${a.notes}` : ""}`,
			)
			.join("\n");

		const assignedStaff = caseData.assignedStaff
			.map((s) => `${s.firstName} ${s.lastName} (${s.role})`)
			.join(", ");

		const prompt = `You are a legal case management assistant for a Social Security disability law firm. Based on the current state of this case, suggest 3-5 specific next actions the team should take.

Case: ${caseData.caseNumber}
Status: ${caseData.status}
Current Stage: ${caseData.stageName ?? "Unknown"}
Stage Group: ${caseData.stageGroupName ?? "Unknown"}
Application Type: ${caseData.applicationTypePrimary ?? "Not specified"}
SSA Office: ${caseData.ssaOffice ?? "Not specified"}
Hearing Office: ${caseData.hearingOffice ?? "Not specified"}
ALJ: ${caseData.adminLawJudge ?? "Not assigned"}
Assigned Staff: ${assignedStaff || "No one assigned"}

Stage History:
${stageHistory || "No transitions recorded."}

Open Tasks:
${openTasks || "No open tasks."}

Completed Tasks:
${completedTasks || "No completed tasks."}

Return exactly 3-5 suggested next steps as a numbered list. Each step should be specific and actionable. Consider the current stage, what has been done, and what typically needs to happen next in Social Security disability cases.`;

		return await askClaude(prompt);
	} catch (error) {
		logger.error("Failed to suggest next steps", { caseId, error });
		return "Failed to generate suggestions. Please try again.";
	}
}

/**
 * Draft a communication to the client based on case context.
 */
export async function draftCommunication(
	caseId: string,
	context: string,
): Promise<string> {
	try {
		const [caseData, activity] = await Promise.all([
			getCaseById(caseId),
			getCaseActivity(caseId),
		]);

		if (!caseData) {
			return "Case not found.";
		}

		const claimantName = caseData.claimant
			? `${caseData.claimant.firstName} ${caseData.claimant.lastName}`
			: "the client";

		const stageHistory = activity
			.slice(0, 5)
			.map(
				(a) =>
					`${a.transitionedAt.toLocaleDateString()}: ${a.fromStageId ? "Stage changed" : "Case created"}`,
			)
			.join("\n");

		const prompt = `You are a legal assistant drafting a message to a client at a Social Security disability law firm. Draft a professional, empathetic message.

Case: ${caseData.caseNumber}
Client Name: ${claimantName}
Status: ${caseData.status}
Current Stage: ${caseData.stageName ?? "Unknown"}
Application Type: ${caseData.applicationTypePrimary ?? "Not specified"}

Recent Case History:
${stageHistory || "No recent activity."}

Context for this message: ${context}

Draft a professional, empathetic message to ${claimantName}. Use plain language (avoid legal jargon where possible). Be warm but professional. Do not include a subject line, just the message body. Sign off as "Hogan Smith Law".`;

		return await askClaude(prompt);
	} catch (error) {
		logger.error("Failed to draft communication", { caseId, error });
		return "Failed to draft message. Please try again.";
	}
}
