"use client";

import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  parseCSV,
  detectDuplicates,
  bulkCreateCases,
  CASFLOW_FIELDS,
  type ParsedRow,
  type FieldMapping,
  type DuplicateCheck,
  type ImportResult,
} from "@/app/actions/import";

type Step = "upload" | "map" | "preview" | "import";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "map", label: "Map Fields" },
  { key: "preview", label: "Preview" },
  { key: "import", label: "Import" },
];

export function ImportWizard() {
  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCheck[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [detectingDuplicates, setDetectingDuplicates] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  const handleFileUpload = useCallback(async (file: File) => {
    setParseError(null);
    setFileName(file.name);

    if (!file.name.endsWith(".csv")) {
      setParseError("Please upload a CSV file.");
      return;
    }

    try {
      const content = await file.text();
      const result = await parseCSV(content);

      if (result.headers.length === 0) {
        setParseError("CSV file appears empty or has no headers.");
        return;
      }

      if (result.rows.length === 0) {
        setParseError("CSV file has headers but no data rows.");
        return;
      }

      setHeaders(result.headers);
      setRows(result.rows);

      // Auto-create initial mappings with best guesses
      const initialMappings: FieldMapping[] = result.headers.map((header) => {
        const normalized = header.toLowerCase().replace(/[_\s-]+/g, "");
        let match = "";

        for (const field of CASFLOW_FIELDS) {
          const fieldNorm = field.value.toLowerCase();
          const labelNorm = field.label.toLowerCase().replace(/[_\s-]+/g, "");
          if (
            normalized === fieldNorm ||
            normalized === labelNorm ||
            normalized.includes(fieldNorm)
          ) {
            match = field.value;
            break;
          }
        }

        // Common aliases
        if (!match) {
          if (normalized.includes("first") && normalized.includes("name"))
            match = "firstName";
          else if (normalized.includes("last") && normalized.includes("name"))
            match = "lastName";
          else if (normalized.includes("dob") || normalized.includes("birth"))
            match = "dateOfBirth";
          else if (normalized.includes("email") || normalized.includes("mail"))
            match = "email";
          else if (normalized.includes("phone")) match = "phone";
          else if (normalized.includes("addr") && !normalized.includes("email"))
            match = "address";
          else if (normalized.includes("zip")) match = "zip";
          else if (normalized === "st" || normalized === "state")
            match = "state";
          else if (normalized === "city") match = "city";
        }

        return { csvColumn: header, caseFlowField: match };
      });

      setMappings(initialMappings);
      setCurrentStep("map");
    } catch {
      setParseError("Failed to parse the CSV file.");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload],
  );

  const handleMappingChange = useCallback(
    (csvColumn: string, caseFlowField: string) => {
      setMappings((prev) =>
        prev.map((m) =>
          m.csvColumn === csvColumn ? { ...m, caseFlowField } : m,
        ),
      );
    },
    [],
  );

  const handleGoToPreview = useCallback(async () => {
    const hasFirstName = mappings.some((m) => m.caseFlowField === "firstName");
    const hasLastName = mappings.some((m) => m.caseFlowField === "lastName");

    if (!hasFirstName || !hasLastName) {
      return;
    }

    setDetectingDuplicates(true);
    try {
      const dupes = await detectDuplicates(rows, mappings);
      setDuplicates(dupes);
      setCurrentStep("preview");
    } finally {
      setDetectingDuplicates(false);
    }
  }, [rows, mappings]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    setImportProgress(0);
    setCurrentStep("import");

    try {
      // Skip rows that are duplicates
      const skipIndices = duplicates.map((d) => d.rowIndex);

      // Simulate progress
      const progressInterval = setInterval(() => {
        setImportProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 15;
        });
      }, 500);

      const result = await bulkCreateCases(rows, mappings, skipIndices);
      clearInterval(progressInterval);
      setImportProgress(100);
      setImportResult(result);
    } catch {
      setImportResult({
        created: 0,
        skipped: rows.length,
        errors: ["Import failed unexpectedly. Please try again."],
      });
    } finally {
      setImporting(false);
    }
  }, [rows, mappings, duplicates]);

  const handleReset = useCallback(() => {
    setCurrentStep("upload");
    setHeaders([]);
    setRows([]);
    setMappings([]);
    setDuplicates([]);
    setImportResult(null);
    setImporting(false);
    setImportProgress(0);
    setFileName(null);
    setParseError(null);
  }, []);

  const hasRequiredMappings =
    mappings.some((m) => m.caseFlowField === "firstName") &&
    mappings.some((m) => m.caseFlowField === "lastName");

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        {STEPS.map((step, i) => (
          <div key={step.key} className="flex items-center gap-1 sm:gap-2 shrink-0">
            {i > 0 && <div className="h-px w-4 sm:w-8 bg-border" />}
            <div
              className={`flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm ${
                i === currentStepIndex
                  ? "text-primary font-medium"
                  : i < currentStepIndex
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
              }`}
            >
              <span
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                  i === currentStepIndex
                    ? "bg-primary text-primary-foreground"
                    : i < currentStepIndex
                      ? "bg-muted text-muted-foreground"
                      : "bg-muted/50 text-muted-foreground/50"
                }`}
              >
                {i < currentStepIndex ? "\u2713" : i + 1}
              </span>
              <span className={i === currentStepIndex ? "inline" : "hidden sm:inline"}>
                {step.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {currentStep === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload CSV File</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed border-border rounded-lg p-6 sm:p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
              <div className="space-y-2">
                <div className="text-4xl text-muted-foreground">&#128196;</div>
                <p className="text-sm font-medium">
                  {fileName
                    ? fileName
                    : "Drop a CSV file here, or click to browse"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Accepts .csv files with headers in the first row
                </p>
              </div>
            </div>
            {parseError && (
              <p className="text-sm text-destructive mt-3">{parseError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Map Fields */}
      {currentStep === "map" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Map Fields</CardTitle>
              <p className="text-sm text-muted-foreground">
                {rows.length} rows detected
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Match each CSV column to the corresponding CaseFlow field. First
              Name and Last Name are required.
            </p>
            <div className="space-y-3">
              {mappings.map((mapping) => (
                <div
                  key={mapping.csvColumn}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="w-full sm:w-1/3 text-sm font-medium truncate">
                    {mapping.csvColumn}
                  </div>
                  <div className="hidden sm:block text-muted-foreground">
                    &#8594;
                  </div>
                  <div className="w-full sm:w-1/2">
                    <Select
                      value={mapping.caseFlowField || "__skip__"}
                      onValueChange={(val) =>
                        handleMappingChange(
                          mapping.csvColumn,
                          val === "__skip__" ? "" : val,
                        )
                      }
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Skip this column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">
                          Skip this column
                        </SelectItem>
                        {CASFLOW_FIELDS.map((field) => (
                          <SelectItem key={field.value} value={field.value}>
                            {field.label} ({field.group})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>

            {!hasRequiredMappings && (
              <p className="text-sm text-destructive mt-4">
                You must map at least First Name and Last Name to proceed.
              </p>
            )}

            <div className="flex justify-between mt-6">
              <Button
                variant="outline"
                onClick={() => setCurrentStep("upload")}
              >
                Back
              </Button>
              <Button
                onClick={handleGoToPreview}
                disabled={!hasRequiredMappings || detectingDuplicates}
              >
                {detectingDuplicates ? "Checking duplicates..." : "Preview"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Preview */}
      {currentStep === "preview" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Preview Import</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{rows.length} total rows</Badge>
                {duplicates.length > 0 && (
                  <Badge variant="destructive">
                    {duplicates.length} potential duplicates
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {duplicates.length > 0 && (
              <div className="rounded-md bg-destructive/10 p-3 mb-4">
                <p className="text-sm font-medium text-destructive">
                  Potential duplicates found
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  The following rows match existing cases and will be skipped
                  during import:
                </p>
                <ul className="text-sm mt-2 space-y-1">
                  {duplicates.map((d) => (
                    <li key={d.rowIndex}>
                      Row {d.rowIndex + 1}: {d.firstName} {d.lastName} matches
                      case {d.existingCaseNumber}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-md border overflow-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {mappings
                      .filter((m) => m.caseFlowField !== "")
                      .map((m) => (
                        <TableHead key={m.csvColumn}>
                          {CASFLOW_FIELDS.find(
                            (f) => f.value === m.caseFlowField,
                          )?.label ?? m.caseFlowField}
                        </TableHead>
                      ))}
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 10).map((row, i) => {
                    const isDuplicate = duplicates.some(
                      (d) => d.rowIndex === i,
                    );
                    return (
                      <TableRow
                        key={`row-${
                          // biome-ignore lint/suspicious/noArrayIndexKey: preview table rows have no stable id
                          i
                        }`}
                        className={isDuplicate ? "bg-destructive/5" : ""}
                      >
                        <TableCell className="text-muted-foreground text-xs">
                          {i + 1}
                        </TableCell>
                        {mappings
                          .filter((m) => m.caseFlowField !== "")
                          .map((m) => (
                            <TableCell
                              key={`${i}-${m.csvColumn}`}
                              className="text-sm"
                            >
                              {row[m.csvColumn] ?? ""}
                            </TableCell>
                          ))}
                        <TableCell>
                          {isDuplicate ? (
                            <Badge variant="destructive">Duplicate</Badge>
                          ) : (
                            <Badge variant="secondary">New</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {rows.length > 10 && (
              <p className="text-xs text-muted-foreground mt-2">
                Showing first 10 of {rows.length} rows.
              </p>
            )}

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setCurrentStep("map")}>
                Back
              </Button>
              <Button onClick={handleImport}>
                Import {rows.length - duplicates.length} Cases
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Import Progress */}
      {currentStep === "import" && (
        <Card>
          <CardHeader>
            <CardTitle>
              {importing ? "Importing..." : "Import Complete"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{
                    width: `${Math.min(importProgress, 100)}%`,
                  }}
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {importing ? `${Math.round(importProgress)}% complete` : "Done"}
              </p>
            </div>

            {importResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-md bg-muted">
                    <p className="text-2xl font-semibold text-primary">
                      {importResult.created}
                    </p>
                    <p className="text-xs text-muted-foreground">Created</p>
                  </div>
                  <div className="text-center p-3 rounded-md bg-muted">
                    <p className="text-2xl font-semibold text-muted-foreground">
                      {importResult.skipped}
                    </p>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                  </div>
                  <div className="text-center p-3 rounded-md bg-muted">
                    <p className="text-2xl font-semibold text-destructive">
                      {importResult.errors.length}
                    </p>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </div>
                </div>

                {importResult.errors.length > 0 && (
                  <div className="rounded-md bg-destructive/10 p-3">
                    <p className="text-sm font-medium text-destructive mb-2">
                      Errors
                    </p>
                    <ul className="text-xs space-y-1">
                      {importResult.errors.slice(0, 20).map((err, i) => (
                        <li
                          key={`err-${
                            // biome-ignore lint/suspicious/noArrayIndexKey: error list has no stable id
                            i
                          }`}
                        >
                          {err}
                        </li>
                      ))}
                    </ul>
                    {importResult.errors.length > 20 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ...and {importResult.errors.length - 20} more
                      </p>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={handleReset}>
                    Import More
                  </Button>
                  <Button asChild>
                    <a href="/cases">View Cases</a>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
