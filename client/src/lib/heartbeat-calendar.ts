export type HeartbeatLevel = "ok" | "degraded" | "offline";

export type HeartbeatHistoryBucket = {
  hourStart: string;
  level: HeartbeatLevel;
  sampleCount?: number;
};

export type HeartbeatCalendarHour = {
  level: HeartbeatLevel | null;
  at: Date;
};

export type HeartbeatCalendarDay = {
  date: Date;
  hours: HeartbeatCalendarHour[];
};

const LEVEL_PRIORITY: Record<HeartbeatLevel, number> = {
  ok: 0,
  degraded: 1,
  offline: 2,
};

function localHourKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  return `${y}-${m}-${day}-${h}`;
}

function worstLevel(a: HeartbeatLevel | null, b: HeartbeatLevel): HeartbeatLevel {
  if (!a) return b;
  return LEVEL_PRIORITY[a] >= LEVEL_PRIORITY[b] ? a : b;
}

/** Map UTC hourly buckets onto the viewer's local calendar grid. */
export function buildHeartbeatCalendar(
  buckets: HeartbeatHistoryBucket[],
  days = 14,
): HeartbeatCalendarDay[] {
  const levelByLocalHour = new Map<string, HeartbeatLevel>();
  for (const bucket of buckets) {
    const at = new Date(bucket.hourStart);
    const key = localHourKey(at);
    levelByLocalHour.set(key, worstLevel(levelByLocalHour.get(key) ?? null, bucket.level));
  }

  const grid: HeartbeatCalendarDay[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - dayOffset);
    const hours: HeartbeatCalendarHour[] = [];

    for (let hour = 0; hour < 24; hour += 1) {
      const at = new Date(date);
      at.setHours(hour, 0, 0, 0);
      hours.push({
        level: levelByLocalHour.get(localHourKey(at)) ?? null,
        at,
      });
    }

    grid.push({ date, hours });
  }

  return grid;
}

export function heartbeatLevelLabel(
  level: HeartbeatLevel | null,
  tr: (strings: { en: string; pt?: string; es?: string; fr?: string }) => string,
): string {
  switch (level) {
    case "ok":
      return tr({
        en: "All good",
        pt: "Tudo OK",
        es: "Todo bien",
        fr: "Tout va bien",
      });
    case "degraded":
      return tr({
        en: "Issue detected",
        pt: "Problema detetado",
        es: "Problema detectado",
        fr: "Problème détecté",
      });
    case "offline":
      return tr({
        en: "Offline",
        pt: "Offline",
        es: "Desconectado",
        fr: "Hors ligne",
      });
    default:
      return tr({
        en: "No data",
        pt: "Sem dados",
        es: "Sin datos",
        fr: "Aucune donnée",
      });
  }
}

export function heartbeatLevelClass(level: HeartbeatLevel | null): string {
  switch (level) {
    case "ok":
      return "bg-emerald-500";
    case "degraded":
      return "bg-orange-500";
    case "offline":
      return "bg-red-500";
    default:
      return "bg-muted";
  }
}
