import { describe, expect, it } from "vitest";
import {
  inferHeartbeatLevel,
  truncateToUtcHour,
  worstHeartbeatLevel,
} from "../../server/services/devices/heartbeat-history";
import { buildHeartbeatCalendar } from "../../client/src/lib/heartbeat-calendar";

describe("inferHeartbeatLevel", () => {
  it("maps online integration to ok", () => {
    expect(inferHeartbeatLevel("ONLINE", "integration", 100)).toBe("ok");
  });

  it("maps offline to red level", () => {
    expect(inferHeartbeatLevel("OFFLINE", "integration")).toBe("offline");
  });

  it("maps mock source to degraded", () => {
    expect(inferHeartbeatLevel("ONLINE", "mock")).toBe("degraded");
  });

  it("maps high latency to degraded", () => {
    expect(inferHeartbeatLevel("ONLINE", "integration", 6000)).toBe("degraded");
  });
});

describe("worstHeartbeatLevel", () => {
  it("keeps the worst status in an hour", () => {
    expect(worstHeartbeatLevel("ok", "degraded")).toBe("degraded");
    expect(worstHeartbeatLevel("degraded", "offline")).toBe("offline");
    expect(worstHeartbeatLevel("offline", "ok")).toBe("offline");
  });
});

describe("truncateToUtcHour", () => {
  it("zeroes minutes and seconds in UTC", () => {
    const d = new Date("2026-08-30T14:37:22.000Z");
    expect(truncateToUtcHour(d).toISOString()).toBe("2026-08-30T14:00:00.000Z");
  });
});

describe("buildHeartbeatCalendar", () => {
  it("places buckets on local hour cells", () => {
    const at = new Date();
    at.setMinutes(0, 0, 0);
    const grid = buildHeartbeatCalendar(
      [{ hourStart: at.toISOString(), level: "ok" }],
      1,
    );
    expect(grid).toHaveLength(1);
    expect(grid[0].hours.some((h) => h.level === "ok")).toBe(true);
  });
});
