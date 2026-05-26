import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdminOrManager } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({ component: Page });

interface Status { id: string; name: string; color: string; is_sales: boolean; is_lost: boolean; sort_order: number; }
interface LabelRow { id: string; name: string; color: string; }

function Page() {
  const { user, roles } = useAuth();
  const canManage = isAdminOrManager(roles);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [labels, setLabels] = useState<LabelRow[]>([]);

  useEffect(() => { void load(); }, []);
  async function load() {
    const [s, l] = await Promise.all([
      supabase.from("statuses").select("*").order("sort_order"),
      supabase.from("labels").select("*").order("name"),
    ]);
    setStatuses((s.data ?? []) as Status[]);
    setLabels((l.data ?? []) as LabelRow[]);
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-5xl mx-auto animate-in fade-in duration-500">
      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
      <p className="text-muted-foreground mt-1 text-sm">{user?.email} · {roles.join(", ") || "no role"}</p>

      <Tabs defaultValue="statuses" className="mt-6">
        <TabsList><TabsTrigger value="statuses">Statuses</TabsTrigger><TabsTrigger value="labels">Labels</TabsTrigger></TabsList>

        <TabsContent value="statuses" className="mt-4">
          <Card className="p-4 sm:p-6 shadow-card">
            {canManage && <NewStatus onCreated={load} nextOrder={(statuses.at(-1)?.sort_order ?? 0) + 1} />}
            <div className="mt-4 space-y-2">
              {statuses.map((s) => (
                <StatusRow key={s.id} status={s} canManage={canManage} onChanged={load} />
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="labels" className="mt-4">
          <Card className="p-4 sm:p-6 shadow-card">
            <NewLabel onCreated={load} />
            <div className="mt-4 flex flex-wrap gap-2">
              {labels.map((l) => (
                <div key={l.id} className="group flex items-center gap-2 rounded-full pl-3 pr-1 py-1 text-sm border" style={{ background: `${l.color}22`, borderColor: `${l.color}55`, color: l.color }}>
                  {l.name}
                  {canManage && (
                    <button onClick={async () => { await supabase.from("labels").delete().eq("id", l.id); load(); }} className="size-5 rounded-full hover:bg-black/10 flex items-center justify-center">
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              ))}
              {labels.length === 0 && <p className="text-sm text-muted-foreground">No labels yet.</p>}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusRow({ status, canManage, onChanged }: { status: Status; canManage: boolean; onChanged: () => void }) {
  async function update(patch: Partial<Status>) {
    const { error } = await supabase.from("statuses").update(patch).eq("id", status.id);
    if (error) toast.error(error.message); else onChanged();
  }
  async function del() {
    if (!confirm(`Delete status "${status.name}"?`)) return;
    const { error } = await supabase.from("statuses").delete().eq("id", status.id);
    if (error) toast.error(error.message); else onChanged();
  }
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 flex-1">
        <input type="color" disabled={!canManage} value={status.color} onChange={(e) => update({ color: e.target.value })} className="size-7 rounded cursor-pointer border" />
        <Input disabled={!canManage} defaultValue={status.name} onBlur={(e) => e.target.value !== status.name && update({ name: e.target.value })} className="max-w-xs" />
      </div>
      <div className="flex items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5"><Switch disabled={!canManage} checked={status.is_sales} onCheckedChange={(v) => update({ is_sales: v })} /> Sale</label>
        <label className="flex items-center gap-1.5"><Switch disabled={!canManage} checked={status.is_lost} onCheckedChange={(v) => update({ is_lost: v })} /> Lost</label>
        {canManage && <Button variant="ghost" size="icon" onClick={del} className="text-destructive"><Trash2 className="size-4" /></Button>}
      </div>
    </div>
  );
}

function NewStatus({ onCreated, nextOrder }: { onCreated: () => void; nextOrder: number }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from("statuses").insert({ name, color, sort_order: nextOrder });
    if (error) return toast.error(error.message);
    setName(""); onCreated();
  }
  return (
    <div className="flex gap-2">
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="size-10 rounded cursor-pointer border" />
      <Input placeholder="New status name" value={name} onChange={(e) => setName(e.target.value)} />
      <Button onClick={add} className="bg-gradient-primary"><Plus className="size-4 mr-1" />Add</Button>
    </div>
  );
}

function NewLabel({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from("labels").insert({ name, color });
    if (error) return toast.error(error.message);
    setName(""); onCreated();
  }
  return (
    <div className="flex gap-2">
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="size-10 rounded cursor-pointer border" />
      <Input placeholder="New label name" value={name} onChange={(e) => setName(e.target.value)} />
      <Button onClick={add} className="bg-gradient-primary"><Plus className="size-4 mr-1" />Add</Button>
    </div>
  );
}