import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { apiJson, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";
import { getDeviceVisual } from "@/lib/device-visuals";
import { cn } from "@/lib/utils";
import { useState } from "react";

export default function DeviceDetailPage() {
  const [, params] = useRoute("/devices/:deviceId");
  const deviceId = params?.deviceId ?? "";
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);
  const { toast } = useToast();
  const [brightness, setBrightness] = useState(80);

  const { data: device } = useQuery<any>({
    queryKey: ["/api/devices", deviceId],
    enabled: !!deviceId,
  });

  const { data: state } = useQuery<any>({
    queryKey: ["/api/devices", deviceId, "state"],
    queryFn: () => apiJson("GET", `/api/devices/${deviceId}/state`),
    enabled: !!deviceId,
    refetchInterval: 15_000,
  });

  const control = useMutation({
    mutationFn: (body: any) => apiJson("POST", `/api/devices/${deviceId}/control`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId, "state"] });
      toast({ title: tr("Comando enviado", "Command sent") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!device) return <p className="text-muted-foreground">{tr("A carregar…", "Loading…")}</p>;

  const caps: string[] = device.capabilities || [];
  const visual = getDeviceVisual({
    deviceType: device.deviceType,
    homeAssistantEntityId: device.homeAssistantEntityId,
  });
  const { Icon } = visual;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ring-1",
            visual.wellClass,
          )}
          aria-hidden
        >
          <Icon className={cn("h-7 w-7", visual.iconClass)} />
        </div>
        <div className="min-w-0">
          <Breadcrumbs items={[{ label: tr("Dispositivos", "Devices") }, { label: device.name }]} />
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold">{device.name}</h1>
            <StatusBadge status={state?.status || device.status} />
          </div>
          <p className="font-mono text-sm text-muted-foreground">{device.deviceCode}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {visual.label}
            {device.homeAssistantEntityId ? ` · ${device.homeAssistantEntityId}` : ""}
            {state?.mapped === false ? ` · ${tr("sem mapeamento HA", "not HA-mapped")}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {caps.includes("Power") ? (
          <>
            <Button onClick={() => control.mutate({ action: "on" })}>ON</Button>
            <Button variant="secondary" onClick={() => control.mutate({ action: "off" })}>
              OFF
            </Button>
            <Button variant="outline" onClick={() => control.mutate({ action: "toggle" })}>
              TOGGLE
            </Button>
          </>
        ) : null}
      </div>

      {caps.includes("Brightness") ? (
        <div className="max-w-md space-y-3 rounded-lg border p-4">
          <div className="text-sm font-medium">
            {tr("Brilho", "Brightness")}: {brightness}%
          </div>
          <Slider
            value={[brightness]}
            min={0}
            max={100}
            step={1}
            onValueChange={(v) => setBrightness(v[0] ?? 0)}
          />
          <Button
            size="sm"
            onClick={() => control.mutate({ action: "set_brightness", brightness })}
          >
            {tr("Aplicar", "Apply")}
          </Button>
        </div>
      ) : null}

      {caps.includes("Color") ? (
        <div className="flex gap-2">
          {["#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffaa00"].map((c) => (
            <button
              key={c}
              className="h-8 w-8 rounded-full border"
              style={{ background: c }}
              onClick={() => control.mutate({ action: "set_color", color: c })}
              aria-label={c}
            />
          ))}
        </div>
      ) : null}

      <pre className="rounded-lg border bg-muted/30 p-4 text-xs overflow-auto">
        {JSON.stringify(state ?? { configuration: device.configuration }, null, 2)}
      </pre>
    </div>
  );
}
