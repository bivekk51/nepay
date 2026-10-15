/**
 * Express integration sketch (illustration only — no live calls, no secrets).
 *
 * - eSewa callback: `data` may arrive via GET query or POST body, so read
 *   `req.query.data ?? req.body.data`.
 * - Khalti return: `pidx` arrives as a `?pidx=` query param.
 * - Secrets come from env vars; only fulfil on `status === "completed"`.
 * - `verifyPayment` THROWS for eSewa mismatches (and on transport errors for
 *   both providers), so every verify handler MUST try/catch — see below.
 */
import type { Request, Response } from "express";
import { initiatePayment, verifyPayment } from "../src/index.js";

const esewaConfig = {
  productCode: "EPAYTEST",
  secretKey: process.env.ESEWA_SECRET_KEY ?? "",
  successUrl: "https://example.com/payments/esewa/callback",
  failureUrl: "https://example.com/payments/esewa/callback",
  env: "sandbox" as const,
};

const khaltiConfig = {
  secretKey: process.env.KHALTI_SECRET_KEY ?? "",
  websiteUrl: "https://example.com",
  returnUrl: "https://example.com/payments/khalti/return",
  env: "sandbox" as const,
};

/** Query values can be string | string[] | object — take the plain-string case. */
function queryString(req: Request, name: string): string {
  const v = req.query[name];
  return typeof v === "string" ? v : "";
}

function bodyField(req: Request, name: string): unknown {
  const body: unknown = req.body;
  if (body !== null && typeof body === "object" && name in body) {
    return (body as Record<string, unknown>)[name];
  }
  return undefined;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function startEsewa(req: Request, res: Response): Promise<void> {
  const initiated = await initiatePayment({
    method: "esewa",
    config: esewaConfig,
    order: {
      orderId: stringField(bodyField(req, "orderId")),
      amountPaisa: Number(bodyField(req, "amountPaisa")),
    },
  });
  if (!("url" in initiated)) {
    throw new Error("unexpected initiate result for method esewa");
  }
  const { url, fields } = initiated;
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}"/>`)
    .join("");
  res.send(`<form id="f" action="${url}" method="POST">${inputs}</form><script>f.submit()</script>`);
}

export async function esewaCallback(req: Request, res: Response): Promise<void> {
  // eSewa sends GET in some envs, POST in others.
  const raw = req.query.data ?? bodyField(req, "data");
  const data = stringField(raw);
  try {
    const result = await verifyPayment({
      method: "esewa",
      config: esewaConfig,
      data,
      expectedOrderId: queryString(req, "orderId") || stringField(bodyField(req, "orderId")),
      expectedAmountPaisa: Number(req.query.amountPaisa ?? bodyField(req, "amountPaisa")),
    });
    if (result.status === "completed") {
      // TODO: fulfil the order exactly once (idempotent on orderId).
    }
    res.json({ status: result.status });
  } catch (err) {
    // eSewa verify THROWS on bad signature / order / amount mismatch.
    res.status(400).json({ status: "failed", error: (err as Error).message });
  }
}

export async function startKhalti(req: Request, res: Response): Promise<void> {
  const initiated = await initiatePayment({
    method: "khalti",
    config: khaltiConfig,
    order: {
      purchaseOrderId: stringField(bodyField(req, "orderId")),
      purchaseOrderName: stringField(bodyField(req, "orderName")),
      amountPaisa: Number(bodyField(req, "amountPaisa")),
    },
  });
  if (!("pidx" in initiated)) {
    throw new Error("unexpected initiate result for method khalti");
  }
  res.redirect(initiated.payment_url);
}

export async function khaltiReturn(req: Request, res: Response): Promise<void> {
  const pidx = queryString(req, "pidx");
  try {
    const result = await verifyPayment({
      method: "khalti",
      config: khaltiConfig,
      pidx,
      expectedAmountPaisa: Number(req.query.amountPaisa),
    });
    if (result.status === "completed") {
      // TODO: fulfil the order exactly once (idempotent on orderId).
    }
    res.json({ status: result.status });
  } catch (err) {
    // Khalti verify throws only on transport/unparseable errors.
    res.status(502).json({ status: "failed", error: (err as Error).message });
  }
}
