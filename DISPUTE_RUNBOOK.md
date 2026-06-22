# Stripe Chargeback / Dispute Runbook

Goal: **never lose a dispute by default.** Most past disputes were lost simply because
no evidence was submitted before the deadline. This runbook + the in-app monitor fix that.

## 1. Where to see what needs a response
- **Admin → Account Disputes** (`/admin/disputes`) → top panel **"Stripe Chargebacks Needing Response"**.
  Lists every open dispute pulled live from Stripe, sorted by due date (🔴 = ≤3 days left).
- Or from a terminal:
  ```
  STRIPE_SECRET_KEY=<read key> JAWSDB_URL=<db url> node scripts/openDisputes.js
  ```

## 2. Respond to a dispute (do this BEFORE the due date)
1. In the monitor panel, click **"Evidence PDF"** on the dispute's row (downloads the full evidence packet for that customer).
   - Or: **Admin → Users → [customer] → Download Dispute Evidence**.
2. Go to **Stripe Dashboard → Payments → Disputes →** open the dispute → **Submit evidence**.
3. **Upload** the evidence PDF in the supporting-files area.
4. Fill the text fields:
   - **Customer name / email** — from the PDF §1.
   - **Access activity log** — paste the §3b "Access Activity Log (IP + timestamp)" lines (logins + unlocks).
   - **Product description** — "Marketplace subscription; credits unlock confidential motor-carrier contact data."
5. **Submit.** Confirm `submission_count` flips to 1 (the monitor / script will stop listing it).

## 3. Tailor the argument to the dispute reason
- **fraudulent / unrecognized** → prove authorization & identity: Stripe Identity verification, login/usage history with IPs, prior successful payments on the same card. (The PDF auto-emphasizes this when the reason is `fraudulent`.)
- **subscription_canceled / product_not_received** → show usage (unlocked listings), the all-payments-final terms accepted at signup, and cancellation policy.
- **duplicate** → show the charges are distinct monthly invoices.

## 4. Evidence we capture (all in the PDF)
- Account: signup date, last login, Stripe Identity status, Stripe customer id.
- Subscription + **live Stripe charges & dispute record**.
- **Credit usage** — which carriers were unlocked, when (proof of value consumed).
- **Access activity log** — login + unlock events with **IP + timestamp** (from June 2026 forward).
- **Terms acceptance** — the signup checkbox consent (with IP/timestamp for accounts created after June 2026).

## 5. Reduce disputes at the source
- Clear billing descriptor + reminder emails before renewal.
- Keep Stripe Identity verification on for subscriptions (already required for credit plans).
- Watch the dispute rate — a high rate risks Stripe reserves/account review.

## Reference
- Backend: `disputeEvidenceService`, `stripeService.listOpenDisputes` / `getCustomerBillingEvidence`, `utils/accessLog.ts`, `UserAccessLog` model.
- Endpoints: `GET /admin/disputes/stripe-open`, `GET /admin/users/:id/dispute-evidence`.
- Scripts: `scripts/openDisputes.js`, `scripts/exportDisputeBundle.js`, `scripts/stripeCharges.js`, `scripts/generateDisputePdf.js`, `scripts/exportTermsPdf.js`.
