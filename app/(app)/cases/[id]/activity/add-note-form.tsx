"use client";

import { useState, useTransition, useRef, useCallback, useEffect } from "react";
import { createCaseNote, searchOrganizationUsers } from "@/app/actions/notes";
import type { NoteType } from "@/app/actions/notes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type MentionUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

const NOTE_TYPE_OPTIONS: { value: NoteType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "phone_call", label: "Phone Call" },
  { value: "internal_memo", label: "Internal Memo" },
];

export function AddNoteForm({ caseId }: { caseId: string }) {
  const [body, setBody] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("general");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<MentionUser[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionSearchPending, setMentionSearchPending] = useState(false);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  // Track the position where the @ started
  const mentionStartPos = useRef<number | null>(null);

  const wrapSelection = useCallback((prefix: string, suffix: string) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const selected = text.slice(start, end);

    const before = text.slice(0, start);
    const after = text.slice(end);

    if (selected.startsWith(prefix) && selected.endsWith(suffix)) {
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
  }, []);

  const handleBold = useCallback(
    () => wrapSelection("**", "**"),
    [wrapSelection],
  );
  const handleItalic = useCallback(
    () => wrapSelection("_", "_"),
    [wrapSelection],
  );

  const handleBulletList = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const selected = text.slice(start, end);

    if (selected) {
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

  // Detect @mention patterns
  function handleBodyChange(newValue: string) {
    setBody(newValue);

    const el = textareaRef.current;
    if (!el) return;

    const cursorPos = el.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);

    // Check if we're in a mention context
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      mentionStartPos.current = cursorPos - atMatch[0].length;
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      mentionStartPos.current = null;
      setMentionQuery(null);
      setMentionResults([]);
    }
  }

  // Search for users when mention query changes
  useEffect(() => {
    if (mentionQuery === null) return;

    const timeout = setTimeout(async () => {
      if (mentionQuery.length === 0) {
        // Show all users when just "@" is typed
        setMentionSearchPending(true);
        try {
          const results = await searchOrganizationUsers("");
          setMentionResults(results);
        } catch {
          setMentionResults([]);
        }
        setMentionSearchPending(false);
      } else {
        setMentionSearchPending(true);
        try {
          const results = await searchOrganizationUsers(mentionQuery);
          setMentionResults(results);
        } catch {
          setMentionResults([]);
        }
        setMentionSearchPending(false);
      }
    }, 200);

    return () => clearTimeout(timeout);
  }, [mentionQuery]);

  function selectMention(user: MentionUser) {
    const el = textareaRef.current;
    if (!el || mentionStartPos.current === null) return;

    const before = body.slice(0, mentionStartPos.current);
    const after = body.slice(el.selectionStart);
    const mention = `@${user.firstName}${user.lastName} `;
    const newBody = before + mention + after;

    setBody(newBody);
    setMentionQuery(null);
    setMentionResults([]);
    mentionStartPos.current = null;

    // Track mentioned user
    if (!mentionedUserIds.includes(user.id)) {
      setMentionedUserIds((prev) => [...prev, user.id]);
    }

    requestAnimationFrame(() => {
      const pos = before.length + mention.length;
      el.selectionStart = pos;
      el.selectionEnd = pos;
      el.focus();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Handle mention dropdown navigation
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) =>
          prev < mentionResults.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) =>
          prev > 0 ? prev - 1 : mentionResults.length - 1,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectMention(mentionResults[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        setMentionResults([]);
        return;
      }
    }

    if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleBold();
    }
    if (e.key === "i" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleItalic();
    }
  }

  function handleAddTag(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const tag = tagInput.trim().replace(/,/g, "");
      if (tag && !tags.includes(tag)) {
        setTags((prev) => [...prev, tag]);
      }
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    setError(null);
    startTransition(async () => {
      try {
        await createCaseNote({
          caseId,
          body: body.trim(),
          noteType,
          tags: tags.length > 0 ? tags : undefined,
          mentionedUserIds:
            mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
        });
        setBody("");
        setNoteType("general");
        setTags([]);
        setTagInput("");
        setMentionedUserIds([]);
      } catch {
        setError("Failed to add note. Please try again.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Note type + tags row */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              value={noteType}
              onValueChange={(v) => setNoteType(v as NoteType)}
            >
              <SelectTrigger className="w-[160px] h-8 text-sm">
                <SelectValue placeholder="Note type" />
              </SelectTrigger>
              <SelectContent>
                {NOTE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 flex-1 min-w-[200px]">
              <div className="flex gap-1 flex-wrap">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs gap-1 cursor-pointer"
                    onClick={() => removeTag(tag)}
                  >
                    {tag}
                    <span className="text-muted-foreground hover:text-foreground">
                      x
                    </span>
                  </Badge>
                ))}
              </div>
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="Add tags..."
                className="h-8 text-sm flex-1 min-w-[100px]"
              />
            </div>
          </div>

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
              <div className="mx-1 h-4 w-px bg-border" />
              <span className="text-xs text-muted-foreground ml-1">
                Type @ to mention a user
              </span>
            </div>
          </TooltipProvider>

          {/* Textarea with mention dropdown */}
          <div className="relative">
            <Textarea
              ref={textareaRef}
              placeholder="Add a note... (supports **bold**, _italic_, - bullet lists, and @mentions)"
              value={body}
              onChange={(e) => handleBodyChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              disabled={isPending}
              className="resize-none font-mono text-sm"
            />

            {/* @mention autocomplete dropdown */}
            {mentionQuery !== null && (
              <div
                ref={mentionDropdownRef}
                className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md"
              >
                {mentionSearchPending && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Searching...
                  </div>
                )}
                {!mentionSearchPending && mentionResults.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No users found
                  </div>
                )}
                {mentionResults.map((user, idx) => (
                  <button
                    key={user.id}
                    type="button"
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent ${
                      idx === mentionIndex ? "bg-accent" : ""
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectMention(user);
                    }}
                  >
                    <span className="font-medium">
                      {user.firstName} {user.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
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
