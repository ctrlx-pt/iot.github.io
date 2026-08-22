import { getPool } from "../db/client";

function padSeq(n: number, width = 6): string {
  return String(n).padStart(width, "0");
}

function padFurniture(n: number): string {
  return `F${String(n).padStart(2, "0")}`;
}

function padKit(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Server-side business ID generator.
 * Uses a transactional counter row so IDs are unique and thread-safe.
 */
export class IdentifierGenerator {
  async nextCounter(counterKey: string): Promise<number> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ next_value: number }>(
        `SELECT next_value FROM id_counters WHERE counter_key = $1 FOR UPDATE`,
        [counterKey],
      );

      let value: number;
      if (existing.rows.length === 0) {
        value = 1;
        await client.query(
          `INSERT INTO id_counters (counter_key, next_value, updated_at) VALUES ($1, $2, NOW())`,
          [counterKey, 2],
        );
      } else {
        value = existing.rows[0].next_value;
        await client.query(
          `UPDATE id_counters SET next_value = $1, updated_at = NOW() WHERE counter_key = $2`,
          [value + 1, counterKey],
        );
      }
      await client.query("COMMIT");
      return value;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async generateStoreCode(companyCode: string): Promise<string> {
    const cc = companyCode.trim();
    if (!/^\d{2}$/.test(cc)) {
      throw new Error("Company code must be exactly 2 digits");
    }
    const seq = await this.nextCounter(`store:${cc}`);
    return `ctrlx-${cc}-${padSeq(seq)}`;
  }

  async generateFurnitureCode(storeCode: string): Promise<string> {
    const seq = await this.nextCounter(`furniture:${storeCode}`);
    return `${storeCode}-${padFurniture(seq)}`;
  }

  async generateKitCode(storeCode: string): Promise<string> {
    const seq = await this.nextCounter(`kit:${storeCode}`);
    return `${storeCode}-${padKit(seq)}`;
  }

  async generateGatewayHardwareId(): Promise<string> {
    const seq = await this.nextCounter("gateway");
    return `ctrlx-GTW-${padSeq(seq)}`;
  }

  async generateDeviceCode(kitCode: string, deviceType: string): Promise<string> {
    const typeSlug = deviceType.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "DEV";
    const seq = await this.nextCounter(`device:${kitCode}:${typeSlug}`);
    return `${kitCode}-${typeSlug}${String(seq).padStart(2, "0")}`;
  }
}

export const identifierGenerator = new IdentifierGenerator();

/** Pure helpers for unit tests (no DB). */
export const IdentifierFormats = {
  storeCode(companyCode: string, seq: number) {
    return `ctrlx-${companyCode}-${padSeq(seq)}`;
  },
  furnitureCode(storeCode: string, seq: number) {
    return `${storeCode}-${padFurniture(seq)}`;
  },
  kitCode(storeCode: string, seq: number) {
    return `${storeCode}-${padKit(seq)}`;
  },
  gatewayHardwareId(seq: number) {
    return `ctrlx-GTW-${padSeq(seq)}`;
  },
  isValidStoreCode(code: string) {
    return /^ctrlx-\d{2}-\d{6}$/.test(code);
  },
  isValidFurnitureCode(code: string) {
    return /^ctrlx-\d{2}-\d{6}-F\d{2}$/.test(code);
  },
  isValidKitCode(code: string) {
    return /^ctrlx-\d{2}-\d{6}-\d{2}$/.test(code);
  },
  isValidGatewayId(code: string) {
    return /^ctrlx-GTW-\d{6}$/.test(code);
  },
};
