import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  ONLINE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  OFFLINE: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  WARNING: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  UNKNOWN: "bg-muted text-muted-foreground border-border",
  ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  INACTIVE: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = status.toUpperCase();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
        STATUS_STYLES[key] ?? STATUS_STYLES.UNKNOWN,
        className,
      )}
    >
      {status}
    </span>
  );
}
