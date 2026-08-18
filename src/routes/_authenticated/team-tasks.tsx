import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAndroidBack } from "@/hooks/use-android-back";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { MultiUserSelect } from "@/components/multi-user-select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  ClipboardList,
  CheckCircle2,
  Send,
  Play,
  Clock,
  CalendarClock,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/team-tasks")({
  component: TeamTasksPage,
});

type Status = "pending" | "in_progress" | "submitted" | "done";
type Priority = "low" | "medium" | "high";
type DateFilter = "all" | "today" | "week";

interface TeamTask {
  id: string;
  title: string;
  description: string | null;
  lead_id: string | null;
  created_by: string;
  assigned_to: string;
  status: Status;
  priority: Priority;
  due_date: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface LeadLite {
  id: string;
  client_name: string;
  phone: string | null;
}

interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  pending:     { label: "Pending",     color: "#6b7280", bg: "#f3f4f6" },
  in_progress: { label: "In Progress", color: "#2563eb", bg: "#dbeafe" },
  submitted:   { label: "Submitted",   color: "#d97706", bg: "#fef3c7" },
  done:        { label: "Done",        color: "#16a34a", bg: "#dcfce7" },
};

const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string }> = {
  high:   { label: "High",   color: "#dc2626", bg: "#fee2e2" },
  medium: { label: "Medium", color: "#d97706", bg: "#fef3c7" },
  low:    { label: "Low",    color: "#16a34a", bg: "#dcfce7" },
};

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function pname(profiles: Map<string, Profile>, id: string | null) {
  if (!id) return "Unknown";
  const p = profiles.get(id);
  return p?.full_name || p?.email || "Unknown";
}

