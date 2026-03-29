"use client";

import { useState, useTransition, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetFooter,
} from "@/components/ui/sheet";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	PlusSignIcon,
	ArrowUp01Icon,
	ArrowDown01Icon,
	Cancel01Icon,
	Search01Icon,
} from "@hugeicons/core-free-icons";
import {
	createExhibitPacket,
	addDocumentToPacket,
	buildExhibitPacket,
} from "@/app/actions/exhibit-packets";
import type { ExhibitPacketItem } from "@/app/(app)/cases/[id]/chronology/client";

type DocumentItem = {
	id: string;
	fileName: string;
	fileType: string;
	fileSizeBytes: number | null;
	category: string | null;
	source: string;
	createdAt: string;
};

type SelectedDoc = {
	documentId: string;
	fileName: string;
	exhibitLabel: string;
	displayOrder: number;
};

type ExhibitBuilderProps = {
	caseId: string;
	organizationId: string;
	userId: string;
	documents: DocumentItem[];
	onPacketCreated: (packet: ExhibitPacketItem) => void;
};

export function ExhibitBuilder({
	caseId,
	organizationId,
	userId,
	documents,
	onPacketCreated,
}: ExhibitBuilderProps) {
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [docSearch, setDocSearch] = useState("");
	const [selectedDocs, setSelectedDocs] = useState<SelectedDoc[]>([]);
	const [buildStatus, setBuildStatus] = useState<string | null>(null);

	const filteredDocuments = useMemo(() => {
		if (!docSearch) return documents;
		const q = docSearch.toLowerCase();
		return documents.filter(
			(d) =>
				d.fileName.toLowerCase().includes(q) ||
				(d.category ?? "").toLowerCase().includes(q),
		);
	}, [documents, docSearch]);

	const selectedIds = useMemo(
		() => new Set(selectedDocs.map((d) => d.documentId)),
		[selectedDocs],
	);

	const toggleDocument = useCallback(
		(doc: DocumentItem) => {
			setSelectedDocs((prev) => {
				const exists = prev.find((d) => d.documentId === doc.id);
				if (exists) {
					return prev
						.filter((d) => d.documentId !== doc.id)
						.map((d, i) => ({ ...d, displayOrder: i }));
				}
				return [
					...prev,
					{
						documentId: doc.id,
						fileName: doc.fileName,
						exhibitLabel: `Exhibit ${String.fromCharCode(65 + prev.length)}`,
						displayOrder: prev.length,
					},
				];
			});
		},
		[],
	);

	const moveDoc = useCallback((index: number, direction: "up" | "down") => {
		setSelectedDocs((prev) => {
			const arr = [...prev];
			const swapIndex =
				direction === "up" ? index - 1 : index + 1;
			if (swapIndex < 0 || swapIndex >= arr.length) return prev;
			[arr[index], arr[swapIndex]] = [arr[swapIndex], arr[index]];
			return arr.map((d, i) => ({ ...d, displayOrder: i }));
		});
	}, []);

	const updateLabel = useCallback(
		(index: number, label: string) => {
			setSelectedDocs((prev) =>
				prev.map((d, i) =>
					i === index ? { ...d, exhibitLabel: label } : d,
				),
			);
		},
		[],
	);

	const removeDoc = useCallback((index: number) => {
		setSelectedDocs((prev) =>
			prev
				.filter((_, i) => i !== index)
				.map((d, i) => ({ ...d, displayOrder: i })),
		);
	}, []);

	const handleBuild = useCallback(() => {
		if (!title.trim() || selectedDocs.length === 0) return;

		startTransition(async () => {
			try {
				setBuildStatus("Creating packet...");

				const packet = await createExhibitPacket({
					caseId,
					title: title.trim(),
					description: description.trim() || undefined,
				});

				setBuildStatus("Adding documents...");

				for (const doc of selectedDocs) {
					await addDocumentToPacket({
						packetId: packet.id,
						documentId: doc.documentId,
						exhibitLabel: doc.exhibitLabel,
						displayOrder: doc.displayOrder,
					});
				}

				setBuildStatus("Building packet...");

				try {
					await buildExhibitPacket(packet.id);
				} catch {
					// Build service may not be available, packet is still created
				}

				onPacketCreated({
					id: packet.id,
					title: packet.title,
					description: packet.description,
					status: packet.status,
					packetStoragePath: packet.packetStoragePath,
					packetSizeBytes: packet.packetSizeBytes,
					builtAt: packet.builtAt?.toISOString() ?? null,
					submittedAt: packet.submittedAt?.toISOString() ?? null,
					errorMessage: packet.errorMessage,
					createdAt: packet.createdAt.toISOString(),
				});

				// Reset
				setTitle("");
				setDescription("");
				setSelectedDocs([]);
				setDocSearch("");
				setBuildStatus(null);
				setOpen(false);
			} catch {
				setBuildStatus("Failed to create packet");
			}
		});
	}, [
		caseId,
		title,
		description,
		selectedDocs,
		onPacketCreated,
	]);

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setBuildStatus(null);
		}
		setOpen(nextOpen);
	};

	return (
		<>
			<Button size="sm" onClick={() => setOpen(true)}>
				<HugeiconsIcon
					icon={PlusSignIcon}
					size={16}
					className="mr-1"
				/>
				Build Exhibit Packet
			</Button>

			<Sheet open={open} onOpenChange={handleOpenChange}>
				<SheetContent
					side="right"
					className="w-[500px] sm:max-w-[500px] flex flex-col"
				>
					<SheetHeader>
						<SheetTitle>Build Exhibit Packet</SheetTitle>
						<SheetDescription>
							Select documents and arrange them into an exhibit
							packet for submission.
						</SheetDescription>
					</SheetHeader>

					<div className="flex-1 overflow-y-auto space-y-4 py-4">
						{/* Packet Title */}
						<div className="space-y-1.5">
							<Label>Packet Title</Label>
							<Input
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="e.g., Medical Evidence Packet"
							/>
						</div>

						{/* Description */}
						<div className="space-y-1.5">
							<Label>Description</Label>
							<Textarea
								value={description}
								onChange={(e) =>
									setDescription(e.target.value)
								}
								placeholder="Optional description..."
								rows={2}
							/>
						</div>

						{/* Document Selector */}
						<div className="space-y-2">
							<Label>
								Select Documents ({selectedDocs.length}{" "}
								selected)
							</Label>
							<div className="relative">
								<HugeiconsIcon
									icon={Search01Icon}
									size={16}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
								/>
								<Input
									placeholder="Search documents..."
									value={docSearch}
									onChange={(e) =>
										setDocSearch(e.target.value)
									}
									className="pl-9"
								/>
							</div>
							<div className="max-h-[200px] overflow-y-auto rounded-md border divide-y">
								{filteredDocuments.length === 0 ? (
									<p className="p-3 text-sm text-muted-foreground">
										No documents found
									</p>
								) : (
									filteredDocuments.map((doc) => (
										<label
											key={doc.id}
											className="flex items-center gap-3 p-2 hover:bg-muted/50 cursor-pointer"
										>
											<Checkbox
												checked={selectedIds.has(
													doc.id,
												)}
												onCheckedChange={() =>
													toggleDocument(doc)
												}
											/>
											<div className="min-w-0 flex-1">
												<p className="text-sm text-foreground truncate">
													{doc.fileName}
												</p>
												{doc.category && (
													<p className="text-xs text-muted-foreground">
														{doc.category}
													</p>
												)}
											</div>
										</label>
									))
								)}
							</div>
						</div>

						{/* Selected Documents (Ordered) */}
						{selectedDocs.length > 0 && (
							<div className="space-y-2">
								<Label>Document Order</Label>
								<div className="space-y-1">
									{selectedDocs.map((doc, index) => (
										<div
											key={doc.documentId}
											className="flex items-center gap-2 rounded-md border p-2"
										>
											<div className="flex flex-col gap-0.5">
												<Button
													variant="ghost"
													size="icon"
													className="h-5 w-5"
													onClick={() =>
														moveDoc(index, "up")
													}
													disabled={index === 0}
												>
													<HugeiconsIcon
														icon={ArrowUp01Icon}
														size={12}
													/>
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="h-5 w-5"
													onClick={() =>
														moveDoc(
															index,
															"down",
														)
													}
													disabled={
														index ===
														selectedDocs.length - 1
													}
												>
													<HugeiconsIcon
														icon={ArrowDown01Icon}
														size={12}
													/>
												</Button>
											</div>
											<div className="min-w-0 flex-1">
												<p className="text-sm text-foreground truncate">
													{doc.fileName}
												</p>
												<Input
													value={doc.exhibitLabel}
													onChange={(e) =>
														updateLabel(
															index,
															e.target.value,
														)
													}
													className="mt-1 h-7 text-xs"
													placeholder="Exhibit label"
												/>
											</div>
											<Button
												variant="ghost"
												size="icon"
												className="h-6 w-6 shrink-0"
												onClick={() =>
													removeDoc(index)
												}
											>
												<HugeiconsIcon
													icon={Cancel01Icon}
													size={14}
												/>
											</Button>
										</div>
									))}
								</div>
							</div>
						)}

						{/* Build Status */}
						{buildStatus && (
							<div className="rounded-md bg-muted p-3">
								<p className="text-sm text-foreground">
									{buildStatus}
								</p>
							</div>
						)}
					</div>

					<SheetFooter className="border-t pt-4">
						<Button
							variant="outline"
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={handleBuild}
							disabled={
								isPending ||
								!title.trim() ||
								selectedDocs.length === 0
							}
						>
							{isPending ? "Building..." : "Build Packet"}
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</>
	);
}
