export type PaymentStatus = "completed" | "pending" | "failed" | "expired" | "canceled";

export interface PaymentResult {
  status: PaymentStatus;
  amountPaisa: number;
  orderId: string;
  traceId: string | null;
  raw: unknown;
}
