import { useQuery } from "@tanstack/react-query";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useTranslation } from "@/lib/i18n";

export default function ActivityLogs() {
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);

  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
  });

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: tr("Logs", "Logs") }]} />
        <h1 className="text-2xl font-semibold">{tr("Audit logs", "Audit logs")}</h1>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground">{tr("A carregar…", "Loading…")}</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {logs.map((l) => (
            <div key={l.id} className="px-4 py-3 text-sm">
              <div className="font-medium">
                {l.action} · {l.entityType}
                {l.entityId ? ` · ${l.entityId.slice(0, 8)}…` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {l.createdAt ? new Date(l.createdAt).toLocaleString() : ""}
                {l.ipAddress ? ` · ${l.ipAddress}` : ""}
              </div>
            </div>
          ))}
          {logs.length === 0 ? (
            <p className="px-4 py-6 text-muted-foreground">{tr("Sem eventos.", "No events.")}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
