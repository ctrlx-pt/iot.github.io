import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Plus } from "lucide-react";
import { useState } from "react";
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
import { apiJson, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTranslation } from "@/lib/i18n";

type StoreDetail = {
  id: string;
  storeCode: string;
  name: string;
  companyId: string;
  city?: string | null;
  country?: string | null;
  timezone: string;
  address?: string | null;
  isActive: boolean;
  company: { id: string; code: string; name: string } | null;
};

type Furniture = {
  id: string;
  furnitureCode: string;
  name: string;
  status: string;
  isActive: boolean;
};

export default function StoreDetailPage() {
  const [, params] = useRoute("/stores/:storeId");
  const storeId = params?.storeId ?? "";
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);
  const { toast } = useToast();
  const { canManageHierarchy } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const { data: store, isLoading } = useQuery<StoreDetail>({
    queryKey: ["/api/stores", storeId],
    enabled: !!storeId,
  });

  const { data: furnitureList = [] } = useQuery<Furniture[]>({
    queryKey: ["/api/furniture", { storeId }],
    queryFn: () => apiJson("GET", `/api/furniture?storeId=${storeId}`),
    enabled: !!storeId,
  });

  const createFurn = useMutation({
    mutationFn: () => apiJson("POST", "/api/furniture", { storeId, name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/furniture"] });
      setOpen(false);
      setName("");
      toast({ title: tr("Móvel criado", "Furniture created") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (isLoading || !store) {
    return <p className="text-muted-foreground">{tr("A carregar…", "Loading…")}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: tr("Empresas", "Companies"), href: "/companies" },
              store.company
                ? { label: `${store.company.code} — ${store.company.name}`, href: `/companies/${store.company.id}` }
                : { label: tr("Empresa", "Company") },
              { label: store.name },
            ]}
          />
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{store.name}</h1>
            <StatusBadge status={store.isActive ? "ONLINE" : "OFFLINE"} />
          </div>
          <p className="font-mono text-sm text-muted-foreground mt-1">{store.storeCode}</p>
        </div>
        {canManageHierarchy ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {tr("Novo móvel", "New furniture")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr("Criar móvel", "Create furniture")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>{tr("Nome", "Name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dior Display" />
            </div>
            <DialogFooter>
              <Button disabled={!name || createFurn.isPending} onClick={() => createFurn.mutate()}>
                {tr("Criar", "Create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{tr("Móveis", "Furniture")}</h2>
        <div className="rounded-lg border divide-y">
          {furnitureList.map((f) => (
            <Link
              key={f.id}
              href={`/furniture/${f.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/40"
            >
              <div>
                <div className="font-medium">{f.name}</div>
                <div className="text-xs font-mono text-muted-foreground">{f.furnitureCode}</div>
              </div>
              <StatusBadge status={f.status} />
            </Link>
          ))}
          {furnitureList.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {tr("Sem móveis nesta loja.", "No furniture in this store.")}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
