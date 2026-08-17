import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, isAdminOrManager } from "@/hooks/use-auth";
import { loadAppSettings, saveAppSetting } from "@/hooks/use-app-settings";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/rate-list")({ component: Page });

type RateItem = { key: string; label: string; price: string };
type RateSection = { key: string; label: string; items: RateItem[] };
type RateData = { sections: RateSection[] };

const DEFAULT_SECTIONS: RateSection[] = [
  {
    key: "full_day",
    label: "Full Day",
    items: [
      { key: "traditional_photo", label: "Traditional Photo", price: "" },
      { key: "traditional_video", label: "Traditional Video", price: "" },
      { key: "candid_photographer", label: "Candid Photographer", price: "" },
      { key: "cinematographer", label: "Cinematographer", price: "" },
    ],
  },
  {
    key: "half_day",
    label: "Half Day",
    items: [
      { key: "traditional_photo", label: "Traditional Photo", price: "" },
      { key: "traditional_video", label: "Traditional Video", price: "" },
      { key: "candid_photographer", label: "Candid Photographer", price: "" },
      { key: "cinematographer", label: "Cinematographer", price: "" },
    ],
  },
  {
    key: "additional",
    label: "Additional Services",
    items: [
      { key: "album_50_sheet", label: "Album 50 Sheet", price: "" },
      { key: "drone", label: "Drone", price: "" },
      { key: "pre_wedding", label: "Pre Wedding", price: "" },
      { key: "makeup_artist", label: "Makeup Artist", price: "" },
      { key: "led_wall", label: "LED Wall", price: "" },
      { key: "led_wall_with_live", label: "LED Wall with Live", price: "" },
      { key: "wedding_day_morning_ritual", label: "Wedding Day Morning Ritual", price: "" },
    ],
  },
];

function migrateOldFormat(raw: Record<string, unknown>): RateData {
  // old format: { full_day: { traditional_photo: "500", ... }, ... }
  return {
    sections: DEFAULT_SECTIONS.map((sec) => ({
      ...sec,
      items: sec.items.map((item) => ({
        ...item,
        price: String((raw[sec.key] as Record<string, string>)?.[item.key] ?? ""),
      })),
    })),
  };
}

function Page() {
  const { roles } = useAuth();
  const canEdit = isAdminOrManager(roles);
  const [data, setData] = useState<RateData>({ sections: DEFAULT_SECTIONS });
  const [saved, setSaved] = useState<RateData>({ sections: DEFAULT_SECTIONS });
  const [saving, setSaving] = useState(false);
  const [newItemLabels, setNewItemLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadAppSettings().then((s) => {
      if (!s.rate_list) return;
      try {
        const parsed = JSON.parse(s.rate_list) as Record<string, unknown>;
        const loaded: RateData = parsed.sections
          ? (parsed as RateData)
          : migrateOldFormat(parsed);
        setData(loaded);
        setSaved(loaded);
      } catch {
        // ignore malformed JSON
      }
    });
  }, []);

  const isDirty = JSON.stringify(data) !== JSON.stringify(saved);

  function updatePrice(sectionKey: string, itemKey: string, price: string) {
    setData((prev) => ({
      sections: prev.sections.map((sec) =>
        sec.key !== sectionKey
          ? sec
          : { ...sec, items: sec.items.map((it) => (it.key === itemKey ? { ...it, price } : it)) }
      ),
    }));
  }

  function deleteItem(sectionKey: string, itemKey: string) {
    setData((prev) => ({
      sections: prev.sections.map((sec) =>
        sec.key !== sectionKey
          ? sec
          : { ...sec, items: sec.items.filter((it) => it.key !== itemKey) }
      ),
    }));
  }

  function addItem(sectionKey: string) {
    const label = (newItemLabels[sectionKey] ?? "").trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") + "_" + Date.now();
    setData((prev) => ({
      sections: prev.sections.map((sec) =>
        sec.key !== sectionKey
          ? sec
          : { ...sec, items: [...sec.items, { key, label, price: "" }] }
      ),
    }));
    setNewItemLabels((prev) => ({ ...prev, [sectionKey]: "" }));
  }

  async function save() {
    setSaving(true);
    await saveAppSetting("rate_list", JSON.stringify(data));
    setSaved(data);
    toast.success("Rate list saved!");
    setSaving(false);
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-2xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Rate List</h1>
          <p className="text-muted-foreground mt-1 text-sm">Photography &amp; videography service prices</p>
        </div>
        {canEdit && isDirty && (
          <Button onClick={save} disabled={saving} className="bg-gradient-primary gap-1.5 shrink-0">
            <Save className="size-4" />
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        )}
      </div>

      <div className="space-y-5">
        {data.sections.map((section) => (
          <Card key={section.key} className="p-4 sm:p-6 shadow-card">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">
              {section.label}
            </h2>

            <div className="space-y-2">
              {section.items.map((item) => (
                <div key={item.key} className="flex items-center gap-2">
                  <span className="text-sm text-foreground flex-1 min-w-0">{item.label}</span>
                  <div className="relative w-36 shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">₹</span>
                    <Input
                      type="number"
                      min="0"
                      disabled={!canEdit}
                      value={item.price}
                      onChange={(e) => updatePrice(section.key, item.key, e.target.value)}
                      className="pl-7 text-right"
                      placeholder="0"
                    />
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => deleteItem(section.key, item.key)}
                      className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canEdit && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                <Input
                  placeholder="New item name…"
                  value={newItemLabels[section.key] ?? ""}
                  onChange={(e) =>
                    setNewItemLabels((prev) => ({ ...prev, [section.key]: e.target.value }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && addItem(section.key)}
                  className="flex-1 text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addItem(section.key)}
                  disabled={!(newItemLabels[section.key] ?? "").trim()}
                  className="gap-1 shrink-0"
                >
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {!canEdit && (
        <p className="text-xs text-muted-foreground text-center mt-6">
          Only admins and managers can edit rates.
        </p>
      )}
    </div>
  );
}
