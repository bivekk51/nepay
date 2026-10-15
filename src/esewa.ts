import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const ESEWA_BASES = {
  sandbox: {
    form: "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
    status: "https://rc.esewa.com.np/api/epay/transaction/status/",
  },
  production: {
    form: "https://epay.esewa.com.np/api/epay/main/v2/form",
    status: "https://esewa.com.np/api/epay/transaction/status/",
  },
} as const;

export const EsewaConfigSchema = z.object({
  productCode: z.string().min(1),
  secretKey: z.string().min(1),
  successUrl: z.string().url(),
  failureUrl: z.string().url(),
  env: z.enum(["sandbox", "production"]),
});

export type EsewaConfig = z.infer<typeof EsewaConfigSchema>;

export class EsewaRetryableError extends Error {
  constructor(message = "eSewa service is currently unavailable") {
    super(message);
    this.name = "EsewaRetryableError";
  }
}

export interface EpayV2SignParams {
  total_amount: string;
  transaction_uuid: string;
  product_code: string;
}

export interface EpayStatusOpts {
  env: "sandbox" | "production";
  product_code: string;
  total_amount: string;
  transaction_uuid: string;
  baseUrl?: string;
}

export interface EpayStatusResult {
  status: string;
  ref_id: string | null;
  raw: unknown;
}

export function signEpayV2(p: EpayV2SignParams, secret: string): string {
  const msg = `total_amount=${p.total_amount},transaction_uuid=${p.transaction_uuid},product_code=${p.product_code}`;
  return createHmac("sha256", secret).update(msg, "utf8").digest("base64");
}

export async function verifyEpayCallback(
  dataB64: string,
  secret: string
): Promise<{ valid: boolean; data: Record<string, string> | null }> {
  let payload: Record<string, unknown>;
  try {
    const json = Buffer.from(dataB64, "base64").toString("utf8");
    payload = JSON.parse(json);
  } catch {
    return { valid: false, data: null };
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.signature !== "string" ||
    typeof payload.signed_field_names !== "string"
  ) {
    return { valid: false, data: null };
  }
  const fields = payload.signed_field_names.split(",");
  for (const f of fields) {
    if (payload[f] === undefined || payload[f] === null) {
      return { valid: false, data: null };
    }
  }
  // Sign raw string values verbatim (no numeric normalization: "1,000.0" stays as-is).
  const msg = fields.map((f) => `${f}=${String(payload[f])}`).join(",");
  const expected = createHmac("sha256", secret).update(msg, "utf8").digest("base64");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(payload.signature, "utf8");
  if (a.length !== b.length) {
    return { valid: false, data: null };
  }
  if (!timingSafeEqual(a, b)) {
    return { valid: false, data: null };
  }
  return { valid: true, data: payload as Record<string, string> };
}

export async function checkEpayStatus(opts: EpayStatusOpts): Promise<EpayStatusResult> {
  const base = opts.baseUrl ?? ESEWA_BASES[opts.env].status;
  const url =
    `${base}?product_code=${encodeURIComponent(opts.product_code)}` +
    `&total_amount=${encodeURIComponent(opts.total_amount)}` +
    `&transaction_uuid=${encodeURIComponent(opts.transaction_uuid)}`;
  const res = await fetch(url);
  const raw: unknown = await res.json();
  if (
    raw !== null &&
    typeof raw === "object" &&
    (raw as Record<string, unknown>).code === 0 &&
    (raw as Record<string, unknown>).error_message === "Service is currently unavailable"
  ) {
    throw new EsewaRetryableError();
  }
  const rec = (raw ?? {}) as Record<string, unknown>;
  return {
    status: typeof rec.status === "string" ? rec.status : "",
    ref_id: rec.ref_id == null ? null : String(rec.ref_id),
    raw,
  };
}