function TeamTasksPage() {
  const { user } = useAuth();

  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [leads, setLeads] = useState<Map<string, LeadLite>>(new Map());
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<TeamTask | null>(null);
  useAndroidBack(activeTask !== null, () => setActiveTask(null));

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const headers = await authHeaders();
    const res = await fetch("/api/team-tasks", { headers });
    if (!res.ok) { setLoading(false); return; }
    const json = await res.json() as { tasks: TeamTask[]; profiles: Profile[]; leads: LeadLite[] };
    setTasks(json.tasks);
    setProfiles(new Map(json.profiles.map((p) => [p.id, p])));
    setLeads(new Map(json.leads.map((l) => [l.id, l])));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("team-tasks-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "team_tasks" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "team_task_comments" }, () => {
        if (activeTask) setActiveTask((t) => t ? { ...t } : null);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user]);

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any).from("profiles").select("id,full_name,email").order("full_name");
      setAllProfiles((data ?? []) as Profile[]);
    })();
  }, []);

  useEffect(() => {
    if (activeTask) {
      const updated = tasks.find((t) => t.id === activeTask.id);
      if (updated) setActiveTask(updated);
    }
  }, [tasks]);

  const now = new Date();

  function matchesMember(t: TeamTask) {
    if (selectedMembers.length === 0) return true;
    return selectedMembers.includes(t.assigned_to);
  }

  function matchesDate(t: TeamTask) {
    if (dateFilter === "all") return true;
    if (!t.due_date) return false;
    const due = new Date(t.due_date);
    if (dateFilter === "today") return due.toDateString() === now.toDateString();
    if (dateFilter === "week") {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return due >= now && due <= weekEnd;
    }
    return true;
  }

  // Overdue: past due, not done, matches member filter — always shown separately when statusFilter=all
  const overdueTasks = tasks.filter(
    (t) => t.status !== "done" && t.due_date && new Date(t.due_date) < now && matchesMember(t)
  );

  // Main list: applies all filters; when showing "all" statuses, overdue tasks go to the separate section above
  const filteredTasks = tasks.filter((t) => {
    if (!matchesMember(t)) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (!matchesDate(t)) return false;
    if (statusFilter === "all" && t.status !== "done" && t.due_date && new Date(t.due_date) < now) return false;
    return true;
  });

  // Counts (member-filtered, date-agnostic)
  const memberTasks = tasks.filter(matchesMember);
  const counts: Record<"all" | Status, number> = {
    all:         memberTasks.length,
    pending:     memberTasks.filter((t) => t.status === "pending").length,
    in_progress: memberTasks.filter((t) => t.status === "in_progress").length,
    submitted:   memberTasks.filter((t) => t.status === "submitted").length,
    done:        memberTasks.filter((t) => t.status === "done").length,
  };

  const STATUS_TABS: Array<{ value: "all" | Status; label: string }> = [
    { value: "all",         label: "All" },
    { value: "pending",     label: "Pending" },
    { value: "in_progress", label: "In Progress" },
    { value: "submitted",   label: "Submitted" },
    { value: "done",        label: "Done" },
  ];

  const DATE_BUTTONS: Array<{ value: DateFilter; label: string }> = [
    { value: "all",   label: "All Dates" },
    { value: "today", label: "Today" },
    { value: "week",  label: "This Week" },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-5xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Team Tasks</h1>
          <p className="text-muted-foreground text-sm mt-1">Assign karo, track karo, done karo.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-gradient-primary">
          <Plus className="size-4 mr-1.5" />New Task
        </Button>
      </div>

      {/* Status tabs */}
      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | Status)} className="mb-3">
        <TabsList className="flex-wrap h-auto gap-0.5">
          {STATUS_TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="text-xs">
              {label}
              <Badge variant="secondary" className="ml-1.5 text-[10px]">{counts[value]}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="min-w-[180px] flex-1 max-w-xs">
          <MultiUserSelect
            profiles={allProfiles}
            selected={selectedMembers}
            onChange={setSelectedMembers}
            placeholder="Filter by member..."
          />
        </div>
        <div className="flex gap-1">
          {DATE_BUTTONS.map(({ value, label }) => (
            <Button
              key={value}
              size="sm"
              variant={dateFilter === value ? "default" : "outline"}
              onClick={() => setDateFilter(value)}
              className="text-xs h-8"
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Overdue section — only when viewing all statuses */}
      {statusFilter === "all" && overdueTasks.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-red-500" />
            <span className="text-sm font-semibold text-red-600">Overdue ({overdueTasks.length})</span>
          </div>
          <Card className="border-red-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-red-100">
              {overdueTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  profiles={profiles}
                  lead={t.lead_id ? leads.get(t.lead_id) : undefined}
                  isMe={user?.id === t.assigned_to}
                  onOpen={() => setActiveTask(t)}
                />
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Main task list */}
      <Card className="shadow-card">
        {loading ? (
          <div className="py-16 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <ClipboardList className="size-8 mx-auto mb-2 opacity-40" />
            Koi task nahi.
          </div>
        ) : (
          <div className="divide-y">
            {filteredTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                profiles={profiles}
                lead={t.lead_id ? leads.get(t.lead_id) : undefined}
                isMe={user?.id === t.assigned_to}
                onOpen={() => setActiveTask(t)}
              />
            ))}
          </div>
        )}
      </Card>

      <CreateTaskDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        profiles={allProfiles}
        onCreated={() => { setCreateOpen(false); void load(); }}
      />

      {activeTask && (
        <TaskDetailSheet
          task={activeTask}
          profiles={profiles}
          lead={activeTask.lead_id ? leads.get(activeTask.lead_id) : undefined}
          currentUserId={user?.id ?? ""}
          onClose={() => setActiveTask(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}

function TaskCard({
  task, profiles, lead, isMe, onOpen,
}: {
  task: TeamTask;
  profiles: Map<string, Profile>;
  lead?: LeadLite;
  isMe: boolean;
  onOpen: () => void;
}) {
  const sm = STATUS_META[task.status];
  const pm = PRIORITY_META[task.priority];
  const now = new Date();
  const due = task.due_date ? new Date(task.due_date) : null;
  const isOverdue  = task.status !== "done" && due && due < now;
  const isDueToday = task.status !== "done" && due && !isOverdue &&
    due.toDateString() === now.toDateString();

  return (
    <div
      onClick={onOpen}
      className={cn(
        "p-4 hover:bg-muted/40 cursor-pointer transition-colors",
        task.status === "submitted" && "bg-amber-50/60 dark:bg-amber-950/10",
        isOverdue  && "bg-red-50/60 dark:bg-red-950/10",
        isDueToday && "bg-amber-50/60 dark:bg-amber-950/10",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{ backgroundColor: sm.bg, color: sm.color }}
            >
              {sm.label}
            </span>
            <span
              className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{ backgroundColor: pm.bg, color: pm.color }}
            >
              {pm.label}
            </span>
            {isOverdue && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-600 flex items-center gap-1">
                <AlertTriangle className="size-3" />Overdue
              </span>
            )}
            {isDueToday && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 flex items-center gap-1">
                <Clock className="size-3" />Due Today
              </span>
            )}
          </div>
          <p className={cn("font-semibold text-sm", task.status === "done" && "line-through text-muted-foreground")}>
            {task.title}
          </p>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {lead && <span className="font-medium text-foreground">{lead.client_name}</span>}
            <span>Assigned to: <span className="font-medium text-foreground">{pname(profiles, task.assigned_to)}</span></span>
            <span>By: {pname(profiles, task.created_by)}</span>
            {task.due_date && (
              <span className={cn("flex items-center gap-1", isOverdue && "text-red-600 font-medium", isDueToday && "text-amber-600 font-medium")}>
                <CalendarClock className="size-3" />
                {format(new Date(task.due_date), "d MMM yyyy, h:mm a")}
              </span>
            )}
          </div>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">{task.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateTaskDialog({
  open, onClose, profiles, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  profiles: Profile[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle(""); setDesc(""); setAssignedTo(""); setPriority("medium"); setDueDate("");
    }
  }, [open]);

  async function submit() {
    if (!title.trim()) return toast.error("Title required");
    if (!assignedTo) return toast.error("Please select someone to assign");
    setBusy(true);
    const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
    const res = await fetch("/api/team-tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: title.trim(),
        description: desc.trim() || null,
        assigned_to: assignedTo,
        priority,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
      }),
    });
    setBusy(false);
    if (!res.ok) return toast.error(await res.text());
    toast.success("Task created");
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">New Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Title *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Description</label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Details..." rows={3} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Assign To *</label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email || p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Priority</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Due Date</label>
              <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-gradient-primary">
            {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Plus className="size-4 mr-1.5" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskDetailSheet({
  task, profiles, lead, currentUserId, onClose, onChanged,
}: {
  task: TeamTask;
  profiles: Map<string, Profile>;
  lead?: LeadLite;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentProfiles, setCommentProfiles] = useState<Map<string, Profile>>(new Map());
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitNote, setSubmitNote] = useState("");
  const [doneDialogOpen, setDoneDialogOpen] = useState(false);
  const [doneNote, setDoneNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isAssignee = task.assigned_to === currentUserId;
  const isCreator  = task.created_by === currentUserId;

  const loadComments = useCallback(async () => {
    const headers = await authHeaders();
    const res = await fetch(`/api/team-task-comment?task_id=${task.id}`, { headers });
    if (!res.ok) return;
    const json = await res.json() as { comments: Comment[]; profiles: Profile[] };
    setComments(json.comments);
    setCommentProfiles(new Map(json.profiles.map((p) => [p.id, p])));
  }, [task.id]);

  useEffect(() => {
    void loadComments();
    // Realtime for comments
    const ch = supabase
      .channel(`task-comments-${task.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_task_comments", filter: `task_id=eq.${task.id}` }, () => void loadComments())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [task.id, loadComments]);

  async function addComment() {
    if (!commentText.trim()) return;
    setBusy(true);
    const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
    const res = await fetch("/api/team-task-comment", {
      method: "POST",
      headers,
      body: JSON.stringify({ task_id: task.id, content: commentText.trim() }),
    });
    setBusy(false);
    if (!res.ok) return toast.error(await res.text());
    setCommentText("");
    void loadComments();
  }

  async function deleteTask() {
    setBusy(true);
    const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
    const res = await fetch("/api/team-tasks", {
      method: "DELETE",
      headers,
      body: JSON.stringify({ id: task.id }),
    });
    setBusy(false);
    if (!res.ok) return toast.error(await res.text());
    toast.success("Task deleted");
    onClose();
    onChanged();
  }

  async function updateStatus(status: Status, comment?: string) {
    setBusy(true);
    const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
    const res = await fetch("/api/team-task-update", {
      method: "POST",
      headers,
      body: JSON.stringify({ id: task.id, status, comment }),
    });
    setBusy(false);
    if (!res.ok) return toast.error(await res.text());
    toast.success(status === "done" ? "Task marked done!" : `Status updated to ${STATUS_META[status].label}`);
    onChanged();
    void loadComments();
  }

  const sm = STATUS_META[task.status];
  const pm = PRIORITY_META[task.priority];

  return (
    <>
      <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
          <SheetHeader className="px-4 pt-4 pb-3 border-b">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ backgroundColor: sm.bg, color: sm.color }}>
                {sm.label}
              </span>
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ backgroundColor: pm.bg, color: pm.color }}>
                {pm.label}
              </span>
              {isCreator && (
                <div className="ml-auto flex items-center gap-1">
                  {confirmDelete ? (
                    <>
                      <Button size="sm" variant="destructive" onClick={deleteTask} disabled={busy} className="h-7 text-xs px-2">
                        Confirm?
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} className="h-7 text-xs px-2">
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
            <SheetTitle className="font-display text-base leading-snug">{task.title}</SheetTitle>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 mt-1">
              <span>Assigned to: <strong>{pname(profiles, task.assigned_to)}</strong></span>
              <span>By: <strong>{pname(profiles, task.created_by)}</strong></span>
              {task.due_date && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />{format(new Date(task.due_date), "d MMM yyyy, h:mm a")}
                </span>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* Lead link */}
            {lead && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">{lead.client_name}</span>
                {lead.phone && <span className="text-muted-foreground">{lead.phone}</span>}
                <Link
                  to="/leads/$leadId"
                  params={{ leadId: task.lead_id! }}
                  onClick={onClose}
                  className="ml-auto text-primary hover:underline flex items-center gap-1 text-xs"
                >
                  <ExternalLink className="size-3" />View Lead
                </Link>
              </div>
            )}

            {/* Description */}
            {task.description && (
              <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-sm whitespace-pre-wrap">
                {task.description}
              </div>
            )}

            {/* Action buttons based on status + role */}
            <div className="flex flex-wrap gap-2">
              {isAssignee && task.status === "pending" && (
                <Button onClick={() => updateStatus("in_progress")} disabled={busy} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Play className="size-4 mr-1.5" />Start
                </Button>
              )}
              {isAssignee && task.status === "in_progress" && (
                <Button onClick={() => setSubmitDialogOpen(true)} disabled={busy} size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                  <Send className="size-4 mr-1.5" />Submit
                </Button>
              )}
              {isCreator && task.status === "submitted" && (
                <Button onClick={() => setDoneDialogOpen(true)} disabled={busy} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle2 className="size-4 mr-1.5" />Mark Done
                </Button>
              )}
              {task.status === "done" && (
                <div className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                  <CheckCircle2 className="size-4" />
                  Done by {pname(profiles, task.reviewed_by)} · {task.reviewed_at ? format(new Date(task.reviewed_at), "d MMM yyyy") : ""}
                </div>
              )}
            </div>

            {/* Comment thread */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                <MessageSquare className="size-3.5" />Comments ({comments.length})
              </div>
              {comments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Koi comment nahi abhi.</p>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => {
                    const author = commentProfiles.get(c.user_id);
                    const isOwn = c.user_id === currentUserId;
                    return (
                      <div key={c.id} className={cn("flex flex-col gap-1", isOwn && "items-end")}>
                        <div className={cn(
                          "max-w-[80%] rounded-xl px-3 py-2 text-sm",
                          isOwn
                            ? "bg-primary text-primary-foreground rounded-br-none"
                            : "bg-muted rounded-bl-none",
                        )}>
                          {c.content}
                        </div>
                        <span className="text-[10px] text-muted-foreground px-1">
                          {author?.full_name || author?.email || "Unknown"} · {format(new Date(c.created_at), "d MMM, h:mm a")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Comment input */}
          <div className="px-4 py-3 border-t flex gap-2">
            <Textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Comment likho..."
              rows={2}
              className="flex-1 resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void addComment(); }
              }}
            />
            <Button onClick={addComment} disabled={busy || !commentText.trim()} size="sm" className="self-end">
              <Send className="size-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Submit dialog */}
      <Dialog open={submitDialogOpen} onOpenChange={(v) => { if (!v) setSubmitDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Submit Task</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Kya kiya, koi note add karo (required).</p>
          <Textarea
            value={submitNote}
            onChange={(e) => setSubmitNote(e.target.value)}
            placeholder="Submission note..."
            rows={4}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSubmitDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!submitNote.trim() || busy}
              onClick={async () => {
                await updateStatus("submitted", submitNote.trim());
                setSubmitDialogOpen(false);
                setSubmitNote("");
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Send className="size-4 mr-1.5" />Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark done dialog */}
      <Dialog open={doneDialogOpen} onOpenChange={(v) => { if (!v) setDoneDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Mark as Done</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Review ke baad done mark karo. Optional note likhna.</p>
          <Textarea
            value={doneNote}
            onChange={(e) => setDoneNote(e.target.value)}
            placeholder="Review note (optional)..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDoneDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                await updateStatus("done", doneNote.trim() || undefined);
                setDoneDialogOpen(false);
                setDoneNote("");
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="size-4 mr-1.5" />Mark Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
