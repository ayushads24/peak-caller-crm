import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageSquare, ListTodo, PhoneOff, PhoneCall, Loader2, Tag, MessageCircle, Plus, X, Search, UserCheck } from "lucide-react";
import { cn, whatsappUrl } from "@/lib/utils";
import { useAppSettings } from "@/hooks/use-app-settings";

interface Status { id: string; name: string; color: string; }
interface LabelRow { id: string; name: string; color: string; }
interface ProfileLite { id: string; full_name: string | null; email: string | null; }
type CallStatus = "connected" | "not_connected" | "voicemail" | "busy" | "wrong_number";

function avatar(p: ProfileLite) {
  return (p.full_name?.trim() || p.email || "?")[0].toUpperCase();
}

export function PostCallSheet({
  open, onOpenChange, lead, statuses, labels = [], profiles = [], onComplete, durationStartedAt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: { id: string; client_name: string; phone: string | null; status_id: string | null; assigned_to?: string | null } | null;
  statuses: Status[];
  labels?: LabelRow[];
  profiles?: ProfileLite[];
  onComplete: (callStatus: CallStatus, newLeadStatusId?: string | null) => void;
  durationStartedAt: number | null;
}) {
  const { user } = useAuth();
  const appSettings = useAppSettings();
  const [callStatus, setCallStatus] = useState<CallStatus>("connected");
  const [leadStatusId, setLeadStatusId] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState<string>("");
  const [selectedLabels, setSelectedLabels] = useState<LabelRow[]>([]);
  const [labelSearch, setLabelSearch] = useState("");
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false);
  const [note, setNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskAssignTo, setTaskAssignTo] = useState<string>("");
  const [seconds, setSeconds] = useState(45);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!open || !lead) return;
    setCallStatus("connected");
    setLeadStatusId(lead.status_id);
    setAssignTo(lead.assigned_to ?? "");
    setTaskAssignTo("");
    setSelectedLabels([]);
    setLabelSearch("");
    setNote(""); setTaskTitle(""); setTaskDue("");
    setSeconds(45); setExpired(false);
  }, [open, lead]);

  useEffect(() => {
    if (!open) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) { setExpired(true); if (timerRef.current) clearInterval(timerRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [open]);

  if (!lead) return null;

  const availableLabels = labels.filter(
    (l) => !selectedLabels.find((s) => s.id === l.id) &&
      l.name.toLowerCase().includes(labelSearch.toLowerCase())
  );

  function addLabel(l: LabelRow) {
    setSelectedLabels((prev) => [...prev, l]);
    setLabelSearch("");
  }

  async function commit(advance: boolean) {
    if (!user || !lead) return;
    setBusy(true);
    const duration = durationStartedAt ? Math.round((Date.now() - durationStartedAt) / 1000) : 0;

    await supabase.from("calls").insert({
      lead_id: lead.id, user_id: user.id, status: callStatus, duration_seconds: duration, notes: note || null,
    });

    // Update lead: status + assignment
    const leadUpdate: Record<string, unknown> = {};
    if (leadStatusId && leadStatusId !== lead.status_id) leadUpdate.status_id = leadStatusId;
    if (assignTo && assignTo !== (lead.assigned_to ?? "")) {
      leadUpdate.assigned_to = assignTo;
      leadUpdate.assigned_at = new Date().toISOString();
    }
    if (Object.keys(leadUpdate).length > 0) {
      await supabase.from("leads").update(leadUpdate).eq("id", lead.id);
    }

    if (note.trim()) {
      await supabase.from("notes").insert({ lead_id: lead.id, content: note, created_by: user.id });
    }

    if (taskTitle.trim()) {
      await supabase.from("tasks").insert({
        lead_id: lead.id,
        title: taskTitle,
        created_by: user.id,
        assigned_to: taskAssignTo || user.id,
        status: "pending",
        due_date: taskDue ? new Date(taskDue).toISOString() : null,
      });
    }

    if (selectedLabels.length > 0) {
      const rows = selectedLabels.map((l) => ({ lead_id: lead.id, label_id: l.id }));
      await supabase.from("lead_labels").upsert(rows, { onConflict: "lead_id,label_id", ignoreDuplicates: true });
    }

    setBusy(false);
    if (advance) onComplete(callStatus, leadStatusId);
    onOpenChange(false);
  }

  function whatsapp() {
    if (!lead?.phone) return;
    const url = whatsappUrl(lead.phone, appSettings.doubletick_chat_url ?? "");
    if (url) window.open(url, "_blank");
  }

  const timerColor = expired
    ? "bg-destructive/10 text-destructive"
    : seconds <= 10 ? "bg-amber-500/15 text-amber-600"
    : "bg-primary/10 text-primary";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) void commit(false); else onOpenChange(v); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">

        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="font-display flex items-center justify-between gap-2">
            <span className="truncate text-base">{lead.client_name}</span>
            <span className={cn("font-mono text-sm px-2.5 py-0.5 rounded-md shrink-0", timerColor)}>{seconds}s</span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">

          {/* Call Outcome + Lead Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <PhoneCall className="size-3" /> Call outcome
              </Label>
              <Select value={callStatus} onValueChange={(v) => setCallStatus(v as CallStatus)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="connected">
                    <span className="flex items-center gap-2"><PhoneCall className="size-3 text-emerald-600" />Connected</span>
                  </SelectItem>
                  <SelectItem value="not_connected">
                    <span className="flex items-center gap-2"><PhoneOff className="size-3 text-muted-foreground" />Not connected</span>
                  </SelectItem>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="wrong_number">Wrong number</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Lead status</Label>
              <Select value={leadStatusId ?? ""} onValueChange={setLeadStatusId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="No change" /></SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full shrink-0" style={{ background: s.color }} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assign Lead */}
          {profiles.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <UserCheck className="size-3" /> Assign lead to
              </Label>
              <Select value={assignTo} onValueChange={setAssignTo}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span className="size-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                          {avatar(p)}
                        </span>
                        {p.full_name || p.email}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Labels */}
          {labels.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Tag className="size-3" /> Labels
              </Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedLabels.map((l) => (
                  <span
                    key={l.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: l.color }}
                  >
                    {l.name}
                    <button type="button" onClick={() => setSelectedLabels((p) => p.filter((x) => x.id !== l.id))}>
                      <X className="size-3 opacity-70 hover:opacity-100" />
                    </button>
                  </span>
                ))}
                <Popover open={labelPopoverOpen} onOpenChange={setLabelPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button type="button" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors">
                      <Plus className="size-3" /> Add label
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-2" align="start">
                    <div className="flex items-center gap-1.5 border rounded-md px-2 py-1 mb-2">
                      <Search className="size-3 text-muted-foreground shrink-0" />
                      <input
                        autoFocus
                        value={labelSearch}
                        onChange={(e) => setLabelSearch(e.target.value)}
                        placeholder="Search labels..."
                        className="text-xs w-full bg-transparent outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="space-y-0.5 max-h-40 overflow-y-auto">
                      {availableLabels.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          {labelSearch ? "No match" : "All labels added"}
                        </p>
                      ) : availableLabels.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => { addLabel(l); setLabelPopoverOpen(false); }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted text-sm text-left"
                        >
                          <span className="size-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                          {l.name}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <MessageSquare className="size-3" /> Note
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="What happened on this call?"
              className="resize-none text-sm"
            />
          </div>

          <div className="border-t" />

          {/* Task */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <ListTodo className="size-3" /> Task <span className="text-muted-foreground/50">(optional)</span>
            </Label>
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Task title"
              className="text-sm h-9"
            />
            {taskTitle && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="datetime-local"
                  value={taskDue}
                  onChange={(e) => setTaskDue(e.target.value)}
                  className="text-sm h-9"
                />
                {profiles.length > 0 && (
                  <Select value={taskAssignTo} onValueChange={setTaskAssignTo}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Assign to" /></SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name || p.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2 border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={whatsapp}
            disabled={!lead.phone}
            className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 shrink-0"
          >
            <MessageCircle className="size-4" />
          </Button>
          {!expired ? (
            <Button onClick={() => commit(true)} disabled={busy} className="flex-1 bg-gradient-primary">
              {busy && <Loader2 className="size-4 mr-2 animate-spin" />}
              Save & Next
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setSeconds(15); setExpired(false); }} className="flex-1">+15s</Button>
              <Button onClick={() => commit(true)} disabled={busy} className="flex-1 bg-gradient-primary">
                {busy && <Loader2 className="size-4 mr-2 animate-spin" />}
                Next lead
              </Button>
            </>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
