import { describe, it, expect } from "vitest";
import * as barrel from "../src/index.js";
import type {
  EsewaConfig,
  EpayV2SignParams,
  EpayStatusOpts,
  EpayStatusResult,
  EsewaFieldOpts,
  VerifyEsewaPaymentOpts,
  KhaltiConfig,
  KhaltiAmountBreakdown,
  InitiateKhaltiOpts,
  InitiateKhaltiResult,
  LookupKhaltiOpts,
  LookupKhaltiResult,
  VerifyKhaltiPaymentOpts,
} from "../src/index.js";

describe("barrel type exports", () => {
  it("exposes the public config/opts/result types from the barrel", () => {
    // Compile-time: every name above must be importable as a type from the barrel.
    const esewaConfig: EsewaConfig = {
      productCode: "EPAYTEST",
      secretKey: "s",
      successUrl: "https://example.com/success",
      failureUrl: "https://example.com/failure",
      env: "sandbox",
    };
    const khaltiConfig: KhaltiConfig = {
      secretKey: "s",
      websiteUrl: "https://example.com",
      returnUrl: "https://example.com/return",
      env: "sandbox",
    };
    const signParams: EpayV2SignParams = {
      total_amount: "100",
      transaction_uuid: "11-201-13",
      product_code: "EPAYTEST",
    };
    const statusOpts: EpayStatusOpts = {
      env: "sandbox",
      product_code: "EPAYTEST",
      total_amount: "100",
      transaction_uuid: "11-201-13",
    };
    const fieldOpts: EsewaFieldOpts = { config: esewaConfig, orderId: "11-201-13", amountPaisa: 10000 };
    const verifyEsewaOpts: VerifyEsewaPaymentOpts = {
      config: esewaConfig,
      data: "ZGF0YQ==",
      expectedOrderId: "11-201-13",
      expectedAmountPaisa: 10000,
    };
    const breakdown: KhaltiAmountBreakdown = { label: "item", amount: 10000 };
    const initiateOpts: InitiateKhaltiOpts = {
      config: khaltiConfig,
      purchaseOrderId: "ORDER-1",
      purchaseOrderName: "Test order",
      amountPaisa: 10000,
    };
    const lookupOpts: LookupKhaltiOpts = { config: khaltiConfig, pidx: "pidx-1" };
    const verifyKhaltiOpts: VerifyKhaltiPaymentOpts = {
      config: khaltiConfig,
      pidx: "pidx-1",
      expectedAmountPaisa: 10000,
    };
    // Runtime: the barrel module loads and carries the value-level surface too.
    expect(barrel.EsewaConfigSchema).toBeDefined();
    expect(barrel.KhaltiConfigSchema).toBeDefined();
    expect(typeof barrel.initiatePayment).toBe("function");
    expect(typeof barrel.verifyPayment).toBe("function");
    // Touch the typed values so unused-variable checks stay quiet.
    expect(
      [
        signParams.total_amount,
        statusOpts.product_code,
        fieldOpts.orderId,
        verifyEsewaOpts.expectedOrderId,
        breakdown.label,
        initiateOpts.purchaseOrderId,
        lookupOpts.pidx,
        verifyKhaltiOpts.pidx,
      ].every((v) => typeof v === "string")
    ).toBe(true);
    const statusRes: EpayStatusResult = { status: "COMPLETE", ref_id: "r", raw: {} };
    const initRes: InitiateKhaltiResult = {
      pidx: "p",
      payment_url: "https://example.com",
      expires_at: "x",
      expires_in: 1,
    };
    const lookupRes: LookupKhaltiResult = {
      pidx: "p",
      total_amount: 100,
      status: "Completed",
      transaction_id: null,
      fee: null,
      refunded: null,
      raw: {},
    };
    expect(statusRes.status).toBe("COMPLETE");
    expect(initRes.pidx).toBe("p");
    expect(lookupRes.status).toBe("Completed");
  });
});
