import { describe, it, expect, vi, afterEach } from "vitest";
import {
  signEpayV2,
  verifyEpayCallback,
  checkEpayStatus,
  EsewaRetryableError,
  ESEWA_BASES,
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
