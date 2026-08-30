import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ExternalLink, Play, RefreshCw } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiJson, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTr } from "@/lib/tr";

type HaAutomation = {
  entityId: string;
  name: string;
  state: string;
  lastTriggered: string | null;
  editorUrl: string;
};

export default function AutomationsPage() {
  const tr = useTr();
  const { toast } = useToast();
  const [storeId, setStoreId] = useState("");

  const { data: stores = [] } = useQuery<any[]>({ queryKey: ["/api/stores"] });
  const effectiveStore = storeId || stores[0]?.id;

  const { data: instances = [] } = useQuery<any[]>({
    queryKey: ["/api/home-assistant", effectiveStore],
    queryFn: () => apiJson("GET", `/api/home-assistant?storeId=${effectiveStore}`),
    enabled: !!effectiveStore,
  });

  const instance = instances[0];

  const {
    data: haData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery<{ automations: HaAutomation[]; editorUrl: string }>({
    queryKey: ["/api/home-assistant", instance?.id, "automations"],
    queryFn: () => apiJson("GET", `/api/home-assistant/${instance.id}/automations`),
    enabled: !!instance?.id,
  });

  const trigger = useMutation({
    mutationFn: (entityId: string) =>
      apiJson("POST", `/api/home-assistant/${instance!.id}/automations/trigger`, { entityId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/home-assistant", instance?.id, "automations"],
      });
      toast({ title: tr({ en: "Automation triggered", pt: "Automação executada" }) });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const automations = haData?.automations ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: tr({ en: "Automations", pt: "Automações" }) }]} />
          <h1 className="text-2xl font-semibold">
            {tr({ en: "Home Assistant automations", pt: "Automações Home Assistant" })}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            {tr({
              en: "Automations are created and edited in Home Assistant. CtrlX only lists and triggers them.",
              pt: "As automações são criadas e editadas na Home Assistant. O CtrlX apenas lista e executa.",
            })}
          </p>
        </div>
        {haData?.editorUrl ? (
          <Button asChild variant="outline">
            <a href={haData.editorUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              {tr({ en: "Open in Home Assistant", pt: "Abrir na Home Assistant" })}
            </a>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={effectiveStore} onValueChange={setStoreId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={tr({ en: "Store", pt: "Loja" })} />
          </SelectTrigger>
          <SelectContent>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {instance ? (
          <Button size="sm" variant="outline" disabled={isFetching} onClick={() => refetch()}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            {tr({ en: "Refresh", pt: "Atualizar" })}
          </Button>
        ) : null}
      </div>

      {!instance ? (
        <p className="text-sm text-muted-foreground rounded-lg border px-4 py-6">
          {tr({
            en: "No integration hub for this store. Connect Home Assistant under Operations → Integration hub.",
            pt: "Sem hub de integração nesta loja. Ligue a Home Assistant em Operações → Hub de integração.",
          })}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">{tr({ en: "Loading…", pt: "A carregar…" })}</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {automations.map((a) => (
            <div key={a.entityId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-medium flex flex-wrap items-center gap-2">
                  {a.name}
                  <StatusBadge status={a.state === "on" ? "ONLINE" : "OFFLINE"} />
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  <code>{a.entityId}</code>
                  {a.lastTriggered
                    ? ` · ${tr({ en: "Last run", pt: "Última execução" })} ${new Date(a.lastTriggered).toLocaleString()}`
                    : ""}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={trigger.isPending}
                onClick={() => trigger.mutate(a.entityId)}
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                {tr({ en: "Run", pt: "Executar" })}
              </Button>
            </div>
          ))}
          {automations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {tr({
                en: "No automations found in Home Assistant for this store.",
                pt: "Nenhuma automação encontrada na Home Assistant desta loja.",
              })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
