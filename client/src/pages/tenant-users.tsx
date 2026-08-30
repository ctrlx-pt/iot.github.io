import { useMutation, useQuery } from "@tanstack/react-query";
import type { TenantCompany } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiJson, queryClient } from "@/lib/queryClient";
import { useTr } from "@/lib/tr";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useState } from "react";

type CompanyUser = {
  id: string;
  username: string;
  email: string | null;
  isActive: boolean;
  role: string;
  storeIds: string[];
  stores: Array<{ id: string; name: string; storeCode: string }>;
};

type Store = { id: string; name: string; storeCode: string; companyId: string };

const ROLES = ["CompanyAdmin", "StoreManager", "Operator", "Viewer"] as const;

export default function TenantUsersPage() {
  const tr = useTr();
  const { toast } = useToast();
  const { user, canManageCompanyUsers } = useCurrentUser();
  const [companyId, setCompanyId] = useState("");
  const [form, setForm] = useState({
    username: "",
    password: "",
    email: "",
    role: "Operator" as (typeof ROLES)[number],
    storeIds: [] as string[],
  });

  const { data: companies = [] } = useQuery<TenantCompany[]>({
    queryKey: ["/api/companies"],
  });

  const adminCompanies = companies.filter((c) => {
    if (user?.isSuperAdmin) return true;
    const m = user?.memberships?.find((x) => x.companyId === c.id);
    return m?.role === "CompanyAdmin";
  });

  const activeCompanyId = companyId || adminCompanies[0]?.id || "";

  const { data: companyUsers = [], isLoading } = useQuery<CompanyUser[]>({
    queryKey: ["/api/companies", activeCompanyId, "users"],
    queryFn: () => apiJson("GET", `/api/companies/${activeCompanyId}/users`),
    enabled: !!activeCompanyId && canManageCompanyUsers,
  });

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  const companyStores = stores.filter((s) => s.companyId === activeCompanyId);

  const createUser = useMutation({
    mutationFn: () =>
      apiJson("POST", `/api/companies/${activeCompanyId}/users`, {
        ...form,
        email: form.email || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompanyId, "users"] });
      setForm({ username: "", password: "", email: "", role: "Operator", storeIds: [] });
      toast({ title: tr({ en: "User created", pt: "Utilizador criado", es: "Usuario creado", fr: "Utilisateur créé" }) });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const patchUser = useMutation({
    mutationFn: (payload: { userId: string; body: Record<string, unknown> }) =>
      apiJson("PATCH", `/api/companies/${activeCompanyId}/users/${payload.userId}`, payload.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompanyId, "users"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!canManageCompanyUsers) {
    return (
      <p className="text-muted-foreground">
        {tr({ en: "You do not have permission to manage users.", pt: "Sem permissão para gerir utilizadores." })}
      </p>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">
          {tr({ en: "User management", pt: "Gestão de utilizadores", es: "Gestión de usuarios", fr: "Gestion des utilisateurs" })}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {tr({
            en: "Create users for your company and assign stores. Deactivate accounts when needed.",
            pt: "Crie utilizadores para a sua empresa e atribua lojas. Desative contas quando necessário.",
            es: "Cree usuarios para su empresa y asigne tiendas.",
            fr: "Créez des utilisateurs et assignez des magasins.",
          })}
        </p>
      </div>

      {adminCompanies.length > 1 ? (
        <div className="space-y-2 max-w-xs">
          <Label>{tr({ en: "Company", pt: "Empresa", es: "Empresa", fr: "Entreprise" })}</Label>
          <Select value={activeCompanyId} onValueChange={setCompanyId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {adminCompanies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="rounded-lg border p-4 space-y-4">
        <h2 className="font-medium">{tr({ en: "New user", pt: "Novo utilizador", es: "Nuevo usuario", fr: "Nouvel utilisateur" })}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{tr({ en: "Username", pt: "Utilizador" })}</Label>
            <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{tr({ en: "Password", pt: "Password" })}</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{tr({ en: "Role", pt: "Função", es: "Rol", fr: "Rôle" })}</Label>
            <Select value={form.role} onValueChange={(role) => setForm((f) => ({ ...f, role: role as typeof form.role }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{tr({ en: "Stores", pt: "Lojas", es: "Tiendas", fr: "Magasins" })}</Label>
          <div className="flex flex-wrap gap-2">
            {companyStores.map((s) => {
              const checked = form.storeIds.includes(s.id);
              return (
                <Button
                  key={s.id}
                  type="button"
                  size="sm"
                  variant={checked ? "default" : "outline"}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      storeIds: checked ? f.storeIds.filter((id) => id !== s.id) : [...f.storeIds, s.id],
                    }))
                  }
                >
                  {s.name}
                </Button>
              );
            })}
          </div>
        </div>
        <Button
          onClick={() => createUser.mutate()}
          disabled={!form.username || !form.password || createUser.isPending}
        >
          {tr({ en: "Create user", pt: "Criar utilizador", es: "Crear usuario", fr: "Créer utilisateur" })}
        </Button>
      </div>

      <div className="rounded-lg border divide-y">
        {isLoading ? (
          <p className="p-4 text-muted-foreground">{tr({ en: "Loading…", pt: "A carregar…" })}</p>
        ) : companyUsers.length === 0 ? (
          <p className="p-4 text-muted-foreground">{tr({ en: "No users yet.", pt: "Ainda sem utilizadores." })}</p>
        ) : (
          companyUsers.map((u) => (
            <div key={u.id} className="p-4 flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{u.username}</div>
                <div className="text-sm text-muted-foreground">{u.email || "—"}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {u.stores?.map((s) => s.name).join(", ") || tr({ en: "All stores (no restriction)", pt: "Todas as lojas" })}
                </div>
              </div>
              <Select
                value={u.role}
                onValueChange={(role) => patchUser.mutate({ userId: u.id, body: { role } })}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch
                  checked={u.isActive}
                  onCheckedChange={(isActive) => patchUser.mutate({ userId: u.id, body: { isActive } })}
                />
                <span className="text-sm">{u.isActive ? tr({ en: "Active", pt: "Ativo" }) : tr({ en: "Disabled", pt: "Desativado" })}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
