import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, HeartPulse, RefreshCw } from "lucide-react";
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
  buildHeartbeatWeek,
  formatWeekRange,
  heartbeatLevelClass,
  heartbeatLevelLabel,
  startOfWeek,
  summarizeDay,
  type HeartbeatLevel,
} from "@/lib/heartbeat-calendar";
import { cn } from "@/lib/utils";

const HISTORY_DAYS = 90;
const MAX_WEEKS_BACK = Math.floor(HISTORY_DAYS / 7);

type Props = {
  deviceId: string;
  source?: string;
  lastSeen?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  compact?: boolean;
};

function LegendDot({ level, label }: { level: HeartbeatLevel | null; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", heartbeatLevelClass(level))} />
      {label}
    </div>
  );
}

function isFutureDay(date: Date): boolean {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date.getTime() > today.getTime();
}

function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function DeviceHeartbeatCalendar({
  deviceId,
  source,
  lastSeen,
  onRefresh,
  refreshing,
  compact = false,
}: Props) {
  const tr = useTr();
  const [weekOffset, setWeekOffset] = useState(0);

  const { data: history, isLoading } = useQuery({
    queryKey: ["/api/devices", deviceId, "heartbeat", "history", HISTORY_DAYS],
    queryFn: () =>
      apiJson<{ days: number; buckets: { hourStart: string; level: HeartbeatLevel }[] }>(
        "GET",
        `/api/devices/${deviceId}/heartbeat/history?days=${HISTORY_DAYS}`,
      ),
    enabled: !!deviceId,
    refetchInterval: 60_000,
  });

  const weekStart = useMemo(() => {
    const today = new Date();
    const current = startOfWeek(today, 1);
    current.setDate(current.getDate() - weekOffset * 7);
    return current;
  }, [weekOffset]);

  const weekDays = useMemo(
    () => buildHeartbeatWeek(history?.buckets ?? [], weekStart),
    [history?.buckets, weekStart],
  );

  const weekLabel = formatWeekRange(weekStart);
  const canGoForward = weekOffset > 0;
  const canGoBack = weekOffset < MAX_WEEKS_BACK - 1;

  return (
    <div className={cn("rounded-lg border space-y-3", compact ? "p-3" : "p-4")}>
      <div className={cn("flex gap-2", compact ? "flex-col" : "flex-wrap items-start justify-between")}>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 font-medium text-sm">
            <HeartPulse className="h-3.5 w-3.5 text-emerald-600" />
            {tr({ en: "Heartbeat", pt: "Heartbeat", es: "Latido", fr: "Heartbeat" })}
          </div>
        </div>
        <div className={cn("flex flex-wrap items-center gap-2 text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>
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
              {new Date(lastSeen).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
            </span>
          ) : null}
          {onRefresh ? (
            <Button
              size="sm"
              variant="outline"
              className={compact ? "h-7 px-2 text-xs" : undefined}
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw className={cn("h-3 w-3 mr-1", refreshing && "animate-spin")} />
              {tr({ en: "Refresh", pt: "Atualizar", es: "Actualizar", fr: "Actualiser" })}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={!canGoBack}
          onClick={() => setWeekOffset((w) => w + 1)}
          aria-label={tr({ en: "Previous week", pt: "Semana anterior", es: "Semana anterior", fr: "Semaine précédente" })}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-xs font-medium truncate">{weekLabel}</div>
          {weekOffset > 0 ? (
            <button
              type="button"
              className="text-[10px] text-primary hover:underline"
              onClick={() => setWeekOffset(0)}
            >
              {tr({ en: "This week", pt: "Esta semana", es: "Esta semana", fr: "Cette semaine" })}
            </button>
          ) : (
            <div className="text-[10px] text-muted-foreground">
              {tr({ en: "This week", pt: "Esta semana", es: "Esta semana", fr: "Cette semaine" })}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={!canGoForward}
          onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
          aria-label={tr({ en: "Next week", pt: "Semana seguinte", es: "Semana siguiente", fr: "Semaine suivante" })}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          {tr({ en: "Loading history…", pt: "A carregar histórico…", es: "Cargando historial…", fr: "Chargement…" })}
        </p>
      ) : (
        <TooltipProvider delayDuration={100}>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day) => {
              const future = isFutureDay(day.date);
              const today = isToday(day.date);
              const summary = summarizeDay(day.hours);
              const weekday = day.date.toLocaleDateString(undefined, { weekday: "short" });
              const dayNum = day.date.getDate();

              return (
                <Tooltip key={day.date.toISOString()}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-md border px-0.5 py-1.5 text-center transition-colors",
                        today && "border-primary/50 bg-primary/5",
                        future && "opacity-40",
                        !future && !today && "border-border/60",
                      )}
                    >
                      <span className="text-[9px] text-muted-foreground uppercase truncate w-full">
                        {weekday.replace(".", "")}
                      </span>
                      <span className={cn("text-[11px] font-medium leading-none", today && "text-primary")}>
                        {dayNum}
                      </span>
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full ring-1 ring-border/40",
                          future ? "bg-transparent" : heartbeatLevelClass(summary),
                        )}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[220px]">
                    <div className="font-medium mb-1">
                      {day.date.toLocaleDateString(undefined, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </div>
                    {future ? (
                      <div>{tr({ en: "Future", pt: "Futuro", es: "Futuro", fr: "Futur" })}</div>
                    ) : (
                      <>
                        <div className="mb-1.5">{heartbeatLevelLabel(summary, tr)}</div>
                        <div className="grid grid-cols-12 gap-0.5">
                          {day.hours.map((hour) => (
                            <span
                              key={hour.at.toISOString()}
                              className={cn("h-1.5 w-1.5 rounded-full", heartbeatLevelClass(hour.level))}
                              title={`${hour.at.getHours()}h — ${heartbeatLevelLabel(hour.level, tr)}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      )}

      <div className="flex flex-wrap gap-2 pt-0.5">
        <LegendDot
          level="ok"
          label={tr({ en: "All good", pt: "Tudo OK", es: "Todo bien", fr: "Tout va bien" })}
        />
        <LegendDot
          level="degraded"
          label={tr({ en: "Issue", pt: "Problema", es: "Problema", fr: "Problème" })}
        />
        <LegendDot
          level="offline"
          label={tr({ en: "Offline", pt: "Offline", es: "Desconectado", fr: "Hors ligne" })}
        />
      </div>
    </div>
  );
}
