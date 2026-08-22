import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Play } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
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

export default function AutomationsPage() {
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);
  const { toast } = useToast();
  const { canManageHierarchy } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [time, setTime] = useState("08:00");
  const [action, setAction] = useState<"device_on" | "device_off">("device_on");

  const { data: companies = [] } = useQuery<any[]>({ queryKey: ["/api/companies"] });
  const { data: stores = [] } = useQuery<any[]>({ queryKey: ["/api/stores"] });
  const { data: automations = [] } = useQuery<any[]>({ queryKey: ["/api/automations"] });

  const create = useMutation({
    mutationFn: () =>
      apiJson("POST", "/api/automations", {
        companyId: companyId || companies[0]?.id,
        name,
        scopeType: "Store",
        scopeId: storeId || stores[0]?.id,
        triggerType: "time",
        configuration: { time, actions: [{ type: action }] },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      setOpen(false);
      toast({ title: tr("Automação criada", "Automation created") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const run = useMutation({
    mutationFn: (id: string) => apiJson("POST", `/api/automations/${id}/run`),
    onSuccess: () => toast({ title: tr("Executada", "Ran") }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Breadcrumbs items={[{ label: tr("Automações", "Automations") }]} />
          <h1 className="text-2xl font-semibold">{tr("Automações", "Automations")}</h1>
        </div>
        {canManageHierarchy ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {tr("Nova", "New")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr("Automação por horário", "Time automation")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{tr("Nome", "Name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Opening Store" />
              </div>
              <div className="space-y-2">
                <Label>{tr("Empresa", "Company")}</Label>
                <Select value={companyId || companies[0]?.id} onValueChange={setCompanyId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{tr("Loja (âmbito)", "Store scope")}</Label>
                <Select value={storeId || stores[0]?.id} onValueChange={setStoreId}>
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
                <Label>{tr("Hora", "Time")}</Label>
                <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="08:00" />
              </div>
              <div className="space-y-2">
                <Label>{tr("Ação", "Action")}</Label>
                <Select value={action} onValueChange={(v) => setAction(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="device_on">{tr("Ligar", "Turn on")}</SelectItem>
                    <SelectItem value="device_off">{tr("Desligar", "Turn off")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!name} onClick={() => create.mutate()}>
                {tr("Criar", "Create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        ) : null}
      </div>

      <div className="rounded-lg border divide-y">
        {automations.map((a) => (
          <div key={a.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-muted-foreground">
                {a.triggerType} · {a.scopeType} ·{" "}
                {a.configuration?.time ? `at ${a.configuration.time}` : "manual"}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => run.mutate(a.id)}>
              <Play className="h-3.5 w-3.5 mr-1" />
              {tr("Correr", "Run")}
            </Button>
          </div>
        ))}
        {automations.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {tr("Sem automações.", "No automations.")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
