import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPermissions, setRolePermission } from "@/lib/permissions.functions";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Role = "admin" | "team_leader" | "caller" | "project_manager";
const ROLES: { key: Role; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "team_leader", label: "Team Leader" },
  { key: "project_manager", label: "Project Manager" },
  { key: "caller", label: "Caller" },
];

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard", leads: "Leads", workflow: "Calling Workflow", tasks: "Tasks",
  reports: "Reports", users: "User Management", settings: "Settings", analytics: "Analytics",
};

interface Perm { key: string; module: string; action: string; label: string; sort_order: number }
interface Mapping { role: string; permission_key: string }

export function PermissionsMatrix() {
  const load = useServerFn(listPermissions);
  const setPerm = useServerFn(setRolePermission);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);

  async function reload() {
    const res = await load();
    setPerms(res.permissions as Perm[]);
    setGranted(new Set((res.mappings as Mapping[]).map((m) => `${m.role}::${m.permission_key}`)));
  }
  useEffect(() => { void reload(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Perm[]>();
    perms.forEach((p) => {
      const arr = map.get(p.module) ?? [];
      arr.push(p);
      map.set(p.module, arr);
    });
    return Array.from(map.entries());
  }, [perms]);

  async function toggle(role: Role, key: string, current: boolean) {
    const id = `${role}::${key}`;
    if (role === "admin") {
      toast.info("Admin role always has full access");
      return;
    }
    setSaving(id);
    // Optimistic
    setGranted((g) => {
      const ng = new Set(g);
      if (current) ng.delete(id); else ng.add(id);
      return ng;
    });
    try {
      await setPerm({ data: { role, permission_key: key, granted: !current } });
    } catch (e) {
      toast.error((e as Error).message);
      void reload();
    } finally { setSaving(null); }
  }

  return (
    <Card className="p-4 sm:p-6 shadow-card">
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold">Role permissions</h2>
        <p className="text-xs text-muted-foreground mt-1">Toggle which actions each role can perform. Changes apply immediately.</p>
      </div>

      <div className="space-y-6">
        {grouped.map(([module, mPerms]) => (
          <div key={module}>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold">{MODULE_LABELS[module] ?? module}</h3>
              <Badge variant="outline" className="text-[10px]">{mPerms.length}</Badge>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-2 font-medium">Permission</th>
                    {ROLES.map((r) => (
                      <th key={r.key} className="p-2 font-medium text-center w-32">{r.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mPerms.map((p) => (
                    <tr key={p.key} className="border-t">
                      <td className="p-2">{p.label}<div className="text-[10px] text-muted-foreground font-mono">{p.key}</div></td>
                      {ROLES.map((r) => {
                        const id = `${r.key}::${p.key}`;
                        const isOn = r.key === "admin" ? true : granted.has(id);
                        return (
                          <td key={r.key} className="p-2 text-center">
                            <Switch
                              checked={isOn}
                              disabled={r.key === "admin" || saving === id}
                              onCheckedChange={() => toggle(r.key, p.key, isOn)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}