import { useQuery } from "@tanstack/react-query";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DeviceListItem } from "@/components/device-list-item";
import { StatusBadge } from "@/components/status-badge";
import { MetricCard } from "@/components/metric-card";
import { useTranslation } from "@/lib/i18n";
import { Router, Cpu, Activity } from "lucide-react";

export default function MonitoringPage() {
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/monitoring"],
    refetchInterval: 20_000,
  });

  if (isLoading || !data) {
    return <p className="text-muted-foreground">{tr("A carregar…", "Loading…")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: tr("Monitorização", "Monitoring") }]} />
        <h1 className="text-2xl font-semibold">{tr("Monitorização", "Monitoring")}</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title={tr("Gateways online", "Gateways online")}
          value={data.counts.gatewaysOnline}
          icon={Router}
        />
        <MetricCard
          title={tr("Dispositivos online", "Devices online")}
          value={data.counts.devicesOnline}
          icon={Cpu}
        />
        <MetricCard
          title={tr("HA online", "HA online")}
          value={data.counts.haOnline}
          icon={Activity}
        />
      </div>

      <Section title="Gateways" rows={data.gateways} codeKey="hardwareId" />
      <Section title="Home Assistant" rows={data.homeAssistant} codeKey="url" />

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{tr("Dispositivos", "Devices")}</h2>
        <div className="rounded-lg border divide-y">
          {(data.devices as any[]).map((d) => (
            <DeviceListItem
              key={d.id}
              id={d.id}
              name={d.name}
              deviceType={d.deviceType}
              deviceCode={d.deviceCode}
              homeAssistantEntityId={d.homeAssistantEntityId}
              status={d.status}
            />
          ))}
          {data.devices.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">—</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Section({
  title,
  rows,
  codeKey,
}: {
  title: string;
  rows: any[];
  codeKey: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="rounded-lg border divide-y">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-medium">{r.name || r.friendlyName || r.id}</div>
              <div className="text-xs font-mono text-muted-foreground">{r[codeKey]}</div>
            </div>
            <StatusBadge status={r.status} />
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">—</p>
        ) : null}
      </div>
    </section>
  );
}
