"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Check, ArrowRight, AlertCircle, ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, getAccessToken, setAccessToken } from "@/lib/api";
import type { CSVImportResponse, LeadList } from "@/lib/types";

const SYSTEM_FIELDS = [
  { value: "skip", label: "-- Skip --" },
  { value: "email", label: "Email" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "company", label: "Company" },
  { value: "title", label: "Job Title" },
  { value: "phone", label: "Phone" },
  { value: "linkedin_url", label: "LinkedIn URL" },
  { value: "website", label: "Website" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "country", label: "Country" },
  { value: "industry", label: "Industry" },
];

/** Try to auto-map a CSV header to a system field. */
function guessMapping(header: string): string {
  const h = header.toLowerCase().trim().replace(/[_\s-]+/g, "");
  const map: Record<string, string> = {
    email: "email",
    emailaddress: "email",
    firstname: "first_name",
    first: "first_name",
    lastname: "last_name",
    last: "last_name",
    name: "first_name",
    company: "company",
    companyname: "company",
    organization: "company",
    title: "title",
    jobtitle: "title",
    position: "title",
    phone: "phone",
    phonenumber: "phone",
    telephone: "phone",
    linkedin: "linkedin_url",
    linkedinurl: "linkedin_url",
    website: "website",
    url: "website",
    city: "city",
    state: "state",
    country: "country",
    industry: "industry",
    sector: "industry",
  };
  return map[h] ?? "skip";
}

