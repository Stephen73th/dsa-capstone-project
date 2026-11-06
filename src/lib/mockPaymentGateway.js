// Mock payment gateway.
// Real credit card details never touch our application.
// Simulates success or decline scenarios.

import { randomUUID } from 'node:crypto';

export class MockPaymentGateway {
  async charge({ amountCents, shouldDecline = false } = {}) {
    // Simulate brief network latency
    await new Promise((resolve) => setTimeout(resolve, 5));

    if (shouldDecline) {
      return {
        success: false,
        error: 'PAYMENT_DECLINED',
        message: 'The card was declined by the issuer',
      };
    }

    return {
      success: true,
      transactionId: randomUUID(),
      amountCents,
      timestamp: new Date().toISOString(),
    };
  }
}
