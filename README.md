# CtrlX — Smart Retail Control Platform

Multi-tenant SaaS for managing smart retail environments:

```text
Company → Store → Furniture → Kit → Device → Gateway → Home Assistant
```

## Stack

- Backend: Node.js, Express, Drizzle, PostgreSQL
- Frontend: React, Vite, shadcn/ui, TanStack Query, wouter
- Realtime: WebSocket (`/ws`)
- Control: Home Assistant REST (replaceable via `IDeviceControlService`)

## Quick start

```bash
docker compose up --build
```

- Web: http://localhost:4173  
- API: http://localhost:5000  

| User | Password | Role | Scope |
|------|----------|------|-------|
| `admin` | `changeme` | SuperAdmin | All companies — create hierarchy |
| `puig` | `changeme` | Operator | PUIG only — view & control |
| `lvmh` | `changeme` | Operator | LVMH only — view & control |

Only **SuperAdmin** can create/edit companies, stores, furniture, kits, gateways, HA and automations. Client users see their tenant and can control devices / run automations / sync HA.

Seed includes PUIG/LVMH companies, stores, furniture, kits, LED/TV devices and gateways.

## Local dev

```bash
cp .env.example .env
docker compose up db -d
npm install
npm run db:push
npm run seed
npm run dev
```

## Main API

```text
/api/auth/*
/api/companies /api/stores
/api/furniture /api/kits /api/devices
/api/gateways
/api/home-assistant (+ /entities, /:id/ping)
/api/devices/:id/control
/api/automations (+ /:id/run)
/api/monitoring
/api/audit-logs
/api/dashboard/summary
```

Device control commands: `on`, `off`, `toggle`, `set_brightness`, `set_color`, `set_temperature`, `set_volume`, `set_input`.

HA API tokens are encrypted at rest (`ENCRYPTION_KEY`) and never returned to the frontend.

## How to connect Home Assistant

1. Create a store.
2. **Operações → Home Assistant** → add URL + long-lived token for that store.
3. On save, CtrlX calls the HA API (`/api/states`), discovers controllable entities (lights, switches, media players, etc.), and creates devices under furniture **Home Assistant** → kit **Dispositivos descobertos**.
4. Use **Sincronizar** anytime to refresh inventory (also creates/updates the store gateway).
5. Control from the device page or `POST /api/devices/:id/control`.

Manual `POST /api/devices` is disabled — inventory comes only from HA discovery.

## Automations

Time-based and manual triggers. Scheduler ticks every 30s. Scope: Company / Store / Furniture / Kit / Device.

## Tests

```bash
npm test
# integration:
# RUN_INTEGRATION_TESTS=1 DATABASE_URL=... npm test
```
