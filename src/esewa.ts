import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { paisaToRupeesString, parseAmountToPaisa } from "./money.js";
import type { PaymentResult } from "./types.js";

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

const ORDER_ID_RE = /^[A-Za-z0-9-]+$/;

function assertOrderId(orderId: string): void {
  if (!ORDER_ID_RE.test(orderId)) {
    throw new Error(`invalid orderId ${JSON.stringify(orderId)}: must match [A-Za-z0-9-]`);
  }
}

function assertPaisa(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`invalid ${name}: must be a non-negative integer paisa amount`);
  }
}

function constantTimeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface EsewaFieldOpts {
  config: EsewaConfig;
  orderId: string;
  amountPaisa: number;
  taxPaisa?: number;
  servicePaisa?: number;
  deliveryPaisa?: number;
}

export function buildEsewaFields(opts: EsewaFieldOpts): {
  url: string;
  fields: Record<string, string>;
} {
  assertOrderId(opts.orderId);
  assertPaisa("amountPaisa", opts.amountPaisa);
  const taxPaisa = opts.taxPaisa ?? 0;
  const servicePaisa = opts.servicePaisa ?? 0;
  const deliveryPaisa = opts.deliveryPaisa ?? 0;
  assertPaisa("taxPaisa", taxPaisa);
  assertPaisa("servicePaisa", servicePaisa);
  assertPaisa("deliveryPaisa", deliveryPaisa);

  const totalPaisa = opts.amountPaisa + taxPaisa + servicePaisa + deliveryPaisa;
  const total_amount = paisaToRupeesString(totalPaisa);
  const transaction_uuid = opts.orderId;
  const product_code = opts.config.productCode;
  const signature = signEpayV2({ total_amount, transaction_uuid, product_code }, opts.config.secretKey);
  return {
    url: ESEWA_BASES[opts.config.env].form,
    fields: {
      amount: paisaToRupeesString(opts.amountPaisa),
      tax_amount: paisaToRupeesString(taxPaisa),
      total_amount,
      transaction_uuid,
      product_code,
      product_service_charge: paisaToRupeesString(servicePaisa),
      product_delivery_charge: paisaToRupeesString(deliveryPaisa),
      success_url: opts.config.successUrl,
      failure_url: opts.config.failureUrl,
      signed_field_names: "total_amount,transaction_uuid,product_code",
      signature,
    },
  };
}

export interface VerifyEsewaPaymentOpts {
  config: EsewaConfig;
  /** Base64 `data` string from the eSewa callback. The caller extracts it via `req.query.data ?? req.body.data` (eSewa sends GET in some envs, POST in others). */
  data: string;
  expectedOrderId: string;
  expectedAmountPaisa: number;
}

export async function verifyEsewaPayment(opts: VerifyEsewaPaymentOpts): Promise<PaymentResult> {
  assertOrderId(opts.expectedOrderId);
  assertPaisa("expectedAmountPaisa", opts.expectedAmountPaisa);

  const { valid, data: callback } = await verifyEpayCallback(opts.data, opts.config.secretKey);
  if (!valid || !callback) {
    throw new Error("invalid eSewa callback signature");
  }
  const productCode = callback.product_code;
  const uuid = callback.transaction_uuid;
  const totalRaw = callback.total_amount;
  if (typeof productCode !== "string" || typeof uuid !== "string" || typeof totalRaw !== "string") {
    throw new Error("eSewa callback is missing product_code, transaction_uuid, or total_amount");
  }
  if (!constantTimeEq(productCode, opts.config.productCode)) {
    throw new Error("eSewa callback product_code mismatch");
  }
  if (!constantTimeEq(uuid, opts.expectedOrderId)) {
    throw new Error("eSewa callback transaction_uuid mismatch");
  }
  if (parseAmountToPaisa(totalRaw) !== opts.expectedAmountPaisa) {
    throw new Error("eSewa callback total_amount mismatch");
  }

  const live = await checkEpayStatus({
    env: opts.config.env,
    product_code: productCode,
    total_amount: totalRaw,
    transaction_uuid: uuid,
  });
  const statusRaw = (live.raw ?? {}) as Record<string, unknown>;
  const txCode = statusRaw.transaction_code == null ? null : String(statusRaw.transaction_code);
  const traceId = live.ref_id ?? txCode;
  const base = {
    amountPaisa: opts.expectedAmountPaisa,
    orderId: opts.expectedOrderId,
    traceId,
    raw: { callback, status: live.raw },
  } as const;

  switch (live.status) {
    case "COMPLETE":
      // Only a COMPLETE backed by a ref_id counts as completed.
      return { ...base, status: live.ref_id ? "completed" : "pending" };
    case "PENDING":
    case "AMBIGUOUS":
      return { ...base, status: "pending" };
    case "NOT_FOUND":
    case "CANCELED":
    case "FULL_REFUND":
    case "PARTIAL_REFUND":
      return { ...base, status: "failed" };
    default:
      // Unknown non-terminal statuses stay pending; raw is preserved for inspection.
      return { ...base, status: "pending" };
  }
}
