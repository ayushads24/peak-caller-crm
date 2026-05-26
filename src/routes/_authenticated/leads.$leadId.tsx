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
});

function Page() {
  const { leadId } = Route.useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);

  useEffect(() => {
    void load();
  }, [leadId]);

  async function load() {
    const [l, s, lb, p] = await Promise.all([
      supabase
        .from("leads")
        .select(
          "id, client_name, email, phone, sales_value, lead_source, status_id, created_at, assigned_to, created_by"
        )
        .eq("id", leadId)
        .single(),
      supabase
        .from("statuses")
        .select("id, name, color, is_sales, is_lost")
        .order("sort_order"),
      supabase.from("labels").select("id, name, color").order("name"),
      (supabase as any)
        .from("profiles_directory")
        .select("id, full_name, email")
        .order("full_name"),
    ]);
    if (l.data) setLead(l.data as LeadRow);
    setStatuses((s.data ?? []) as StatusRow[]);
    setLabels((lb.data ?? []) as LabelRow[]);
    setProfiles((p.data ?? []) as ProfileLite[]);
  }

  return (
    <LeadDetailSheet
      lead={lead}
      statuses={statuses}
      labels={labels}
      profiles={profiles}
      open={true}
      onOpenChange={(v) => {
        if (!v) void navigate({ to: "/leads" });
      }}
      onChanged={load}
    />
  );
}
