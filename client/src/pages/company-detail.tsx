import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Plus } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { StoreCard } from "@/components/store-card";
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
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiJson, queryClient } from "@/lib/queryClient";
import { useTranslation } from "@/lib/i18n";
import type { Store, TenantCompany } from "@shared/schema";

export default function CompanyDetailPage() {
  const [, params] = useRoute("/companies/:companyId");
  const companyId = params?.companyId ?? "";
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);
  const { toast } = useToast();
  const { canManageHierarchy } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("PT");

  const { data: company, isLoading } = useQuery<TenantCompany>({
    queryKey: ["/api/companies", companyId],
    enabled: !!companyId,
  });

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/companies", companyId, "stores"],
    queryFn: () => apiJson("GET", `/api/companies/${companyId}/stores`),
    enabled: !!companyId,
  });

  const createStore = useMutation({
    mutationFn: () =>
      apiJson<Store>("POST", "/api/stores", {
        companyId,
        name,
        city: city || undefined,
        country: country || undefined,
      }),
    onSuccess: (store) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      setOpen(false);
      setName("");
      toast({
        title: tr("Loja criada", "Store created"),
        description: store.storeCode,
      });
    },
    onError: (err: Error) => {
      toast({ title: tr("Erro", "Error"), description: err.message, variant: "destructive" });
    },
  });

  if (isLoading || !company) {
    return <p className="text-muted-foreground">{tr("A carregar…", "Loading…")}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: tr("Empresas", "Companies"), href: "/companies" },
              { label: `${company.code} — ${company.name}` },
            ]}
          />
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">
              {company.code} — {company.name}
            </h1>
            <StatusBadge status={company.isActive ? "ACTIVE" : "INACTIVE"} />
          </div>
          {company.description ? (
            <p className="text-sm text-muted-foreground mt-1">{company.description}</p>
          ) : null}
        </div>
        {canManageHierarchy ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {tr("Nova loja", "New store")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr("Criar loja", "Create store")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {tr(
                "O StoreCode (ctrlx-XX-NNNNNN) é gerado automaticamente e é imutável.",
                "StoreCode (ctrlx-XX-NNNNNN) is generated automatically and is immutable.",
              )}
            </p>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{tr("Nome", "Name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Store Lisbon" />
              </div>
              <div className="space-y-2">
                <Label>{tr("Cidade", "City")}</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{tr("País", "Country")}</Label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => createStore.mutate()} disabled={!name || createStore.isPending}>
                {tr("Criar", "Create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((store) => (
          <StoreCard key={store.id} store={store} company={company} />
        ))}
      </div>
      {stores.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr("Sem lojas nesta empresa.", "No stores in this company.")}</p>
      ) : null}
    </div>
  );
}
