import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search as SearchIcon,
  Store,
  MapPin,
  Lightbulb,
  Monitor,
  ChevronRight,
  Filter,
  X,
  Power,
  Zap,
} from "lucide-react";
import { Link } from "wouter";
import type { Company, Location, Light, Tv } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { DeviceLocationSearch } from "@/components/device-location-search";

type SearchResult = {
  type: "store" | "space" | "light" | "tv";
  id: string;
  name: string;
  description?: string;
  parentName?: string;
  parentId?: string;
  status?: string;
  isOnline?: boolean;
  isOn?: boolean;
  href: string;
};

export default function Search() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: lights = [] } = useQuery<Light[]>({
    queryKey: ["/api/lights"],
  });

  const { data: tvs = [] } = useQuery<Tv[]>({
    queryKey: ["/api/tvs"],
  });

  const getCompanyName = (companyId: string) => {
    return companies.find((c) => c.id === companyId)?.name || "";
  };

  const getLocationName = (locationId: string) => {
    return locations.find((l) => l.id === locationId)?.name || "";
  };

  const getLocationCompanyId = (locationId: string) => {
    return locations.find((l) => l.id === locationId)?.companyId || "";
  };

  const getLocationCompanyName = (locationId: string) => {
    const location = locations.find((l) => l.id === locationId);
    if (!location) return "";
    return getCompanyName(location.companyId);
  };

  const allResults = useMemo<SearchResult[]>(() => {
    const results: SearchResult[] = [];

    // Add stores
    companies.forEach((company) => {
      results.push({
        type: "store",
        id: company.id,
        name: company.name,
        description: company.description || undefined,
        href: `/store/${company.id}`,
      });
    });

    // Add spaces (locations)
    locations.forEach((location) => {
      results.push({
        type: "space",
        id: location.id,
        name: location.name,
        description: location.description || undefined,
        parentName: getCompanyName(location.companyId),
        parentId: location.companyId,
        href: `/location/${location.id}`,
      });
    });

    // Add lights
    lights.forEach((light) => {
      results.push({
        type: "light",
        id: light.id,
        name: light.name,
        parentName: `${getLocationCompanyName(light.locationId)} › ${getLocationName(light.locationId)}`,
        parentId: getLocationCompanyId(light.locationId),
        status: light.status,
        isOnline: light.status === "online",
        isOn: light.isOn,
        href: `/location/${light.locationId}`,
      });
    });

    // Add TVs
    tvs.forEach((tv) => {
      results.push({
        type: "tv",
        id: tv.id,
        name: tv.name,
        parentName: `${getLocationCompanyName(tv.locationId)} › ${getLocationName(tv.locationId)}`,
        parentId: getLocationCompanyId(tv.locationId),
        status: tv.status,
        isOnline: tv.status === "online",
        href: `/location/${tv.locationId}`,
      });
    });

    return results;
  }, [companies, locations, lights, tvs]);

  const filteredResults = useMemo(() => {
    if (!searchQuery.trim() && filterType === "all") {
      return [];
    }

    return allResults.filter((result) => {
      // Filter by type
      if (filterType !== "all" && result.type !== filterType) {
        return false;
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          result.name.toLowerCase().includes(query) ||
          result.description?.toLowerCase().includes(query) ||
          result.parentName?.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [allResults, searchQuery, filterType]);

  // Group results by type for better visualization
  const groupedResults = useMemo(() => {
    const groups: { [key: string]: SearchResult[] } = {
      store: [],
      space: [],
      light: [],
      tv: [],
    };

    filteredResults.forEach((result) => {
      groups[result.type].push(result);
    });

    return groups;
  }, [filteredResults]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "store":
        return <Store className="w-5 h-5 text-primary" />;
      case "space":
        return <MapPin className="w-5 h-5 text-blue-500" />;
      case "light":
        return <Lightbulb className="w-5 h-5 text-yellow-500" />;
      case "tv":
        return <Monitor className="w-5 h-5 text-purple-500" />;
      default:
        return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "store":
        return tr("Loja", "Store");
      case "space":
        return tr("Espaço", "Space");
      case "light":
        return tr("Luz", "Light");
      case "tv":
        return "TV";
      default:
        return type;
    }
  };

  const getTypePluralLabel = (type: string) => {
    switch (type) {
      case "store":
        return tr("Lojas", "Stores");
      case "space":
        return tr("Espaços", "Spaces");
      case "light":
        return tr("Luzes", "Lights");
      case "tv":
        return tr("Televisões", "TVs");
      default:
        return type;
    }
  };

  const getTypeBadgeClass = (type: string) => {
    switch (type) {
      case "store":
        return "bg-primary/10 text-primary";
      case "space":
        return "bg-blue-500/10 text-blue-600";
      case "light":
        return "bg-yellow-500/10 text-yellow-600";
      case "tv":
        return "bg-purple-500/10 text-purple-600";
      default:
        return "";
    }
  };

  const stats = {
    stores: companies.length,
    spaces: locations.length,
    lights: lights.length,
    tvs: tvs.length,
    onlineLights: lights.filter((l) => l.status === "online").length,
    activeLights: lights.filter((l) => l.isOn).length,
    onlineTvs: tvs.filter((t) => t.status === "online").length,
  };

  const hasResults = filteredResults.length > 0;
  const isSearching = searchQuery.trim() !== "" || filterType !== "all";

  // Keyboard shortcut hint
  const clearSearch = () => {
    setSearchQuery("");
    setFilterType("all");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">{tr("Pesquisar", "Search")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tr(
            "Encontre lojas, espaços e dispositivos rapidamente",
            "Find stores, spaces, and devices quickly"
          )}
        </p>
      </div>

      <DeviceLocationSearch />

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder={tr(
              "Pesquisar por nome, descrição ou localização...",
              "Search by name, description, or location..."
            )}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 pr-10 h-12 text-base"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-[180px] h-12">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder={tr("Filtrar por tipo", "Filter by type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr("Todos", "All")}</SelectItem>
            <SelectItem value="store">{tr("Lojas", "Stores")}</SelectItem>
            <SelectItem value="space">{tr("Espaços", "Spaces")}</SelectItem>
            <SelectItem value="light">{tr("Luzes", "Lights")}</SelectItem>
            <SelectItem value="tv">{tr("Televisões", "TVs")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quick Stats */}
      {!isSearching && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors group"
            onClick={() => setFilterType("store")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{tr("Lojas", "Stores")}</p>
                  <p className="text-2xl font-bold">{stats.stores}</p>
                </div>
                <Store className="w-8 h-8 text-primary/20 group-hover:text-primary/40 transition-colors" />
              </div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-blue-500/50 transition-colors group"
            onClick={() => setFilterType("space")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{tr("Espaços", "Spaces")}</p>
                  <p className="text-2xl font-bold">{stats.spaces}</p>
                </div>
                <MapPin className="w-8 h-8 text-blue-500/20 group-hover:text-blue-500/40 transition-colors" />
              </div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-yellow-500/50 transition-colors group"
            onClick={() => setFilterType("light")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{tr("Luzes", "Lights")}</p>
                  <p className="text-2xl font-bold">{stats.lights}</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.activeLights} {tr("ligadas", "on")}
                  </p>
                </div>
                <Lightbulb className="w-8 h-8 text-yellow-500/20 group-hover:text-yellow-500/40 transition-colors" />
              </div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-purple-500/50 transition-colors group"
            onClick={() => setFilterType("tv")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{tr("Televisões", "TVs")}</p>
                  <p className="text-2xl font-bold">{stats.tvs}</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.onlineTvs} online
                  </p>
                </div>
                <Monitor className="w-8 h-8 text-purple-500/20 group-hover:text-purple-500/40 transition-colors" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results Header */}
      {isSearching && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredResults.length}{" "}
            {tr(
              filteredResults.length !== 1 ? "resultados encontrados" : "resultado encontrado",
              filteredResults.length !== 1 ? "results found" : "result found"
            )}
          </p>
          <Button variant="ghost" size="sm" onClick={clearSearch} className="gap-2">
            <X className="w-4 h-4" />
            {tr("Limpar", "Clear")}
          </Button>
        </div>
      )}

      {/* Grouped Results */}
      {isSearching && hasResults && (
        <div className="space-y-6">
          {(["store", "space", "light", "tv"] as const).map((type) => {
            const results = groupedResults[type];
            if (results.length === 0) return null;

            return (
              <Card key={type}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    {getTypeIcon(type)}
                    {getTypePluralLabel(type)}
                    <Badge variant="secondary" className="ml-auto">
                      {results.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1">
                    {results.slice(0, 10).map((result) => (
                      <Link key={`${result.type}-${result.id}`} href={result.href}>
                        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
                          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                            {getTypeIcon(result.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">
                                {result.name}
                              </span>
                              {result.type === "light" && (
                                <div className="flex items-center gap-1">
                                  {result.isOn ? (
                                    <Power className="w-3 h-3 text-green-500" />
                                  ) : (
                                    <Power className="w-3 h-3 text-muted-foreground" />
                                  )}
                                  {!result.isOnline && (
                                    <Badge variant="destructive" className="text-[10px] h-4 px-1">
                                      offline
                                    </Badge>
                                  )}
                                </div>
                              )}
                              {result.type === "tv" && !result.isOnline && (
                                <Badge variant="destructive" className="text-[10px] h-4 px-1">
                                  offline
                                </Badge>
                              )}
                            </div>
                            {result.parentName && (
                              <p className="text-xs text-muted-foreground truncate">
                                {result.parentName}
                              </p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </div>
                      </Link>
                    ))}
                    {results.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        +{results.length - 10} {tr("mais", "more")}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* No Results */}
      {isSearching && !hasResults && (
        <Card>
          <CardContent className="py-16 text-center">
            <SearchIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {tr("Nenhum resultado encontrado", "No results found")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {tr(
                "Tente uma pesquisa diferente ou altere os filtros",
                "Try a different search or change the filters"
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isSearching && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <SearchIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {tr("Pesquise por qualquer coisa", "Search for anything")}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {tr(
                "Digite o nome de uma loja, espaço ou dispositivo para encontrar rapidamente o que procura. Ou clique nos cards acima para filtrar por tipo.",
                "Type the name of a store, space, or device to quickly find what you're looking for. Or click the cards above to filter by type."
              )}
            </p>
            <div className="flex items-center justify-center gap-4 mt-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="w-4 h-4" />
                {stats.activeLights} {tr("luzes ligadas", "lights on")}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Monitor className="w-4 h-4" />
                {stats.onlineTvs} TVs online
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
