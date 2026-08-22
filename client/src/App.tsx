import { Switch, Route, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileBottomNav, MobileHeader, mobileStyles } from "@/components/mobile-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { I18nProvider } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n";
import { useWebSocket } from "@/hooks/use-websocket";
import Dashboard from "@/pages/dashboard";
import Companies from "@/pages/companies";
import CompanyDetail from "@/pages/company-detail";
import LocationDetail from "@/pages/location-detail";
import StoreDetail from "@/pages/store-detail";
import Videos from "@/pages/videos";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import HomeAssistant from "@/pages/home-assistant";
import Organizations from "@/pages/organizations";
import AcceptInvite from "@/pages/invite";
import Profile from "@/pages/profile";
import Landing from "@/pages/landing";
import Stores from "@/pages/stores";
import Members from "@/pages/members";
import Search from "@/pages/search";
import Energy from "@/pages/energy";
import ActivityLogs from "@/pages/activity-logs";
import Administration from "@/pages/administration";
import Requests from "@/pages/requests";
import Brands from "@/pages/brands";
import BrandDetail from "@/pages/brand-detail";
import LocalControl from "@/pages/local-control";
import Schedules from "@/pages/schedules";
import MediaDashboard from "@/pages/media-dashboard";
import MediaContent from "@/pages/media-content";
import MediaPlaylists from "@/pages/media-playlists";
import AccessGroups from "@/pages/access-groups";
import FurnitureDetail from "@/pages/furniture-detail";
import KitDetail from "@/pages/kit-detail";
import DeviceDetail from "@/pages/device-detail";
import Gateways from "@/pages/gateways";
import GatewayDetail from "@/pages/gateway-detail";
import Automations from "@/pages/automations";
import Monitoring from "@/pages/monitoring";
import { useMemo, useState, useEffect, type CSSProperties } from "react";
import { getToken, clearToken, apiUrl } from "@/lib/auth";
import { unwrapApiData } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

function AuthenticatedRoutes() {
  useWebSocket();

  return (
    <Switch>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/companies/:companyId" component={CompanyDetail} />
      <Route path="/companies" component={Companies} />
      <Route path="/stores/:storeId" component={StoreDetail} />
      <Route path="/stores" component={Stores} />
      <Route path="/furniture/:furnitureId" component={FurnitureDetail} />
      <Route path="/kits/:kitId" component={KitDetail} />
      <Route path="/devices/:deviceId" component={DeviceDetail} />
      <Route path="/gateways/:gatewayId" component={GatewayDetail} />
      <Route path="/gateways" component={Gateways} />
      <Route path="/members" component={Members} />
      <Route path="/search" component={Search} />
      <Route path="/energy" component={Energy} />
      <Route path="/logs" component={ActivityLogs} />
      <Route path="/location/:id" component={LocationDetail} />
      <Route path="/store/:id" component={StoreDetail} />
      <Route path="/videos" component={Videos} />
      <Route path="/ha" component={HomeAssistant} />
      <Route path="/home-assistant" component={HomeAssistant} />
      <Route path="/organizations" component={Organizations} />
      <Route path="/users" component={Members} />
      <Route path="/profile" component={Profile} />
      <Route path="/settings" component={Profile} />
      <Route path="/administration" component={Administration} />
      <Route path="/requests" component={Requests} />
      <Route path="/brands" component={Brands} />
      <Route path="/brand/:id" component={BrandDetail} />
      <Route path="/local-control" component={LocalControl} />
      <Route path="/schedules" component={Schedules} />
      <Route path="/automations" component={Automations} />
      <Route path="/monitoring" component={Monitoring} />
      <Route path="/media" component={MediaDashboard} />
      <Route path="/media/content" component={MediaContent} />
      <Route path="/media/playlists" component={MediaPlaylists} />
      <Route path="/access-groups" component={AccessGroups} />
      <Route path="/">
        {() => {
          window.location.replace("/dashboard");
          return null;
        }}
      </Route>
      <Route path="*" component={NotFound} />
    </Switch>
  );
}

function PublicRoutes() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/invite/:code" component={AcceptInvite} />
      <Route path="*" component={Landing} />
    </Switch>
  );
}

function AppContent() {
  const token = getToken();
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);

  const style: CSSProperties = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  // GitHub Pages doesn't support SPA rewrites; use hash routing there.
  const routerMode =
    (import.meta.env.VITE_ROUTER_MODE as string | undefined) ?? "path";
  const routerHook = useMemo(
    () => (routerMode === "hash" ? useHashLocation : undefined),
    [routerMode]
  );

  // Validate token by fetching user info
  const {
    data: userData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const currentToken = getToken();
      if (!currentToken) return null;
      const res = await fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: `Bearer ${currentToken}` },
        credentials: "include",
      });
      if (!res.ok) {
        clearToken();
        return null;
      }
      const json = await res.json();
      return unwrapApiData<{ user: unknown }>(json);
    },
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Clear token if validation failed
  useEffect(() => {
    if (isError) {
      clearToken();
    }
  }, [isError]);

  // Show loading state while validating token
  if (token && isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If not authenticated or token is invalid, show public routes
  const isAuthenticated = token && userData && !isError;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <WouterRouter hook={routerHook}>
          <PublicRoutes />
        </WouterRouter>
      </div>
    );
  }

  // Authenticated app shell
  const shell = (
    <SidebarProvider style={style}>
      {/* Mobile styles for safe areas and touch targets */}
      <style>{mobileStyles}</style>
      
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Desktop Header */}
          <header className="hidden md:flex items-center justify-between px-4 py-2 border-b border-border bg-background">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
            </div>
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </header>
          
          {/* Mobile Header */}
          <MobileHeader />
          
          <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
            <div className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-6">
              <WouterRouter hook={routerHook}>
                <AuthenticatedRoutes />
              </WouterRouter>
            </div>
          </main>
          
          {/* Mobile Bottom Navigation */}
          <MobileBottomNav />
        </div>
      </div>
    </SidebarProvider>
  );

  return shell;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <I18nProvider>
          <TooltipProvider>
            <AppContent />
            <Toaster />
          </TooltipProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Minimal hash-based location hook for wouter Router.
// Signature matches wouter's `hook` contract: () => [path, navigate]
function useHashLocation(): [string, (to: string) => void] {
  const getHashPath = () => {
    const hash = window.location.hash || "";
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    // Support both "#/path" and "#path" by normalizing to "/path"
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    return path === "/" ? "/" : path.replace(/\/+$/, "");
  };

  const [path, setPath] = useState<string>(() => getHashPath());

  useEffect(() => {
    const onChange = () => setPath(getHashPath());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = (to: string) => {
    const normalized = to.startsWith("/") ? to : `/${to}`;
    window.location.hash = normalized;
  };

  return [path, navigate];
}
