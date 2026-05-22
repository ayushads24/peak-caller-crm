import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, Trash2, Plus, Check, MessageSquare, ListTodo, Activity as ActivityIcon, X, Tag } from "lucide-react";
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
}

export interface StatusRow { id: string; name: string; color: string; is_sales: boolean; is_lost: boolean; }
export interface LabelRow { id: string; name: string; color: string; }

export function LeadDetailSheet({ lead, statuses, labels, open, onOpenChange, onChanged }: {
  lead: LeadRow | null;
  statuses: StatusRow[];
  labels: LabelRow[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<{ id: string; content: string; created_at: string }[]>([]);
  const [tasks, setTasks] = useState<{ id: string; title: string; status: string; due_date: string | null }[]>([]);
  const [activities, setActivities] = useState<{ id: string; description: string; created_at: string; type: string }[]>([]);
  const [leadLabelIds, setLeadLabelIds] = useState<string[]>([]);
  const [noteText, setNoteText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [edit, setEdit] = useState<LeadRow | null>(null);

  useEffect(() => { setEdit(lead); if (lead) void loadRelated(lead.id); }, [lead]);

  async function loadRelated(id: string) {
    const [n, t, a, ll] = await Promise.all([
      supabase.from("notes").select("id, content, created_at").eq("lead_id", id).order("created_at", { ascending: false }),
      supabase.from("tasks").select("id, title, status, due_date").eq("lead_id", id).order("created_at", { ascending: false }),
      supabase.from("activities").select("id, description, created_at, type").eq("lead_id", id).order("created_at", { ascending: false }),
      supabase.from("lead_labels").select("label_id").eq("lead_id", id),
    ]);
    setNotes(n.data ?? []);
    setTasks((t.data ?? []) as typeof tasks);
    setActivities((a.data ?? []) as typeof activities);
    setLeadLabelIds((ll.data ?? []).map((r: { label_id: string }) => r.label_id));
  }

  if (!lead || !edit) return null;

  async function save() {
    if (!edit) return;
    const { error } = await supabase.from("leads").update({
      client_name: edit.client_name,
      email: edit.email,
      phone: edit.phone,
      sales_value: edit.sales_value,
      lead_source: edit.lead_source,
      status_id: edit.status_id,
    }).eq("id", edit.id);
    if (error) return toast.error(error.message);
    toast.success("Lead updated");
    onChanged();
    void loadRelated(edit.id);
  }

  async function addNote() {
    if (!noteText.trim() || !user) return;
    const { error } = await supabase.from("notes").insert({ lead_id: lead!.id, content: noteText, created_by: user.id });
    if (error) return toast.error(error.message);
    setNoteText("");
    void loadRelated(lead!.id);
  }

  async function addTask() {
    if (!taskTitle.trim() || !user) return;
    const { error } = await supabase.from("tasks").insert({
      lead_id: lead!.id, title: taskTitle, created_by: user.id, status: "pending",
      due_date: taskDue ? new Date(taskDue).toISOString() : null,
    });
    if (error) return toast.error(error.message);
    setTaskTitle(""); setTaskDue("");
    void loadRelated(lead!.id);
  }

  async function toggleTask(id: string, status: string) {
    const next = status === "completed" ? "pending" : "completed";
    const { error } = await supabase.from("tasks").update({
      status: next, completed_at: next === "completed" ? new Date().toISOString() : null,
    }).eq("id", id);
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
    const { error } = await supabase.from("lead_labels").insert({ lead_id: lead!.id, label_id: labelId });
    if (error) return toast.error(error.message);
    setLeadLabelIds((ids) => [...ids, labelId]);
    onChanged();
  }

  async function removeLabel(labelId: string) {
    const { error } = await supabase.from("lead_labels").delete().eq("lead_id", lead!.id).eq("label_id", labelId);
    if (error) return toast.error(error.message);
    setLeadLabelIds((ids) => ids.filter((i) => i !== labelId));
    onChanged();
  }

  const status = statuses.find((s) => s.id === edit.status_id);
  const assignedLabels = labels.filter((l) => leadLabelIds.includes(l.id));
  const availableLabels = labels.filter((l) => !leadLabelIds.includes(l.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="font-display text-xl flex items-center gap-2">
            {edit.client_name}
            {status && <Badge style={{ background: status.color, color: "white" }} className="border-0">{status.name}</Badge>}
          </SheetTitle>
        </SheetHeader>
        <div className="px-5 pb-5">
          {/* Lead details first */}
          <div className="space-y-3 mt-4">
            <Field label="Name"><Input value={edit.client_name} onChange={(e) => setEdit({ ...edit, client_name: e.target.value })} /></Field>
            <Field label="Email"><Input value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="Sales value (₹)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                <Input type="number" className="pl-7" value={edit.sales_value ?? ""} onChange={(e) => setEdit({ ...edit, sales_value: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
            </Field>
            <Field label="Source"><Input value={edit.lead_source ?? ""} onChange={(e) => setEdit({ ...edit, lead_source: e.target.value })} /></Field>
            <Field label="Status">
              <Select value={edit.status_id ?? ""} onValueChange={(v) => setEdit({ ...edit, status_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{statuses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.name}</span>
                  </SelectItem>
                ))}</SelectContent>
              </Select>
            </Field>
            <Field label="Labels">
              <div className="flex flex-wrap gap-1.5 items-center">
                {assignedLabels.map((l) => (
                  <Badge key={l.id} style={{ background: l.color, color: "white" }} className="border-0 gap-1 pr-1">
                    {l.name}
                    <button onClick={() => removeLabel(l.id)} className="hover:bg-black/20 rounded-sm p-0.5"><X className="size-3" /></button>
                  </Badge>
                ))}
                {assignedLabels.length === 0 && <span className="text-xs text-muted-foreground">No labels</span>}
                {availableLabels.length > 0 && (
                  <Select value="" onValueChange={addLabel}>
                    <SelectTrigger className="h-7 w-auto gap-1 border-dashed px-2 text-xs"><Tag className="size-3" />Add</SelectTrigger>
                    <SelectContent>{availableLabels.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: l.color }} />{l.name}</span>
                      </SelectItem>
                    ))}</SelectContent>
                  </Select>
                )}
              </div>
            </Field>
            <div className="flex gap-2 pt-2">
              <Button onClick={save} className="flex-1 bg-gradient-primary"><Check className="size-4 mr-1" />Save changes</Button>
              <Button variant="outline" size="icon" onClick={deleteLead} className="text-destructive hover:text-destructive"><Trash2 className="size-4" /></Button>
            </div>
          </div>

          {/* Quick actions + tabs BELOW the details */}
          <div className="grid grid-cols-2 gap-2 mt-6">
            {edit.phone && (
              <Button asChild variant="outline" size="sm" className="justify-start"><a href={`tel:${edit.phone}`}><Phone className="size-3.5 mr-2" />Call</a></Button>
            )}
            {edit.email && (
              <Button asChild variant="outline" size="sm" className="justify-start"><a href={`mailto:${edit.email}`}><Mail className="size-3.5 mr-2" />Email</a></Button>
            )}
          </div>

          <Tabs defaultValue="notes" className="mt-4">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="notes"><MessageSquare className="size-3.5 mr-1" />Notes {notes.length}</TabsTrigger>
              <TabsTrigger value="tasks"><ListTodo className="size-3.5 mr-1" />Tasks {tasks.length}</TabsTrigger>
              <TabsTrigger value="activity"><ActivityIcon className="size-3.5 mr-1" />Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="notes" className="space-y-3 mt-4">
              <div className="flex gap-2">
                <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…" rows={2} />
                <Button onClick={addNote} size="icon" className="bg-gradient-primary self-end"><Plus className="size-4" /></Button>
              </div>
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg border bg-card p-3 text-sm">
                  <p>{n.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                </div>
              ))}
              {notes.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No notes yet.</p>}
            </TabsContent>

            <TabsContent value="tasks" className="space-y-3 mt-4">
              <div className="space-y-2">
                <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" />
                <div className="flex gap-2">
                  <Input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                  <Button onClick={addTask} className="bg-gradient-primary"><Plus className="size-4 mr-1" />Add</Button>
                </div>
              </div>
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm">
                  <button onClick={() => toggleTask(t.id, t.status)} className={`size-5 rounded border flex items-center justify-center ${t.status === "completed" ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
                    {t.status === "completed" && <Check className="size-3" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={t.status === "completed" ? "line-through text-muted-foreground" : ""}>{t.title}</p>
                    {t.due_date && <p className="text-[10px] text-muted-foreground">Due {new Date(t.due_date).toLocaleString()}</p>}
                  </div>
                </div>
              ))}
              {tasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No tasks yet.</p>}
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <div className="relative pl-5 border-l border-border space-y-4">
                {activities.map((a) => (
                  <div key={a.id} className="relative">
                    <span className="absolute -left-[23px] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-background" />
                    <p className="text-sm">{a.description}</p>
                    <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                  </div>
                ))}
                {activities.length === 0 && <p className="text-xs text-muted-foreground">No activity yet.</p>}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}