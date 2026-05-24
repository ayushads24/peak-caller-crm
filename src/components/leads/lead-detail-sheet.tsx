import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Mail,
  Phone,
  Trash2,
  Plus,
  Check,
  MessageSquare,
  ListTodo,
  Activity as ActivityIcon,
  X,
  Tag,
  MessageCircle,
  ChevronRight,
  ChevronLeft,
  MoreHorizontal,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export interface LeadRow {
  id: string;
  client_name: string;
  email: string | null;
  phone: string | null;
  sales_value: number | null;
  lead_source: string | null;
  status_id: string | null;
  created_at: string;
  assigned_to?: string | null;
  created_by?: string | null;
}

export interface StatusRow {
  id: string;
  name: string;
  color: string;
  is_sales: boolean;
  is_lost: boolean;
}
export interface LabelRow {
  id: string;
  name: string;
  color: string;
}
export interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
}

export function LeadDetailSheet({
  lead,
  statuses,
  labels,
  profiles = [],
  open,
  onOpenChange,
  onChanged,
  onNext,
  onPrev,
}: {
  lead: LeadRow | null;
  statuses: StatusRow[];
  labels: LabelRow[];
  profiles?: ProfileLite[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<{ id: string; content: string; created_at: string }[]>([]);
  const [tasks, setTasks] = useState<
    {
      id: string;
      title: string;
      status: string;
      due_date: string | null;
      assigned_to: string | null;
    }[]
  >([]);
  const [activities, setActivities] = useState<
    { id: string; description: string; created_at: string; type: string }[]
  >([]);
  const [leadLabelIds, setLeadLabelIds] = useState<string[]>([]);
  const [noteText, setNoteText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<string>("");
  const [edit, setEdit] = useState<LeadRow | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async () => {
    if (!edit) return;
    setSaving(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const { error } = await supabase
      .from("leads")
      .update({
        client_name: edit.client_name,
        email: edit.email,
        phone: edit.phone,
        sales_value: edit.sales_value,
        lead_source: edit.lead_source,
        status_id: edit.status_id,
        assigned_to: edit.assigned_to ?? null,
      })
      .eq("id", edit.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lead updated");
    onChanged();
    void loadRelated(edit.id);
  }, [edit, onChanged]);

  useEffect(() => {
    setEdit(lead);
    if (lead) void loadRelated(lead.id);
  }, [lead]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight" && onNext) onNext();
      if (e.key === "ArrowLeft" && onPrev) onPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onNext, onPrev]);

  async function loadRelated(id: string) {
    const [n, t, a, ll] = await Promise.all([
      supabase
        .from("notes")
        .select("id, content, created_at")
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("id, title, status, due_date, assigned_to")
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("activities")
        .select("id, description, created_at, type")
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("lead_labels").select("label_id").eq("lead_id", id),
    ]);
    setNotes(n.data ?? []);
    setTasks((t.data ?? []) as typeof tasks);
    setActivities((a.data ?? []) as typeof activities);
    setLeadLabelIds((ll.data ?? []).map((r: { label_id: string }) => r.label_id));
  }

  if (!lead || !edit) return null;

  /* Auto-save when edit diverges from lead */
  useEffect(() => {
    if (!edit || !lead) return;
    const changed =
      edit.client_name !== lead.client_name ||
      edit.email !== lead.email ||
      edit.phone !== lead.phone ||
      edit.sales_value !== lead.sales_value ||
      edit.lead_source !== lead.lead_source ||
      edit.status_id !== lead.status_id ||
      edit.assigned_to !== lead.assigned_to;
    if (!changed) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void save();
    }, 1200);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [edit, lead, save]);

  async function addNote() {
    if (!noteText.trim() || !user) return;
    const { error } = await supabase
      .from("notes")
      .insert({ lead_id: lead!.id, content: noteText, created_by: user.id });
    if (error) return toast.error(error.message);
    setNoteText("");
    void loadRelated(lead!.id);
  }

  async function addTask() {
    if (!taskTitle.trim() || !user) return;
    const { error } = await supabase.from("tasks").insert({
      lead_id: lead!.id,
      title: taskTitle,
      created_by: user.id,
      status: "pending",
      due_date: taskDue ? new Date(taskDue).toISOString() : null,
      assigned_to: taskAssignee || null,
    });
    if (error) return toast.error(error.message);
    setTaskTitle("");
    setTaskDue("");
    setTaskAssignee("");
    void loadRelated(lead!.id);
  }

  async function toggleTask(id: string, status: string) {
    const next = status === "completed" ? "pending" : "completed";
    const { error } = await supabase
      .from("tasks")
      .update({
        status: next,
        completed_at: next === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    void loadRelated(lead!.id);
  }

  async function deleteLead() {
    if (!confirm("Delete this lead permanently?")) return;
    const { error } = await supabase.from("leads").delete().eq("id", lead!.id);
    if (error) return toast.error(error.message);
    toast.success("Lead deleted");
    onOpenChange(false);
    onChanged();
  }

  async function addLabel(labelId: string) {
    if (!labelId || leadLabelIds.includes(labelId)) return;
    const { error } = await supabase
      .from("lead_labels")
      .insert({ lead_id: lead!.id, label_id: labelId });
    if (error) return toast.error(error.message);
    setLeadLabelIds((ids) => [...ids, labelId]);
    onChanged();
  }

  async function removeLabel(labelId: string) {
    const { error } = await supabase
      .from("lead_labels")
      .delete()
      .eq("lead_id", lead!.id)
      .eq("label_id", labelId);
    if (error) return toast.error(error.message);
    setLeadLabelIds((ids) => ids.filter((i) => i !== labelId));
    onChanged();
  }

  const status = statuses.find((s) => s.id === edit.status_id);
  const assignedLabels = labels.filter((l) => leadLabelIds.includes(l.id));
  const availableLabels = labels.filter((l) => !leadLabelIds.includes(l.id));
  const cleanPhone = (edit.phone ?? "").replace(/\D/g, "");
  const assignedProfile = profiles.find((p) => p.id === edit.assigned_to);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl lg:max-w-5xl overflow-hidden p-0 flex flex-col">
        {/* Sticky header */}
        <SheetHeader className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b px-5 pt-5 pb-3 space-y-3">
          <SheetTitle asChild>
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={edit.client_name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-display text-xl truncate">{edit.client_name}</span>
                  {status && (
                    <Badge
                      style={{
                        background: `${status.color}1a`,
                        color: status.color,
                        borderColor: `${status.color}33`,
                      }}
                      className="border font-medium"
                    >
                      {status.name}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  Created {formatDistanceToNow(new Date(edit.created_at), { addSuffix: true })}
                  {assignedProfile && (
                    <> · Owner: {assignedProfile.full_name || assignedProfile.email}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={onPrev}
                  disabled={!onPrev}
                  title="Previous (←)"
                >
                  <ChevronLeft className="size-3.5 mr-1" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={onNext}
                  disabled={!onNext}
                  title="Next (→)"
                >
                  Next
                  <ChevronRight className="size-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </SheetTitle>

          {/* Quick actions row */}
          <div className="flex items-center gap-2">
            <div className="grid grid-cols-3 gap-1.5 flex-1">
              <QuickAction
                href={edit.phone ? `tel:${edit.phone}` : undefined}
                icon={<Phone className="size-3.5" />}
                label="Call"
                tone="text-sky-600"
              />
              <QuickAction
                href={cleanPhone ? `https://wa.me/${cleanPhone}` : undefined}
                external
                icon={<MessageCircle className="size-3.5" />}
                label="WhatsApp"
                tone="text-emerald-600"
              />
              <QuickAction
                href={edit.email ? `mailto:${edit.email}` : undefined}
                icon={<Mail className="size-3.5" />}
                label="Email"
                tone="text-indigo-600"
              />
            </div>
            {saving && (
              <span className="text-[10px] text-muted-foreground animate-pulse">
                Saving…
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={deleteLead}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4 mr-2" />
                  Delete lead
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SheetHeader>

        {/* Two-column body */}
        <div className="grid lg:grid-cols-[1fr_380px] flex-1 overflow-hidden">
          {/* LEFT: form */}
          <div className="overflow-y-auto px-5 py-5 space-y-6 lg:border-r">
            <Section title="Contact">
              <div className="space-y-3">
            <Field label="Name">
              <Input
                value={edit.client_name}
                onChange={(e) => setEdit({ ...edit, client_name: e.target.value })}
                onBlur={save}
              />
            </Field>
            <Field label="Email">
              <Input
                value={edit.email ?? ""}
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                onBlur={save}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={edit.phone ?? ""}
                onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                onBlur={save}
              />
            </Field>
              </div>
            </Section>

            <Section title="Deal">
              <div className="space-y-3">
            <Field label="Sales value (₹)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  ₹
                </span>
                <Input
                  type="number"
                  className="pl-7"
                  value={edit.sales_value ?? ""}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      sales_value: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            </Field>
            <Field label="Source">
              <Input
                value={edit.lead_source ?? ""}
                onChange={(e) => setEdit({ ...edit, lead_source: e.target.value })}
              />
            </Field>
              </div>
            </Section>

            <Section title="Pipeline">
              <div className="space-y-3">
            <Field label="Status">
              <Select
                value={edit.status_id ?? ""}
                onValueChange={(v) => setEdit({ ...edit, status_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: s.color }} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Assigned to">
              <Select
                value={edit.assigned_to ?? "__unassigned"}
                onValueChange={(v) =>
                  setEdit({ ...edit, assigned_to: v === "__unassigned" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned">Unassigned</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email || p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Labels">
              <div className="flex flex-wrap gap-1.5 items-center">
                {assignedLabels.map((l) => (
                  <Badge
                    key={l.id}
                    style={{ background: l.color, color: "white" }}
                    className="border-0 gap-1 pr-1"
                  >
                    {l.name}
                    <button
                      onClick={() => removeLabel(l.id)}
                      className="hover:bg-black/20 rounded-sm p-0.5"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                {assignedLabels.length === 0 && (
                  <span className="text-xs text-muted-foreground">No labels</span>
                )}
                {availableLabels.length > 0 && (
                  <Select value="" onValueChange={addLabel}>
                    <SelectTrigger className="h-7 w-auto gap-1 border-dashed px-2 text-xs">
                      <Tag className="size-3" />
                      Add
                    </SelectTrigger>
                    <SelectContent>
                      {availableLabels.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          <span className="inline-flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ background: l.color }} />
                            {l.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </Field>
              </div>
            </Section>
          </div>

          {/* RIGHT: activity rail */}
          <div className="overflow-y-auto px-5 py-5 bg-muted/30">
          <Tabs defaultValue="notes">
            <TabsList className="grid grid-cols-3 w-full sticky top-0 z-10">
              <TabsTrigger value="notes">
                <MessageSquare className="size-3.5 mr-1" />
                Notes {notes.length}
              </TabsTrigger>
              <TabsTrigger value="tasks">
                <ListTodo className="size-3.5 mr-1" />
                Tasks {tasks.length}
              </TabsTrigger>
              <TabsTrigger value="activity">
                <ActivityIcon className="size-3.5 mr-1" />
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="notes" className="space-y-3 mt-4">
              <div className="flex gap-2">
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note…"
                  rows={2}
                />
                <Button onClick={addNote} size="icon" className="bg-gradient-primary self-end">
                  <Plus className="size-4" />
                </Button>
              </div>
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg border bg-card p-3 text-sm">
                  <p>{n.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
              {notes.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No notes yet.</p>
              )}
            </TabsContent>

            <TabsContent value="tasks" className="space-y-3 mt-4">
              <div className="space-y-2">
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Task title"
                />
                <div className="flex flex-wrap gap-2">
                  <Input
                    type="datetime-local"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                    className="flex-1 min-w-[140px]"
                  />
                  <Select
                    value={taskAssignee || "__me"}
                    onValueChange={(v) => setTaskAssignee(v === "__me" ? "" : v)}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Assign to" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__me">Assign to me</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name || p.email || p.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={addTask} className="bg-gradient-primary">
                    <Plus className="size-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm"
                >
                  <button
                    onClick={() => toggleTask(t.id, t.status)}
                    className={`size-5 rounded border flex items-center justify-center ${t.status === "completed" ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}
                  >
                    {t.status === "completed" && <Check className="size-3" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className={
                        t.status === "completed" ? "line-through text-muted-foreground" : ""
                      }
                    >
                      {t.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {t.due_date && <>Due {new Date(t.due_date).toLocaleString()}</>}
                      {t.assigned_to && (
                        <>
                          {" "}
                          · For{" "}
                          {profiles.find((p) => p.id === t.assigned_to)?.full_name ??
                            profiles.find((p) => p.id === t.assigned_to)?.email ??
                            "teammate"}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              ))}
              {tasks.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No tasks yet.</p>
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <div className="relative pl-5 border-l border-border space-y-4">
                {activities.map((a) => (
                  <div key={a.id} className="relative">
                    <span className="absolute -left-[23px] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-background" />
                    <p className="text-sm">{a.description}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </p>
                  </div>
                ))}
                {activities.length === 0 && (
                  <p className="text-xs text-muted-foreground">No activity yet.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  tone,
  external,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  tone?: string;
  external?: boolean;
}) {
  if (!href) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="h-9 justify-center gap-1.5 opacity-50"
      >
        <span className={tone}>{icon}</span>
        <span className="text-xs">{label}</span>
      </Button>
    );
  }
  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="h-9 justify-center gap-1.5 hover:bg-accent"
    >
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      >
        <span className={tone}>{icon}</span>
        <span className="text-xs">{label}</span>
      </a>
    </Button>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return (
    <div
      className="size-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
      style={{ background: `hsl(${hue} 65% 50%)` }}
    >
      {initials || "?"}
    </div>
  );
}
