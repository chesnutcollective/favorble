"use client";

import { useState, useTransition } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { createWorkflowTemplate } from "@/app/actions/workflows";
import { toast } from "sonner";

type Stage = {
	id: string;
	name: string;
	code: string;
};

export function NewWorkflowDialog({ stages }: { stages: Stage[] }) {
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [triggerStageId, setTriggerStageId] = useState("");
	const [isActive, setIsActive] = useState(false);

	function resetForm() {
		setName("");
		setDescription("");
		setTriggerStageId("");
		setIsActive(false);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();

		if (!name.trim()) {
			toast.error("Name is required.");
			return;
		}

		startTransition(async () => {
			try {
				await createWorkflowTemplate({
					name: name.trim(),
					description: description.trim() || undefined,
					triggerType: "stage_enter",
					triggerStageId: triggerStageId || undefined,
				});
				toast.success("Workflow created.");
				resetForm();
				setOpen(false);
			} catch {
				toast.error("Failed to create workflow.");
			}
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) resetForm();
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm">
					<HugeiconsIcon
						icon={PlusSignIcon}
						size={16}
						className="mr-1"
					/>
					New Workflow
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>New Workflow</DialogTitle>
						<DialogDescription>
							Create an automated workflow triggered by stage changes.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="wf-name">
								Name <span className="text-red-500">*</span>
							</Label>
							<Input
								id="wf-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="e.g. New Case Intake Tasks"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="wf-description">Description</Label>
							<Textarea
								id="wf-description"
								value={description}
								onChange={(e) =>
									setDescription(e.target.value)
								}
								placeholder="What does this workflow do?"
								rows={3}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="wf-trigger-stage">
								Trigger Stage
							</Label>
							<Select
								value={triggerStageId}
								onValueChange={setTriggerStageId}
							>
								<SelectTrigger id="wf-trigger-stage">
									<SelectValue placeholder="Select a stage..." />
								</SelectTrigger>
								<SelectContent>
									{stages.map((stage) => (
										<SelectItem
											key={stage.id}
											value={stage.id}
										>
											{stage.code} - {stage.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-center justify-between">
							<Label htmlFor="wf-active">Active</Label>
							<Switch
								id="wf-active"
								checked={isActive}
								onCheckedChange={setIsActive}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Creating..." : "Create Workflow"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
