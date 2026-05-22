import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasPermission, isAdmin } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, History } from "lucide-react";
import { toast } from "sonner";
import { format, parse as parseDate, isValid } from "date-fns";

export const Route = createFileRoute("/_authenticated/import")({ component: ImportPage });

type FieldKey =
  | "client_name"
  | "phone"
  | "email"
  | "lead_source"
  | "sales_value"
  | "status"
  | "notes"
  | "created_at"
  | "follow_up";

const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: "client_name", label: "Name", required: true },
  { key: "phone", label: "Phone Number", required: true },
  { key: "email", label: "Email" },
  { key: "lead_source", label: "Lead Source" },
  { key: "sales_value", label: "Sales Value" },
  { key: "status", label: "Status (name)" },
  { key: "notes", label: "Notes" },
  { key: "created_at", label: "Created Date (historical)" },
  { key: "follow_up", label: "Follow-up Date" },
];

const SKIP = "__skip__";

type BatchLog = {
  id: string;
  filename: string;
  total_rows: number;
  inserted_count: number;
  duplicate_count: number;
  error_count: number;
  created_at: string;
};

function autoGuess(header: string): FieldKey | typeof SKIP {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/^name|client|fullname|customer/.test(h)) return "client_name";
  if (/phone|mobile|contact|whatsapp/.test(h)) return "phone";
  if (/email|mail/.test(h)) return "email";
  if (/source|campaign|channel/.test(h)) return "lead_source";
  if (/(sales|deal|amount|value|price)/.test(h)) return "sales_value";
  if (/status|stage/.test(h)) return "status";
  if (/note|comment|remark|message/.test(h)) return "notes";
  if (/created|leaddate|date$|enquiry|enquirydate/.test(h)) return "created_at";
  if (/follow|next|reminder/.test(h)) return "follow_up";
  return SKIP;
}

function parseFlexibleDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isValid(v) ? v : null;
  if (typeof v === "number") {
    // Excel serial
    const utcDays = Math.floor(v - 25569);
    const utcMs = utcDays * 86400 * 1000;
    const d = new Date(utcMs + (v - Math.floor(v)) * 86400 * 1000);
    return isValid(d) ? d : null;
  }
  const s = String(v).trim();
  // Try ISO first
  const iso = new Date(s);
  if (isValid(iso) && /\d{4}/.test(s)) return iso;
  const formats = [
    "dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "d-M-yyyy",
    "MM/dd/yyyy", "M/d/yyyy",
    "yyyy-MM-dd", "yyyy/MM/dd",
    "dd/MM/yyyy HH:mm", "dd-MM-yyyy HH:mm",
    "yyyy-MM-dd HH:mm:ss",
  ];
  for (const f of formats) {
    const d = parseDate(s, f, new Date());
    if (isValid(d)) return d;
  }
  return null;
}

