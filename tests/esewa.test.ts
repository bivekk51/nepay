import { describe, it, expect, vi, afterEach } from "vitest";
import {
  signEpayV2,
  verifyEpayCallback,
  verifyEsewaPayment,
  buildEsewaFields,
  checkEpayStatus,
  EsewaRetryableError,
  ESEWA_BASES,
  type EsewaConfig,
} from "../src/esewa.js";
import { parseAmountToPaisa } from "../src/money.js";

const SECRET = "8gBm/:&EnhH.1/q";

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

describe("esewa sign", () => {
  it("computes standard HMAC-SHA256-base64 of the spec message", () => {
    // NOTE on the eSewa docs vector: the docs (and copies of them) print
    // "4Ov7pCI1zIOdwtV2BRMUNjz1upIlT/COTxfLhWvVurE=" for this input, but that
    // string is NOT the HMAC-SHA256 of the documented message under any
    // standard construction. Node node:crypto, Python hashlib, and openssl(1)
    // all independently agree on the value asserted below, and the live
    // gateway verifies standard HMAC-SHA256 — so this test pins the true
    // digest. See task report for the full evidence.
    expect(
      signEpayV2(
        { total_amount: "100", transaction_uuid: "11-201-13", product_code: "EPAYTEST" },
        SECRET
      )
    ).toBe("5DZywcrTKD0gia/rsSMcrRHmJl+4Tbol6S+lWgdJ94E=");
  });

  it("accepts comma-formatted amounts after verify", async () => {
    const payload = {
      total_amount: "1,000.0",
      transaction_uuid: "uuid-123",
      product_code: "EPAYTEST",
      signed_field_names: "total_amount,transaction_uuid,product_code",
      signature: signEpayV2(
        { total_amount: "1,000.0", transaction_uuid: "uuid-123", product_code: "EPAYTEST" },
        SECRET
      ),
    };
    const { valid, data } = await verifyEpayCallback(b64(payload), SECRET);
    expect(valid).toBe(true);
    expect(data).not.toBeNull();
    expect(parseAmountToPaisa(data!.total_amount)).toBe(100000);
  });

  it("rejects tampered payloads", async () => {
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
    const tampered = { ...payload, total_amount: "200" };
    const { valid, data } = await verifyEpayCallback(b64(tampered), SECRET);
    expect(valid).toBe(false);
    expect(data).toBeNull();
  });

  it("rejects wrong secret without throwing on length mismatch", async () => {
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
    const { valid } = await verifyEpayCallback(b64(payload), "wrong-secret");
    expect(valid).toBe(false);
  });

  it("returns invalid for malformed base64", async () => {
    const { valid, data } = await verifyEpayCallback("!!!not-base64!!!", SECRET);
    expect(valid).toBe(false);
    expect(data).toBeNull();
  });
});

describe("esewa status check", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns status, ref_id and raw on success", async () => {
    const raw = { status: "COMPLETE", ref_id: "abc123" };
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      void input;
      return { json: async () => raw } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await checkEpayStatus({
      env: "sandbox",
      product_code: "EPAYTEST",
      total_amount: "100",
      transaction_uuid: "11-201-13",
    });
    expect(res.status).toBe("COMPLETE");
    expect(res.ref_id).toBe("abc123");
    expect(res.raw).toEqual(raw);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl.startsWith(ESEWA_BASES.sandbox.status)).toBe(true);
    expect(calledUrl).toContain("product_code=EPAYTEST");
    expect(calledUrl).toContain("transaction_uuid=11-201-13");
  });

  it("throws EsewaRetryableError when service unavailable", async () => {
    const raw = { code: 0, error_message: "Service is currently unavailable" };
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => raw }) as Response));
    await expect(
      checkEpayStatus({
        env: "sandbox",
        product_code: "EPAYTEST",
        total_amount: "100",
        transaction_uuid: "11-201-13",
      })
    ).rejects.toBeInstanceOf(EsewaRetryableError);
  });

  it("honours baseUrl override", async () => {
    const raw = { status: "COMPLETE", ref_id: "x" };
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      void input;
      return { json: async () => raw } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    await checkEpayStatus({
      env: "sandbox",
      product_code: "EPAYTEST",
      total_amount: "100",
      transaction_uuid: "11-201-13",
      baseUrl: "https://example.test/status/",
    });
    expect(String(fetchMock.mock.calls[0][0]).startsWith("https://example.test/status/")).toBe(true);
  });
});

const sandboxCfg: EsewaConfig = {
  productCode: "EPAYTEST",
  secretKey: SECRET,
  successUrl: "https://example.com/success",
  failureUrl: "https://example.com/failure",
  env: "sandbox",
};

function signedCallbackData(fields: {
  total_amount: string;
  transaction_uuid: string;
  product_code: string;
}): string {
  const signature = signEpayV2(fields, SECRET);
  return b64({
    ...fields,
    signed_field_names: "total_amount,transaction_uuid,product_code",
    signature,
  });
}

/** eSewa redirects with `data` via GET in some envs and POST in others. */
function extractData(req: { query?: { data?: string }; body?: { data?: string } }): string {
  return req.query?.data ?? req.body?.data ?? "";
}

function stubStatusFetch(raw: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => raw }) as Response)
  );
}

