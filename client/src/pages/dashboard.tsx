import { useQuery } from "@tanstack/react-query";
import { Building2, Store as StoreIcon, Sofa, Cpu, Router } from "lucide-react";
import { Link } from "wouter";
import { MetricCard } from "@/components/metric-card";
import { StoreCard } from "@/components/store-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { StatusBadge } from "@/components/status-badge";
import { useTranslation } from "@/lib/i18n";
import type { Store, TenantCompany } from "@shared/schema";

type DashboardSummary = {
  totalCompanies: number;
  totalStores: number;
  totalFurniture: number;
  totalKits: number;
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  gatewaysOnline: number;
  gatewaysOffline: number;
  stores: Array<
    Store & {
      status: string;
      deviceCount: number;
      companyCode?: string;
      companyName?: string;
    }
  >;
  companies: Array<TenantCompany & { storeCount: number }>;
};

export default function Dashboard() {
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);

  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/dashboard/summary"],
  });

  if (isLoading) {
    return <div className="text-muted-foreground">{tr("A carregar…", "Loading…")}</div>;
  }

  const summary = data ?? {
    totalCompanies: 0,
    totalStores: 0,
    totalFurniture: 0,
    totalKits: 0,
    totalDevices: 0,
    onlineDevices: 0,
    offlineDevices: 0,
    gatewaysOnline: 0,
    gatewaysOffline: 0,
    stores: [],
    companies: [],
  };

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: tr("Dashboard", "Dashboard") }]} />
        <h1 className="text-2xl font-semibold tracking-tight">{tr("Dashboard", "Dashboard")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tr(
            "Visão geral das empresas, lojas e equipamento retail.",
            "Overview of companies, stores and retail equipment.",
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title={tr("Empresas", "Companies")} value={summary.totalCompanies} icon={Building2} />
        <MetricCard title={tr("Lojas", "Stores")} value={summary.totalStores} icon={StoreIcon} />
        <MetricCard
          title={tr("Móveis", "Furniture")}
          value={summary.totalFurniture}
          hint={tr("Phase 2", "Phase 2")}
          icon={Sofa}
        />
        <MetricCard
          title={tr("Dispositivos", "Devices")}
          value={summary.totalDevices}
          hint={`${summary.onlineDevices} online / ${summary.offlineDevices} offline`}
          icon={Cpu}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard title={tr("Gateways online", "Gateways online")} value={summary.gatewaysOnline} icon={Router} />
        <MetricCard title={tr("Gateways offline", "Gateways offline")} value={summary.gatewaysOffline} icon={Router} />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{tr("Lojas", "Stores")}</h2>
          <Link href="/stores" className="text-sm text-primary hover:underline">
            {tr("Ver todas", "View all")}
          </Link>
        </div>
        {summary.stores.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tr("Ainda não há lojas. Crie uma empresa e uma loja.", "No stores yet. Create a company and a store.")}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {summary.stores.map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                company={
                  store.companyCode
                    ? { code: store.companyCode, name: store.companyName || "" }
                    : null
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{tr("Empresas", "Companies")}</h2>
          <Link href="/companies" className="text-sm text-primary hover:underline">
            {tr("Gerir", "Manage")}
          </Link>
        </div>
        <div className="divide-y rounded-lg border border-border">
          {summary.companies.map((c) => (
            <Link
              key={c.id}
              href={`/companies/${c.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div>
                <div className="font-medium">
                  {c.code} — {c.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.storeCount} {tr("lojas", "stores")}
                </div>
              </div>
              <StatusBadge status={c.isActive ? "ACTIVE" : "INACTIVE"} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
