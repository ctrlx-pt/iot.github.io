import {
  Home,
  Store,
  Users,
  Settings,
  LogOut,
  ChevronUp,
  Building2,
  Router,
  Cpu,
  Sofa,
  Boxes,
  Activity,
  History,
  Clock,
  Shield,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TenantCompany } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getToken, apiUrl, clearToken } from "@/lib/auth";
import { unwrapApiData } from "@/lib/queryClient";
import { useTranslation } from "@/lib/i18n";
import { useCurrentUser } from "@/hooks/use-current-user";

type MeResponse = {
  user: {
    id: string;
    username: string;
    email: string | null;
    isSuperAdmin?: boolean;
    memberships?: Array<{ companyId: string; role: string }>;
  };
};

const comingSoon = false;

export function AppSidebar() {
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);
  const { canManageCompanyUsers } = useCurrentUser();

  const { data: me } = useQuery<MeResponse>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch user");
      return unwrapApiData<MeResponse>(await res.json());
    },
  });

  const user = me?.user;
  const roleLabel = user?.isSuperAdmin
    ? "SuperAdmin"
    : user?.memberships?.[0]?.role || user?.email || "";

  const { data: companies = [] } = useQuery<TenantCompany[]>({
    queryKey: ["/api/companies"],
  });

  const handleLogout = async () => {
    try {
      await fetch(apiUrl("/api/auth/logout"), { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    clearToken();
    queryClient.clear();
    navigate("/login");
  };

  const initials = (user?.username || "?").slice(0, 2).toUpperCase();

  const primary = [
    { href: "/dashboard", label: tr("Dashboard", "Dashboard"), icon: Home },
    { href: "/companies", label: tr("Empresas", "Companies"), icon: Building2 },
    { href: "/stores", label: tr("Lojas", "Stores"), icon: Store },
    { href: "/gateways", label: tr("Gateways", "Gateways"), icon: Router },
  ];

  const hierarchySoon: { href: string; label: string; icon: any }[] = [];

  const ops = [
    { href: "/home-assistant", label: tr("Hub de integração", "Integration hub"), icon: Shield, soon: false },
    { href: "/automations", label: tr("Automações", "Automations"), icon: Clock, soon: false },
    { href: "/monitoring", label: tr("Monitorização", "Monitoring"), icon: Activity, soon: false },
    { href: "/logs", label: tr("Logs", "Logs"), icon: History, soon: false },
    ...(user?.isSuperAdmin || canManageCompanyUsers
      ? [{ href: "/company-users", label: tr("Utilizadores", "Users"), icon: Users, soon: false }]
      : []),
    { href: "/settings", label: tr("Definições", "Settings"), icon: Settings, soon: false },
  ];

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
            CX
          </div>
          <div>
            <div className="font-semibold tracking-tight">CtrlX</div>
            <div className="text-xs text-muted-foreground">
              {tr("Smart Retail Control", "Smart Retail Control")}
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel>{tr("Principal", "Main")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primary.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={location === item.href || location.startsWith(item.href + "/")}>
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{tr("Hierarquia", "Hierarchy")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {hierarchySoon.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton disabled className="opacity-50">
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                      Soon
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {companies.slice(0, 4).map((c) => (
                <SidebarMenuItem key={c.id}>
                  <SidebarMenuButton asChild isActive={location === `/companies/${c.id}`}>
                    <Link href={`/companies/${c.id}`}>
                      <Building2 className="h-4 w-4" />
                      <span>
                        {c.code} — {c.name}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{tr("Operações", "Operations")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ops.map((item) => (
                <SidebarMenuItem key={item.href}>
                  {item.soon && comingSoon ? (
                    <SidebarMenuButton disabled className="opacity-50">
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                        Soon
                      </span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton asChild isActive={location === item.href}>
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 hover:bg-sidebar-accent text-left">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user?.username ?? "—"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {roleLabel}
                </div>
              </div>
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/profile">{tr("Perfil", "Profile")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">{tr("Definições", "Settings")}</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              {tr("Sair", "Log out")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
