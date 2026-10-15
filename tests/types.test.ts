import { describe, it, expect } from "vitest";
import type { PaymentResult, PaymentStatus } from "../src/types.js";

describe("types", () => {
  it("accepts all valid payment statuses", () => {
    const statuses: PaymentStatus[] = ["completed", "pending", "failed", "expired", "canceled"];
    expect(statuses).toHaveLength(5);
  });

  it("shapes a PaymentResult", () => {
    const result: PaymentResult = {
      status: "completed",
      amountPaisa: 12345,
      orderId: "order-1",
      traceId: null,
      raw: {},
    };
    expect(result.status).toBe("completed");
    expect(result.amountPaisa).toBe(12345);
    expect(result.traceId).toBeNull();
  });
});
