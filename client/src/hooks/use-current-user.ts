import { useQuery } from "@tanstack/react-query";
import { apiUrl, getToken } from "@/lib/auth";
import { unwrapApiData } from "@/lib/queryClient";

export type CurrentUser = {
  id: string;
  username: string;
  email: string | null;
  isSuperAdmin: boolean;
  memberships: Array<{ companyId: string; role: string }>;
  storeIds: string[];
};

export function useCurrentUser() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const token = getToken();
      if (!token) return null;
      const res = await fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) return null;
      const json = await res.json();
      return unwrapApiData<{ user: CurrentUser }>(json);
    },
    staleTime: 5 * 60 * 1000,
  });

  const user = data?.user ?? null;
  const isSuperAdmin = !!user?.isSuperAdmin;

  return {
    user,
    isLoading,
    isSuperAdmin,
    /** Create/edit companies, stores, furniture, kits, gateways, integration hub */
    canManageHierarchy: isSuperAdmin,
    /** Edit device metadata (description, image, address) */
    canEditDevice:
      isSuperAdmin ||
      !!user?.memberships?.some((m) =>
        ["CompanyAdmin", "StoreManager"].includes(m.role),
      ),
    /** Manage company users (create, deactivate, assign stores) */
    canManageCompanyUsers:
      isSuperAdmin ||
      !!user?.memberships?.some((m) => m.role === "CompanyAdmin"),
    roleLabel: isSuperAdmin
      ? "SuperAdmin"
      : user?.memberships?.[0]?.role || user?.email || "",
  };
}
