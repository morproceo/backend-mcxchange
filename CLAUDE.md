# CLAUDE.md — AI Developer Notes for backend-mcxchange

## Subscription Changes — CRITICAL

**NEVER manually insert/update subscription records in the database without keeping ALL three layers in sync:**

1. **Stripe** — Create, update, or cancel the actual Stripe subscription via the Stripe API
2. **Database** — Update the `subscriptions` table (plan, status, stripeSubId, stripeCustomerId, credits, dates)
3. **User credits** — Update `creditsPerMonth` and `creditsRemaining` to match the new plan

### Before making any subscription change:
- Query the DB to get current subscription state (plan, stripeSubId, stripeCustomerId, credits)
- Query Stripe to verify the subscription exists and its status matches the DB
- If there's a mismatch, resolve it before making further changes

### Subscription plan defaults:
| Plan | Price/mo | Credits/mo |
|------|----------|------------|
| STARTER | $9.99 | 4 |
| PREMIUM | $29.99 | 15 |
| ENTERPRISE | $49.99 | 50 |
| VIP_ACCESS | $19.99 | 999 |

### Key fields:
- `User.stripeCustomerId` — the Stripe customer ID on the user record
- `Subscription.stripeSubId` — the Stripe subscription ID (NOT `stripeSubscriptionId`)
- `Subscription.stripeCustomerId` — should match `User.stripeCustomerId` but is sometimes null; always populate both

### Stripe env vars:
- `STRIPE_SECRET_KEY` — for API calls
- `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_PREMIUM_MONTHLY`, etc. — price IDs for each plan

## Database
- MySQL 8.0 via Sequelize ORM
- Hosted on JawsDB (Heroku addon)
- Connection via `JAWSDB_URL` env var

## Deployment
- Heroku app: `mcxchange`
- Auto-deploys from `main` branch on GitHub (`morproceo/backend-mcxchange`)
- Frontend on Vercel (`frontend-mcxchange-7gyr`) pointing to `https://www.domilea.com`
