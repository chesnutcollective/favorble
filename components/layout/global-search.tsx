"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";

type SearchResults = {
	cases: Array<{
		id: string;
		caseNumber: string;
		status: string;
		stageName: string | null;
		claimantName: string | null;
	}>;
	contacts: Array<{
		id: string;
		name: string;
		email: string | null;
		contactType: string;
	}>;
	tasks: Array<{
		id: string;
		title: string;
		status: string;
		caseId: string;
	}>;
};

export function GlobalSearch() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResults>({
		cases: [],
		contacts: [],
		tasks: [],
	});
	const [isSearching, setIsSearching] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	// Cmd+K keyboard shortcut
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	const search = useCallback(async (term: string) => {
		if (term.length < 2) {
			setResults({ cases: [], contacts: [], tasks: [] });
			setIsSearching(false);
			return;
		}

		setIsSearching(true);
		try {
			const res = await fetch(
				`/api/search?q=${encodeURIComponent(term)}`,
			);
			if (res.ok) {
				const data = await res.json();
				setResults(data);
			}
		} catch {
			// Silently fail
		} finally {
			setIsSearching(false);
		}
	}, []);

	function handleQueryChange(value: string) {
		setQuery(value);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => search(value), 250);
	}

	function navigate(path: string) {
		setOpen(false);
		setQuery("");
		setResults({ cases: [], contacts: [], tasks: [] });
		router.push(path);
	}

	const hasResults =
		results.cases.length > 0 ||
		results.contacts.length > 0 ||
		results.tasks.length > 0;

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
			>
				<HugeiconsIcon icon={Search01Icon} size={16} />
				<span className="hidden md:inline">Search...</span>
				<kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 md:inline-flex">
					<span className="text-xs">&#8984;</span>K
				</kbd>
			</button>

			<CommandDialog open={open} onOpenChange={setOpen}>
				<CommandInput
					placeholder="Search cases, contacts, tasks..."
					value={query}
					onValueChange={handleQueryChange}
				/>
				<CommandList>
					{query.length >= 2 && !isSearching && !hasResults && (
						<CommandEmpty>No results found.</CommandEmpty>
					)}

					{isSearching && (
						<div className="py-6 text-center text-sm text-muted-foreground">
							Searching...
						</div>
					)}

					{results.cases.length > 0 && (
						<CommandGroup heading="Cases">
							{results.cases.map((c) => (
								<CommandItem
									key={c.id}
									value={`case-${c.id}`}
									onSelect={() => navigate(`/cases/${c.id}`)}
								>
									<div className="flex flex-1 items-center justify-between">
										<div>
											<span className="font-medium">
												{c.caseNumber}
											</span>
											{c.claimantName && (
												<span className="ml-2 text-muted-foreground">
													{c.claimantName}
												</span>
											)}
										</div>
										{c.stageName && (
											<span className="text-xs text-muted-foreground">
												{c.stageName}
											</span>
										)}
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					)}

					{results.contacts.length > 0 && (
						<CommandGroup heading="Contacts">
							{results.contacts.map((c) => (
								<CommandItem
									key={c.id}
									value={`contact-${c.id}`}
									onSelect={() =>
										navigate(`/contacts/${c.id}`)
									}
								>
									<div className="flex flex-1 items-center justify-between">
										<span className="font-medium">
											{c.name}
										</span>
										<span className="text-xs text-muted-foreground">
											{c.contactType}
										</span>
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					)}

					{results.tasks.length > 0 && (
						<CommandGroup heading="Tasks">
							{results.tasks.map((t) => (
								<CommandItem
									key={t.id}
									value={`task-${t.id}`}
									onSelect={() =>
										navigate(
											`/cases/${t.caseId}/tasks`,
										)
									}
								>
									<div className="flex flex-1 items-center justify-between">
										<span className="font-medium">
											{t.title}
										</span>
										<span className="text-xs text-muted-foreground">
											{t.status}
										</span>
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					)}
				</CommandList>
			</CommandDialog>
		</>
	);
}
