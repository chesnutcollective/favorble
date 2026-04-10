import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getChannels } from "@/app/actions/team-chat";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BubbleChatIcon,
  PlusSignIcon,
  Mail01Icon,
} from "@hugeicons/core-free-icons";

export const metadata: Metadata = { title: "Team Chat" };
export const dynamic = "force-dynamic";

const PRIMARY = "#263c94";

type MockMessage = {
  id: string;
  author: string;
  authorInitials: string;
  timestamp: string;
  content: string;
};

const MOCK_MESSAGES: MockMessage[] = [
  {
    id: "m1",
    author: "Sarah Chen",
    authorInitials: "SC",
    timestamp: "10:14 AM",
    content:
      "Just got off a call with the claimant on CF-1042. She's worried about the ALJ assignment — can someone confirm the hearing is still on for next Tuesday?",
  },
  {
    id: "m2",
    author: "Marcus Webb",
    authorInitials: "MW",
    timestamp: "10:16 AM",
    content:
      "Yes, confirmed via ERE this morning. ALJ Thompson, 9 AM. I'll send the prep packet over today.",
  },
  {
    id: "m3",
    author: "You",
    authorInitials: "JK",
    timestamp: "10:22 AM",
    content:
      "Thanks Marcus. Let's also make sure we have the updated medical records from Dr. Patel — I saw they were flagged as missing yesterday.",
  },
  {
    id: "m4",
    author: "Lisa Nguyen",
    authorInitials: "LN",
    timestamp: "10:25 AM",
    content:
      "I just pulled them from Chronicle. Uploading to the case file now.",
  },
];

export default async function TeamChatPage() {
  await requireSession();
  const channels = await getChannels().catch(() => []);

  const mockChannels =
    channels.length > 0
      ? channels
      : [
          {
            id: "general",
            name: "general",
            channelType: "team" as const,
            description: "Firm-wide announcements",
            caseId: null,
            isPrivate: false,
            createdAt: new Date(),
          },
          {
            id: "intake",
            name: "intake",
            channelType: "team" as const,
            description: "Intake team coordination",
            caseId: null,
            isPrivate: false,
            createdAt: new Date(),
          },
          {
            id: "hearings",
            name: "hearings",
            channelType: "team" as const,
            description: "Hearings prep and updates",
            caseId: null,
            isPrivate: false,
            createdAt: new Date(),
          },
          {
            id: "case-cf1042",
            name: "CF-1042 · Johnson",
            channelType: "case" as const,
            description: null,
            caseId: null,
            isPrivate: false,
            createdAt: new Date(),
          },
        ];

  const activeChannel = mockChannels[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Chat"
        description="Real-time conversations with your team and case-scoped channels."
        actions={
          <Button size="sm" style={{ backgroundColor: PRIMARY }}>
            <HugeiconsIcon icon={PlusSignIcon} size={14} />
            New Channel
          </Button>
        }
      />

      <div
        className="grid gap-0 rounded-[10px] border border-[#EAEAEA] overflow-hidden bg-white"
        style={{ minHeight: "520px" }}
      >
        <div className="grid grid-cols-[240px_1fr]">
          {/* Channel sidebar */}
          <aside
            className="border-r border-[#EAEAEA] p-3"
            style={{ backgroundColor: "#F8F9FC" }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#666] mb-2 px-2">
              Channels
            </p>
            <ul className="space-y-0.5">
              {mockChannels
                .filter((c) => c.channelType !== "case")
                .map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full text-left rounded px-2 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        backgroundColor:
                          c.id === activeChannel.id
                            ? "rgba(38,60,148,0.10)"
                            : "transparent",
                        color:
                          c.id === activeChannel.id ? PRIMARY : "#333",
                      }}
                    >
                      # {c.name}
                    </button>
                  </li>
                ))}
            </ul>

            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#666] mb-2 mt-4 px-2">
              Case Channels
            </p>
            <ul className="space-y-0.5">
              {mockChannels
                .filter((c) => c.channelType === "case")
                .map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full text-left rounded px-2 py-1.5 text-xs text-[#333] hover:bg-white"
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
            </ul>
          </aside>

          {/* Active channel */}
          <section className="flex flex-col">
            <header className="border-b border-[#EAEAEA] px-4 py-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <HugeiconsIcon
                  icon={BubbleChatIcon}
                  size={16}
                  color={PRIMARY}
                />
                # {activeChannel.name}
              </h2>
              {activeChannel.description && (
                <p className="text-[11px] text-[#666] mt-0.5">
                  {activeChannel.description}
                </p>
              )}
            </header>

            <div
              className="flex-1 overflow-y-auto p-4 space-y-4"
              style={{ backgroundColor: "#FFFFFF" }}
            >
              {MOCK_MESSAGES.map((m) => (
                <div key={m.id} className="flex items-start gap-3">
                  <div
                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {m.authorInitials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-xs font-semibold">{m.author}</p>
                      <p className="text-[10px] text-[#999]">{m.timestamp}</p>
                    </div>
                    <p className="text-xs text-[#333] mt-0.5 leading-relaxed">
                      {m.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div
              className="border-t border-[#EAEAEA] p-3"
              style={{ backgroundColor: "#F8F9FC" }}
            >
              <Card className="p-0">
                <CardContent className="flex items-center gap-2 p-2">
                  <input
                    type="text"
                    placeholder={`Message #${activeChannel.name} (stub — coming soon)`}
                    disabled
                    className="flex-1 bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-[#999]"
                  />
                  <Button
                    size="sm"
                    disabled
                    style={{ backgroundColor: PRIMARY }}
                  >
                    <HugeiconsIcon icon={Mail01Icon} size={14} />
                    Send
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
