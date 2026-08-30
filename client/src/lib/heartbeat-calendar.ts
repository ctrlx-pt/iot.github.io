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
  endDate = new Date(),
): HeartbeatCalendarDay[] {
  const levelByLocalHour = new Map<string, HeartbeatLevel>();
  for (const bucket of buckets) {
    const at = new Date(bucket.hourStart);
    const key = localHourKey(at);
    levelByLocalHour.set(key, worstLevel(levelByLocalHour.get(key) ?? null, bucket.level));
  }

  const grid: HeartbeatCalendarDay[] = [];
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - dayOffset);
    grid.push(buildDayFromMap(date, levelByLocalHour));
  }

  return grid;
}

function buildDayFromMap(
  date: Date,
  levelByLocalHour: Map<string, HeartbeatLevel>,
): HeartbeatCalendarDay {
  const hours: HeartbeatCalendarHour[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const at = new Date(date);
    at.setHours(hour, 0, 0, 0);
    hours.push({
      level: levelByLocalHour.get(localHourKey(at)) ?? null,
      at,
    });
  }
  return { date, hours };
}

/** Monday-based week start (locale-friendly for PT/EU). */
export function startOfWeek(date: Date, weekStartsOn: 0 | 1 = 1): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = weekStartsOn === 1 ? (day === 0 ? -6 : 1 - day) : -day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function buildHeartbeatWeek(
  buckets: HeartbeatHistoryBucket[],
  weekStart: Date,
): HeartbeatCalendarDay[] {
  const levelByLocalHour = new Map<string, HeartbeatLevel>();
  for (const bucket of buckets) {
    const at = new Date(bucket.hourStart);
    const key = localHourKey(at);
    levelByLocalHour.set(key, worstLevel(levelByLocalHour.get(key) ?? null, bucket.level));
  }

  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const days: HeartbeatCalendarDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    days.push(buildDayFromMap(date, levelByLocalHour));
  }
  return days;
}

export function summarizeDay(hours: HeartbeatCalendarHour[]): HeartbeatLevel | null {
  let summary: HeartbeatLevel | null = null;
  for (const hour of hours) {
    if (hour.level) {
      summary = summary ? worstLevel(summary, hour.level) : hour.level;
    }
  }
  return summary;
}

export function formatWeekRange(weekStart: Date, locale?: string): string {
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const startStr = weekStart.toLocaleDateString(locale, opts);
  const endStr = end.toLocaleDateString(locale, {
    ...opts,
    year: weekStart.getFullYear() === end.getFullYear() ? undefined : "numeric",
  });
  const year = end.getFullYear();
  if (weekStart.getMonth() === end.getMonth()) {
    return `${weekStart.getDate()} – ${end.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return `${startStr} – ${endStr} ${year}`;
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
