"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { createCaseNote } from "@/app/actions/notes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export function AddNoteForm({ caseId }: { caseId: string }) {
	const [body, setBody] = useState("");
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const wrapSelection = useCallback(
		(prefix: string, suffix: string) => {
			const el = textareaRef.current;
			if (!el) return;

			const start = el.selectionStart;
			const end = el.selectionEnd;
			const text = el.value;
			const selected = text.slice(start, end);

			// If there's selected text already wrapped, unwrap it
			const before = text.slice(0, start);
			const after = text.slice(end);

			if (
				selected.startsWith(prefix) &&
				selected.endsWith(suffix)
			) {
				const unwrapped =
					before +
					selected.slice(prefix.length, selected.length - suffix.length) +
					after;
				setBody(unwrapped);
				requestAnimationFrame(() => {
					el.selectionStart = start;
					el.selectionEnd = end - prefix.length - suffix.length;
					el.focus();
				});
				return;
			}

			const wrapped = before + prefix + selected + suffix + after;
			setBody(wrapped);
			requestAnimationFrame(() => {
				if (selected) {
					el.selectionStart = start;
					el.selectionEnd = end + prefix.length + suffix.length;
				} else {
					el.selectionStart = start + prefix.length;
					el.selectionEnd = start + prefix.length;
				}
				el.focus();
			});
		},
		[],
	);

	const handleBold = useCallback(() => wrapSelection("**", "**"), [wrapSelection]);
	const handleItalic = useCallback(() => wrapSelection("_", "_"), [wrapSelection]);

	const handleBulletList = useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;

		const start = el.selectionStart;
		const end = el.selectionEnd;
		const text = el.value;
		const selected = text.slice(start, end);

		if (selected) {
			// Convert each line to a bullet item
			const lines = selected.split("\n");
			const allBulleted = lines.every((l) => l.startsWith("- "));
			const transformed = allBulleted
				? lines.map((l) => l.slice(2)).join("\n")
				: lines.map((l) => `- ${l}`).join("\n");

			const newBody = text.slice(0, start) + transformed + text.slice(end);
			setBody(newBody);
			requestAnimationFrame(() => {
				el.selectionStart = start;
				el.selectionEnd = start + transformed.length;
				el.focus();
			});
		} else {
			// Insert a bullet at cursor
			const before = text.slice(0, start);
			const after = text.slice(start);
			const needsNewline = before.length > 0 && !before.endsWith("\n");
			const bullet = (needsNewline ? "\n" : "") + "- ";
			const newBody = before + bullet + after;
			setBody(newBody);
			requestAnimationFrame(() => {
				const pos = start + bullet.length;
				el.selectionStart = pos;
				el.selectionEnd = pos;
				el.focus();
			});
		}
	}, []);

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			handleBold();
		}
		if (e.key === "i" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			handleItalic();
		}
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!body.trim()) return;

		setError(null);
		startTransition(async () => {
			try {
				await createCaseNote({ caseId, body: body.trim() });
				setBody("");
			} catch {
				setError("Failed to add note. Please try again.");
			}
		});
	}

	return (
		<Card>
			<CardContent className="p-4">
				<form onSubmit={handleSubmit} className="space-y-3">
					{/* Formatting toolbar */}
					<TooltipProvider delayDuration={300}>
						<div className="flex items-center gap-1 border-b pb-2">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-7 w-7 p-0 font-bold"
										onClick={handleBold}
										disabled={isPending}
										aria-label="Bold"
									>
										B
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									<p>Bold (Cmd+B)</p>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-7 w-7 p-0 italic"
										onClick={handleItalic}
										disabled={isPending}
										aria-label="Italic"
									>
										I
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									<p>Italic (Cmd+I)</p>
								</TooltipContent>
							</Tooltip>
							<div className="mx-1 h-4 w-px bg-border" />
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-7 px-1.5 text-xs"
										onClick={handleBulletList}
										disabled={isPending}
										aria-label="Bullet list"
									>
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth={2}
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											<line x1="9" y1="6" x2="20" y2="6" />
											<line x1="9" y1="12" x2="20" y2="12" />
											<line x1="9" y1="18" x2="20" y2="18" />
											<circle cx="4" cy="6" r="1.5" fill="currentColor" />
											<circle cx="4" cy="12" r="1.5" fill="currentColor" />
											<circle cx="4" cy="18" r="1.5" fill="currentColor" />
										</svg>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									<p>Bullet list</p>
								</TooltipContent>
							</Tooltip>
						</div>
					</TooltipProvider>

					<Textarea
						ref={textareaRef}
						placeholder="Add a note... (supports **bold**, _italic_, and - bullet lists)"
						value={body}
						onChange={(e) => setBody(e.target.value)}
						onKeyDown={handleKeyDown}
						rows={3}
						disabled={isPending}
						className="resize-none font-mono text-sm"
					/>
					{error && (
						<p className="text-sm text-destructive">{error}</p>
					)}
					<div className="flex justify-end">
						<Button
							type="submit"
							size="sm"
							disabled={isPending || !body.trim()}
						>
							{isPending ? "Adding..." : "Add Note"}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
