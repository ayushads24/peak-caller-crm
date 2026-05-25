import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Clock,
  AlarmClock,
  CalendarDays,
  ListTodo,
  Phone,
  MessageCircle,
  CalendarClock,
  StickyNote,
  Loader2,
  CalendarRange,
  List as ListIcon,
  AlertTriangle,
} from "lucide-react";
import { isToday, isPast, isFuture, isSameDay } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/my-tasks")({ component: Page });

type Priority = "low" | "medium" | "high";
type Status = "pending" | "in_progress" | "completed";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: Status;
  priority: Priority;
  completed_at: string | null;
  created_at: string;
  created_by: string | null;
  assigned_to: string | null;
  lead_id: string;
}
interface LeadLite {
  id: string;
  client_name: string;
  phone: string | null;
  status_id: string | null;
}
interface StatusLite { id: string; name: string; color: string }
interface ProfileLite { id: string; full_name: string | null; email: string | null }

type FilterKey = "today" | "upcoming" | "overdue" | "completed";

const IST_TZ = "Asia/Kolkata";
const fmtIST = (d: Date | string, pattern: string) => formatInTimeZone(new Date(d), IST_TZ, pattern);
/** Date object whose local Y/M/D/H/M equals the IST wall-clock of `d`. Useful for comparison helpers like isToday/isPast that read local fields. */
const istWall = (d: Date | string) => toZonedTime(new Date(d), IST_TZ);
const nowIST = () => toZonedTime(new Date(), IST_TZ);

const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string }> = {
  high: { label: "High", color: "#dc2626", bg: "#fee2e2" },
  medium: { label: "Medium", color: "#d97706", bg: "#fef3c7" },
  low: { label: "Low", color: "#16a34a", bg: "#dcfce7" },
};

function bucketOf(t: TaskRow): FilterKey | null {
  if (t.status === "completed") return "completed";
  if (!t.due_date) return "upcoming";
  const d = istWall(t.due_date);
  const now = nowIST();
  if (isSameDay(d, now)) return "today";
  if (d.getTime() < now.getTime()) return "overdue";
  if (d.getTime() > now.getTime()) return "upcoming";
  return "upcoming";
}

