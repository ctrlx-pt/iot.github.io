import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { StatusBadge } from "@/components/status-badge";
import { useTranslation } from "@/lib/i18n";

export default function GatewayDetailPage() {
  const [, params] = useRoute("/gateways/:gatewayId");
  const id = params?.gatewayId ?? "";
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);

  const { data: gw } = useQuery<any>({
    queryKey: ["/api/gateways", id],
    enabled: !!id,
  });

  if (!gw) return <p className="text-muted-foreground">{tr("A carregar…", "Loading…")}</p>;

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Gateways", href: "/gateways" }, { label: gw.name }]} />
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{gw.name}</h1>
        <StatusBadge status={gw.status} />
      </div>
      <p className="font-mono text-sm text-muted-foreground">{gw.hardwareId}</p>
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <Info label="IP" value={gw.ipAddress} />
        <Info label="MAC" value={gw.macAddress} />
        <Info label={tr("Versão", "Version")} value={gw.version} />
        <Info
          label={tr("Último contacto", "Last seen")}
          value={gw.lastSeenAt ? new Date(gw.lastSeenAt).toLocaleString() : "—"}
        />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value || "—"}</div>
    </div>
  );
}
