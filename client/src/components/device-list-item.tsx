import { Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { getDeviceVisual } from "@/lib/device-visuals";
import { cn } from "@/lib/utils";

type DeviceListItemProps = {
  id: string;
  name: string;
  deviceType?: string | null;
  deviceCode?: string | null;
  homeAssistantEntityId?: string | null;
  status?: string | null;
  /** When false, render a static row (e.g. monitoring). Default true. */
  link?: boolean;
  className?: string;
};

export function DeviceListItem({
  id,
  name,
  deviceType,
  deviceCode,
  homeAssistantEntityId,
  status,
  link = true,
  className,
}: DeviceListItemProps) {
  const visual = getDeviceVisual({ deviceType, homeAssistantEntityId });
  const { Icon } = visual;

  const body = (
    <>
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1",
            visual.wellClass,
          )}
          aria-hidden
        >
          <Icon className={cn("h-5 w-5", visual.iconClass)} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{name}</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {visual.label}
            </span>
          </div>
          {deviceCode ? (
            <div className="text-xs font-mono text-muted-foreground truncate">{deviceCode}</div>
          ) : null}
          {homeAssistantEntityId ? (
            <div className="text-xs text-muted-foreground truncate">{homeAssistantEntityId}</div>
          ) : null}
        </div>
      </div>
      {status ? <StatusBadge status={status} /> : null}
    </>
  );

  if (!link) {
    return (
      <div className={cn("flex items-center justify-between gap-3 px-4 py-3", className)}>{body}</div>
    );
  }

  return (
    <Link
      href={`/devices/${id}`}
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors",
        className,
      )}
    >
      {body}
    </Link>
  );
}
