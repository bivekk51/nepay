import { describe, it, expect, vi, afterEach } from "vitest";
import { UnifiedInput, initiatePayment, verifyPayment } from "../src/index.js";

describe("unified", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects unknown method", () => {
    expect(() => UnifiedInput.parse({ method: "fonepay-qr" })).toThrow();
  });

  it("routes esewa vs khalti to their builders (mocked)", async () => {
    const esewaRes = await initiatePayment({
      method: "esewa",
      config: {
        productCode: "EPAYTEST",
        secretKey: "8gBm/:&EnhH.1/q",
        successUrl: "https://example.com/success",
        failureUrl: "https://example.com/failure",
        env: "sandbox",
      },
      order: { orderId: "11-201-13", amountPaisa: 10000 },
    });
    expect(esewaRes).toHaveProperty("url");
    expect(esewaRes).toHaveProperty("fields");

    const raw = {
      pidx: "pidx-123",
      payment_url: "https://pay.khalti.com/?pidx=pidx-123",
      expires_at: "2026-01-01T00:00:00Z",
      expires_in: 3600,
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => raw }) as Response));
    const khaltiRes = await initiatePayment({
      method: "khalti",
      config: {
        secretKey: "test-secret-key",
        websiteUrl: "https://example.com",
        returnUrl: "https://example.com/return",
        env: "sandbox",
      },
      order: {
        purchaseOrderId: "ORDER-1",
        purchaseOrderName: "Test order",
        amountPaisa: 10000,
      },
    });
    expect(khaltiRes).toMatchObject({ pidx: "pidx-123", payment_url: expect.any(String) });

    const khaltiWithOrderIdRes = await initiatePayment({
      method: "khalti",
      config: {
        secretKey: "test-secret-key",
        websiteUrl: "https://example.com",
        returnUrl: "https://example.com/return",
        env: "sandbox",
      },
      order: {
        orderId: "ORDER-ALIAS-1",
        purchaseOrderName: "Test order alias",
        amountPaisa: 10000,
      },
    });
    expect(khaltiWithOrderIdRes).toMatchObject({ pidx: "pidx-123", payment_url: expect.any(String) });
  });

  it("routes verifyPayment to esewa/khalti verifiers (mocked)", async () => {
    const { signEpayV2 } = await import("../src/esewa.js");
    const SECRET = "8gBm/:&EnhH.1/q";
    const payload = {
      total_amount: "100",
      transaction_uuid: "11-201-13",
      product_code: "EPAYTEST",
      signed_field_names: "total_amount,transaction_uuid,product_code",
      signature: signEpayV2(
        { total_amount: "100", transaction_uuid: "11-201-13", product_code: "EPAYTEST" },
        SECRET
      ),
    };
    const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ status: "COMPLETE", ref_id: "ref-1" }) }) as Response)
    );
    const esewaCfg = {
      productCode: "EPAYTEST",
      secretKey: SECRET,
      successUrl: "https://example.com/success",
      failureUrl: "https://example.com/failure",
      env: "sandbox" as const,
    };
    await expect(
      verifyPayment({ method: "esewa", config: esewaCfg, data, expectedOrderId: "11-201-13", expectedAmountPaisa: 10000 })
    ).resolves.toMatchObject({ status: "completed" });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              pidx: "pidx-1",
              total_amount: 10000,
              status: "Completed",
              transaction_id: "tx-1",
              purchase_order_id: "ORDER-1",
            }),
          }) as Response
      )
    );
    await expect(
      verifyPayment({
        method: "khalti",
        config: {
          secretKey: "test-secret-key",
          websiteUrl: "https://example.com",
          returnUrl: "https://example.com/return",
          env: "sandbox",
        },
        pidx: "pidx-1",
        expectedAmountPaisa: 10000,
      })
    ).resolves.toMatchObject({ status: "completed" });
  });
});