/** Parse CSV text into rows of string arrays. Handles quoted fields. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(current);
        current = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        row.push(current);
        current = "";
        if (row.some((c) => c.trim() !== "")) rows.push(row);
        row = [];
        if (ch === "\r") i++;
      } else {
        current += ch;
      }
    }
  }
  // push last field / row
  row.push(current);
  if (row.some((c) => c.trim() !== "")) rows.push(row);

  return rows;
}

type Step = "upload" | "mapping" | "preview" | "importing" | "done";

export default function ImportLeadsPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<CSVImportResponse | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // List selection
  const [leadLists, setLeadLists] = useState<LeadList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchLists = useCallback(async () => {
    try {
      const data = await api.get<LeadList[]>("/api/leads/lists/all");
      setLeadLists(data);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  async function handleCreateList() {
    if (!newListName.trim()) return;
    setCreatingList(true);
    try {
      const created = await api.post<LeadList>("/api/leads/lists", { name: newListName.trim() });
      await fetchLists();
      setSelectedListId(created.id);
      setNewListName("");
      toast.success(`List "${newListName.trim()}" created`);
    } catch {
      toast.error("Failed to create list");
    } finally {
      setCreatingList(false);
    }
  }

  function handleFileSelected(selectedFile: File) {
    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please select a CSV file");
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        toast.error("Could not read file");
        return;
      }

      const allRows = parseCSV(text);
      if (allRows.length < 2) {
        toast.error("CSV file must have at least a header row and one data row");
        return;
      }

      const headers = allRows[0].map((h) => h.trim());
      const dataRows = allRows.slice(1);
      const preview = dataRows.slice(0, 5);

      setCsvHeaders(headers);
      setCsvPreviewRows(preview);
      setTotalRows(dataRows.length);

      // Auto-map headers
      const autoMappings: Record<string, string> = {};
      headers.forEach((h) => {
        autoMappings[h] = guessMapping(h);
      });
      setMappings(autoMappings);

      setStep("mapping");
    };
    reader.onerror = () => {
      toast.error("Failed to read the file");
    };
    reader.readAsText(selectedFile);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFileSelected(f);
    // Reset so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelected(f);
  }

  async function handleImport() {
    if (!file) return;
    setStep("importing");

    try {
      const token = getAccessToken();
      const formData = new FormData();
      formData.append("file", file);
      const importUrl = new URL(
        "/api/leads/import/csv",
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
      );
      if (selectedListId) {
        importUrl.searchParams.set("list_id", selectedListId);
      }
      const res = await fetch(importUrl.toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        let detail = res.statusText;
        try {
          const body = await res.json();
          detail = body.detail ?? detail;
        } catch {
          // ignore
        }
        if (res.status === 401) {
          setAccessToken(null);
          window.location.href = "/login";
          return;
        }
        throw new Error(detail);
      }

      const result: CSVImportResponse = await res.json();
      setImportResult(result);
      setStep("done");
      if (result.imported > 0) {
        toast.success(`Successfully imported ${result.imported} lead${result.imported !== 1 ? "s" : ""}`);
      }
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} error${result.errors.length !== 1 ? "s" : ""} during import`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
      setStep("preview");
    } finally {
    }
  }

  function resetWizard() {
    setStep("upload");
    setFile(null);
    setCsvHeaders([]);
    setCsvPreviewRows([]);
    setTotalRows(0);
    setMappings({});
    setImportResult(null);
    setSelectedListId("");
    setNewListName("");
  }

  const hasEmailMapping = Object.values(mappings).includes("email");

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import Leads</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a CSV file to import leads into your workspace
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Step Indicators */}
      <div className="flex items-center gap-4">
        {(["upload", "mapping", "preview", "importing"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                step === s || (step === "done" && s === "importing")
                  ? "bg-primary text-primary-foreground"
                  : ["upload", "mapping", "preview", "importing"].indexOf(step) > i ||
                    step === "done"
                  ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {(["upload", "mapping", "preview", "importing"].indexOf(step) > i ||
                step === "done") &&
              step !== s ? (
                <Check className="h-3 w-3" />
              ) : (
                i + 1
              )}
            </div>
            <span className="text-sm font-medium capitalize">
              {s === "importing" ? "Import" : s}
            </span>
            {i < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground ml-2" />}
          </div>
        ))}
      </div>

      {/* Upload Step */}
      {step === "upload" && (
        <>
        {/* List Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select a List</CardTitle>
            <CardDescription>
              Choose an existing list or create a new one for the imported leads
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedListId} onValueChange={setSelectedListId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a list..." />
              </SelectTrigger>
              <SelectContent>
                {leadLists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                    {list.member_count > 0 && ` (${list.member_count} leads)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or create new</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="New list name..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
              />
              <Button
                variant="outline"
                onClick={handleCreateList}
                disabled={!newListName.trim() || creatingList}
              >
                <Plus className="h-4 w-4 mr-1" />
                {creatingList ? "Creating..." : "Create"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* File Upload */}
        <Card className={!selectedListId ? "opacity-50 pointer-events-none" : ""}>
          <CardHeader>
            <CardTitle>Upload CSV File</CardTitle>
            <CardDescription>
              {selectedListId
                ? "Drag and drop your CSV file or click to browse"
                : "Select or create a list above first"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                if (selectedListId) setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                if (selectedListId) handleDrop(e);
                else e.preventDefault();
              }}
              onClick={() => selectedListId && fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Drop your CSV file here</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    or click to browse -- CSV, up to 50MB
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        </>
      )}

      {/* Mapping Step */}
      {step === "mapping" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Map Fields</CardTitle>
                <CardDescription>
                  Match your CSV columns to the system fields.{" "}
                  {file && (
                    <span className="font-medium text-foreground">{file.name}</span>
                  )}{" "}
                  -- {totalRows.toLocaleString()} row{totalRows !== 1 ? "s" : ""} detected
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {csvHeaders.map((col) => (
                <div key={col} className="flex items-center gap-4">
                  <div className="w-48">
                    <Badge variant="outline" className="text-xs">
                      {col}
                    </Badge>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select
                    value={mappings[col] || "skip"}
                    onValueChange={(val) =>
                      setMappings((prev) => ({ ...prev, [col]: val }))
                    }
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_FIELDS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {!hasEmailMapping && (
              <p className="text-sm text-amber-600 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                No column is mapped to Email. The backend will try to auto-detect it.
              </p>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("upload")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={() => setStep("preview")}>
                Continue
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Step */}
      {step === "preview" && (
        <Card>
          <CardHeader>
            <CardTitle>Preview Import</CardTitle>
            <CardDescription>
              Showing first {csvPreviewRows.length} row{csvPreviewRows.length !== 1 ? "s" : ""} with mapped fields
              {selectedListId && (
                <> &mdash; importing to <span className="font-medium text-foreground">{leadLists.find((l) => l.id === selectedListId)?.name}</span></>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {csvHeaders.map((col) => (
                      <TableHead key={col}>
                        <div>
                          <span className="text-xs text-muted-foreground">{col}</span>
                          <br />
                          <Badge variant="secondary" className="text-xs mt-0.5">
                            {"\u2192"}{" "}
                            {SYSTEM_FIELDS.find((f) => f.value === mappings[col])?.label ||
                              "Skip"}
                          </Badge>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvPreviewRows.map((row, i) => (
                    <TableRow key={i}>
                      {csvHeaders.map((_, j) => (
                        <TableCell key={j} className="text-sm">
                          {row[j] ?? ""}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {csvPreviewRows.length} of {totalRows.toLocaleString()} rows shown -- Ready
                to import
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("mapping")}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <Button onClick={handleImport}>
                  Import {totalRows.toLocaleString()} Lead{totalRows !== 1 ? "s" : ""}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Importing Step */}
      {step === "importing" && (
        <Card>
          <CardHeader>
            <CardTitle>Importing Leads...</CardTitle>
            <CardDescription>Please wait while we process your file</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={undefined} className="h-2" />
            <p className="text-sm text-muted-foreground text-center">
              Uploading and processing {totalRows.toLocaleString()} rows...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Done Step */}
      {step === "done" && importResult && (
        <Card>
          <CardHeader>
            <CardTitle>Import Complete!</CardTitle>
            <CardDescription>
              Your CSV file has been processed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={100} className="h-2" />

            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{importResult.imported}</p>
                <p className="text-xs text-muted-foreground mt-1">Imported</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{importResult.skipped}</p>
                <p className="text-xs text-muted-foreground mt-1">Skipped</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-muted-foreground">{importResult.total_rows}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Rows</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
                <p className="text-sm font-medium text-red-700 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  {importResult.errors.length} Error{importResult.errors.length !== 1 ? "s" : ""}
                </p>
                <ul className="text-xs text-red-600 space-y-1 max-h-40 overflow-y-auto">
                  {importResult.errors.map((err, i) => (
                    <li key={i}>- {err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" asChild>
                <a href="/leads">View Leads</a>
              </Button>
              <Button onClick={resetWizard}>Import More</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
