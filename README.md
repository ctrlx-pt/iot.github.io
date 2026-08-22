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

## Deploy backend (Netlify + Neon)

The API runs as a **Netlify Function** (`netlify/functions/api.ts`) wrapping the Express app via `serverless-http`. Postgres uses the Neon serverless driver when `NETLIFY=true`.

### 1. Bootstrap Neon (once)

```bash
psql "$DATABASE_URL" -f scripts/neon-init.sql
```

Or locally: `npm run db:push && npm run seed` against your Neon pooled URL (`?sslmode=require`).

### 2. Netlify site settings → Environment variables

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | `postgresql://...@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require` |
| `JWT_SECRET` | strong random secret |
| `ENCRYPTION_KEY` | strong random 32+ char key |
| `CORS_ORIGIN` | `https://your-frontend.example.com` (comma-separated if needed) |
| `NETLIFY` | `true` (also set in `netlify.toml`) |
| `DISABLE_AUTOMATION_SCHEDULER` | `true` (cron runs in `automations-cron`) |

### 3. Connect repo to Netlify

- Build command: `npm ci` (from `netlify.toml`)
- Functions directory: `netlify/functions`
- Publish directory: `public` (placeholder; frontend is on GitHub Pages)

### 4. Frontend API URL

Set in GitHub Pages workflow or `.env`:

```env
VITE_API_BASE_URL=https://YOUR-SITE.netlify.app/.netlify/functions
VITE_ENABLE_WS=false
VITE_API_CREDENTIALS=omit
```

### Limitations on Netlify

- **WebSockets** (`/ws`) are not supported — realtime updates are disabled (`VITE_ENABLE_WS=false`).
- **Automations** time triggers run via the scheduled function `automations-cron` (every minute), not `setInterval`.
- **Cold starts** — first request after idle may be slower; HA discovery can hit function timeouts on large inventories.

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
