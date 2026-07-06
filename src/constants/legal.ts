/**
 * Canonical legal consent language.
 *
 * These strings are the single source of truth for the exact wording customers
 * agree to. They are quoted verbatim in the dispute-evidence PDF and recorded
 * (alongside timestamp + IP) whenever a customer accepts. Keep them in sync with
 * the copy shown in the frontend (RegisterPage checkbox, PaymentConsentModal).
 *
 * IMPORTANT: never introduce refund language here — all payments are final.
 */

// Shown as the mandatory checkbox at signup (version `register-checkbox-1.0`).
export const REGISTER_CONSENT =
  'I agree to the Buyer Terms of Service and Privacy Policy, including all payment terms, ' +
  'subscription billing policies, deposit and refund policies, and dispute resolution provisions contained therein.';

// Shown — and now affirmatively signed — at the point of payment
// (version `checkout-payment-1.0`).
export const CHECKOUT_CONSENT =
  'By subscribing, you confirm your agreement to our Terms of Service and Privacy Policy, including the Payment Terms, ' +
  'Subscription Billing, and Dispute Prohibition policies (Article 7). Subscriptions are billed month-to-month. ' +
  'All payments are final and non-refundable. You may cancel a subscription at any time by contacting info@domilea.com.';

// Version identifier stored on each checkout-time payment consent record.
export const CHECKOUT_CONSENT_VERSION = 'checkout-payment-1.0';

// Public URL of the full Terms of Service.
export const TERMS_OF_SERVICE_URL = 'https://www.domilea.com/terms';

// The payment- and dispute-relevant provisions of the Buyer Terms of Service
// (Article 7), kept verbatim in sync with the public Terms page
// (frontend LegalDocumentContent.tsx). Rendered into the Terms-of-Service PDF
// that backs Stripe's `terms_of_service` dispute-evidence field. These are the
// clauses reviewers care about: all payments final, and the customer's agreement
// not to file chargebacks.
export const PAYMENT_TERMS_ARTICLE_7: Array<{ heading: string; body: string }> = [
  {
    heading: '7.2. Deposits; Non-Refundable Nature of Deposits.',
    body:
      'When Buyer submits a deposit in connection with the purchase of a motor carrier authority or any asset listed on the Platform, such deposit is made in consideration of the Marketplace and Seller reserving the asset and commencing the transaction process. BUYER EXPRESSLY ACKNOWLEDGES AND AGREES THAT ALL DEPOSITS ARE NON-REFUNDABLE IF BUYER DECIDES TO WITHDRAW FROM, ABANDON, OR OTHERWISE FAIL TO COMPLETE THE TRANSACTION FOR ANY REASON. The determination of whether a refund condition has been met shall be made by the Marketplace in its sole and reasonable discretion. Buyer hereby waives any right to contest or dispute the Marketplace’s refund determination through any means other than the binding arbitration process set forth in Article 6.',
  },
  {
    heading: '7.3. Final Payments; All Sales Final; No Refunds on Completed Transactions.',
    body:
      'ALL FINAL PAYMENTS MADE THROUGH THE PLATFORM FOR THE PURCHASE OF ANY ASSET, MOTOR CARRIER AUTHORITY, OR BUSINESS ENTITY ARE FINAL, NON-REFUNDABLE, AND NON-REVERSIBLE. Once a final payment has been processed and the transaction has been completed, Buyer shall have no right to a refund, reversal, or credit of any kind. Buyer acknowledges that prior to making the final payment, Buyer had the full and exclusive opportunity to conduct due diligence, inspect documents, verify regulatory standing, and assess the value of the asset. By proceeding with the payment, Buyer confirms satisfaction and waives any right to rescind the transaction.',
  },
  {
    heading: '7.4. PROHIBITION ON CHARGEBACKS, BANK DISPUTES, AND PAYMENT REVERSALS.',
    body:
      'BUYER EXPRESSLY COVENANTS AND AGREES THAT IT SHALL NOT, UNDER ANY CIRCUMSTANCES, INITIATE, FILE, OR OTHERWISE PURSUE A CHARGEBACK, PAYMENT DISPUTE, BANK REVERSAL, CREDIT CARD DISPUTE, ACH REVERSAL, WIRE RECALL, OR ANY OTHER FORM OF PAYMENT REVERSAL WITH BUYER’S BANK, CREDIT CARD ISSUER, PAYMENT PROCESSOR, OR ANY FINANCIAL INSTITUTION REGARDING ANY PAYMENT MADE THROUGH THE PLATFORM, INCLUDING BUT NOT LIMITED TO SUBSCRIPTION FEES, DEPOSIT PAYMENTS, AND FINAL TRANSACTION PAYMENTS. Buyer acknowledges that all payments made on the Platform are authorized, voluntary, and made with full knowledge of the terms and conditions herein. By clicking “I Agree” and accepting these Terms, Buyer provides express, documented consent to all charges. IF BUYER HAS ANY ISSUE WITH A CHARGE, BUYER AGREES TO CONTACT THE MARKETPLACE DIRECTLY AT INFO@DOMILEA.COM TO RESOLVE THE MATTER BEFORE TAKING ANY OTHER ACTION.',
  },
];
