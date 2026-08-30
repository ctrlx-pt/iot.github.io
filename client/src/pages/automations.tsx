import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiJson, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTr } from "@/lib/tr";
import { useCurrentUser } from "@/hooks/use-current-user";

type Automation = {
  configId: string;
  entityId: string;
  name: string;
  state: string;
  lastTriggered: string | null;
  time: string | null;
  deviceEntityId: string | null;
  action: "on" | "off" | null;
};

type StoreDevice = {
  id: string;
  name: string;
  homeAssistantEntityId: string | null;
};

type AutomationForm = {
  name: string;
  time: string;
  deviceEntityId: string;
  action: "on" | "off";
};

const emptyForm = (): AutomationForm => ({
  name: "",
  time: "09:00",
  deviceEntityId: "",
  action: "on",
});

export default function AutomationsPage() {
  const tr = useTr();
  const { toast } = useToast();
  const { canManageHierarchy } = useCurrentUser();
  const [storeId, setStoreId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [form, setForm] = useState<AutomationForm>(emptyForm());

  const { data: stores = [] } = useQuery<any[]>({ queryKey: ["/api/stores"] });
  const effectiveStore = storeId || stores[0]?.id;

  const { data: instances = [] } = useQuery<any[]>({
    queryKey: ["/api/home-assistant", effectiveStore],
    queryFn: () => apiJson("GET", `/api/home-assistant?storeId=${effectiveStore}`),
    enabled: !!effectiveStore,
  });

  const instance = instances[0];

  const { data: storeDevices = [] } = useQuery<StoreDevice[]>({
    queryKey: ["/api/devices", { storeId: effectiveStore }],
    queryFn: () => apiJson("GET", `/api/devices?storeId=${effectiveStore}`),
    enabled: !!effectiveStore,
  });

  const linkedDevices = storeDevices.filter((d) => d.homeAssistantEntityId);

  const {
    data: haData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery<{ automations: Automation[] }>({
    queryKey: ["/api/home-assistant", instance?.id, "automations"],
    queryFn: () => apiJson("GET", `/api/home-assistant/${instance.id}/automations`),
    enabled: !!instance?.id,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["/api/home-assistant", instance?.id, "automations"],
    });

  const trigger = useMutation({
    mutationFn: (entityId: string) =>
      apiJson("POST", `/api/home-assistant/${instance!.id}/automations/trigger`, { entityId }),
    onSuccess: () => {
      invalidate();
      toast({ title: tr({ en: "Automation triggered", pt: "Automação executada" }) });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: () => {
      if (editing) {
        return apiJson("PATCH", `/api/home-assistant/${instance!.id}/automations/${editing.configId}`, form);
      }
      return apiJson("POST", `/api/home-assistant/${instance!.id}/automations`, form);
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm());
      toast({
        title: tr({
          en: editing ? "Automation updated" : "Automation created",
          pt: editing ? "Automação atualizada" : "Automação criada",
        }),
      });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (configId: string) =>
      apiJson("DELETE", `/api/home-assistant/${instance!.id}/automations/${configId}`),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast({ title: tr({ en: "Automation deleted", pt: "Automação eliminada" }) });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const toggleEnabled = useMutation({
    mutationFn: ({ entityId, enabled }: { entityId: string; enabled: boolean }) =>
      apiJson("POST", `/api/home-assistant/${instance!.id}/automations/enable`, {
        entityId,
        enabled,
      }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const automations = haData?.automations ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm(),
      deviceEntityId: linkedDevices[0]?.homeAssistantEntityId ?? "",
    });
    setDialogOpen(true);
  };

  const openEdit = (a: Automation) => {
    setEditing(a);
    setForm({
      name: a.name,
      time: a.time ?? "09:00",
      deviceEntityId: a.deviceEntityId ?? linkedDevices[0]?.homeAssistantEntityId ?? "",
      action: a.action ?? "on",
    });
    setDialogOpen(true);
  };

  const deviceLabel = (entityId: string | null) => {
    if (!entityId) return null;
    const d = linkedDevices.find((x) => x.homeAssistantEntityId === entityId);
    return d ? d.name : entityId;
  };

  const canSave =
    form.name.trim() && form.time && form.deviceEntityId && (form.action === "on" || form.action === "off");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: tr({ en: "Automations", pt: "Automações" }) }]} />
          <h1 className="text-2xl font-semibold">
            {tr({ en: "Automations", pt: "Automações" })}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            {tr({
              en: "Create and manage scheduled automations for devices in this store.",
              pt: "Crie e gira automações agendadas para dispositivos desta loja.",
            })}
          </p>
        </div>
        {instance && canManageHierarchy ? (
          <Button onClick={openCreate} disabled={linkedDevices.length === 0}>
            <Plus className="h-4 w-4 mr-2" />
            {tr({ en: "New automation", pt: "Nova automação" })}
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
            en: "No integration hub for this store. Connect it under Operations → Integration hub.",
            pt: "Sem hub de integração nesta loja. Ligue em Operações → Hub de integração.",
          })}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">{tr({ en: "Loading…", pt: "A carregar…" })}</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {automations.map((a) => (
            <div key={a.entityId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium flex flex-wrap items-center gap-2">
                  {a.name}
                  <StatusBadge status={a.state === "on" ? "ONLINE" : "OFFLINE"} />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {a.time
                    ? `${tr({ en: "Daily at", pt: "Diariamente às" })} ${a.time}`
                    : null}
                  {a.deviceEntityId
                    ? ` · ${deviceLabel(a.deviceEntityId) ?? a.deviceEntityId}`
                    : null}
                  {a.action
                    ? ` · ${a.action === "on" ? tr({ en: "Turn on", pt: "Ligar" }) : tr({ en: "Turn off", pt: "Desligar" })}`
                    : null}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {a.lastTriggered
                    ? `${tr({ en: "Last run", pt: "Última execução" })} ${new Date(a.lastTriggered).toLocaleString()}`
                    : tr({ en: "Never run", pt: "Nunca executada" })}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canManageHierarchy ? (
                  <Switch
                    checked={a.state === "on"}
                    disabled={toggleEnabled.isPending}
                    onCheckedChange={(enabled) =>
                      toggleEnabled.mutate({ entityId: a.entityId, enabled })
                    }
                  />
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={trigger.isPending}
                  onClick={() => trigger.mutate(a.entityId)}
                >
                  <Play className="h-3.5 w-3.5 mr-1" />
                  {tr({ en: "Run", pt: "Executar" })}
                </Button>
                {canManageHierarchy ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(a)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
          {automations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {tr({
                en: "No automations yet. Create one to schedule device actions.",
                pt: "Ainda sem automações. Crie uma para agendar ações nos dispositivos.",
              })}
            </p>
          ) : null}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? tr({ en: "Edit automation", pt: "Editar automação" })
                : tr({ en: "New automation", pt: "Nova automação" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{tr({ en: "Name", pt: "Nome" })}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{tr({ en: "Time", pt: "Hora" })}</Label>
              <Input
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{tr({ en: "Device", pt: "Dispositivo" })}</Label>
              <Select
                value={form.deviceEntityId}
                onValueChange={(v) => setForm((f) => ({ ...f, deviceEntityId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tr({ en: "Select device", pt: "Selecionar dispositivo" })} />
                </SelectTrigger>
                <SelectContent>
                  {linkedDevices.map((d) => (
                    <SelectItem key={d.id} value={d.homeAssistantEntityId!}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{tr({ en: "Action", pt: "Ação" })}</Label>
              <Select
                value={form.action}
                onValueChange={(v) => setForm((f) => ({ ...f, action: v as "on" | "off" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">{tr({ en: "Turn on", pt: "Ligar" })}</SelectItem>
                  <SelectItem value="off">{tr({ en: "Turn off", pt: "Desligar" })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tr({ en: "Cancel", pt: "Cancelar" })}
            </Button>
            <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
              {tr({ en: "Save", pt: "Guardar" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr({ en: "Delete automation?", pt: "Eliminar automação?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr({
                en: `This will permanently remove "${deleteTarget?.name}".`,
                pt: `Isto remove permanentemente "${deleteTarget?.name}".`,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr({ en: "Cancel", pt: "Cancelar" })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && remove.mutate(deleteTarget.configId)}
            >
              {tr({ en: "Delete", pt: "Eliminar" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
