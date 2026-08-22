import { useQuery } from "@tanstack/react-query";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { StoreCard } from "@/components/store-card";
import { useTranslation } from "@/lib/i18n";
import type { Store, TenantCompany } from "@shared/schema";

export default function StoresPage() {
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);

  const { data: stores = [], isLoading } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  const { data: companies = [] } = useQuery<TenantCompany[]>({
    queryKey: ["/api/companies"],
  });

  const companyMap = new Map(companies.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: tr("Lojas", "Stores") }]} />
        <h1 className="text-2xl font-semibold">{tr("Lojas", "Stores")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tr(
            "Lojas físicas identificadas por StoreCode imutável (ctrlx-XX-NNNNNN).",
            "Physical stores identified by immutable StoreCode (ctrlx-XX-NNNNNN).",
          )}
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{tr("A carregar…", "Loading…")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <StoreCard key={store.id} store={store} company={companyMap.get(store.companyId)} />
          ))}
        </div>
      )}
      {!isLoading && stores.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tr("Nenhuma loja acessível.", "No accessible stores.")}
        </p>
      ) : null}
    </div>
  );
}
