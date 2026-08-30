import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { LocationSearchInput } from "@/components/location-search-input";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiJson, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTr } from "@/lib/tr";
import { getDeviceVisual } from "@/lib/device-visuals";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { HeartPulse, MapPin, TicketPlus } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

type Ticket = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  createdAt: string;
};

export default function DeviceDetailPage() {
  const [, params] = useRoute("/devices/:deviceId");
  const deviceId = params?.deviceId ?? "";
  const tr = useTr();
  const { toast } = useToast();
  const { canEditDevice } = useCurrentUser();
  const [brightness, setBrightness] = useState(80);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    description: "",
    address: "",
    city: "",
    country: "",
    imageUrl: "",
  });
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");

  const { data: device } = useQuery<any>({
    queryKey: ["/api/devices", deviceId],
    enabled: !!deviceId,
  });

  const { data: state } = useQuery<any>({
    queryKey: ["/api/devices", deviceId, "state"],
    queryFn: () => apiJson("GET", `/api/devices/${deviceId}/state`),
    enabled: !!deviceId,
    refetchInterval: 15_000,
  });

  const { data: heartbeat, refetch: refetchHeartbeat } = useQuery<any>({
    queryKey: ["/api/devices", deviceId, "heartbeat"],
    queryFn: () => apiJson("GET", `/api/devices/${deviceId}/heartbeat`),
    enabled: !!deviceId,
    refetchInterval: 30_000,
  });

  const { data: tickets = [] } = useQuery<Ticket[]>({
    queryKey: ["/api/devices", deviceId, "tickets"],
    queryFn: () => apiJson("GET", `/api/devices/${deviceId}/tickets`),
    enabled: !!deviceId,
  });

  useEffect(() => {
    if (!device) return;
    setForm({
      description: device.description || "",
      address: device.address || "",
      city: device.city || "",
      country: device.country || "",
      imageUrl: device.imageUrl || "",
    });
  }, [device]);

  const control = useMutation({
    mutationFn: (body: any) => apiJson("POST", `/api/devices/${deviceId}/control`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId, "state"] });
      toast({ title: tr({ en: "Command sent", pt: "Comando enviado", es: "Comando enviado", fr: "Commande envoyée" }) });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const saveMeta = useMutation({
    mutationFn: () => apiJson("PATCH", `/api/devices/${deviceId}`, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId] });
      setEditOpen(false);
      toast({ title: tr({ en: "Device updated", pt: "Dispositivo atualizado", es: "Dispositivo actualizado", fr: "Appareil mis à jour" }) });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const createTicket = useMutation({
    mutationFn: () =>
      apiJson("POST", `/api/devices/${deviceId}/tickets`, {
        title: ticketTitle,
        description: ticketDesc,
        priority: "MEDIUM",
      }),
    onSuccess: () => {
      setTicketTitle("");
      setTicketDesc("");
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId, "tickets"] });
      toast({ title: tr({ en: "Ticket created", pt: "Ticket criado", es: "Ticket creado", fr: "Ticket créé" }) });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateTicket = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiJson("PATCH", `/api/devices/${deviceId}/tickets/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", deviceId, "tickets"] });
    },
  });

  const onImageFile = (file: File | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: tr({ en: "Image too large (max 2MB)", pt: "Imagem demasiado grande (máx. 2MB)" }),
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, imageUrl: String(reader.result) }));
      setEditOpen(true);
    };
    reader.readAsDataURL(file);
  };

  if (!device) {
    return <p className="text-muted-foreground">{tr({ en: "Loading…", pt: "A carregar…", es: "Cargando…", fr: "Chargement…" })}</p>;
  }

  const caps: string[] = device.capabilities || [];
  const visual = getDeviceVisual({
    deviceType: device.deviceType,
    homeAssistantEntityId: device.homeAssistantEntityId,
  });
  const { Icon } = visual;
  const heartbeatSource = heartbeat?.source || device.heartbeatSource || "mock";
  const lastSeen = heartbeat?.lastSeenAt || device.lastSeenAt;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          {device.imageUrl ? (
            <img
              src={device.imageUrl}
              alt={device.name}
              className="h-28 w-28 shrink-0 rounded-xl object-cover ring-1 ring-border"
            />
          ) : (
            <div
              className={cn(
                "flex h-28 w-28 shrink-0 items-center justify-center rounded-xl ring-1",
                visual.wellClass,
              )}
            >
              <Icon className={cn("h-10 w-10", visual.iconClass)} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <Breadcrumbs
              items={[
                { label: tr({ en: "Devices", pt: "Dispositivos", es: "Dispositivos", fr: "Appareils" }) },
                { label: device.name },
              ]}
            />
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{device.name}</h1>
              <StatusBadge status={state?.status || device.status} />
            </div>
            <p className="font-mono text-sm text-muted-foreground">{device.deviceCode}</p>
            <p className="text-sm text-muted-foreground mt-1">{visual.label}</p>
            {device.description ? (
              <p className="mt-2 text-sm text-foreground/90">{device.description}</p>
            ) : null}
            {(device.address || device.city || device.country) && (
              <p className="mt-2 flex items-start gap-1 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                {[device.address, device.city, device.country].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border p-4 text-sm space-y-2 min-w-[220px]">
          <div className="flex items-center gap-2 font-medium">
            <HeartPulse className="h-4 w-4 text-emerald-600" />
            {tr({ en: "Heartbeat", pt: "Heartbeat", es: "Latido", fr: "Heartbeat" })}
          </div>
          <div className="text-muted-foreground">
            {tr({
              en: "Source",
              pt: "Origem",
              es: "Origen",
              fr: "Source",
            })}
            :{" "}
            <span className="font-medium text-foreground">
              {heartbeatSource === "integration"
                ? tr({ en: "Integration hub", pt: "Hub de integração", es: "Hub de integración", fr: "Hub d'intégration" })
                : tr({ en: "Simulated", pt: "Simulado", es: "Simulado", fr: "Simulé" })}
            </span>
          </div>
          {lastSeen ? (
            <div className="text-muted-foreground">
              {tr({ en: "Last seen", pt: "Última vez", es: "Última vez", fr: "Dernière vue" })}:{" "}
              {new Date(lastSeen).toLocaleString()}
            </div>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => refetchHeartbeat()}>
            {tr({ en: "Refresh", pt: "Atualizar", es: "Actualizar", fr: "Actualiser" })}
          </Button>
        </div>
      </div>

      {canEditDevice ? (
        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">
              {tr({ en: "Device details", pt: "Detalhes do dispositivo", es: "Detalles del dispositivo", fr: "Détails de l'appareil" })}
            </h2>
            <Button size="sm" variant="outline" onClick={() => setEditOpen((v) => !v)}>
              {editOpen
                ? tr({ en: "Close", pt: "Fechar", es: "Cerrar", fr: "Fermer" })
                : tr({ en: "Edit", pt: "Editar", es: "Editar", fr: "Modifier" })}
            </Button>
          </div>
          {editOpen ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>{tr({ en: "Description", pt: "Descrição", es: "Descripción", fr: "Description" })}</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{tr({ en: "Photo", pt: "Foto", es: "Foto", fr: "Photo" })}</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onImageFile(e.target.files?.[0] ?? null)}
                />
                <Input
                  placeholder="https://…"
                  value={form.imageUrl.startsWith("data:") ? "" : form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{tr({ en: "Address", pt: "Morada", es: "Dirección", fr: "Adresse" })}</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{tr({ en: "City", pt: "Cidade", es: "Ciudad", fr: "Ville" })}</Label>
                <LocationSearchInput
                  value={form.city}
                  onChange={(city) => setForm((f) => ({ ...f, city }))}
                  mode="city"
                />
              </div>
              <div className="space-y-2">
                <Label>{tr({ en: "Country", pt: "País", es: "País", fr: "Pays" })}</Label>
                <LocationSearchInput
                  value={form.country}
                  onChange={(country) => setForm((f) => ({ ...f, country }))}
                  mode="country"
                />
              </div>
              <div className="md:col-span-2">
                <Button onClick={() => saveMeta.mutate()} disabled={saveMeta.isPending}>
                  {tr({ en: "Save", pt: "Guardar", es: "Guardar", fr: "Enregistrer" })}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {caps.includes("Power") ? (
          <>
            <Button onClick={() => control.mutate({ action: "on" })}>ON</Button>
            <Button variant="secondary" onClick={() => control.mutate({ action: "off" })}>
              OFF
            </Button>
            <Button variant="outline" onClick={() => control.mutate({ action: "toggle" })}>
              TOGGLE
            </Button>
          </>
        ) : null}
      </div>

      {caps.includes("Brightness") ? (
        <div className="max-w-md space-y-3 rounded-lg border p-4">
          <div className="text-sm font-medium">
            {tr({ en: "Brightness", pt: "Brilho", es: "Brillo", fr: "Luminosité" })}: {brightness}%
          </div>
          <Slider value={[brightness]} min={0} max={100} step={1} onValueChange={(v) => setBrightness(v[0] ?? 0)} />
          <Button size="sm" onClick={() => control.mutate({ action: "set_brightness", brightness })}>
            {tr({ en: "Apply", pt: "Aplicar", es: "Aplicar", fr: "Appliquer" })}
          </Button>
        </div>
      ) : null}

      {caps.includes("Color") ? (
        <div className="flex gap-2">
          {["#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffaa00"].map((c) => (
            <button
              key={c}
              className="h-8 w-8 rounded-full border"
              style={{ background: c }}
              onClick={() => control.mutate({ action: "set_color", color: c })}
              aria-label={c}
            />
          ))}
        </div>
      ) : null}

      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center gap-2 font-medium">
          <TicketPlus className="h-4 w-4" />
          {tr({ en: "Support tickets", pt: "Tickets de suporte", es: "Tickets de soporte", fr: "Tickets de support" })}
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <Input
            placeholder={tr({ en: "Title", pt: "Título", es: "Título", fr: "Titre" })}
            value={ticketTitle}
            onChange={(e) => setTicketTitle(e.target.value)}
          />
          <Input
            placeholder={tr({ en: "Description (optional)", pt: "Descrição (opcional)" })}
            value={ticketDesc}
            onChange={(e) => setTicketDesc(e.target.value)}
          />
          <Button
            onClick={() => createTicket.mutate()}
            disabled={!ticketTitle.trim() || createTicket.isPending}
          >
            {tr({ en: "Create", pt: "Criar", es: "Crear", fr: "Créer" })}
          </Button>
        </div>
        <div className="space-y-2">
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {tr({ en: "No tickets yet.", pt: "Ainda sem tickets.", es: "Sin tickets aún.", fr: "Aucun ticket." })}
            </p>
          ) : (
            tickets.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.title}</div>
                  {t.description ? <div className="text-muted-foreground">{t.description}</div> : null}
                </div>
                <Select value={t.status} onValueChange={(status) => updateTicket.mutate({ id: t.id, status })}>
                  <SelectTrigger className="w-[140px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
