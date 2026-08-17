import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, Users, X, Search } from "lucide-react";

interface ProfileLite { id: string; full_name: string | null; email: string | null }

interface Props {
  profiles: ProfileLite[];
  selected: string[];         // selected user IDs
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

export function MultiUserSelect({ profiles, selected, onChange, placeholder = "All Members" }: Props) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");

  const filtered = profiles.filter((p) =>
    (p.full_name ?? p.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (profiles.find((p) => p.id === selected[0])?.full_name ?? profiles.find((p) => p.id === selected[0])?.email ?? "1 member")
        : `${selected.length} members`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm font-normal max-w-52 justify-start">
          <Users className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
          {selected.length > 0 && (
            <span className="ml-auto size-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shrink-0">
              {selected.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        {/* Search */}
        <div className="flex items-center gap-1.5 border rounded-md px-2 py-1 mb-2">
          <Search className="size-3 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="text-xs w-full bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Clear */}
        {selected.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="w-full flex items-center gap-1.5 px-2 py-1 mb-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
          >
            <X className="size-3" /> Clear selection
          </button>
        )}

        {/* List */}
        <div className="space-y-0.5 max-h-52 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">No match</p>
          )}
          {filtered.map((p) => {
            const isSelected = selected.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted text-sm text-left transition-colors"
              >
                <div className={`size-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                  {isSelected && <Check className="size-2.5 text-white" />}
                </div>
                <span className="truncate">{p.full_name || p.email || "Unknown"}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
