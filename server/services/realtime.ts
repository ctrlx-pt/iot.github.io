type Client = { send: (data: string) => void; readyState: number; companyIds?: string[] };

const OPEN = 1;
const clients = new Set<Client>();

export function registerRealtimeClient(client: Client) {
  clients.add(client);
  return () => clients.delete(client);
}

export function broadcastDeviceState(companyId: string, payload: unknown) {
  const msg = JSON.stringify(payload);
  for (const c of clients) {
    if (c.readyState !== OPEN) continue;
    if (c.companyIds && c.companyIds.length > 0 && !c.companyIds.includes(companyId) && !c.companyIds.includes("*")) {
      continue;
    }
    try {
      c.send(msg);
    } catch {
      /* ignore */
    }
  }
}

export function broadcastToAll(payload: unknown) {
  const msg = JSON.stringify(payload);
  for (const c of clients) {
    if (c.readyState !== OPEN) continue;
    try {
      c.send(msg);
    } catch {
      /* ignore */
    }
  }
}
