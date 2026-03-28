"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleNotePin } from "@/app/actions/notes";
import type { NoteType } from "@/app/actions/notes";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export type TimelineEvent = {
	id: string;
	type: string;
	title: string;
	description?: string;
	timestamp: string;
	actor?: string;
	metadata?: Record<string, unknown>;
	caseId?: string;
};

type TimelineProps = {
	events: TimelineEvent[];
	className?: string;
};

const EVENT_COLORS: Record<string, string> = {
	stage_changed: "bg-blue-500",
	task_created: "bg-green-500",
	task_completed: "bg-emerald-500",
	document_uploaded: "bg-purple-500",
	document_deleted: "bg-red-400",
	note_added: "bg-amber-500",
	note_phone_call: "bg-teal-500",
	note_internal_memo: "bg-violet-500",
	message_received: "bg-indigo-500",
	message_sent: "bg-indigo-400",
	email_received: "bg-cyan-500",
	email_sent: "bg-cyan-400",
	assignment_changed: "bg-accent0",
	case_created: "bg-blue-600",
	workflow_executed: "bg-green-600",
};

function formatRelativeTime(timestamp: string): string {
	const now = Date.now();
	const then = new Date(timestamp).getTime();
	const diff = now - then;

	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;

	return new Date(timestamp).toLocaleDateString();
}

function NoteTypeIcon({ noteType }: { noteType: NoteType }) {
	switch (noteType) {
		case "phone_call":
			return (
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
					className="text-teal-600"
				>
					<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
				</svg>
			);
		case "internal_memo":
			return (
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
					className="text-violet-600"
				>
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
					<line x1="16" y1="13" x2="8" y2="13" />
					<line x1="16" y1="17" x2="8" y2="17" />
					<polyline points="10 9 9 9 8 9" />
				</svg>
			);
		default:
			return (
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
					className="text-amber-600"
				>
					<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
					<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
				</svg>
			);
	}
}

function PinIcon({ filled }: { filled: boolean }) {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill={filled ? "currentColor" : "none"}
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="12" y1="17" x2="12" y2="22" />
			<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" />
		</svg>
	);
}

