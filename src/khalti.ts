import { z } from "zod";
import type { PaymentResult } from "./types.js";

export const KHALTI_BASES = {
  sandbox: "https://dev.khalti.com/api/v2",
  production: "https://khalti.com/api/v2",
} as const;

export const KhaltiConfigSchema = z.object({
  secretKey: z.string().min(1),
  websiteUrl: z.string().url(),
  returnUrl: z.string().url(),
  env: z.enum(["sandbox", "production"]),
  baseUrl: z.string().url().optional(),
});

export type KhaltiConfig = z.infer<typeof KhaltiConfigSchema>;

export interface KhaltiAmountBreakdown {
  label: string;
  amount: number;
}

export interface InitiateKhaltiOpts {
  config: KhaltiConfig;
  purchaseOrderId: string;
  purchaseOrderName: string;
  amountPaisa: number;
  customerInfo?: { name?: string; email?: string; phone?: string };
  amountBreakdown?: KhaltiAmountBreakdown[];
  extra?: Record<`merchant_${string}`, string>;
}

export interface InitiateKhaltiResult {
  pidx: string;
  payment_url: string;
  expires_at: string;
  expires_in: number;
}

export interface LookupKhaltiOpts {
  config: KhaltiConfig;
  pidx: string;
}

export interface LookupKhaltiResult {
  pidx: string;
  total_amount: number;
  status: string;
  transaction_id: string | null;
  fee: number | null;
  refunded: boolean | null;
  raw: unknown;
}

export interface VerifyKhaltiPaymentOpts {
  config: KhaltiConfig;
  pidx: string;
  expectedAmountPaisa: number;
  expectedOrderId?: string;
}

function assertAmountPaisa(value: number): void {
  if (!Number.isInteger(value) || value < 1000) {
    throw new RangeError(`invalid amountPaisa ${JSON.stringify(value)}: must be an integer >= 1000 paisa`);
  }
}

function assertExpectedAmountPaisa(value: number): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`invalid expectedAmountPaisa ${JSON.stringify(value)}: must be an integer paisa amount`);
  }
}

function assertBreakdown(amountPaisa: number, breakdown: KhaltiAmountBreakdown[] | undefined): void {
  if (!breakdown) return;
  let sum = 0;
  for (const item of breakdown) {
    if (!Number.isInteger(item.amount) || item.amount < 0) {
      throw new RangeError(
        `invalid amountBreakdown amount ${JSON.stringify(item.amount)}: must be a non-negative integer paisa amount`
      );
    }
    sum += item.amount;
  }
  if (sum !== amountPaisa) {
    throw new Error(`Breakdown mismatch: sum of amountBreakdown (${sum}) != amountPaisa (${amountPaisa})`);
  }
}

function authHeaders(secretKey: string): Record<string, string> {
  return {
    Authorization: `Key ${secretKey}`,
    "Content-Type": "application/json",
  };
}

export async function initiateKhalti(opts: InitiateKhaltiOpts): Promise<InitiateKhaltiResult> {
  if (!opts.purchaseOrderId || typeof opts.purchaseOrderId !== "string") {
    throw new Error("purchaseOrderId must be a non-empty string");
  }
  if (!opts.purchaseOrderName || typeof opts.purchaseOrderName !== "string") {
    throw new Error("purchaseOrderName must be a non-empty string");
  }
  assertAmountPaisa(opts.amountPaisa);
  assertBreakdown(opts.amountPaisa, opts.amountBreakdown);

  const base = opts.config.baseUrl ?? KHALTI_BASES[opts.config.env];
  const body: Record<string, unknown> = {
    return_url: opts.config.returnUrl,
    website_url: opts.config.websiteUrl,
    amount: opts.amountPaisa,
    purchase_order_id: opts.purchaseOrderId,
    purchase_order_name: opts.purchaseOrderName,
  };
  if (opts.customerInfo) body.customer_info = opts.customerInfo;
  if (opts.amountBreakdown) body.amount_breakdown = opts.amountBreakdown;
  if (opts.extra) {
    for (const [k, v] of Object.entries(opts.extra)) {
      body[k] = v;
    }
  }

  const res = await fetch(`${base}/epayment/initiate/`, {
    method: "POST",
    headers: authHeaders(opts.config.secretKey),
    body: JSON.stringify(body),
  });
  const raw: unknown = await res.json();
  if (!res.ok) {
    const detail =
      raw !== null && typeof raw === "object" && "detail" in (raw as Record<string, unknown>)
        ? String((raw as Record<string, unknown>).detail)
        : JSON.stringify(raw);
    throw new Error(`Khalti initiate failed (HTTP ${res.status}): ${detail}`);
  }
  const rec = (raw ?? {}) as Record<string, unknown>;
  const pidx = rec.pidx;
  const paymentUrl = rec.payment_url;
  const expiresIn = rec.expires_in;
  if (typeof pidx !== "string" || pidx.length === 0) {
    throw new Error(`Khalti initiate returned malformed pidx: ${JSON.stringify(raw)}`);
  }
  if (typeof paymentUrl !== "string" || paymentUrl.length === 0) {
    throw new Error(`Khalti initiate returned malformed payment_url: ${JSON.stringify(raw)}`);
  }
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) {
    throw new Error(`Khalti initiate returned malformed expires_in: ${JSON.stringify(raw)}`);
  }
  return {
    pidx,
    payment_url: paymentUrl,
    expires_at: String(rec.expires_at),
    expires_in: expiresIn,
  };
}

