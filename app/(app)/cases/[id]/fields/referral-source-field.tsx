"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { editCaseReferral, searchContactsForCase } from "@/app/actions/cases";
import { toast } from "sonner";

type ContactSearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  contactType: string;
};

type ReferralSourceFieldProps = {
  caseId: string;
  initialSource: string | null;
  initialContactId: string | null;
};

/**
 * Dedicated Referral Source editor pinned above the custom-field tabs on
 * the Case Fields page. Includes a free-text "source" input and a
 * typeahead-style contact picker. Both fields are optional and can be
 * cleared independently.
 */
export function ReferralSourceField({
  caseId,
  initialSource,
  initialContactId,
}: ReferralSourceFieldProps) {
  const router = useRouter();
  const [source, setSource] = useState<string>(initialSource ?? "");
  const [contactId, setContactId] = useState<string | null>(initialContactId);
  const [contactQuery, setContactQuery] = useState<string>("");
  const [contactResults, setContactResults] = useState<ContactSearchResult[]>(
    [],
  );
  const [selectedContactLabel, setSelectedContactLabel] = useState<
    string | null
  >(null);
  const [showContactResults, setShowContactResults] = useState(false);
  const [isPending, startTransition] = useTransition();

  // If we were hydrated with an initialContactId we don't know the contact's
  // name yet — fetch it once so the input reflects who is linked.
  useEffect(() => {
    if (!initialContactId) return;
    let cancelled = false;
    (async () => {
      const rows = await searchContactsForCase("");
      if (cancelled) return;
      const match = rows.find((r) => r.id === initialContactId);
      if (match) {
        setSelectedContactLabel(`${match.firstName} ${match.lastName}`);
        setContactQuery(`${match.firstName} ${match.lastName}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialContactId]);

  // Debounced contact search for the typeahead.
  useEffect(() => {
    if (!showContactResults) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      const rows = await searchContactsForCase(contactQuery);
      if (!cancelled) setContactResults(rows);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [contactQuery, showContactResults]);

  const handleSave = () => {
    startTransition(async () => {
      const result = await editCaseReferral(
        caseId,
        source.trim().length > 0 ? source.trim() : null,
        contactId,
      );
      if (result.ok) {
        toast.success("Referral source saved.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleClearContact = () => {
    setContactId(null);
    setSelectedContactLabel(null);
    setContactQuery("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Referral Source</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Free-text source */}
          <div className="space-y-2">
            <Label htmlFor="referral-source-text">Source</Label>
            <Input
              id="referral-source-text"
              list="referral-source-suggestions"
              placeholder="e.g. Google, attorney referral, past client"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
            <datalist id="referral-source-suggestions">
              <option value="Google" />
              <option value="Facebook" />
              <option value="TV/Radio" />
              <option value="Attorney Referral" />
              <option value="Past Client" />
              <option value="Family/Friend" />
              <option value="Website" />
            </datalist>
            <p className="text-xs text-muted-foreground">
              Free text — pick a suggestion or type your own.
            </p>
          </div>

          {/* Contact picker */}
          <div className="space-y-2">
            <Label htmlFor="referral-contact">Referring Contact (optional)</Label>
            <div className="relative">
              <Input
                id="referral-contact"
                placeholder="Search contacts..."
                value={contactQuery}
                onFocus={() => setShowContactResults(true)}
                onBlur={() => {
                  // Delay so click events on results can still register
                  setTimeout(() => setShowContactResults(false), 150);
                }}
                onChange={(e) => {
                  setContactQuery(e.target.value);
                  setShowContactResults(true);
                  // Typing invalidates any previous selection until the user
                  // actually picks a row from the dropdown.
                  if (contactId) setContactId(null);
                  if (selectedContactLabel) setSelectedContactLabel(null);
                }}
                autoComplete="off"
              />
              {showContactResults && contactResults.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-white shadow-md">
                  {contactResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onMouseDown={(e) => {
                          // onMouseDown fires before blur so we can capture
                          // the selection without the dropdown closing first.
                          e.preventDefault();
                          setContactId(c.id);
                          const label = `${c.firstName} ${c.lastName}`;
                          setSelectedContactLabel(label);
                          setContactQuery(label);
                          setShowContactResults(false);
                        }}
                      >
                        <span className="font-medium text-foreground">
                          {c.firstName} {c.lastName}
                        </span>
                        {c.email && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {c.email}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {contactId && selectedContactLabel && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Linked to{" "}
                  <span className="font-medium text-foreground">
                    {selectedContactLabel}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={handleClearContact}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save Referral"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
