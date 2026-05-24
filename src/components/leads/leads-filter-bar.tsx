import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, RotateCcw, CalendarIcon, ChevronDown, ArrowRight, GitBranch, User as UserIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { StatusRow, LabelRow } from "@/components/leads/lead-detail-sheet";

export const LEAD_SOURCES = [
  "Facebook Lead Form",
  "DoubleTick",
  "Excel Import",
  "Manual Entry",
  "Website Leads",
  "Other Sources",
];

export interface ProfileLite { id: string; full_name: string | null; email: string | null; }

export interface LeadFilters {
  q: string;
  name: string;
  phone: string;
  statusIds: string[];
  labelIds: string[];
  sources: string[];
  assignedTo: string;
  createdBy: string;
  teamId: string;
  dateFrom?: Date;
  dateTo?: Date;
  followFrom?: Date;
  followTo?: Date;
  salesMin: string;
  salesMax: string;
  // movement
  moveFrom: string;
  moveTo: string;
  moveBy: string;
  moveDateFrom?: Date;
  moveDateTo?: Date;
}

export const EMPTY_FILTERS: LeadFilters = {
  q: "", name: "", phone: "",
  statusIds: [], labelIds: [], sources: [],
  assignedTo: "any", createdBy: "any", teamId: "any",
  salesMin: "", salesMax: "",
  moveFrom: "any", moveTo: "any", moveBy: "any",
};

function activeCount(f: LeadFilters): number {
  let n = 0;
  if (f.q) n++; if (f.name) n++; if (f.phone) n++;
  n += f.statusIds.length + f.labelIds.length + f.sources.length;
  if (f.assignedTo !== "any") n++;
  if (f.createdBy !== "any") n++;
  if (f.teamId !== "any") n++;
  if (f.dateFrom || f.dateTo) n++;
  if (f.followFrom || f.followTo) n++;
  if (f.salesMin || f.salesMax) n++;
  if (f.moveFrom !== "any" || f.moveTo !== "any" || f.moveBy !== "any" || f.moveDateFrom || f.moveDateTo) n++;
  return n;
}

export function LeadsFilterBar({
  filters, onChange, statuses, labels, profiles, teams,
}: {
  filters: LeadFilters;
  onChange: (f: LeadFilters) => void;
  statuses: StatusRow[];
  labels: LabelRow[];
  profiles: ProfileLite[];
  teams: { id: string; name: string }[];
}) {
  const count = useMemo(() => activeCount(filters), [filters]);

  function set<K extends keyof LeadFilters>(k: K, v: LeadFilters[K]) { onChange({ ...filters, [k]: v }); }
  function toggleArr(k: "statusIds" | "labelIds" | "sources", v: string) {
    const arr = filters[k];
    onChange({ ...filters, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] });
  }

  return (
    <Card className="sticky top-2 z-30 mt-5 p-3 sm:p-4 shadow-card backdrop-blur bg-card/95">
      {/* Row 1: live search + quick popovers */}
      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Live search: name, email, phone, source…"
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            className="pl-9"
          />
        </div>

        <MultiPopover
          label="Status"
          selected={filters.statusIds}
          options={statuses.map((s) => ({ value: s.id, label: s.name, color: s.color }))}
          onToggle={(v) => toggleArr("statusIds", v)}
          onClear={() => set("statusIds", [])}
        />
        <MultiPopover
          label="Label"
          selected={filters.labelIds}
          options={labels.map((l) => ({ value: l.id, label: l.name, color: l.color }))}
          onToggle={(v) => toggleArr("labelIds", v)}
          onClear={() => set("labelIds", [])}
        />
        <MultiPopover
          label="Source"
          selected={filters.sources}
          options={LEAD_SOURCES.map((s) => ({ value: s, label: s }))}
          onToggle={(v) => toggleArr("sources", v)}
          onClear={() => set("sources", [])}
        />

        <AssignedFilter filters={filters} onChange={onChange} profiles={profiles} />

        <DateFilter filters={filters} onChange={onChange} />

        <MovementFilter filters={filters} onChange={onChange} statuses={statuses} />

        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)} disabled={count === 0} className="gap-1">
          <RotateCcw className="size-4" /> Reset
        </Button>
      </div>

      {count > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {filters.statusIds.map((id) => {
            const s = statuses.find((x) => x.id === id);
            return s && <Chip key={id} color={s.color} onClear={() => toggleArr("statusIds", id)}>Status: {s.name}</Chip>;
          })}
          {filters.labelIds.map((id) => {
            const l = labels.find((x) => x.id === id);
            return l && <Chip key={id} color={l.color} onClear={() => toggleArr("labelIds", id)}>Label: {l.name}</Chip>;
          })}
          {filters.sources.map((s) => <Chip key={s} onClear={() => toggleArr("sources", s)}>Source: {s}</Chip>)}
          {filters.assignedTo !== "any" && (
            <Chip onClear={() => onChange({ ...filters, assignedTo: "any" })}>
              Assigned: {profiles.find((p) => p.id === filters.assignedTo)?.full_name ?? "…"}
            </Chip>
          )}
          {(filters.dateFrom || filters.dateTo) && <Chip onClear={() => onChange({ ...filters, dateFrom: undefined, dateTo: undefined })}>
            Date: {fmt(filters.dateFrom)}–{fmt(filters.dateTo)}
          </Chip>}
          {(filters.moveFrom !== "any" || filters.moveTo !== "any" || filters.moveDateFrom || filters.moveDateTo) && (
            <Chip onClear={() => onChange({ ...filters, moveFrom: "any", moveTo: "any", moveDateFrom: undefined, moveDateTo: undefined })}>
              Moved: {statuses.find((s) => s.id === filters.moveFrom)?.name ?? "Any"} → {statuses.find((s) => s.id === filters.moveTo)?.name ?? "Any"}
              {(filters.moveDateFrom || filters.moveDateTo) && ` · ${fmt(filters.moveDateFrom)}–${fmt(filters.moveDateTo)}`}
            </Chip>
          )}
        </div>
      )}
    </Card>
  );
}

