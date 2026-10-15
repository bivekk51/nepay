import { describe, it, expect, vi, afterEach } from "vitest";
import {
  initiateKhalti,
  lookupKhalti,
  verifyKhaltiPayment,
  KHALTI_BASES,
  type KhaltiConfig,
} from "../src/khalti.js";

const config: KhaltiConfig = {
  secretKey: "test-secret-key",
  websiteUrl: "https://example.com",
  returnUrl: "https://example.com/return",
  env: "sandbox",
};

function stubFetch(raw: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async () => ({ ok, status, json: async () => raw }) as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("khalti", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects amount < 1000 paisa before network", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("must not reach network");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      initiateKhalti({
        config,
        purchaseOrderId: "ORDER-1",
        purchaseOrderName: "Test order",
        amountPaisa: 500,
      })
    ).rejects.toThrow(/integer >= 1000/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects breakdown sum mismatch before network", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("must not reach network");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      initiateKhalti({
        config,
        purchaseOrderId: "ORDER-1",
        purchaseOrderName: "Test order",
        amountPaisa: 10000,
        amountBreakdown: [{ label: "a", amount: 9000 }],
      })
    ).rejects.toThrow(/Breakdown mismatch/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("initiate posts to sandbox base with Authorization Key and returns pidx payload", async () => {
    const raw = {
      pidx: "pidx-123",
      payment_url: "https://pay.khalti.com/?pidx=pidx-123",
      expires_at: "2026-01-01T00:00:00Z",
      expires_in: 3600,
    };
    const fetchMock = stubFetch(raw);
    const res = await initiateKhalti({
      config,
      purchaseOrderId: "ORDER-1",
      purchaseOrderName: "Test order",
      amountPaisa: 10000,
    });
    expect(res).toEqual(raw);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${KHALTI_BASES.sandbox}/epayment/initiate/`);
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Key test-secret-key");
    const body = JSON.parse(String(init.body));
    expect(body.amount).toBe(10000);
    expect(body.purchase_order_id).toBe("ORDER-1");
  });

  it("maps Completed+amount-match to completed, Pending to pending, Expired-400 to expired", async () => {
    stubFetch({
      pidx: "pidx-1",
      total_amount: 10000,
      status: "Completed",
      transaction_id: "tx-1",
      fee: 0,
      refunded: false,
      purchase_order_id: "ORDER-1",
    });
    await expect(
      verifyKhaltiPayment({ config, pidx: "pidx-1", expectedAmountPaisa: 10000 })
    ).resolves.toMatchObject({ status: "completed", traceId: "tx-1" });

    stubFetch({
      pidx: "pidx-1",
      total_amount: 10000,
      status: "Pending",
      transaction_id: null,
      fee: 0,
      refunded: false,
    });
    await expect(
      verifyKhaltiPayment({ config, pidx: "pidx-1", expectedAmountPaisa: 10000 })
    ).resolves.toMatchObject({ status: "pending" });

    stubFetch(
      {
        pidx: "pidx-1",
        total_amount: 10000,
        status: "Expired",
        transaction_id: null,
        fee: 0,
        refunded: false,
      },
      false,
      400
    );
    await expect(
      verifyKhaltiPayment({ config, pidx: "pidx-1", expectedAmountPaisa: 10000 })
    ).resolves.toMatchObject({ status: "expired" });
  });

  it("maps Initiated to pending, User canceled to canceled, Refunded to failed", async () => {
    stubFetch({ pidx: "p", total_amount: 10000, status: "Initiated", transaction_id: null });
    await expect(
      verifyKhaltiPayment({ config, pidx: "p", expectedAmountPaisa: 10000 })
    ).resolves.toMatchObject({ status: "pending" });

    stubFetch({ pidx: "p", total_amount: 10000, status: "User canceled", transaction_id: null });
    await expect(
      verifyKhaltiPayment({ config, pidx: "p", expectedAmountPaisa: 10000 })
    ).resolves.toMatchObject({ status: "canceled" });

    stubFetch({ pidx: "p", total_amount: 10000, status: "Refunded", transaction_id: "tx-r" });
    await expect(
      verifyKhaltiPayment({ config, pidx: "p", expectedAmountPaisa: 10000 })
    ).resolves.toMatchObject({ status: "failed" });

    stubFetch({
      pidx: "p",
      total_amount: 10000,
      status: "Partially Refunded",
      transaction_id: "tx-r",
    });
    await expect(
      verifyKhaltiPayment({ config, pidx: "p", expectedAmountPaisa: 10000 })
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("returns failed on amount mismatch and on order binding mismatch", async () => {
    stubFetch({
      pidx: "pidx-1",
      total_amount: 10000,
      status: "Completed",
      transaction_id: "tx-1",
      purchase_order_id: "ORDER-1",
    });
    await expect(
      verifyKhaltiPayment({ config, pidx: "pidx-1", expectedAmountPaisa: 9999 })
    ).resolves.toMatchObject({ status: "failed" });

    await expect(
      verifyKhaltiPayment({
        config,
        pidx: "pidx-1",
        expectedAmountPaisa: 10000,
        expectedOrderId: "OTHER-ORDER",
      })
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("lookup parses JSON body even on HTTP 400 and honours baseUrl override", async () => {
    const raw = { pidx: "p", total_amount: 1000, status: "Expired", transaction_id: null };
    const fetchMock = stubFetch(raw, false, 400);
    const res = await lookupKhalti({
      config: { ...config, baseUrl: "https://example.test/api/v2" },
      pidx: "p",
    });
    expect(res.status).toBe("Expired");
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.test/api/v2/epayment/lookup/");
  });
});
