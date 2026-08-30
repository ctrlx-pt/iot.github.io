import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationSearchInput } from "@/components/location-search-input";
import { DeviceListItem } from "@/components/device-list-item";
import { apiJson } from "@/lib/queryClient";
import { useTr } from "@/lib/tr";

type DeviceHit = {
  id: string;
  name: string;
  deviceCode: string;
  deviceType: string;
  status: string;
  city?: string | null;
  country?: string | null;
  imageUrl?: string | null;
};

export function DeviceLocationSearch() {
  const tr = useTr();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");

  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (city.trim()) params.set("city", city.trim());
  if (country.trim()) params.set("country", country.trim());

  const { data: results = [] } = useQuery<DeviceHit[]>({
    queryKey: ["/api/device-search", q, city, country],
    queryFn: () => apiJson("GET", `/api/device-search?${params.toString()}`),
    enabled: q.trim().length >= 2 || city.trim().length >= 2 || country.trim().length >= 2,
  });

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div>
        <h2 className="font-medium">
          {tr({
            en: "Search devices by location",
            pt: "Pesquisar dispositivos por localização",
            es: "Buscar dispositivos por ubicación",
            fr: "Rechercher des appareils par lieu",
          })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {tr({
            en: "Type a city or country — suggestions appear as you type.",
            pt: "Escreva cidade ou país — sugestões aparecem enquanto escreve.",
            es: "Escriba ciudad o país — aparecen sugerencias.",
            fr: "Saisissez une ville ou un pays — suggestions en direct.",
          })}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <Label>{tr({ en: "Keyword", pt: "Palavra-chave", es: "Palabra clave", fr: "Mot-clé" })}</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr({ en: "Name, code…", pt: "Nome, código…" })} />
        </div>
        <div className="space-y-2">
          <Label>{tr({ en: "City", pt: "Cidade", es: "Ciudad", fr: "Ville" })}</Label>
          <LocationSearchInput value={city} onChange={setCity} mode="city" />
        </div>
        <div className="space-y-2">
          <Label>{tr({ en: "Country", pt: "País", es: "País", fr: "Pays" })}</Label>
          <LocationSearchInput value={country} onChange={setCountry} mode="country" />
        </div>
      </div>
      {results.length > 0 ? (
        <div className="rounded-lg border divide-y">
          {results.map((d) => (
            <div key={d.id}>
              <DeviceListItem
                id={d.id}
                name={d.name}
                deviceType={d.deviceType}
                deviceCode={d.deviceCode}
                status={d.status}
              />
              {(d.city || d.country) && (
                <div className="px-4 pb-2 text-xs text-muted-foreground -mt-1">
                  {[d.city, d.country].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : q.trim().length >= 2 || city.trim().length >= 2 || country.trim().length >= 2 ? (
        <p className="text-sm text-muted-foreground">
          {tr({ en: "No devices found.", pt: "Nenhum dispositivo encontrado.", es: "Sin dispositivos.", fr: "Aucun appareil." })}
        </p>
      ) : null}
    </div>
  );
}
