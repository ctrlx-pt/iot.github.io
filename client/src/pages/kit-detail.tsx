import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DeviceListItem } from "@/components/device-list-item";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/queryClient";
import { useTranslation } from "@/lib/i18n";

export default function KitDetailPage() {
  const [, params] = useRoute("/kits/:kitId");
  const kitId = params?.kitId ?? "";
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);

  const { data: kit } = useQuery<any>({
    queryKey: ["/api/kits", kitId],
    enabled: !!kitId,
  });

  const { data: devices = [] } = useQuery<any[]>({
    queryKey: ["/api/devices", { kitId }],
    queryFn: () => apiJson("GET", `/api/devices?kitId=${kitId}`),
    enabled: !!kitId,
  });

  if (!kit) return <p className="text-muted-foreground">{tr("A carregar…", "Loading…")}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: tr("Kits", "Kits") },
              { label: kit.name },
            ]}
          />
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{kit.name}</h1>
            <StatusBadge status={kit.status} />
          </div>
          <p className="font-mono text-sm text-muted-foreground">{kit.kitCode}</p>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            {tr(
              "Os dispositivos são sincronizados automaticamente a partir do hub de integração. Configure em Operações → Hub de integração.",
              "Devices sync automatically from the integration hub. Configure under Operations → Integration hub.",
            )}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/home-assistant">{tr("Hub de integração", "Integration hub")}</Link>
        </Button>
      </div>

      <div className="rounded-lg border divide-y">
        {devices.map((d) => (
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
        {devices.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {tr(
              "Ainda sem dispositivos. Ligue o hub de integração desta loja e sincronize.",
              "No devices yet. Connect this store's integration hub and sync.",
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}