function Page() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [leads, setLeads] = useState<Map<string, LeadLite>>(new Map());
  const [statuses, setStatuses] = useState<Map<string, StatusLite>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("today");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [active, setActive] = useState<TaskRow | null>(null);

  useEffect(() => {
    if (!user) return;
    void load();
    const ch = supabase
      .channel("my-tasks-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data: ts } = await supabase
      .from("tasks")
      .select("id, title, description, due_date, status, priority, completed_at, created_at, created_by, assigned_to, lead_id")
      .or(`assigned_to.eq.${user.id},and(assigned_to.is.null,created_by.eq.${user.id})`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(500);
    const rows = (ts ?? []) as TaskRow[];
    setTasks(rows);

    const leadIds = Array.from(new Set(rows.map((r) => r.lead_id)));
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.assigned_to, r.created_by]).filter(Boolean) as string[]));

    const [{ data: lds }, { data: sts }, { data: profs }] = await Promise.all([
      leadIds.length
        ? supabase.from("leads").select("id, client_name, phone, status_id").in("id", leadIds)
        : Promise.resolve({ data: [] as LeadLite[] }),
      supabase.from("statuses").select("id, name, color"),
      userIds.length
        ? supabase.from("profiles").select("id, full_name, email").in("id", userIds)
        : Promise.resolve({ data: [] as ProfileLite[] }),
    ]);
    setLeads(new Map(((lds ?? []) as LeadLite[]).map((l) => [l.id, l])));
    setStatuses(new Map(((sts ?? []) as StatusLite[]).map((s) => [s.id, s])));
    setProfiles(new Map(((profs ?? []) as ProfileLite[]).map((p) => [p.id, p])));
    setLoading(false);
  }

  const counts = useMemo(() => {
    const c = { today: 0, upcoming: 0, overdue: 0, completed: 0 } as Record<FilterKey, number>;
    for (const t of tasks) {
      const b = bucketOf(t);
      if (b) c[b]++;
    }
    return c;
  }, [tasks]);

  const filtered = useMemo(() => {
    const arr = tasks.filter((t) => bucketOf(t) === filter);
    arr.sort((a, b) => {
      if (filter === "completed") {
        return new Date(b.completed_at ?? b.created_at).getTime() - new Date(a.completed_at ?? a.created_at).getTime();
      }
      const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return ad - bd;
    });
    return arr;
  }, [tasks, filter]);

  const tasksByDay = useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const key = fmtIST(t.due_date, "yyyy-MM-dd");
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return m;
  }, [tasks]);

  const dayTasks = useMemo(() => {
    return tasks.filter((t) => t.due_date && isSameDay(new Date(t.due_date), selectedDate));
  }, [tasks, selectedDate]);

  const calendarModifiers = useMemo(() => {
    const today: Date[] = [];
    const overdue: Date[] = [];
    const upcoming: Date[] = [];
    const done: Date[] = [];
    for (const [key, arr] of tasksByDay.entries()) {
      const d = new Date(key);
      const hasDone = arr.some((t) => t.status === "completed");
      const hasOverdue = arr.some((t) => t.status !== "completed" && isPast(new Date(t.due_date!)) && !isToday(new Date(t.due_date!)));
      const hasToday = arr.some((t) => t.status !== "completed" && isToday(new Date(t.due_date!)));
      const hasUpcoming = arr.some((t) => t.status !== "completed" && isFuture(new Date(t.due_date!)));
      if (hasOverdue) overdue.push(d);
      else if (hasToday) today.push(d);
      else if (hasUpcoming) upcoming.push(d);
      else if (hasDone) done.push(d);
    }
    return { today, overdue, upcoming, done };
  }, [tasksByDay]);

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">My Tasks</h1>
          <p className="text-muted-foreground text-sm mt-1">Apne assigned tasks ek jagah se manage karo.</p>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as "list" | "calendar")}>
          <TabsList>
            <TabsTrigger value="list"><ListIcon className="size-4 mr-1.5" />List</TabsTrigger>
            <TabsTrigger value="calendar"><CalendarRange className="size-4 mr-1.5" />Calendar</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <CounterCard label="Today" value={counts.today} icon={Clock} tone="today" active={filter === "today"} onClick={() => setFilter("today")} />
        <CounterCard label="Upcoming" value={counts.upcoming} icon={CalendarDays} tone="upcoming" active={filter === "upcoming"} onClick={() => setFilter("upcoming")} />
        <CounterCard label="Overdue" value={counts.overdue} icon={AlarmClock} tone="overdue" active={filter === "overdue"} onClick={() => setFilter("overdue")} />
        <CounterCard label="Completed" value={counts.completed} icon={CheckCircle2} tone="done" active={filter === "completed"} onClick={() => setFilter("completed")} />
      </div>

      {view === "list" ? (
        <Card className="p-2 sm:p-3 shadow-card">
          {loading ? (
            <div className="py-12 grid place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <ListTodo className="size-8 mx-auto mb-2 opacity-50" />
              No tasks in this view.
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  lead={leads.get(t.lead_id)}
                  leadStatus={leads.get(t.lead_id)?.status_id ? statuses.get(leads.get(t.lead_id)!.status_id!) : undefined}
                  assignee={t.assigned_to ? profiles.get(t.assigned_to) : t.created_by ? profiles.get(t.created_by) : undefined}
                  onOpen={() => setActive(t)}
                />
              ))}
            </div>
          )}
        </Card>
      ) : (
        <div className="grid md:grid-cols-[auto,1fr] gap-4">
          <Card className="p-2 shadow-card">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              modifiers={{
                hasOverdue: calendarModifiers.overdue,
                hasToday: calendarModifiers.today,
                hasUpcoming: calendarModifiers.upcoming,
                hasDone: calendarModifiers.done,
              }}
              modifiersClassNames={{
                hasOverdue: "bg-destructive/15 text-destructive font-semibold",
                hasToday: "bg-primary/15 text-primary font-semibold",
                hasUpcoming: "bg-blue-500/10 text-blue-600 font-medium",
                hasDone: "bg-emerald-500/10 text-emerald-600",
              }}
              className={cn("p-3 pointer-events-auto")}
            />
          </Card>
          <Card className="p-3 shadow-card">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="font-display font-semibold">{fmtIST(selectedDate, "EEEE, MMM d")}</h3>
              <Badge variant="secondary">{dayTasks.length} task{dayTasks.length === 1 ? "" : "s"}</Badge>
            </div>
            {dayTasks.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Is din koi task nahi.</div>
            ) : (
              <div className="divide-y">
                {dayTasks.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    lead={leads.get(t.lead_id)}
                    leadStatus={leads.get(t.lead_id)?.status_id ? statuses.get(leads.get(t.lead_id)!.status_id!) : undefined}
                    assignee={t.assigned_to ? profiles.get(t.assigned_to) : t.created_by ? profiles.get(t.created_by) : undefined}
                    onOpen={() => setActive(t)}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <TaskActionsDialog
        task={active}
        lead={active ? leads.get(active.lead_id) : undefined}
        onClose={() => setActive(null)}
        onChanged={() => void load()}
      />
    </div>
  );
}

function CounterCard({
  label, value, icon: Icon, tone, active, onClick,
}: {
  label: string; value: number; icon: typeof Clock;
  tone: "today" | "upcoming" | "overdue" | "done"; active: boolean; onClick: () => void;
}) {
  const toneClass =
    tone === "overdue" ? "from-destructive/15 to-destructive/5 text-destructive border-destructive/30"
    : tone === "today" ? "from-primary/15 to-primary/5 text-primary border-primary/30"
    : tone === "upcoming" ? "from-blue-500/15 to-blue-500/5 text-blue-600 border-blue-500/30"
    : "from-emerald-500/15 to-emerald-500/5 text-emerald-600 border-emerald-500/30";
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border bg-gradient-to-br p-4 transition-all hover:shadow-card",
        toneClass,
        active ? "ring-2 ring-offset-1 ring-current shadow-card" : "opacity-90 hover:opacity-100",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        <Icon className="size-4" />
      </div>
      <div className="font-display text-3xl font-bold mt-1">{value}</div>
    </button>
  );
}

