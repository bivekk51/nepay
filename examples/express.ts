/**
 * Express integration sketch (illustration only — no live calls, no secrets).
 *
 * - eSewa callback: `data` may arrive via GET query or POST body, so read
 *   `req.query.data ?? req.body.data`.
 * - Khalti return: `pidx` arrives as a `?pidx=` query param.
 * - Secrets come from env vars; only fulfil on `status === "completed"`.
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

export async function startEsewa(req: Request, res: Response): Promise<void> {
  const { url, fields } = (await initiatePayment({
    method: "esewa",
    config: esewaConfig,
    order: { orderId: String(req.body.orderId), amountPaisa: Number(req.body.amountPaisa) },
  })) as { url: string; fields: Record<string, string> };
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}"/>`)
    .join("");
  res.send(`<form id="f" action="${url}" method="POST">${inputs}</form><script>f.submit()</script>`);
}

export async function esewaCallback(req: Request, res: Response): Promise<void> {
  // eSewa sends GET in some envs, POST in others.
  const data = (req.query.data ?? req.body.data) as string;
  const result = await verifyPayment({
    method: "esewa",
    config: esewaConfig,
    data,
    expectedOrderId: String(req.query.orderId ?? req.body.orderId),
    expectedAmountPaisa: Number(req.query.amountPaisa ?? req.body.amountPaisa),
  });
  if (result.status === "completed") {
    // TODO: fulfil the order exactly once (idempotent on orderId).
  }
  res.json({ status: result.status });
}

export async function startKhalti(req: Request, res: Response): Promise<void> {
  const { payment_url } = (await initiatePayment({
    method: "khalti",
    config: khaltiConfig,
    order: {
      purchaseOrderId: String(req.body.orderId),
      purchaseOrderName: String(req.body.orderName),
      amountPaisa: Number(req.body.amountPaisa),
    },
  })) as { pidx: string; payment_url: string };
  res.redirect(payment_url);
}

export async function khaltiReturn(req: Request, res: Response): Promise<void> {
  const pidx = String(req.query.pidx ?? "");
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
}
