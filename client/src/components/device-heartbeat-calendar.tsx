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
  days = 14,
}: Props) {
  const tr = useTr();

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
  const hourMarkers = [0, 6, 12, 18, 23];

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-medium">
            <HeartPulse className="h-4 w-4 text-emerald-600" />
            {tr({ en: "Heartbeat", pt: "Heartbeat", es: "Latido", fr: "Heartbeat" })}
          </div>
          <p className="text-xs text-muted-foreground">
            {tr({
              en: "Hourly status for the last {days} days",
              pt: "Estado horário dos últimos {days} dias",
              es: "Estado horario de los últimos {days} días",
              fr: "État horaire des {days} derniers jours",
            }).replace("{days}", String(days))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
            <span>
              {tr({ en: "Last seen", pt: "Última vez", es: "Última vez", fr: "Dernière vue" })}:{" "}
              {new Date(lastSeen).toLocaleString()}
            </span>
          ) : null}
          {onRefresh ? (
            <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin")} />
              {tr({ en: "Refresh", pt: "Atualizar", es: "Actualizar", fr: "Actualiser" })}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px] space-y-1">
          <div className="grid grid-cols-[88px_repeat(24,minmax(0,1fr))] gap-1 items-end pl-0.5">
            <div />
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="text-[10px] text-muted-foreground text-center leading-none">
                {hourMarkers.includes(hour) ? `${hour}h` : ""}
              </div>
            ))}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {tr({ en: "Loading history…", pt: "A carregar histórico…", es: "Cargando historial…", fr: "Chargement…" })}
            </p>
          ) : (
            <TooltipProvider delayDuration={100}>
              {calendar.map((day) => (
                <div
                  key={day.date.toISOString()}
                  className="grid grid-cols-[88px_repeat(24,minmax(0,1fr))] gap-1 items-center"
                >
                  <div className="text-xs text-muted-foreground pr-2 truncate">
                    {formatDayLabel(day.date, tr)}
                  </div>
                  {day.hours.map((hour) => (
                    <Tooltip key={hour.at.toISOString()}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "mx-auto h-3 w-3 rounded-full ring-1 ring-border/40",
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

      <div className="flex flex-wrap gap-4 pt-1">
        <LegendDot
          level="ok"
          label={tr({ en: "All good", pt: "Tudo OK", es: "Todo bien", fr: "Tout va bien" })}
        />
        <LegendDot
          level="degraded"
          label={tr({
            en: "Issue detected",
            pt: "Problema detetado",
            es: "Problema detectado",
            fr: "Problème détecté",
          })}
        />
        <LegendDot
          level="offline"
          label={tr({ en: "Offline", pt: "Offline", es: "Desconectado", fr: "Hors ligne" })}
        />
        <LegendDot
          level={null}
          label={tr({ en: "No data", pt: "Sem dados", es: "Sin datos", fr: "Aucune donnée" })}
        />
      </div>
    </div>
  );
}
