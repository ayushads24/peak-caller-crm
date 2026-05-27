import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, ListTodo, CalendarPlus, PhoneOff, PhoneCall, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Status { id: string; name: string; color: string; }
type CallStatus = "connected" | "not_connected" | "voicemail" | "busy" | "wrong_number";

export function PostCallSheet({
  open, onOpenChange, lead, statuses, onComplete, durationStartedAt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: { id: string; client_name: string; phone: string | null; status_id: string | null } | null;
  statuses: Status[];
  onComplete: (callStatus: CallStatus) => void;
  durationStartedAt: number | null;
}) {
  const { user } = useAuth();
  const [callStatus, setCallStatus] = useState<CallStatus>("connected");
  const [leadStatusId, setLeadStatusId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [seconds, setSeconds] = useState(45);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!open || !lead) return;
    setCallStatus("connected");
    setLeadStatusId(lead.status_id);
    setNote(""); setTaskTitle(""); setTaskDue(""); setMeetingAt("");
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

  async function commit(advance: boolean) {
    if (!user || !lead) return;
    setBusy(true);
    const duration = durationStartedAt ? Math.round((Date.now() - durationStartedAt) / 1000) : 0;

    // 1. Log call
    await supabase.from("calls").insert({
      lead_id: lead.id, user_id: user.id, status: callStatus, duration_seconds: duration, notes: note || null,
    });

    // 2. Status change
    if (leadStatusId && leadStatusId !== lead.status_id) {
      await supabase.from("leads").update({ status_id: leadStatusId }).eq("id", lead.id);
    }
    // 3. Note
    if (note.trim()) {
      await supabase.from("notes").insert({ lead_id: lead.id, content: note, created_by: user.id });
    }
    // 4. Task
    if (taskTitle.trim()) {
      await supabase.from("tasks").insert({
        lead_id: lead.id, title: taskTitle, created_by: user.id, status: "pending",
        due_date: taskDue ? new Date(taskDue).toISOString() : null,
      });
    }
    // 5. Meeting
    if (meetingAt) {
      await supabase.from("meetings").insert({
        lead_id: lead.id, scheduled_at: new Date(meetingAt).toISOString(), created_by: user.id, title: "Meeting",
      });
    }
    setBusy(false);
    if (advance) onComplete(callStatus);
    onOpenChange(false);
  }

  function whatsapp() {
    if (!lead?.phone) return;
    const phone = lead.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}`, "_blank");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) void commit(false); else onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center justify-between gap-2">
            <span>Post-call: {lead.client_name}</span>
            <span className={`font-mono text-base px-2.5 py-0.5 rounded-md ${expired ? "bg-destructive/10 text-destructive" : seconds <= 10 ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary"}`}>{seconds}s</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs text-muted-foreground">Call outcome</Label>
            <Select value={callStatus} onValueChange={(v) => setCallStatus(v as CallStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="connected"><span className="inline-flex items-center gap-2"><PhoneCall className="size-3 text-emerald-600" />Connected</span></SelectItem>
                <SelectItem value="not_connected"><span className="inline-flex items-center gap-2"><PhoneOff className="size-3 text-muted-foreground" />Not connected</span></SelectItem>
                <SelectItem value="voicemail">Voicemail</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
                <SelectItem value="wrong_number">Wrong number</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Update lead status</Label>
            <Select value={leadStatusId ?? ""} onValueChange={setLeadStatusId}>
              <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
              <SelectContent>{statuses.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.name}</span>
                </SelectItem>
              ))}</SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><MessageSquare className="size-3" />Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What happened on this call?" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><ListTodo className="size-3" />Task</Label>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Optional" />
              <Input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarPlus className="size-3" />Schedule meeting</Label>
              <Input type="datetime-local" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} />
              <Button variant="outline" size="sm" onClick={whatsapp} disabled={!lead.phone} className="w-full mt-1.5">WhatsApp</Button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          {!expired ? (
            <Button onClick={() => commit(true)} disabled={busy} className="flex-1 bg-gradient-primary">
              {busy && <Loader2 className="size-4 mr-2 animate-spin" />}Save & Next
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setSeconds(15); setExpired(false); }} className="flex-1">+15s</Button>
              <Button onClick={() => commit(true)} disabled={busy} className="flex-1 bg-gradient-primary">Next lead</Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