function ImportPage() {
  const { user, permissions, roles } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldKey | typeof SKIP>>({});
  const [statuses, setStatuses] = useState<{ id: string; name: string }[]>([]);
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [history, setHistory] = useState<BatchLog[]>([]);
  const canImport = isAdmin(roles) || hasPermission(permissions, "leads.import");

  useEffect(() => { void loadMeta(); }, []);

  async function loadMeta() {
    const [s, l, h] = await Promise.all([
      supabase.from("statuses").select("id, name").order("sort_order"),
      supabase.from("leads").select("phone").not("phone", "is", null),
      supabase.from("import_batches").select("*").order("created_at", { ascending: false }).limit(10),
    ]);
    setStatuses((s.data ?? []) as { id: string; name: string }[]);
      setExistingPhones(new Set((l.data ?? []).map((r: { phone: string | null }) => normalizePhone(r.phone)).filter(Boolean)));
    setHistory((h.data ?? []) as BatchLog[]);
  }

  function normalizePhone(p: unknown): string {
    return String(p ?? "").replace(/\D/g, "");
  }

  function handleFile(file: File) {
    setFilename(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") {
      Papa.parse<Record<string, string>>(file, {
        header: true, skipEmptyLines: true,
        complete: (res) => loadData(res.meta.fields ?? [], res.data),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        const hdrs = json.length > 0 ? Object.keys(json[0]) : [];
        loadData(hdrs, json);
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error("Unsupported file. Use .csv, .xlsx, or .xls");
    }
  }

  function loadData(hdrs: string[], data: Record<string, unknown>[]) {
    setHeaders(hdrs);
    setRows(data);
    const m: Record<string, FieldKey | typeof SKIP> = {};
    hdrs.forEach((h) => { m[h] = autoGuess(h); });
    setMapping(m);
  }

  const preview = useMemo(() => {
    const reverse: Partial<Record<FieldKey, string>> = {};
    Object.entries(mapping).forEach(([col, field]) => {
      if (field !== SKIP) reverse[field as FieldKey] = col;
    });
    return rows.slice(0, 0).concat(rows).map((r) => {
      const out: Record<string, unknown> = {};
      (Object.keys(reverse) as FieldKey[]).forEach((f) => {
        out[f] = r[reverse[f]!];
      });
      return out;
    });
  }, [rows, mapping]);

  const validation = useMemo(() => {
    const seen = new Set<string>();
    let valid = 0, dupExisting = 0, dupInFile = 0, missingRequired = 0;
    for (const r of preview) {
      const name = String(r.client_name ?? "").trim();
      const phone = normalizePhone(r.phone);
      if (!name || !phone) { missingRequired++; continue; }
      if (existingPhones.has(phone)) { dupExisting++; continue; }
      if (seen.has(phone)) { dupInFile++; continue; }
      seen.add(phone);
      valid++;
    }
    return { valid, dupExisting, dupInFile, missingRequired, total: preview.length };
  }, [preview, existingPhones]);

  async function runImport() {
    if (!user) return;
    setImporting(true);
    const statusMap = new Map(statuses.map((s) => [s.name.toLowerCase(), s.id]));
    const seen = new Set<string>();
    type LeadInsert = {
      client_name: string;
      phone: string;
      email: string | null;
      lead_source: string | null;
      sales_value: number | null;
      status_id: string | null;
      created_by: string;
      created_at?: string;
      updated_at?: string;
    };
    const toInsert: Array<{
      payload: LeadInsert;
      notes?: string;
      followUp?: Date;
    }> = [];
    let duplicates = 0;
    const errors: { row: number; reason: string }[] = [];

    preview.forEach((r, i) => {
      const name = String(r.client_name ?? "").trim();
      const phone = normalizePhone(r.phone);
      if (!name || !phone) { errors.push({ row: i + 2, reason: "Missing name or phone" }); return; }
      if (existingPhones.has(phone) || seen.has(phone)) { duplicates++; return; }
      seen.add(phone);
      const createdAt = parseFlexibleDate(r.created_at);
      const followUp = parseFlexibleDate(r.follow_up);
      const salesRaw = r.sales_value;
      const sales = salesRaw === "" || salesRaw == null ? null : Number(String(salesRaw).replace(/[^0-9.-]/g, ""));
      const statusName = String(r.status ?? "").trim().toLowerCase();
      const status_id = statusName ? statusMap.get(statusName) ?? null : null;
      const payload: LeadInsert = {
        client_name: name,
        phone: String(r.phone).trim(),
        email: r.email ? String(r.email).trim() : null,
        lead_source: r.lead_source ? String(r.lead_source).trim() : null,
        sales_value: sales != null && Number.isFinite(sales) ? sales : null,
        status_id,
        created_by: user.id,
      };
      if (createdAt) {
        payload.created_at = createdAt.toISOString();
        payload.updated_at = createdAt.toISOString();
      }
      toInsert.push({
        payload,
        notes: r.notes ? String(r.notes) : undefined,
        followUp: followUp ?? undefined,
      });
    });

    if (toInsert.length === 0) {
      await logBatch(0, duplicates, errors);
      toast.info("No new leads to import");
      setImporting(false);
      return;
    }

    // Batch insert in chunks of 200
    let inserted = 0;
    const insertedIds: { id: string; idx: number }[] = [];
    const chunkSize = 200;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("leads")
        .insert(chunk.map((c) => c.payload))
        .select("id");
      if (error) {
        errors.push({ row: i + 2, reason: error.message });
        continue;
      }
      (data ?? []).forEach((row: { id: string }, j: number) => {
        insertedIds.push({ id: row.id, idx: i + j });
        inserted++;
      });
    }

    // Insert notes & follow-up tasks
    const noteRows = insertedIds
      .filter(({ idx }) => toInsert[idx].notes)
      .map(({ id, idx }) => ({ lead_id: id, content: toInsert[idx].notes!, created_by: user.id }));
    if (noteRows.length > 0) {
      const { error } = await supabase.from("notes").insert(noteRows);
      if (error) errors.push({ row: 0, reason: `Notes: ${error.message}` });
    }

    const taskRows = insertedIds
      .filter(({ idx }) => toInsert[idx].followUp)
      .map(({ id, idx }) => ({
        lead_id: id,
        title: "Follow-up",
        due_date: toInsert[idx].followUp!.toISOString(),
        created_by: user.id,
      }));
    if (taskRows.length > 0) {
      const { error } = await supabase.from("tasks").insert(taskRows);
      if (error) errors.push({ row: 0, reason: `Tasks: ${error.message}` });
    }

    await logBatch(inserted, duplicates, errors);
    toast.success(`Imported ${inserted} leads · ${duplicates} duplicates skipped${errors.length ? ` · ${errors.length} errors` : ""}`);
    setImporting(false);
    setRows([]);
    setHeaders([]);
    setMapping({});
    setFilename("");
    await loadMeta();
  }

  async function logBatch(inserted: number, duplicates: number, errors: { row: number; reason: string }[]) {
    if (!user) return;
    await supabase.from("import_batches").insert({
      user_id: user.id,
      filename,
      total_rows: preview.length,
      inserted_count: inserted,
      duplicate_count: duplicates,
      error_count: errors.length,
      errors: errors.slice(0, 50),
    });
  }

  if (!canImport) {
    return (
      <div className="p-10 max-w-3xl mx-auto">
        <Card className="p-8 text-center">
          <h2 className="font-display text-xl font-semibold">Access restricted</h2>
          <p className="text-sm text-muted-foreground mt-2">You don't have permission to import leads.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Historical Lead Import</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Upload Excel/CSV files. Past dates are preserved exactly — a lead dated May 8 will show as May 8 in reports.
        </p>
      </div>

      <Card className="p-6 shadow-card">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Button onClick={() => fileRef.current?.click()} className="gap-2">
            <Upload className="size-4" /> Choose file
          </Button>
          {filename && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="size-4" />
              <span>{filename}</span>
              <Badge variant="secondary">{rows.length} rows</Badge>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Supports .csv, .xlsx, .xls. Duplicates detected by phone number. Dates accept Excel serials, ISO, dd/MM/yyyy, MM/dd/yyyy.
        </p>
      </Card>

      {headers.length > 0 && (
        <>
          <Card className="mt-6 p-6 shadow-card">
            <h2 className="font-display text-lg font-semibold mb-1">Map columns</h2>
            <p className="text-xs text-muted-foreground mb-4">Match each spreadsheet column to a lead field. Set to "Skip" to ignore.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {headers.map((h) => (
                <div key={h} className="flex items-center gap-2">
                  <Label className="w-1/2 truncate text-sm" title={h}>{h || "(empty)"}</Label>
                  <Select value={mapping[h] ?? SKIP} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v as FieldKey | typeof SKIP }))}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP}>— Skip —</SelectItem>
                      {FIELDS.map((f) => (
                        <SelectItem key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </Card>

          <Card className="mt-6 p-6 shadow-card">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="font-display text-lg font-semibold">Preview & validate</h2>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge className="bg-emerald-500/15 text-emerald-700 border-0"><CheckCircle2 className="size-3 mr-1" />{validation.valid} ready</Badge>
                <Badge className="bg-amber-500/15 text-amber-700 border-0">{validation.dupExisting} existing duplicates</Badge>
                <Badge className="bg-amber-500/15 text-amber-700 border-0">{validation.dupInFile} in-file duplicates</Badge>
                <Badge className="bg-red-500/15 text-red-700 border-0"><AlertTriangle className="size-3 mr-1" />{validation.missingRequired} missing required</Badge>
              </div>
            </div>
            <div className="overflow-auto rounded-lg border max-h-96">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider sticky top-0">
                  <tr>
                    {FIELDS.map((f) => <th key={f.key} className="text-left p-2 font-medium whitespace-nowrap">{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map((r, i) => {
                    const phone = normalizePhone(r.phone);
                    const name = String(r.client_name ?? "").trim();
                    const isDup = phone && existingPhones.has(phone);
                    const missing = !name || !phone;
                    const createdAt = parseFlexibleDate(r.created_at);
                    return (
                      <tr key={i} className={`border-t ${missing ? "bg-red-500/5" : isDup ? "bg-amber-500/5" : ""}`}>
                        {FIELDS.map((f) => {
                          let v: string = "";
                          if (f.key === "created_at") v = createdAt ? format(createdAt, "yyyy-MM-dd HH:mm") : (r.created_at ? String(r.created_at) : "");
                          else if (f.key === "follow_up") { const d = parseFlexibleDate(r.follow_up); v = d ? format(d, "yyyy-MM-dd") : (r.follow_up ? String(r.follow_up) : ""); }
                          else v = r[f.key] == null ? "" : String(r[f.key]);
                          return <td key={f.key} className="p-2 max-w-[180px] truncate" title={v}>{v}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {preview.length > 50 && <p className="text-xs text-muted-foreground mt-2">Showing first 50 of {preview.length} rows.</p>}
            <div className="mt-4 flex justify-end">
              <Button onClick={runImport} disabled={importing || validation.valid === 0} className="gap-2">
                {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Import {validation.valid} leads
              </Button>
            </div>
          </Card>
        </>
      )}

      <Card className="mt-6 p-6 shadow-card">
        <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2"><History className="size-4" /> Import history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-2 font-medium">When</th>
                  <th className="text-left p-2 font-medium">File</th>
                  <th className="text-right p-2 font-medium">Total</th>
                  <th className="text-right p-2 font-medium">Imported</th>
                  <th className="text-right p-2 font-medium">Duplicates</th>
                  <th className="text-right p-2 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="p-2 text-muted-foreground">{format(new Date(b.created_at), "MMM d, HH:mm")}</td>
                    <td className="p-2 truncate max-w-[240px]">{b.filename}</td>
                    <td className="p-2 text-right">{b.total_rows}</td>
                    <td className="p-2 text-right text-emerald-600 font-medium">{b.inserted_count}</td>
                    <td className="p-2 text-right text-amber-600">{b.duplicate_count}</td>
                    <td className="p-2 text-right text-red-600">{b.error_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}