import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";
import { Plus } from "lucide-react";
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

export default function GatewaysPage() {
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);
  const { toast } = useToast();
  const { canManageHierarchy } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [name, setName] = useState("");

  const { data: stores = [] } = useQuery<any[]>({ queryKey: ["/api/stores"] });
  const { data: gateways = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/gateways", storeId || "all"],
    queryFn: () =>
      storeId
        ? apiJson("GET", `/api/gateways?storeId=${storeId}`)
        : apiJson("GET", "/api/gateways").catch(() =>
            // non-superadmin without storeId — pick first store
            stores[0]
              ? apiJson("GET", `/api/gateways?storeId=${stores[0].id}`)
              : Promise.resolve([]),
          ),
    enabled: stores.length > 0 || true,
  });

  const create = useMutation({
    mutationFn: () => apiJson("POST", "/api/gateways", { storeId, name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gateways"] });
      setOpen(false);
      toast({ title: tr("Gateway registado", "Gateway registered") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Breadcrumbs items={[{ label: tr("Gateways", "Gateways") }]} />
          <h1 className="text-2xl font-semibold">{tr("Gateways", "Gateways")}</h1>
        </div>
        {canManageHierarchy ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {tr("Registar", "Register")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr("Registar gateway", "Register gateway")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{tr("Loja", "Store")}</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger>
                    <SelectValue placeholder={tr("Selecionar", "Select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.storeCode} — {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{tr("Nome", "Name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!storeId || !name} onClick={() => create.mutate()}>
                {tr("Criar", "Create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        ) : null}
      </div>

      <div className="mb-2 max-w-sm">
        <Select
          value={storeId || stores[0]?.id || ""}
          onValueChange={(v) => {
            setStoreId(v);
            queryClient.invalidateQueries({ queryKey: ["/api/gateways"] });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={tr("Filtrar por loja", "Filter by store")} />
          </SelectTrigger>
          <SelectContent>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.storeCode} — {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{tr("A carregar…", "Loading…")}</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {(Array.isArray(gateways) ? gateways : []).map((g) => (
            <Link
              key={g.id}
              href={`/gateways/${g.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/40"
            >
              <div>
                <div className="font-medium">{g.name}</div>
                <div className="text-xs font-mono text-muted-foreground">{g.hardwareId}</div>
              </div>
              <StatusBadge status={g.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
