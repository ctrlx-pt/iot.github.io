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
              "Os dispositivos são descobertos automaticamente a partir do Home Assistant. Configure a integração e sincronize em Operações → Home Assistant.",
              "Devices are discovered automatically from Home Assistant. Configure the integration and sync under Operations → Home Assistant.",
            )}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/home-assistant">{tr("Home Assistant", "Home Assistant")}</Link>
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
              "Ainda sem dispositivos. Adicione o Home Assistant desta loja e sincronize para os detetar.",
              "No devices yet. Add this store’s Home Assistant and sync to discover them.",
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}
