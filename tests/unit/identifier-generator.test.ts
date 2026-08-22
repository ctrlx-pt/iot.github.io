import { describe, expect, it } from "vitest";
import { IdentifierFormats } from "../../server/services/identifier-generator";

describe("IdentifierFormats", () => {
  it("formats store codes", () => {
    expect(IdentifierFormats.storeCode("00", 1)).toBe("ctrlx-00-000001");
    expect(IdentifierFormats.storeCode("01", 42)).toBe("ctrlx-01-000042");
    expect(IdentifierFormats.isValidStoreCode("ctrlx-00-000001")).toBe(true);
    expect(IdentifierFormats.isValidStoreCode("ctrlx-0-1")).toBe(false);
  });

  it("formats furniture and kit codes", () => {
    expect(IdentifierFormats.furnitureCode("ctrlx-00-000001", 1)).toBe("ctrlx-00-000001-F01");
    expect(IdentifierFormats.kitCode("ctrlx-01-000001", 2)).toBe("ctrlx-01-000001-02");
    expect(IdentifierFormats.isValidFurnitureCode("ctrlx-00-000001-F01")).toBe(true);
    expect(IdentifierFormats.isValidKitCode("ctrlx-01-000001-02")).toBe(true);
  });

  it("formats gateway hardware ids", () => {
    expect(IdentifierFormats.gatewayHardwareId(3)).toBe("ctrlx-GTW-000003");
    expect(IdentifierFormats.isValidGatewayId("ctrlx-GTW-000003")).toBe(true);
  });
});
