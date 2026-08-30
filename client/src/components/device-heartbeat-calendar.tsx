import { useQuery } from "@tanstack/react-query";
import { HeartPulse, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiJson } from "@/lib/queryClient";
import { useTr } from "@/lib/tr";
import {
  buildHeartbeatCalendar,
  heartbeatLevelClass,
  heartbeatLevelLabel,
  type HeartbeatLevel,
} from "@/lib/heartbeat-calendar";
import { cn } from "@/lib/utils";

type Props = {
  deviceId: string;
  source?: string;
  lastSeen?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  days?: number;
  compact?: boolean;
};

function formatDayLabel(date: Date, tr: ReturnType<typeof useTr>): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return tr({ en: "Today", pt: "Hoje", es: "Hoy", fr: "Aujourd'hui" });
  }
  if (diffDays === 1) {
    return tr({ en: "Yesterday", pt: "Ontem", es: "Ayer", fr: "Hier" });
  }
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function LegendDot({ level, label }: { level: HeartbeatLevel | null; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-2.5 w-2.5 rounded-full", heartbeatLevelClass(level))} />
      {label}
    </div>
  );
}

export function DeviceHeartbeatCalendar({
  deviceId,
  source,
  lastSeen,
  onRefresh,
  refreshing,
  days: daysProp,
  compact = false,
}: Props) {
  const tr = useTr();
  const days = daysProp ?? (compact ? 7 : 14);

  const { data: history, isLoading } = useQuery({
    queryKey: ["/api/devices", deviceId, "heartbeat", "history", days],
    queryFn: () =>
      apiJson<{ days: number; buckets: { hourStart: string; level: HeartbeatLevel }[] }>(
        "GET",
        `/api/devices/${deviceId}/heartbeat/history?days=${days}`,
      ),
    enabled: !!deviceId,
    refetchInterval: 60_000,
  });

  const calendar = buildHeartbeatCalendar(history?.buckets ?? [], days);
  const hourMarkers = compact ? [0, 12, 23] : [0, 6, 12, 18, 23];
  const dayCol = compact ? "52px" : "88px";
  const dotSize = compact ? "h-2 w-2" : "h-3 w-3";

  return (
    <div className={cn("rounded-lg border space-y-3", compact ? "p-3" : "p-4 space-y-4")}>
      <div className={cn("flex gap-2", compact ? "flex-col" : "flex-wrap items-start justify-between gap-3")}>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 font-medium text-sm">
            <HeartPulse className="h-3.5 w-3.5 text-emerald-600" />
            {tr({ en: "Heartbeat", pt: "Heartbeat", es: "Latido", fr: "Heartbeat" })}
          </div>
          {!compact ? (
            <p className="text-xs text-muted-foreground">
              {tr({
                en: "Hourly status for the last {days} days",
                pt: "Estado horário dos últimos {days} dias",
                es: "Estado horario de los últimos {days} días",
                fr: "État horaire des {days} derniers jours",
              }).replace("{days}", String(days))}
            </p>
          ) : null}
        </div>
        <div className={cn("flex flex-wrap items-center gap-2 text-muted-foreground", compact ? "text-[10px]" : "text-xs gap-3")}>
          {source ? (
            <span>
              {tr({ en: "Source", pt: "Origem", es: "Origen", fr: "Source" })}:{" "}
              <span className="font-medium text-foreground">
                {source === "integration"
                  ? tr({
                      en: "Integration hub",
                      pt: "Hub de integração",
                      es: "Hub de integración",
                      fr: "Hub d'intégration",
                    })
                  : tr({ en: "Simulated", pt: "Simulado", es: "Simulado", fr: "Simulé" })}
              </span>
            </span>
          ) : null}
          {lastSeen ? (
            <span className={compact ? "block w-full" : undefined}>
              {tr({ en: "Last seen", pt: "Última vez", es: "Última vez", fr: "Dernière vue" })}:{" "}
              {new Date(lastSeen).toLocaleString(undefined, compact ? { dateStyle: "short", timeStyle: "short" } : undefined)}
            </span>
          ) : null}
          {onRefresh ? (
            <Button size="sm" variant="outline" className={compact ? "h-7 px-2 text-xs" : undefined} disabled={refreshing} onClick={onRefresh}>
              <RefreshCw className={cn("h-3 w-3", !compact && "h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin", compact && "mr-1")} />
              {tr({ en: "Refresh", pt: "Atualizar", es: "Actualizar", fr: "Actualiser" })}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className={cn("space-y-0.5", compact ? "min-w-[280px]" : "min-w-[640px] space-y-1")}>
          <div
            className="grid gap-0.5 items-end pl-0.5"
            style={{ gridTemplateColumns: `${dayCol} repeat(24, minmax(0, 1fr))` }}
          >
            <div />
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="text-[9px] text-muted-foreground text-center leading-none">
                {hourMarkers.includes(hour) ? `${hour}h` : ""}
              </div>
            ))}
          </div>

          {isLoading ? (
            <p className={cn("text-muted-foreground text-center", compact ? "text-xs py-3" : "text-sm py-6")}>
              {tr({ en: "Loading history…", pt: "A carregar histórico…", es: "Cargando historial…", fr: "Chargement…" })}
            </p>
          ) : (
            <TooltipProvider delayDuration={100}>
              {calendar.map((day) => (
                <div
                  key={day.date.toISOString()}
                  className="grid gap-0.5 items-center"
                  style={{ gridTemplateColumns: `${dayCol} repeat(24, minmax(0, 1fr))` }}
                >
                  <div className={cn("text-muted-foreground pr-1 truncate", compact ? "text-[10px]" : "text-xs pr-2")}>
                    {formatDayLabel(day.date, tr)}
                  </div>
                  {day.hours.map((hour) => (
                    <Tooltip key={hour.at.toISOString()}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "mx-auto rounded-full ring-1 ring-border/40",
                            dotSize,
                            heartbeatLevelClass(hour.level),
                          )}
                          aria-label={heartbeatLevelLabel(hour.level, tr)}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <div className="font-medium">
                          {hour.at.toLocaleString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <div>{heartbeatLevelLabel(hour.level, tr)}</div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              ))}
            </TooltipProvider>
          )}
        </div>
      </div>

      <div className={cn("flex flex-wrap pt-0.5", compact ? "gap-2" : "gap-4 pt-1")}>
        <LegendDot
          level="ok"
          label={tr({ en: "All good", pt: "Tudo OK", es: "Todo bien", fr: "Tout va bien" })}
        />
        <LegendDot
          level="degraded"
          label={compact
            ? tr({ en: "Issue", pt: "Problema", es: "Problema", fr: "Problème" })
            : tr({ en: "Issue detected", pt: "Problema detetado", es: "Problema detectado", fr: "Problème détecté" })}
        />
        <LegendDot
          level="offline"
          label={tr({ en: "Offline", pt: "Offline", es: "Desconectado", fr: "Hors ligne" })}
        />
        {!compact ? (
          <LegendDot
            level={null}
            label={tr({ en: "No data", pt: "Sem dados", es: "Sin datos", fr: "Aucune donnée" })}
          />
        ) : null}
      </div>
    </div>
  );
}
