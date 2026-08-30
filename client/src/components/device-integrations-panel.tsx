import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Clock, ExternalLink, Play, Plug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { apiJson, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTr } from "@/lib/tr";
import { useCurrentUser } from "@/hooks/use-current-user";

type Props = {
  deviceId: string;
};

export function DeviceIntegrationsPanel({ deviceId }: Props) {
  const tr = useTr();
  const { toast } = useToast();
  const { canManageHierarchy } = useCurrentUser();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/devices", deviceId, "integrations"],
    queryFn: () => apiJson("GET", `/api/devices/${deviceId}/integrations`),
    enabled: !!deviceId,
  });

  const syncHa = useMutation({
    mutationFn: (instanceId: string) =>
      apiJson("POST", `/api/home-assistant/${instanceId}/discover`),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId, "integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId] });
      toast({
        title: tr({ en: "Devices synced", pt: "Dispositivos sincronizados" }),
        description: tr({
          en: `${result.created ?? 0} new · ${result.updated ?? 0} updated`,
          pt: `${result.created ?? 0} novos · ${result.updated ?? 0} atualizados`,
        }),
      });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const triggerAutomation = useMutation({
    mutationFn: ({ instanceId, entityId }: { instanceId: string; entityId: string }) =>
      apiJson("POST", `/api/home-assistant/${instanceId}/automations/trigger`, { entityId }),
    onSuccess: () =>
      toast({ title: tr({ en: "Automation triggered", pt: "Automação executada" }) }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        {tr({ en: "Loading integrations…", pt: "A carregar integrações…" })}
      </p>
    );
  }

  if (!data) return null;

  const ha = data.homeAssistant;
  const automations: any[] = ha?.automations ?? [];

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <Plug className="h-4 w-4" />
          {tr({ en: "Integrations", pt: "Integrações" })}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/home-assistant">
            {tr({ en: "Integration hub", pt: "Hub de integração" })}
          </Link>
        </Button>
      </div>

      <div className="rounded-md border p-3 space-y-2 text-sm">
        <div className="font-medium">Home Assistant</div>
        {ha?.connected ? (
          <>
            <div className="text-muted-foreground">
              {tr({ en: "Entity", pt: "Entidade" })}:{" "}
              <code className="text-xs">{ha.entityId}</code>
            </div>
            {ha.instance ? (
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span>{ha.instance.name}</span>
                <StatusBadge status={ha.instance.status} />
                {canManageHierarchy ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    disabled={syncHa.isPending}
                    onClick={() => syncHa.mutate(ha.instance.id)}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncHa.isPending ? "animate-spin" : ""}`} />
                    {tr({ en: "Sync devices", pt: "Sincronizar dispositivos" })}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">
            {tr({
              en: "Not linked to Home Assistant. Connect the store hub and sync devices.",
              pt: "Sem ligação à Home Assistant. Ligue o hub da loja e sincronize dispositivos.",
            })}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" />
            {tr({ en: "Home Assistant automations", pt: "Automações Home Assistant" })}
          </div>
          {ha?.automationsEditorUrl ? (
            <Button asChild size="sm" variant="outline">
              <a href={ha.automationsEditorUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                {tr({ en: "Create in HA", pt: "Criar na HA" })}
              </a>
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {tr({
            en: "Automations are managed in Home Assistant. Below are automations that may reference this device.",
            pt: "As automações são geridas na Home Assistant. Abaixo, automações que podem referenciar este dispositivo.",
          })}
        </p>

        {automations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tr({
              en: "No related automations found. Create them in Home Assistant.",
              pt: "Nenhuma automação relacionada. Crie-as na Home Assistant.",
            })}
          </p>
        ) : (
          <div className="rounded-md border divide-y">
            {automations.map((a) => (
              <div key={a.entityId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{a.entityId}</div>
                </div>
                {ha?.instance ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={triggerAutomation.isPending}
                    onClick={() =>
                      triggerAutomation.mutate({
                        instanceId: ha.instance.id,
                        entityId: a.entityId,
                      })
                    }
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
