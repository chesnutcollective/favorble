"use client";

import { useState, useTransition } from "react";
import { createCaseNote } from "@/app/actions/notes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

export function AddNoteForm({ caseId }: { caseId: string }) {
	const [body, setBody] = useState("");
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

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
					<Textarea
						placeholder="Add a note..."
						value={body}
						onChange={(e) => setBody(e.target.value)}
						rows={3}
						disabled={isPending}
						className="resize-none"
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
