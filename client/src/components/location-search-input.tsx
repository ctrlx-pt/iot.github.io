import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { apiJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string, type: "city" | "country") => void;
  placeholder?: string;
  className?: string;
  mode?: "city" | "country" | "both";
};

export function LocationSearchInput({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  mode = "both",
}: Props) {
  const [suggestions, setSuggestions] = useState<Array<{ label: string; type: "city" | "country" }>>(
    [],
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await apiJson<{ cities: string[]; countries: string[] }>(
          "GET",
          `/api/device-search/locations?q=${encodeURIComponent(value.trim())}`,
        );
        const items: Array<{ label: string; type: "city" | "country" }> = [];
        if (mode !== "country") {
          items.push(...data.cities.map((c) => ({ label: c, type: "city" as const })));
        }
        if (mode !== "city") {
          items.push(...data.countries.map((c) => ({ label: c, type: "country" as const })));
        }
        setSuggestions(items.slice(0, 12));
        setOpen(items.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [value, mode]);

  return (
    <div className={cn("relative", className)}>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => suggestions.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md">
          {suggestions.map((item) => (
            <li key={`${item.type}-${item.label}`}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(item.label);
                  onSelect?.(item.label, item.type);
                  setOpen(false);
                }}
              >
                <span>{item.label}</span>
                <span className="text-xs uppercase text-muted-foreground">{item.type}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