function TaskItem({
  task, lead, leadStatus, assignee, onOpen,
}: {
  task: TaskRow;
  lead?: LeadLite;
  leadStatus?: StatusLite;
  assignee?: ProfileLite;
  onOpen: () => void;
}) {
  const due = task.due_date ? new Date(task.due_date) : null;
  const isOverdue = task.status !== "completed" && due && isPast(due) && !isToday(due);
  const isDueToday = task.status !== "completed" && due && isToday(due);
  const prio = PRIORITY_META[task.priority];

  function call(e: React.MouseEvent) {
    e.stopPropagation();
    if (!lead?.phone) return toast.error("No phone number on lead");
    window.location.href = `tel:${lead.phone}`;
  }
  function whatsapp(e: React.MouseEvent) {
    e.stopPropagation();
    if (!lead?.phone) return toast.error("No phone number on lead");
    const phone = lead.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}`, "_blank");
  }

  return (
    <div
      onClick={onOpen}
      className={cn(
        "p-3 sm:p-4 hover:bg-muted/40 cursor-pointer transition-colors rounded-lg",
        isOverdue && "bg-destructive/[0.04] hover:bg-destructive/[0.08]",
        isDueToday && "bg-primary/[0.04] hover:bg-primary/[0.08]",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            {(isOverdue || isDueToday) && (
              <span className={cn(
                "inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded",
                isOverdue ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary",
              )}>
                {isOverdue ? <><AlertTriangle className="size-3" />Overdue</> : <><Clock className="size-3" />Today</>}
              </span>
            )}
            <h4 className={cn("font-semibold text-sm truncate", task.status === "completed" && "line-through text-muted-foreground")}>
              {task.title}
            </h4>
            <span
              className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
              style={{ backgroundColor: prio.bg, color: prio.color }}
            >
              {prio.label}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {lead && <span className="font-medium text-foreground">{lead.client_name}</span>}
            {leadStatus && (
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: leadStatus.color }} />
                {leadStatus.name}
              </span>
            )}
            {due && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3" />
                {fmtIST(due, "MMM d, h:mm a")} IST
              </span>
            )}
            {assignee && (
              <span className="truncate">@ {assignee.full_name ?? assignee.email}</span>
            )}
          </div>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 whitespace-pre-wrap">{task.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" onClick={call} title="Call" className="size-8">
            <Phone className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={whatsapp} title="WhatsApp" className="size-8 text-emerald-600 hover:text-emerald-700">
            <MessageCircle className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskActionsDialog({
  task, lead, onClose, onChanged,
}: {
  task: TaskRow | null;
  lead?: LeadLite;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [reschedDate, setReschedDate] = useState<string>("");
  const [reschedTime, setReschedTime] = useState<string>("");
  const [priority, setPriority] = useState<Priority>("medium");

  useEffect(() => {
    if (task) {
      setNote("");
      setPriority(task.priority);
      if (task.due_date) {
        setReschedDate(fmtIST(task.due_date, "yyyy-MM-dd"));
        setReschedTime(fmtIST(task.due_date, "HH:mm"));
      } else {
        setReschedDate("");
        setReschedTime("");
      }
    }
  }, [task]);

  if (!task) return null;

  async function complete() {
    if (!task) return;
    setBusy(true);
    const { error } = await supabase
      .from("tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", task.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Task marked complete");
    onChanged();
    onClose();
  }

  async function reschedule() {
    if (!task) return;
    if (!reschedDate) return toast.error("Pick a date");
    // Interpret the picker values as IST wall-clock, then convert to UTC ISO.
    const iso = fromZonedTime(`${reschedDate}T${reschedTime || "09:00"}:00`, IST_TZ).toISOString();
    setBusy(true);
    const { error } = await supabase
      .from("tasks")
      .update({ due_date: iso, status: task.status === "completed" ? "pending" : task.status })
      .eq("id", task.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Task rescheduled");
    onChanged();
    onClose();
  }

  async function savePriority(p: Priority) {
    if (!task) return;
    setPriority(p);
    const { error } = await supabase.from("tasks").update({ priority: p }).eq("id", task.id);
    if (error) toast.error(error.message);
    else { toast.success("Priority updated"); onChanged(); }
  }

  async function addNote() {
    if (!task || !user) return;
    if (!note.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("notes")
      .insert({ lead_id: task.lead_id, content: note.trim(), created_by: user.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Note added to lead");
    setNote("");
    onChanged();
  }

  function call() {
    if (!lead?.phone) return toast.error("No phone number");
    window.location.href = `tel:${lead.phone}`;
  }
  function whatsapp() {
    if (!lead?.phone) return toast.error("No phone number");
    const phone = lead.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}`, "_blank");
  }

  return (
    <Dialog open={!!task} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{task.title}</DialogTitle>
          {lead && <p className="text-sm text-muted-foreground">{lead.client_name}{lead.phone ? ` · ${lead.phone}` : ""}</p>}
        </DialogHeader>

        {task.description && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{task.description}</div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={call} variant="outline" size="sm"><Phone className="size-4 mr-1.5" />Call</Button>
          <Button onClick={whatsapp} variant="outline" size="sm" className="text-emerald-600 hover:text-emerald-700"><MessageCircle className="size-4 mr-1.5" />WhatsApp</Button>
          {task.status !== "completed" && (
            <Button onClick={complete} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy}>
              <CheckCircle2 className="size-4 mr-1.5" />Mark complete
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority</label>
          <Select value={priority} onValueChange={(v) => savePriority(v as Priority)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <CalendarClock className="size-3.5" /> Reschedule
          </label>
          <div className="flex gap-2">
            <Input type="date" value={reschedDate} onChange={(e) => setReschedDate(e.target.value)} className="flex-1" />
            <Input type="time" value={reschedTime} onChange={(e) => setReschedTime(e.target.value)} className="w-32" />
            <Button onClick={reschedule} disabled={busy} variant="outline">Save</Button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <StickyNote className="size-3.5" /> Add note to lead
          </label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Type a note..." rows={3} />
          <div className="flex justify-end">
            <Button onClick={addNote} disabled={busy || !note.trim()} size="sm">Add note</Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Keep popover import in use to avoid tree-shake warnings if added later.
void Popover; void PopoverContent; void PopoverTrigger;