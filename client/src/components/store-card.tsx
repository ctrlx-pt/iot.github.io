import { Link } from "wouter";
import { Building2, ChevronRight, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import type { Store, TenantCompany } from "@shared/schema";

export function StoreCard({
  store,
  company,
}: {
  store: Store & { status?: string; deviceCount?: number };
  company?: Pick<TenantCompany, "code" | "name"> | null;
}) {
  return (
    <Link href={`/stores/${store.id}`}>
      <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold">{store.name}</CardTitle>
              <p className="text-xs font-mono text-muted-foreground mt-1">{store.storeCode}</p>
            </div>
            <StatusBadge status={store.status ?? (store.isActive ? "ONLINE" : "OFFLINE")} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {company ? (
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5" />
              <span>
                {company.code} — {company.name}
              </span>
            </div>
          ) : null}
          {(store.city || store.country) && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" />
              <span>
                {[store.city, store.country].filter(Boolean).join(", ")}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1 text-foreground">
            <span>{store.deviceCount ?? 0} devices</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
