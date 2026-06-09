import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdminOrManager } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { GripVertical, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export const Route = createFileRoute("/_authenticated/settings")({ component: Page });

interface Status { id: string; name: string; color: string; is_sales: boolean; is_lost: boolean; sort_order: number; }
interface LabelRow { id: string; name: string; color: string; }

function Page() {
  const { user, roles } = useAuth();
  const canManage = isAdminOrManager(roles);
  const [savedStatuses, setSavedStatuses] = useState<Status[]>([]);
  const [draft, setDraft] = useState<Status[]>([]);
  const [modifiedIds, setModifiedIds] = useState<Set<string>>(new Set());
  const [orderChanged, setOrderChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [labels, setLabels] = useState<LabelRow[]>([]);

  const isDirty = modifiedIds.size > 0 || orderChanged;

  useEffect(() => { void load(); }, []);

  async function load() {
    const [s, l] = await Promise.all([
      supabase.from("statuses").select("*").order("sort_order"),
      supabase.from("labels").select("*").order("name"),
    ]);
    const loaded = (s.data ?? []) as Status[];
    setSavedStatuses(loaded);
    setDraft(loaded);
    setModifiedIds(new Set());
    setOrderChanged(false);
    setLabels((l.data ?? []) as LabelRow[]);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((prev) => {
      const oldIdx = prev.findIndex((s) => s.id === active.id);
      const newIdx = prev.findIndex((s) => s.id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
    setOrderChanged(true);
  }

  function handleFieldChange(id: string, patch: Partial<Status>) {
    setDraft((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setModifiedIds((prev) => new Set(prev).add(id));
  }

  async function saveAll() {
    setSaving(true);
    const updates = draft.map((s, i) =>
      supabase.from("statuses").update({
        name: s.name,
        color: s.color,
        is_sales: s.is_sales,
        is_lost: s.is_lost,
        sort_order: i + 1,
      }).eq("id", s.id)
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      toast.error(failed.error.message);
    } else {
      toast.success("Changes saved!");
      await load();
    }
    setSaving(false);
  }

  function cancelChanges() {
    setDraft(savedStatuses);
    setModifiedIds(new Set());
    setOrderChanged(false);
  }

  async function deleteStatus(s: Status) {
    if (!confirm(`Delete status "${s.name}"?`)) return;
    const { error } = await supabase.from("statuses").delete().eq("id", s.id);
    if (error) toast.error(error.message); else load();
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-5xl mx-auto animate-in fade-in duration-500">
      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
      <p className="text-muted-foreground mt-1 text-sm">{user?.email} · {roles.join(", ") || "no role"}</p>

      <Tabs defaultValue="statuses" className="mt-6">
        <TabsList><TabsTrigger value="statuses">Statuses</TabsTrigger><TabsTrigger value="labels">Labels</TabsTrigger></TabsList>

        <TabsContent value="statuses" className="mt-4">
          <Card className="p-4 sm:p-6 shadow-card">
            {canManage && (
              <NewStatus
                onCreated={load}
                nextOrder={(savedStatuses.at(-1)?.sort_order ?? 0) + 1}
              />
            )}

            {canManage && isDirty && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-2.5">
                <span className="text-sm text-amber-700 dark:text-amber-400 flex-1">
                  {orderChanged && modifiedIds.size > 0
                    ? "Order and field changes unsaved"
                    : orderChanged
                    ? "Order changed — save to apply everywhere"
                    : `${modifiedIds.size} status${modifiedIds.size > 1 ? "es" : ""} edited — unsaved`}
                </span>
                <Button variant="outline" size="sm" onClick={cancelChanges} className="text-xs">Cancel</Button>
                <Button size="sm" onClick={saveAll} disabled={saving} className="bg-gradient-primary text-xs gap-1.5">
                  <Save className="size-3.5" />
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            )}

            <div className="mt-4 space-y-2">
              {canManage ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={draft.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    {draft.map((s) => (
                      <SortableStatusRow
                        key={s.id}
                        status={s}
                        isModified={modifiedIds.has(s.id)}
                        onFieldChange={(patch) => handleFieldChange(s.id, patch)}
                        onDelete={() => deleteStatus(s)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              ) : (
                draft.map((s) => (
                  <StatusRow key={s.id} status={s} isModified={false} onFieldChange={() => {}} onDelete={() => {}} canManage={false} />
                ))
              )}
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

function SortableStatusRow(props: {
  status: Status;
  isModified: boolean;
  onFieldChange: (patch: Partial<Status>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.status.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <StatusRow {...props} canManage dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function StatusRow({ status, isModified, onFieldChange, onDelete, canManage, dragHandleProps }: {
  status: Status;
  isModified: boolean;
  onFieldChange: (patch: Partial<Status>) => void;
  onDelete: () => void;
  canManage: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-lg border bg-card p-3 transition-colors ${isModified ? "border-amber-300 dark:border-amber-700" : ""}`}>
      {canManage && (
        <button
          {...dragHandleProps}
          className="hidden sm:flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <div className="flex items-center gap-2 flex-1">
        <input
          type="color"
          disabled={!canManage}
          value={status.color}
          onChange={(e) => onFieldChange({ color: e.target.value })}
          className="size-7 rounded cursor-pointer border"
        />
        <Input
          disabled={!canManage}
          value={status.name}
          onChange={(e) => onFieldChange({ name: e.target.value })}
          className="max-w-xs"
        />
      </div>
      <div className="flex items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <Switch disabled={!canManage} checked={status.is_sales} onCheckedChange={(v) => onFieldChange({ is_sales: v })} />
          Sale
        </label>
        <label className="flex items-center gap-1.5">
          <Switch disabled={!canManage} checked={status.is_lost} onCheckedChange={(v) => onFieldChange({ is_lost: v })} />
          Lost
        </label>
        {canManage && (
          <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive">
            <Trash2 className="size-4" />
          </Button>
        )}
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
      <Input placeholder="New status name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
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
      <Input placeholder="New label name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
      <Button onClick={add} className="bg-gradient-primary"><Plus className="size-4 mr-1" />Add</Button>
    </div>
  );
}
