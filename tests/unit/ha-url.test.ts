import { describe, expect, it } from "vitest";
import { normalizeHomeAssistantBaseUrl } from "../../shared/ha-url";

describe("normalizeHomeAssistantBaseUrl", () => {
  it("keeps a bare origin", () => {
    expect(normalizeHomeAssistantBaseUrl("https://ha.example.com")).toBe("https://ha.example.com");
    expect(normalizeHomeAssistantBaseUrl("https://ha.example.com/")).toBe("https://ha.example.com");
    expect(normalizeHomeAssistantBaseUrl("https://ha.example.com:8123/")).toBe(
      "https://ha.example.com:8123",
    );
  });

  it("adds https when the scheme is missing", () => {
    expect(normalizeHomeAssistantBaseUrl("ha.example.com")).toBe("https://ha.example.com");
  });

  it("strips dashboard and lovelace UI paths", () => {
    expect(normalizeHomeAssistantBaseUrl("https://ctrlx.prod.diogomendes.net/dashboard/console")).toBe(
      "https://ctrlx.prod.diogomendes.net",
    );
    expect(normalizeHomeAssistantBaseUrl("https://ha.example.com/lovelace/default_view")).toBe(
      "https://ha.example.com",
    );
    expect(normalizeHomeAssistantBaseUrl("https://ha.example.com/dashboard-conex/aa")).toBe(
      "https://ha.example.com",
    );
  });

  it("strips /api and /api/states", () => {
    expect(normalizeHomeAssistantBaseUrl("https://ha.example.com/api")).toBe("https://ha.example.com");
    expect(normalizeHomeAssistantBaseUrl("https://ha.example.com/api/states")).toBe(
      "https://ha.example.com",
    );
  });

  it("keeps a subdirectory install", () => {
    expect(normalizeHomeAssistantBaseUrl("https://domain.com/ha")).toBe("https://domain.com/ha");
    expect(normalizeHomeAssistantBaseUrl("https://domain.com/ha/lovelace/0")).toBe(
      "https://domain.com/ha",
    );
    expect(normalizeHomeAssistantBaseUrl("https://domain.com/ha/dashboard/console")).toBe(
      "https://domain.com/ha",
    );
  });
});