function inferStatusFromErrorBody(rec: Record<string, unknown>): string | null {
  const haystack = [rec.error_key, rec.detail, rec.status]
    .filter((v) => typeof v === "string")
    .join(" ");
  if (/expired/i.test(haystack)) return "Expired";
  if (/user[_\s-]?cancel/i.test(haystack) || /cancelled by user/i.test(haystack)) return "User canceled";
  return null;
}

export async function lookupKhalti(opts: LookupKhaltiOpts): Promise<LookupKhaltiResult> {
  if (!opts.pidx || typeof opts.pidx !== "string") {
    throw new Error("pidx must be a non-empty string");
  }
  const base = opts.config.baseUrl ?? KHALTI_BASES[opts.config.env];
  const res = await fetch(`${base}/epayment/lookup/`, {
    method: "POST",
    headers: authHeaders(opts.config.secretKey),
    body: JSON.stringify({ pidx: opts.pidx }),
  });
  // Parse the JSON body even on HTTP 400 (Expired / User-canceled carry their
  // status in the body, not just in the status code).
  const raw: unknown = await res.json();
  const rec = (raw ?? {}) as Record<string, unknown>;
  const status =
    typeof rec.status === "string" ? rec.status : (inferStatusFromErrorBody(rec) ?? "");
  if (!res.ok && !status) {
    const detail = typeof rec.detail === "string" ? rec.detail : JSON.stringify(raw);
    throw new Error(`Khalti lookup failed (HTTP ${res.status}): ${detail}`);
  }
  return {
    pidx: typeof rec.pidx === "string" ? rec.pidx : opts.pidx,
    total_amount: typeof rec.total_amount === "number" ? rec.total_amount : Number(rec.total_amount ?? NaN),
    status,
    transaction_id: rec.transaction_id == null ? null : String(rec.transaction_id),
    fee: rec.fee == null ? null : Number(rec.fee),
    refunded: rec.refunded == null ? null : Boolean(rec.refunded),
    raw,
  };
}

export async function verifyKhaltiPayment(opts: VerifyKhaltiPaymentOpts): Promise<PaymentResult> {
  assertExpectedAmountPaisa(opts.expectedAmountPaisa);
  const lookup = await lookupKhalti({ config: opts.config, pidx: opts.pidx });

  const rec = (lookup.raw ?? {}) as Record<string, unknown>;
  const lookupOrderId = typeof rec.purchase_order_id === "string" ? rec.purchase_order_id : null;
  const orderId = opts.expectedOrderId ?? lookupOrderId ?? opts.pidx;

  const base = {
    amountPaisa: opts.expectedAmountPaisa,
    orderId,
    traceId: lookup.transaction_id,
    raw: lookup.raw,
  } as const;

  // Order binding: when the caller provides an expected order id and the
  // lookup body carries a purchase_order_id, they must agree. When the body
  // carries no order id there is nothing to compare against, so pass.
  if (opts.expectedOrderId !== undefined && lookupOrderId !== null && lookupOrderId !== opts.expectedOrderId) {
    return { ...base, status: "failed" };
  }

  switch (lookup.status) {
    case "Completed":
      return { ...base, status: lookup.total_amount === opts.expectedAmountPaisa ? "completed" : "failed" };
    case "Pending":
    case "Initiated":
      return { ...base, status: "pending" };
    case "Expired":
      return { ...base, status: "expired" };
    case "User canceled":
      return { ...base, status: "canceled" };
    case "Refunded":
    case "Partially Refunded":
      return { ...base, status: "failed" };
    default:
      return { ...base, status: "pending" };
  }
}
