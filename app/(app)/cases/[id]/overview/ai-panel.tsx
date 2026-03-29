"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import {
  summarizeCase,
  suggestNextSteps,
  draftCommunication,
} from "@/app/actions/ai";

type AIResult = {
  summary: string | null;
  suggestions: string | null;
  draft: string | null;
};

type LoadingState = {
  summary: boolean;
  suggestions: boolean;
  draft: boolean;
};

export function AIPanel({ caseId }: { caseId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<AIResult>({
    summary: null,
    suggestions: null,
    draft: null,
  });
  const [loading, setLoading] = useState<LoadingState>({
    summary: false,
    suggestions: false,
    draft: false,
  });
  const [draftContext, setDraftContext] = useState("");
  const [copied, setCopied] = useState(false);

  const handleSummarize = useCallback(async () => {
    setLoading((prev) => ({ ...prev, summary: true }));
    try {
      const result = await summarizeCase(caseId);
      setResults((prev) => ({ ...prev, summary: result }));
    } finally {
      setLoading((prev) => ({ ...prev, summary: false }));
    }
  }, [caseId]);

  const handleSuggestNextSteps = useCallback(async () => {
    setLoading((prev) => ({ ...prev, suggestions: true }));
    try {
      const result = await suggestNextSteps(caseId);
      setResults((prev) => ({ ...prev, suggestions: result }));
    } finally {
      setLoading((prev) => ({ ...prev, suggestions: false }));
    }
  }, [caseId]);

  const handleDraftMessage = useCallback(async () => {
    if (!draftContext.trim()) return;
    setLoading((prev) => ({ ...prev, draft: true }));
    try {
      const result = await draftCommunication(caseId, draftContext);
      setResults((prev) => ({ ...prev, draft: result }));
    } finally {
      setLoading((prev) => ({ ...prev, draft: false }));
    }
  }, [caseId, draftContext]);

  const handleCopyDraft = useCallback(async () => {
    if (!results.draft) return;
    await navigator.clipboard.writeText(results.draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [results.draft]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary text-xs font-bold">
                  AI
                </span>
                AI Assistant
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {isOpen ? "Collapse" : "Expand"}
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Summarize */}
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSummarize}
                disabled={loading.summary}
              >
                {loading.summary ? "Summarizing..." : "Summarize Case"}
              </Button>
              {loading.summary && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Analyzing case data...
                </div>
              )}
              {results.summary && !loading.summary && (
                <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
                  {results.summary}
                </div>
              )}
            </div>

            {/* Suggest Next Steps */}
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSuggestNextSteps}
                disabled={loading.suggestions}
              >
                {loading.suggestions ? "Thinking..." : "Suggest Next Steps"}
              </Button>
              {loading.suggestions && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Analyzing case history...
                </div>
              )}
              {results.suggestions && !loading.suggestions && (
                <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
                  {results.suggestions}
                </div>
              )}
            </div>

            {/* Draft Communication */}
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label
                    htmlFor="draft-context"
                    className="text-sm font-medium mb-1 block"
                  >
                    Draft Message
                  </label>
                  <Textarea
                    id="draft-context"
                    placeholder="Describe what the message should cover (e.g., 'Update on hearing date' or 'Request for medical records')"
                    value={draftContext}
                    onChange={(e) => setDraftContext(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDraftMessage}
                  disabled={loading.draft || !draftContext.trim()}
                >
                  {loading.draft ? "Drafting..." : "Draft"}
                </Button>
              </div>
              {loading.draft && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Drafting message...
                </div>
              )}
              {results.draft && !loading.draft && (
                <div className="space-y-2">
                  <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
                    {results.draft}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyDraft}
                  >
                    {copied ? "Copied" : "Copy to Clipboard"}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
