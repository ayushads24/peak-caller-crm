import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, isAdmin } from "@/hooks/use-auth";
import {
  adminListUsers, adminCreateUser, adminUpdateUser, adminDeleteUser,
  adminListTeams, adminCreateTeam, adminUpdateTeam, adminDeleteTeam,
} from "@/lib/admin-users.functions";
import { PermissionsMatrix } from "@/components/users/permissions-matrix";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, ShieldAlert, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/users")({ component: Page });

type Role = "admin" | "team_leader" | "caller" | "project_manager" | "manager";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  team_leader: "Team Leader",
  project_manager: "Project Manager",
  caller: "Caller",
  manager: "Manager (legacy)",
};
const ROLE_OPTIONS: Role[] = ["admin", "team_leader", "project_manager", "caller"];

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  designation: string | null;
  last_login_at: string | null;
  is_active: boolean;
  team_id: string | null;
  team_name: string | null;
  roles: string[];
  created_at: string;
}

interface TeamRow {
  id: string;
  name: string;
  leader_id: string | null;
  member_count: number;
  leader: { full_name: string | null; email: string | null } | null;
}

function Page() {
  const { roles, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin(roles)) {
    return (
      <div className="p-10 max-w-md mx-auto text-center">
        <ShieldAlert className="size-12 mx-auto text-muted-foreground mb-4" />
        <h1 className="font-display text-xl font-semibold">Admin access required</h1>
        <p className="text-muted-foreground mt-1 text-sm">Only admins can manage users and teams.</p>
      </div>
    );
  }
  return <Admin />;
}