function PinButton({
	noteId,
	caseId,
	isPinned,
}: {
	noteId: string;
	caseId: string;
	isPinned: boolean;
}) {
	const [pinned, setPinned] = useState(isPinned);
	const [isPendingPin, startTransition] = useTransition();

	function handleToggle() {
		const newPinned = !pinned;
		setPinned(newPinned);
		startTransition(async () => {
			try {
				await toggleNotePin({
					noteId,
					caseId,
					isPinned: newPinned,
				});
			} catch {
				setPinned(!newPinned); // revert
			}
		});
	}

	return (
		<TooltipProvider delayDuration={300}>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className={cn(
							"h-6 w-6 p-0",
							pinned
								? "text-amber-600"
								: "text-muted-foreground opacity-0 group-hover:opacity-100",
						)}
						onClick={handleToggle}
						disabled={isPendingPin}
					>
						<PinIcon filled={pinned} />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">
					<p>{pinned ? "Unpin note" : "Pin note"}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

/**
 * Renders basic markdown: **bold**, _italic_, - bullet lists, URLs, and [text](url) links.
 * Outputs plain React elements, no dependencies.
 */
function MarkdownText({ text }: { text: string }) {
	const lines = text.split("\n");
	const elements: React.ReactNode[] = [];
	let bulletBuffer: string[] = [];
	let key = 0;

	function flushBullets() {
		if (bulletBuffer.length === 0) return;
		elements.push(
			<ul key={key++} className="list-disc pl-4 space-y-0.5">
				{bulletBuffer.map((item, i) => (
					<li key={i}>{renderInline(item)}</li>
				))}
			</ul>,
		);
		bulletBuffer = [];
	}

	function renderInline(line: string): React.ReactNode {
		const parts: React.ReactNode[] = [];
		let remaining = line;
		let partKey = 0;

		while (remaining.length > 0) {
			// Check for bold: **...**
			const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
			// Check for italic: _..._
			const italicMatch = remaining.match(/(?<!\w)_(.+?)_(?!\w)/);
			// Check for markdown link: [text](url)
			const mdLinkMatch = remaining.match(
				/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/,
			);
			// Check for bare URL: https://... or http://...
			const urlMatch = remaining.match(
				/(?<!\()\b(https?:\/\/[^\s<>\])"]+)/,
			);

			type MatchType = "bold" | "italic" | "mdlink" | "url";
			let earliest: {
				type: MatchType;
				index: number;
				match: RegExpMatchArray;
			} | null = null;

			if (boldMatch?.index !== undefined) {
				earliest = {
					type: "bold",
					index: boldMatch.index,
					match: boldMatch,
				};
			}
			if (italicMatch?.index !== undefined) {
				if (!earliest || italicMatch.index < earliest.index) {
					earliest = {
						type: "italic",
						index: italicMatch.index,
						match: italicMatch,
					};
				}
			}
			if (mdLinkMatch?.index !== undefined) {
				if (!earliest || mdLinkMatch.index < earliest.index) {
					earliest = {
						type: "mdlink",
						index: mdLinkMatch.index,
						match: mdLinkMatch,
					};
				}
			}
			if (urlMatch?.index !== undefined) {
				// Only match bare URL if it's not inside a markdown link
				const isInsideMdLink =
					mdLinkMatch?.index !== undefined &&
					urlMatch.index >= mdLinkMatch.index &&
					urlMatch.index <
						mdLinkMatch.index + mdLinkMatch[0].length;
				if (!isInsideMdLink) {
					if (!earliest || urlMatch.index < earliest.index) {
						earliest = {
							type: "url",
							index: urlMatch.index,
							match: urlMatch,
						};
					}
				}
			}

			if (!earliest) {
				parts.push(remaining);
				break;
			}

			if (earliest.index > 0) {
				parts.push(remaining.slice(0, earliest.index));
			}

			if (earliest.type === "bold") {
				parts.push(
					<strong
						key={partKey++}
						className="font-semibold text-foreground"
					>
						{earliest.match[1]}
					</strong>,
				);
			} else if (earliest.type === "italic") {
				parts.push(<em key={partKey++}>{earliest.match[1]}</em>);
			} else if (earliest.type === "mdlink") {
				parts.push(
					<a
						key={partKey++}
						href={earliest.match[2]}
						target="_blank"
						rel="noopener noreferrer"
						className="text-blue-600 hover:underline"
					>
						{earliest.match[1]}
					</a>,
				);
			} else if (earliest.type === "url") {
				const url = earliest.match[1];
				parts.push(
					<a
						key={partKey++}
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						className="text-blue-600 hover:underline break-all"
					>
						{url}
					</a>,
				);
			}

			remaining = remaining.slice(
				earliest.index + earliest.match[0].length,
			);
		}

		return parts.length === 1 ? parts[0] : <>{parts}</>;
	}

	for (const line of lines) {
		const bulletMatch = line.match(/^[-*]\s+(.*)/);
		if (bulletMatch) {
			bulletBuffer.push(bulletMatch[1]);
		} else {
			flushBullets();
			if (line.trim() === "") {
				elements.push(<br key={key++} />);
			} else {
				elements.push(<p key={key++}>{renderInline(line)}</p>);
			}
		}
	}
	flushBullets();

	return <>{elements}</>;
}

function getNoteTypeLabel(noteType: NoteType): string {
	switch (noteType) {
		case "phone_call":
			return "Phone Call";
		case "internal_memo":
			return "Internal Memo";
		default:
			return "General";
	}
}

function getEventDotColor(event: TimelineEvent): string {
	const noteType = event.metadata?.noteType as NoteType | undefined;
	if (event.type === "note_added" && noteType) {
		switch (noteType) {
			case "phone_call":
				return EVENT_COLORS.note_phone_call;
			case "internal_memo":
				return EVENT_COLORS.note_internal_memo;
		}
	}
	return EVENT_COLORS[event.type] ?? "bg-gray-400";
}

export function Timeline({ events, className }: TimelineProps) {
	if (events.length === 0) {
		return (
			<div className="py-8 text-center text-sm text-muted-foreground">
				No activity yet
			</div>
		);
	}

	// Separate pinned note events from the rest
	const pinnedEvents: TimelineEvent[] = [];
	const unpinnedEvents: TimelineEvent[] = [];

	for (const event of events) {
		if (
			event.type === "note_added" &&
			(event.metadata?.isPinned as boolean)
		) {
			pinnedEvents.push(event);
		} else {
			unpinnedEvents.push(event);
		}
	}

	return (
		<div className={cn("space-y-0", className)}>
			{/* Pinned notes section */}
			{pinnedEvents.length > 0 && (
				<div className="mb-4">
					<div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-amber-600">
						<PinIcon filled />
						<span>Pinned Notes</span>
					</div>
					<div className="space-y-0 rounded-md border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-900 dark:bg-amber-950/20">
						{pinnedEvents.map((event, index) => (
							<TimelineItem
								key={event.id}
								event={event}
								isLast={index === pinnedEvents.length - 1}
							/>
						))}
					</div>
				</div>
			)}

			{/* Regular timeline */}
			{unpinnedEvents.map((event, index) => (
				<TimelineItem
					key={event.id}
					event={event}
					isLast={index === unpinnedEvents.length - 1}
				/>
			))}
		</div>
	);
}

function TimelineItem({
	event,
	isLast,
}: {
	event: TimelineEvent;
	isLast: boolean;
}) {
	const dotColor = getEventDotColor(event);
	const isNote = event.type === "note_added";
	const noteType = (event.metadata?.noteType as NoteType) ?? "general";
	const tags = (event.metadata?.tags as string[]) ?? [];
	const isPinned = (event.metadata?.isPinned as boolean) ?? false;
	const caseId = event.caseId ?? "";

	return (
		<div className="group relative flex gap-3 pb-4">
			{/* Vertical line */}
			{!isLast && (
				<div className="absolute left-[7px] top-4 h-full w-px bg-muted" />
			)}

			{/* Dot */}
			<div
				className={cn(
					"relative z-10 mt-1 h-4 w-4 shrink-0 rounded-full border-2 border-white",
					dotColor,
				)}
			/>

			{/* Content */}
			<div className="min-w-0 flex-1">
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-1.5">
						{isNote && <NoteTypeIcon noteType={noteType} />}
						<p className="text-sm font-medium text-foreground">
							{isNote && noteType !== "general"
								? getNoteTypeLabel(noteType)
								: event.title}
						</p>
						{tags.length > 0 && (
							<div className="flex gap-1 ml-1">
								{tags.map((tag) => (
									<Badge
										key={tag}
										variant="secondary"
										className="text-[10px] px-1.5 py-0"
									>
										{tag}
									</Badge>
								))}
							</div>
						)}
					</div>
					<div className="flex items-center gap-1 shrink-0">
						{isNote && caseId && (
							<PinButton
								noteId={event.id}
								caseId={caseId}
								isPinned={isPinned}
							/>
						)}
						<span className="text-xs text-muted-foreground">
							{formatRelativeTime(event.timestamp)}
						</span>
					</div>
				</div>
				{event.description && (
					<div className="mt-0.5 text-sm text-muted-foreground">
						<MarkdownText text={event.description} />
					</div>
				)}
				{event.actor && (
					<p className="mt-0.5 text-xs text-muted-foreground">
						by {event.actor}
					</p>
				)}
			</div>
		</div>
	);
}
