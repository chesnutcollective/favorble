"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createNpsCampaign,
  deleteNpsCampaign,
  toggleNpsCampaign,
  type CampaignChannel,
  type NpsCampaignListRow,
} from "@/app/actions/nps";

export function CreateCampaignDialog({
  stageOptions,
}: {
  stageOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [triggerStageId, setTriggerStageId] = useState<string>("");
  const [delayDays, setDelayDays] = useState<string>("3");
  const [channel, setChannel] = useState<CampaignChannel>("portal");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setName("");
    setTriggerStageId("");
    setDelayDays("3");
    setChannel("portal");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Name is required");
      return;
    }
    if (!triggerStageId) {
      toast.error("Pick a trigger stage");
      return;
    }
    const parsedDelay = Number.parseInt(delayDays, 10);
    const resolvedDelay = Number.isFinite(parsedDelay)
      ? Math.max(0, parsedDelay)
      : 0;

    startTransition(async () => {
      const result = await createNpsCampaign({
        name: trimmedName,
        triggerStageId,
        delayDays: resolvedDelay,
        channel,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Campaign created");
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">New campaign</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New NPS campaign</DialogTitle>
            <DialogDescription>
              When a case reaches the trigger stage, we enqueue a survey.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="nps-campaign-name">Name</Label>
              <Input
                id="nps-campaign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Post-hearing pulse"
                autoFocus
              />
            </div>

            <div>
              <Label htmlFor="nps-trigger-stage">Trigger stage</Label>
              <Select
                value={triggerStageId}
                onValueChange={setTriggerStageId}
              >
                <SelectTrigger id="nps-trigger-stage">
                  <SelectValue placeholder="Pick a stage" />
                </SelectTrigger>
                <SelectContent>
                  {stageOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="nps-delay">Delay (days)</Label>
                <Input
                  id="nps-delay"
                  type="number"
                  min={0}
                  max={365}
                  value={delayDays}
                  onChange={(e) => setDelayDays(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="nps-channel">Channel</Label>
                <Select
                  value={channel}
                  onValueChange={(v) => setChannel(v as CampaignChannel)}
                >
                  <SelectTrigger id="nps-channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portal">Portal banner</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CampaignList({
  campaigns,
}: {
  campaigns: NpsCampaignListRow[];
}) {
  return (
    <div className="space-y-3">
      {campaigns.map((campaign) => (
        <CampaignRow key={campaign.id} campaign={campaign} />
      ))}
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: NpsCampaignListRow }) {
  const router = useRouter();
  const [isActive, setIsActive] = useState(campaign.isActive);
  const [isPending, startTransition] = useTransition();

  function handleToggle(next: boolean) {
    setIsActive(next);
    startTransition(async () => {
      const result = await toggleNpsCampaign(campaign.id, next);
      if (!result.ok) {
        toast.error(result.error ?? "Failed to update");
        setIsActive(!next); // revert
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`Delete "${campaign.name}"? This can't be undone.`)) return;
    startTransition(async () => {
      const result = await deleteNpsCampaign(campaign.id);
      if (!result.ok) {
        toast.error(result.error ?? "Failed to delete");
        return;
      }
      toast.success("Campaign deleted");
      router.refresh();
    });
  }

  const channelLabel: Record<CampaignChannel, string> = {
    portal: "Portal banner",
    sms: "SMS",
    email: "Email",
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold text-[#171717]">
              {campaign.name}
            </h3>
            <Badge variant={isActive ? "default" : "secondary"}>
              {isActive ? "Active" : "Inactive"}
            </Badge>
            <Badge variant="outline">{channelLabel[campaign.channel]}</Badge>
          </div>
          <p className="mt-1 text-[12px] text-[#666]">
            Trigger:{" "}
            <span className="font-medium text-[#171717]">
              {campaign.triggerStageName ?? "—"}
            </span>
            {" · "}Delay:{" "}
            <span className="font-medium text-[#171717]">
              {campaign.delayDays} day{campaign.delayDays === 1 ? "" : "s"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#666]">Active</span>
            <Switch
              checked={isActive}
              onCheckedChange={handleToggle}
              disabled={isPending}
              aria-label="Toggle campaign"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