function Admin() {
  const listUsers = useServerFn(adminListUsers);
  const listTeams = useServerFn(adminListTeams);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("__all__");

  async function reload() {
    const [u, t] = await Promise.all([listUsers(), listTeams()]);
    setUsers(u as UserRow[]);
    setTeams(t as TeamRow[]);
  }
  useEffect(() => { void reload(); }, []);

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== "__all__" && !u.roles.includes(roleFilter)) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return [u.full_name, u.email, u.phone, u.designation, u.team_name]
      .some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Users & Teams</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage who can access the CRM and what they can see.</p>
        </div>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users ({filteredUsers.length})</TabsTrigger>
          <TabsTrigger value="teams">Teams ({teams.length})</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card className="p-4 sm:p-6 shadow-card">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone..." className="pl-9" />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All roles</SelectItem>
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
              <UserDialog teams={teams} onSaved={reload}>
                <Button className="bg-gradient-primary"><Plus className="size-4 mr-1" /> New user</Button>
              </UserDialog>
            </div>
            <div className="space-y-2">
              {filteredUsers.map((u) => (
                <UserRowItem key={u.id} user={u} teams={teams} onChanged={reload} />
              ))}
              {filteredUsers.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No users match your filters.</p>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="mt-4">
          <Card className="p-4 sm:p-6 shadow-card">
            <div className="flex justify-end mb-4">
              <TeamDialog users={users} onSaved={reload}>
                <Button className="bg-gradient-primary"><Plus className="size-4 mr-1" /> New team</Button>
              </TeamDialog>
            </div>
            <div className="space-y-2">
              {teams.map((t) => (
                <TeamRowItem key={t.id} team={t} users={users} onChanged={reload} />
              ))}
              {teams.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No teams yet.</p>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <PermissionsMatrix />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UserRowItem({ user, teams, onChanged }: { user: UserRow; teams: TeamRow[]; onChanged: () => void }) {
  const del = useServerFn(adminDeleteUser);
  const update = useServerFn(adminUpdateUser);
  const role = (user.roles[0] as Role) ?? "caller";
  const lastLogin = user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : "Never";
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border bg-card p-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{user.full_name || user.email}</div>
        <div className="text-xs text-muted-foreground truncate">
          {user.email} {user.phone && `· ${user.phone}`} {user.designation && `· ${user.designation}`}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">Last login: {lastLogin}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{ROLE_LABELS[role] ?? role}</Badge>
        {user.team_name && <Badge variant="outline">{user.team_name}</Badge>}
        <label className="flex items-center gap-1.5 text-xs">
          <Switch checked={user.is_active} onCheckedChange={async (v) => {
            try { await update({ data: { id: user.id, is_active: v } }); onChanged(); }
            catch (e) { toast.error((e as Error).message); }
          }} />
          {user.is_active ? "Active" : "Inactive"}
        </label>
        <UserDialog teams={teams} existing={user} onSaved={onChanged}>
          <Button variant="ghost" size="icon"><Pencil className="size-4" /></Button>
        </UserDialog>
        <Button variant="ghost" size="icon" className="text-destructive" onClick={async () => {
          if (!confirm(`Delete ${user.email}?`)) return;
          try { await del({ data: { id: user.id } }); toast.success("User deleted"); onChanged(); }
          catch (e) { toast.error((e as Error).message); }
        }}><Trash2 className="size-4" /></Button>
      </div>
    </div>
  );
}

function UserDialog({ children, teams, existing, onSaved }: {
  children: React.ReactNode; teams: TeamRow[]; existing?: UserRow; onSaved: () => void;
}) {
  const create = useServerFn(adminCreateUser);
  const update = useServerFn(adminUpdateUser);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(existing?.email ?? "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [designation, setDesignation] = useState(existing?.designation ?? "");
  const [role, setRole] = useState<Role>((existing?.roles[0] as Role) ?? "caller");
  const [teamId, setTeamId] = useState<string>(existing?.team_id ?? "__none__");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      if (existing) {
        await update({ data: {
          id: existing.id,
          full_name: fullName,
          phone: phone || null,
          designation: designation || null,
          role,
          team_id: teamId === "__none__" ? null : teamId,
          ...(password && { password }),
        }});
        toast.success("User updated");
      } else {
        await create({ data: {
          email, password, full_name: fullName, phone: phone || null, designation: designation || null, role,
          team_id: teamId === "__none__" ? null : teamId, is_active: true,
        }});
        toast.success("User created");
      }
      setOpen(false);
      onSaved();
      if (!existing) { setEmail(""); setPassword(""); setFullName(""); setPhone(""); setDesignation(""); }
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{existing ? "Edit user" : "Create new user"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div><Label>Email</Label><Input type="email" value={email} disabled={!!existing} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>{existing ? "New password (leave blank to keep)" : "Password"}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label>Designation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Senior Caller" /></div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Team</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No team</SelectItem>
                {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-primary">{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamRowItem({ team, users, onChanged }: { team: TeamRow; users: UserRow[]; onChanged: () => void }) {
  const del = useServerFn(adminDeleteTeam);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border bg-card p-3">
      <div className="flex-1">
        <div className="font-medium">{team.name}</div>
        <div className="text-xs text-muted-foreground">
          {team.member_count} member{team.member_count === 1 ? "" : "s"}
          {team.leader && ` · Leader: ${team.leader.full_name || team.leader.email}`}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <TeamDialog users={users} existing={team} onSaved={onChanged}>
          <Button variant="ghost" size="icon"><Pencil className="size-4" /></Button>
        </TeamDialog>
        <Button variant="ghost" size="icon" className="text-destructive" onClick={async () => {
          if (!confirm(`Delete team "${team.name}"?`)) return;
          try { await del({ data: { id: team.id } }); onChanged(); }
          catch (e) { toast.error((e as Error).message); }
        }}><Trash2 className="size-4" /></Button>
      </div>
    </div>
  );
}

function TeamDialog({ children, users, existing, onSaved }: {
  children: React.ReactNode; users: UserRow[]; existing?: TeamRow; onSaved: () => void;
}) {
  const create = useServerFn(adminCreateTeam);
  const update = useServerFn(adminUpdateTeam);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(existing?.name ?? "");
  const [leaderId, setLeaderId] = useState<string>(existing?.leader_id ?? "__none__");
  const [saving, setSaving] = useState(false);

  const leaderCandidates = users.filter((u) => u.roles.includes("team_leader") || u.roles.includes("admin"));

  async function save() {
    setSaving(true);
    try {
      const payload = { name, leader_id: leaderId === "__none__" ? null : leaderId };
      if (existing) await update({ data: { id: existing.id, ...payload } });
      else await create({ data: payload });
      toast.success(existing ? "Team updated" : "Team created");
      setOpen(false);
      onSaved();
      if (!existing) setName("");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{existing ? "Edit team" : "Create new team"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Team name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>Team leader</Label>
            <Select value={leaderId} onValueChange={setLeaderId}>
              <SelectTrigger><SelectValue placeholder="No leader" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No leader</SelectItem>
                {leaderCandidates.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Only users with Team Leader or Admin role appear here.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-primary">{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}