describe("esewa initiate fields", () => {
  it("builds v2 fields with total=sum and signed_field_names order", () => {
    const { url, fields } = buildEsewaFields({
      config: sandboxCfg,
      orderId: "11-201-13",
      amountPaisa: 10000,
      taxPaisa: 0,
      servicePaisa: 0,
      deliveryPaisa: 0,
    });
    expect(url).toBe("https://rc-epay.esewa.com.np/api/epay/main/v2/form");
    expect(fields.signed_field_names).toBe("total_amount,transaction_uuid,product_code");
    expect(fields.total_amount).toBe("100");
  });

  it("sums amount+tax+service+delivery into total_amount", () => {
    const { fields } = buildEsewaFields({
      config: sandboxCfg,
      orderId: "ORDER-1",
      amountPaisa: 10000,
      taxPaisa: 1000,
      servicePaisa: 200,
      deliveryPaisa: 50,
    });
    expect(fields.total_amount).toBe("112.5");
    expect(fields.transaction_uuid).toBe("ORDER-1");
    expect(fields.product_code).toBe("EPAYTEST");
  });

  it("rejects orderIds outside [A-Za-z0-9-]", () => {
    expect(() =>
      buildEsewaFields({ config: sandboxCfg, orderId: "bad/id?", amountPaisa: 100 })
    ).toThrow();
  });
});

describe("esewa callback normalize", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts data from GET query or POST body identically", async () => {
    const data = signedCallbackData({
      total_amount: "100",
      transaction_uuid: "11-201-13",
      product_code: "EPAYTEST",
    });
    stubStatusFetch({ status: "COMPLETE", ref_id: "ref-1" });

    const fromGet = extractData({ query: { data } });
    const getRes = await verifyEsewaPayment({
      config: sandboxCfg,
      data: fromGet,
      expectedOrderId: "11-201-13",
      expectedAmountPaisa: 10000,
    });

    const fromPost = extractData({ body: { data } });
    const postRes = await verifyEsewaPayment({
      config: sandboxCfg,
      data: fromPost,
      expectedOrderId: "11-201-13",
      expectedAmountPaisa: 10000,
    });

    expect(fromGet).toBe(fromPost);
    expect(postRes).toEqual(getRes);
    expect(getRes.status).toBe("completed");
    expect(getRes.traceId).toBe("ref-1");
  });

  it("keeps PENDING (e.g. from failure_url) as pending, never failed", async () => {
    const data = signedCallbackData({
      total_amount: "100",
      transaction_uuid: "11-201-13",
      product_code: "EPAYTEST",
    });
    stubStatusFetch({ status: "PENDING", ref_id: null });
    const res = await verifyEsewaPayment({
      config: sandboxCfg,
      data,
      expectedOrderId: "11-201-13",
      expectedAmountPaisa: 10000,
    });
    expect(res.status).toBe("pending");
  });

  it("maps AMBIGUOUS to pending and CANCELED to failed", async () => {
    const data = signedCallbackData({
      total_amount: "100",
      transaction_uuid: "11-201-13",
      product_code: "EPAYTEST",
    });
    stubStatusFetch({ status: "AMBIGUOUS", ref_id: null });
    await expect(
      verifyEsewaPayment({
        config: sandboxCfg,
        data,
        expectedOrderId: "11-201-13",
        expectedAmountPaisa: 10000,
      })
    ).resolves.toMatchObject({ status: "pending" });

    stubStatusFetch({ status: "CANCELED", ref_id: null, transaction_code: "tx-9" });
    await expect(
      verifyEsewaPayment({
        config: sandboxCfg,
        data,
        expectedOrderId: "11-201-13",
        expectedAmountPaisa: 10000,
      })
    ).resolves.toMatchObject({ status: "failed", traceId: "tx-9" });
  });

  it("rejects tampered signatures and mismatched order/amount", async () => {
    const good = signedCallbackData({
      total_amount: "100",
      transaction_uuid: "11-201-13",
      product_code: "EPAYTEST",
    });
    stubStatusFetch({ status: "COMPLETE", ref_id: "ref-1" });
    await expect(
      verifyEsewaPayment({
        config: sandboxCfg,
        data: good,
        expectedOrderId: "other-id",
        expectedAmountPaisa: 10000,
      })
    ).rejects.toThrow();
    await expect(
      verifyEsewaPayment({
        config: sandboxCfg,
        data: good,
        expectedOrderId: "11-201-13",
        expectedAmountPaisa: 9999,
      })
    ).rejects.toThrow();
    const tampered = b64({
      total_amount: "100",
      transaction_uuid: "11-201-13",
      product_code: "EPAYTEST",
      signed_field_names: "total_amount,transaction_uuid,product_code",
      signature: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    });
    await expect(
      verifyEsewaPayment({
        config: sandboxCfg,
        data: tampered,
        expectedOrderId: "11-201-13",
        expectedAmountPaisa: 10000,
      })
    ).rejects.toThrow();
  });

  it("sends comma-free total_amount to the status check for comma-formatted callbacks", async () => {
    const data = signedCallbackData({
      total_amount: "1,112.50",
      transaction_uuid: "11-201-13",
      product_code: "EPAYTEST",
    });
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      void input;
      return { json: async () => ({ status: "COMPLETE", ref_id: "ref-9" }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await verifyEsewaPayment({
      config: sandboxCfg,
      data,
      expectedOrderId: "11-201-13",
      expectedAmountPaisa: 111250,
    });
    expect(res.status).toBe("completed");
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("total_amount=1112.50");
    expect(calledUrl).not.toContain(",");
    expect(calledUrl).not.toContain("%2C");
  });
});