function fmt(d?: Date) { return d ? format(d, "dd MMM") : "…"; }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function AssignedFilter({ filters, onChange, profiles }: { filters: LeadFilters; onChange: (f: LeadFilters) => void; profiles: ProfileLite[] }) {
  const active = filters.assignedTo !== "any";
  const name = profiles.find((p) => p.id === filters.assignedTo)?.full_name;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <UserIcon className="size-4" /> Assigned
          {active && <Badge className="ml-1 h-5 px-1.5">1</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 space-y-3">
        <Field label="Assigned to">
          <UserSelect value={filters.assignedTo} onChange={(v) => onChange({ ...filters, assignedTo: v })} profiles={profiles} />
        </Field>
        {active && (
          <Button variant="ghost" size="sm" className="w-full"
            onClick={() => onChange({ ...filters, assignedTo: "any" })}>
            Clear assigned filter
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function MovementFilter({ filters, onChange, statuses }: { filters: LeadFilters; onChange: (f: LeadFilters) => void; statuses: StatusRow[] }) {
  const active = filters.moveFrom !== "any" || filters.moveTo !== "any" || !!filters.moveDateFrom || !!filters.moveDateTo;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <GitBranch className="size-4" /> Movement
          {active && <Badge className="ml-1 h-5 px-1.5">1</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,460px)] p-4 space-y-3">
        <div>
          <p className="text-sm font-medium mb-1">Status transition</p>
          <p className="text-xs text-muted-foreground mb-3">
            Find leads that moved from one status to another (e.g. Quotation Sent → Lost).
          </p>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <Field label="From">
            <Select value={filters.moveFrom} onValueChange={(v) => onChange({ ...filters, moveFrom: v })}>
              <SelectTrigger><SelectValue placeholder="Any status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any status</SelectItem>
                {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <ArrowRight className="size-4 text-muted-foreground mb-3" />
          <Field label="To">
            <Select value={filters.moveTo} onValueChange={(v) => onChange({ ...filters, moveTo: v })}>
              <SelectTrigger><SelectValue placeholder="Any status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any status</SelectItem>
                {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Moved between (optional)">
          <DateRange from={filters.moveDateFrom} to={filters.moveDateTo}
            onFrom={(d) => onChange({ ...filters, moveDateFrom: d })}
            onTo={(d) => onChange({ ...filters, moveDateTo: d })} />
        </Field>
        {active && (
          <Button variant="ghost" size="sm" className="w-full"
            onClick={() => onChange({ ...filters, moveFrom: "any", moveTo: "any", moveDateFrom: undefined, moveDateTo: undefined })}>
            Clear movement filter
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

function DateFilter({ filters, onChange }: { filters: LeadFilters; onChange: (f: LeadFilters) => void }) {
  const active = !!(filters.dateFrom || filters.dateTo);

  function applyPreset(preset: string) {
    const now = new Date();
    let from: Date | undefined; let to: Date | undefined;
    if (preset === "today") { from = startOfDay(now); to = endOfDay(now); }
    else if (preset === "yesterday") {
      const y = new Date(now); y.setDate(now.getDate() - 1);
      from = startOfDay(y); to = endOfDay(y);
    }
    else if (preset === "7d") {
      const f = new Date(now); f.setDate(now.getDate() - 6);
      from = startOfDay(f); to = endOfDay(now);
    }
    else if (preset === "30d") {
      const f = new Date(now); f.setDate(now.getDate() - 29);
      from = startOfDay(f); to = endOfDay(now);
    }
    else if (preset === "thisMonth") {
      from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      to = endOfDay(now);
    }
    else if (preset === "lastMonth") {
      from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    }
    onChange({ ...filters, dateFrom: from, dateTo: to });
  }

  const presetList: { key: string; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "7d", label: "Last 7 days" },
    { key: "30d", label: "Last 30 days" },
    { key: "thisMonth", label: "This month" },
    { key: "lastMonth", label: "Last month" },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <CalendarIcon className="size-4" /> Date
          {active && <Badge className="ml-1 h-5 px-1.5">1</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,460px)] p-3 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {presetList.map((p) => (
            <Button key={p.key} variant="outline" size="sm" className="h-8 justify-start" onClick={() => applyPreset(p.key)}>
              {p.label}
            </Button>
          ))}
        </div>
        <Field label="Custom range">
          <DateRange from={filters.dateFrom} to={filters.dateTo}
            onFrom={(d) => onChange({ ...filters, dateFrom: d })}
            onTo={(d) => onChange({ ...filters, dateTo: d })} />
        </Field>
        {active && (
          <Button variant="ghost" size="sm" className="w-full"
            onClick={() => onChange({ ...filters, dateFrom: undefined, dateTo: undefined })}>
            Clear date
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Chip({ children, color, onClear }: { children: React.ReactNode; color?: string; onClear: () => void }) {
  return (
    <Badge variant="outline" className="gap-1 pl-2 pr-1 py-0.5 border-0" style={color ? { background: `${color}22`, color } : undefined}>
      <span className="text-xs">{children}</span>
      <button onClick={onClear} className="hover:bg-background/40 rounded p-0.5"><X className="size-3" /></button>
    </Badge>
  );
}

function MultiPopover({ label, options, selected, onToggle, onClear }: {
  label: string;
  options: { value: string; label: string; color?: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 min-w-[110px] justify-between">
          <span>{label}{selected.length > 0 && <Badge className="ml-1.5 h-5 px-1.5">{selected.length}</Badge>}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="max-h-64 overflow-auto space-y-0.5">
          {options.length === 0 && <p className="text-xs text-muted-foreground p-2">No options</p>}
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
              <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => onToggle(o.value)} />
              {o.color && <span className="size-2.5 rounded-full" style={{ background: o.color }} />}
              <span className="flex-1 truncate">{o.label}</span>
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full mt-1" onClick={onClear}>Clear</Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function UserSelect({ value, onChange, profiles }: { value: string; onChange: (v: string) => void; profiles: ProfileLite[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Anyone" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="any">Anyone</SelectItem>
        {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id.slice(0, 8)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function StatusSelect({ value, onChange, statuses }: { value: string; onChange: (v: string) => void; statuses: StatusRow[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Any status" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="any">Any status</SelectItem>
        {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function DateRange({ from, to, onFrom, onTo }: {
  from?: Date; to?: Date; onFrom: (d?: Date) => void; onTo: (d?: Date) => void;
}) {
  return (
    <div className="flex gap-2">
      <DateBtn date={from} placeholder="From" onChange={onFrom} />
      <DateBtn date={to} placeholder="To" onChange={onTo} />
    </div>
  );
}

function DateBtn({ date, placeholder, onChange }: { date?: Date; placeholder: string; onChange: (d?: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("flex-1 justify-start font-normal", !date && "text-muted-foreground")}>
          <CalendarIcon className="size-3.5 mr-1.5" />
          {date ? format(date, "dd MMM yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar mode="single" selected={date} onSelect={onChange} className={cn("p-3 pointer-events-auto")} />
        {date && <div className="p-2 border-t"><Button size="sm" variant="ghost" className="w-full" onClick={() => onChange(undefined)}>Clear</Button></div>}
      </PopoverContent>
    </Popover>
  );
}