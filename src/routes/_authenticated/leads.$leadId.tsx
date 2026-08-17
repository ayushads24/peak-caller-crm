import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LeadDetailSheet,
  type LeadRow,
  type StatusRow,
  type LabelRow,
  type ProfileLite,
} from "@/components/leads/lead-detail-sheet";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  component: Page,
  validateSearch: (s: Record<string, unknown>) => ({ from: (s.from as string | undefined) ?? "" }),
});

function Page() {
  const { leadId } = Route.useParams();
  const { from } = Route.useSearch();
  const navigate = useNavigate();
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);

  useEffect(() => {
    void load();
  }, [leadId]);

  async function load() {
    const [related, s, lb, p] = await Promise.all([
      fetch(`/api/lead-related?lead_id=${leadId}`).then((r) => r.json()) as Promise<{ lead: LeadRow | null }>,
      supabase.from("statuses").select("id, name, color, is_sales, is_lost").order("sort_order"),
      supabase.from("labels").select("id, name, color").order("name"),
      (supabase as any).from("profiles_directory").select("id, full_name, email").order("full_name"),
    ]);
    if (related.lead) setLead(related.lead);
    setStatuses((s.data ?? []) as StatusRow[]);
    setLabels((lb.data ?? []) as LabelRow[]);
    setProfiles((p.data ?? []) as ProfileLite[]);
  }

  function handleClose() {
    if (from === "my-tasks") void navigate({ to: "/my-tasks" });
    else void navigate({ to: "/leads" });
  }

  return (
    <LeadDetailSheet
      lead={lead}
      statuses={statuses}
      labels={labels}
      profiles={profiles}
      open={true}
      onOpenChange={(v) => { if (!v) handleClose(); }}
      onChanged={load}
    />
  );
}
