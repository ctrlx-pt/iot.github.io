import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
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
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiJson, queryClient } from "@/lib/queryClient";
import { useTranslation } from "@/lib/i18n";
import type { TenantCompany } from "@shared/schema";

export default function CompaniesPage() {
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);
  const { toast } = useToast();
  const { canManageHierarchy } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: companies = [], isLoading } = useQuery<TenantCompany[]>({
    queryKey: ["/api/companies"],
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiJson<TenantCompany>("POST", "/api/companies", { code, name, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      setOpen(false);
      setCode("");
      setName("");
      setDescription("");
      toast({ title: tr("Empresa criada", "Company created") });
    },
    onError: (err: Error) => {
      toast({ title: tr("Erro", "Error"), description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: tr("Empresas", "Companies") }]} />
          <h1 className="text-2xl font-semibold">{tr("Empresas", "Companies")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tr("Tenants do CtrlX (código único, ex. 00, 01).", "CtrlX tenants (unique code, e.g. 00, 01).")}
          </p>
        </div>
        {canManageHierarchy ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {tr("Nova empresa", "New company")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr("Criar empresa", "Create company")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="code">{tr("Código (2 dígitos)", "Code (2 digits)")}</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="00" maxLength={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">{tr("Nome", "Name")}</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="PUIG" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">{tr("Descrição", "Description")}</Label>
                <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !code || !name}
              >
                {tr("Criar", "Create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{tr("A carregar…", "Loading…")}</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/companies/${c.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/40"
            >
              <div>
                <div className="font-medium">
                  {c.code} — {c.name}
                </div>
                {c.description ? (
                  <div className="text-sm text-muted-foreground">{c.description}</div>
                ) : null}
              </div>
              <StatusBadge status={c.isActive ? "ACTIVE" : "INACTIVE"} />
            </Link>
          ))}
          {companies.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center">
              {tr("Nenhuma empresa. (SuperAdmin necessário para criar.)", "No companies. (SuperAdmin required to create.)")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
