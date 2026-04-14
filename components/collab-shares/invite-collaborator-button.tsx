"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InviteCollaboratorDialog } from "./invite-collaborator-dialog";

type DocOption = {
  id: string;
  fileName: string;
  category: string | null;
};

type Props = {
  caseId: string;
  availableDocuments: DocOption[];
};

export function InviteCollaboratorButton({
  caseId,
  availableDocuments,
}: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Invite external collaborator
      </Button>
      <InviteCollaboratorDialog
        open={open}
        onOpenChange={setOpen}
        caseId={caseId}
        availableDocuments={availableDocuments}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
