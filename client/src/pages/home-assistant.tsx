import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Plus, RefreshCw } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiJson, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTranslation } from "@/lib/i18n";

export default function HomeAssistantPage() {
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);
  const { toast } = useToast();
  const { canManageHierarchy } = useCurrentUser();
  const [storeId, setStoreId] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [apiToken, setApiToken] = useState("");

  const { data: stores = [] } = useQuery<any[]>({ queryKey: ["/api/stores"] });
  const effectiveStore = storeId || stores[0]?.id;

  const { data: instances = [] } = useQuery<any[]>({
    queryKey: ["/api/home-assistant", effectiveStore],
    queryFn: () => apiJson("GET", `/api/home-assistant?storeId=${effectiveStore}`),
    enabled: !!effectiveStore,
  });

  const invalidateHierarchy = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/home-assistant"] });
    queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
    queryClient.invalidateQueries({ queryKey: ["/api/kits"] });
    queryClient.invalidateQueries({ queryKey: ["/api/furniture"] });
    queryClient.invalidateQueries({ queryKey: ["/api/gateways"] });
  };

  const create = useMutation({
    mutationFn: () =>
      apiJson("POST", "/api/home-assistant", {
        storeId: effectiveStore,
        name,
        url,
        apiToken,
      }),
    onSuccess: (data: any) => {
      invalidateHierarchy();
      setOpen(false);
      setApiToken("");
      setName("");
      setUrl("");
      const d = data?.discovery;
      if (d?.error) {
        toast({
          title: tr("Instância guardada, mas a descoberta falhou", "Instance saved, but discovery failed"),
          description: d.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: tr("Hub de integração ligado", "Integration hub connected"),
          description: tr(
            `${d?.created ?? 0} novos · ${d?.updated ?? 0} atualizados · ${d?.discovered ?? 0} detetados`,
            `${d?.created ?? 0} created · ${d?.updated ?? 0} updated · ${d?.discovered ?? 0} discovered`,
          ),
        });
      }
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const sync = useMutation({
    mutationFn: (id: string) => apiJson("POST", `/api/home-assistant/${id}/discover`),
    onSuccess: (data: any) => {
      invalidateHierarchy();
      toast({
        title: tr("Dispositivos sincronizados", "Devices synced"),
        description: tr(
          `${data.created ?? 0} novos · ${data.updated ?? 0} atualizados · ${data.discovered ?? 0} detetados`,
          `${data.created ?? 0} created · ${data.updated ?? 0} updated · ${data.discovered ?? 0} discovered`,
        ),
      });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Breadcrumbs items={[{ label: tr("Hub de integração", "Integration hub") }]} />
          <h1 className="text-2xl font-semibold">{tr("Hub de integração", "Integration hub")}</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {tr(
              "Adicione URL e token da loja. O CtrlX deteta automaticamente lights, switches, TVs e outros controláveis via API — sem adicionar dispositivos à mão.",
              "Add the store URL and token. CtrlX automatically discovers lights, switches, TVs and other controllable entities via the API — no manual device entry.",
            )}
          </p>
        </div>
        {canManageHierarchy ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {tr("Adicionar", "Add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr("Ligar hub de integração", "Connect integration hub")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{tr("Loja", "Store")}</Label>
                <Select value={effectiveStore} onValueChange={setStoreId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{tr("Nome", "Name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>URL</Label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ha.example.com" />
              </div>
              <div className="space-y-2">
                <Label>API Token</Label>
                <Input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!name || !url || !apiToken || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending
                  ? tr("A descobrir…", "Discovering…")
                  : tr("Guardar e descobrir", "Save & discover")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        ) : null}
      </div>

      <div className="rounded-lg border divide-y">
        {instances.map((i) => (
          <div key={i.id} className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="min-w-0">
              <div className="font-medium">{i.name}</div>
              <div className="text-xs text-muted-foreground truncate">{i.url}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={i.status} />
              <Button
                size="sm"
                variant="outline"
                disabled={sync.isPending}
                onClick={() => sync.mutate(i.id)}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${sync.isPending ? "animate-spin" : ""}`} />
                {tr("Sincronizar", "Sync")}
              </Button>
            </div>
          </div>
        ))}
        {instances.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {tr(
              "Sem instâncias HA. Adicione uma para popular o inventário de dispositivos.",
              "No HA instances. Add one to populate the device inventory.",
            )}
          </p>
        ) : null}
      </div>

      {instances[0] ? (
        <p className="text-sm text-muted-foreground">
          {tr(
            "Os dispositivos sincronizados ficam na loja sob “Integração de dispositivos” → “Dispositivos sincronizados”. Abra a loja em ",
            "Synced devices live under “Device integration” → “Synced devices”. Open the store from ",
          )}
          <Link href="/stores" className="underline underline-offset-2">
            {tr("Lojas", "Stores")}
          </Link>
          {tr(" ou veja o estado em ", " or check live state in ")}
          <Link href="/monitoring" className="underline underline-offset-2">
            {tr("Monitorização", "Monitoring")}
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
