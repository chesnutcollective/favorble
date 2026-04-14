"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  acknowledgeComplianceFinding,
  remediateComplianceFinding,
  markComplianceFindingFalsePositive,
} from "@/app/actions/compliance";

type Props = {
  findingId: string;
  status: "open" | "acknowledged" | "remediated" | "false_positive";
};

export function FindingActionsClient({ findingId, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const active = status === "open" || status === "acknowledged";
  if (!active) {
    return <span className="text-[11px] text-[#999]">closed</span>;
  }

  const onAck = () =>
    startTransition(async () => {
      await acknowledgeComplianceFinding(findingId);
      router.refresh();
    });

  const onRemediate = () =>
    startTransition(async () => {
      await remediateComplianceFinding(findingId);
      router.refresh();
    });

  const onFalsePositive = () =>
    startTransition(async () => {
      await markComplianceFindingFalsePositive(findingId);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-1">
      {status === "open" && (
        <Button
          size="sm"
          variant="outline"
          onClick={onAck}
          disabled={isPending}
        >
          Ack
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={onRemediate}
        disabled={isPending}
      >
        Remediate
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onFalsePositive}
        disabled={isPending}
      >
        False positive
      </Button>
    </div>
  );
}
