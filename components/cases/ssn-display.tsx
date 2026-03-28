"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { EyeIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { revealCaseSSN } from "@/app/actions/cases";

type SSNDisplayProps = {
	caseId: string;
	maskedSSN: string;
};

export function SSNDisplay({ caseId, maskedSSN }: SSNDisplayProps) {
	const [revealed, setRevealed] = useState(false);
	const [fullSSN, setFullSSN] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function handleToggle() {
		if (revealed) {
			setRevealed(false);
			return;
		}

		startTransition(async () => {
			const ssn = await revealCaseSSN(caseId);
			if (ssn) {
				setFullSSN(ssn);
				setRevealed(true);
			}
		});
	}

	return (
		<div>
			<p className="text-xs font-medium text-muted-foreground">SSN</p>
			<div className="flex items-center gap-1.5">
				<p className="text-sm text-foreground font-mono">
					{revealed && fullSSN ? fullSSN : maskedSSN}
				</p>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 w-6 p-0"
					onClick={handleToggle}
					disabled={isPending}
					title={revealed ? "Hide SSN" : "Reveal SSN"}
				>
					<HugeiconsIcon
						icon={revealed ? ViewOffIcon : EyeIcon}
						size={14}
					/>
				</Button>
			</div>
		</div>
	);
}
