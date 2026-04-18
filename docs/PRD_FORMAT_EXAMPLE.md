# TMS MVP - v0

## Product Overview

| Field | Value |
|-------|-------|
| 🎯 Target date | TBD |
| 🟡 Document status | DRAFT |
| 📥 Team members | @Anthony Jackson, @Zonayad Akbar, @Devon Scott, @Yamil Morales |

### Quick Links

| Field | Value |
|-------|-------|
| 🎨 Designs | TBD |
| 📽️ Loom demo | |
| 🗂️ Work tracker | Coming Soon |

---

## 🎯 Objective

The TMS will be one of the core products provided by MorPro. This Truck Management software will at its core allow anyone to run and manage every aspect of their trucking business. Ops, Compliance, Accounting, and Reporting are the four pillars this service should be able to organize and streamline. We will couple this with 4 AI features:

1. **AI Load Judge** — this will allow dispatchers to map out a load, PU, DO, Rate, Deadhead, before booking. AI will give the load a rating based on current operational data as context.
2. **AI Mechanic** — this will provide an understanding or answer questions on fault codes on trucks with ELD integration.
3. **AI Load Creation** — this will allow the creation of a load via a rate confirmation upload.
4. **AI HOS/Parking** — this will alert users when driver is approaching limit to HOS and recommend parking on drivers route from Spotty network.

---

## 📊 Success Metrics

| North Star Goal | North Star Metric |
|-----------------|-------------------|
| Maximize load profitability visibility & decision quality with our AI features | % of loads created or optimized using Genie-powered intelligence |

| Goal | Metric |
|------|--------|
| Make Genie the default assistant for creating, evaluating, and troubleshooting loads. | 1. % of loads priced with GenieJudge before dispatch: 90%<br>2. Avg. time to evaluate load profitability: 15s<br>3. Avg. time to diagnose an ELD code via Genie Mechanic: 5 seconds<br>4. 70% of ELD fault codes first reviewed through Genie Mechanic<br>5. Average time from RC upload → fully created, assigned load < 60 seconds |
| Increase trust in Genie's predictions | 1. Genie profitability prediction accuracy: 93%<br>2. Misclassification/correction rate (Reader): 5%<br>3. % of Genie recommendations accepted vs. overridden: 70% acceptance<br>4. Dispatcher trust score ("How confident are you in Genie?"): 8/10 |
| **Reporting:** Give owners and managers real-time visibility into load and fleet performance without exporting to spreadsheets. | 1. Avg time spent in reporting dashboard per session: target > 2 minutes<br>2. Reduction in CSV exports for performance data: target > 25% decrease |
| **Operations:** Minimize dispatcher effort and errors by running the full load lifecycle inside the TMS. | 1. Avg time to create a load (from click → saved): target < 2 min<br>2. % of loads with driver & truck assigned before pickup: target > 85%<br>3. % of loads with all required docs uploaded by delivery: target > 75% |
| **Accounting:** Centralize expense and payout inputs so fleets don't rely on spreadsheets. | 1. % of loads with revenue + expenses recorded: target > 80%<br>2. % of loads with driver pay calculated inside the system: target > 70%<br>3. Reduction in manual adjustments to payouts: target > 20% |
| **Compliance:** Help fleets stay legally compliant by centralizing and tracking all required documents. | 1. % of required driver/equipment docs uploaded: target > 80%<br>2. % of docs that are expired or missing: target < 10%<br>3. Avg time to complete compliance setup for a new fleet: target < 30 minutes |

---

## 🤔 Assumptions

### User & Customer Assumptions
- Dispatchers will be able to adapt to a new workflow with minimal training.
- Fleets will provide accurate driver, truck, trailer, and company information during onboarding.
- Users are willing to upload documents (RCs, BOLs, insurance) manually if automation fails in early versions.
- Fleet owners understand basic financial concepts (RPM, gross, net) and don't require full accounting integration on day one.

### Data & AI Assumptions
- Genie Reader (optical/document parsing) will reliably extract key fields from standard RC formats, but not all edge cases.
- Genie Judge can estimate basic profitability using *user-entered* rate + miles data — NOT live market rates yet. The miles should also be tracking truck miles - not vehicle miles if possible.
- Genie Mechanic requires only basic ELD fault code ingestion for MVP, not full diagnostic trees.
- Users will correct OCR or AI mistakes when needed, and those corrections will not break workflows.

### Technical & Integration Assumptions
- A live ELD integration is NOT required for MVP — basic CSV upload or manual entry is acceptable for early Genie Mechanic usage.
- Fuel card integrations are not required for MVP; fuel can be manually entered by CSV.
- Reporting can rely on internal TMS data only (no external accounting systems required).
- Compliance document uploads do not require verification or validation in MVP — only storage + expiration tracking.

### Workflow Assumptions
- Dispatchers operate in a linear workflow: create load → assign driver/truck → attach docs → track progress → complete load → payout.
- Users will attach required documents by delivery, not during creation.
- Driver payroll calculations can be based on simple rate structures (RPM, % split, flat rate).
- Not all fleets will immediately adopt all TMS modules — partial usage is expected in MVP.

### Reporting Assumptions
- Users primarily need high-level insights (RPM, Gross, Net) — deep analytics can wait.
- Reports will be viewed mostly on desktop, not mobile, in MVP.
- Filters (date range, dispatcher, driver, equipment) do not need advanced logic or cross-pillar intelligence yet.

### Compliance Assumptions
- Fleets will upload their own compliance docs; MorPro does not need to fetch them from external sources.
- IFTA calculations will not be automated in MVP — only fuel logging and export.
- Expiration alerts are basic (email or in-app), not automated workflows.

### Accounting & Payroll Assumptions
- Accounting is load-level, not company-level (no chart of accounts yet).
- Payroll can be generated from load data + simple pay rules — no tax withholding or advanced payroll logic.
- Fleet owners will manually verify payouts before sending payments to drivers.
- No QuickBooks or external accounting integration is required for MVP.

---

## 🌟 Milestones

Coming Soon

---

## 📋 Feature & Requirements

### Operations

**Description:**
Operations is the core workflow where dispatchers create, assign, track, and complete loads. This feature category enables end-to-end visibility from load creation → assignment → delivery → payout, all inside MorPro.

**Narrative:**
For the MVP, the Operations module must allow a dispatcher to take a load from zero to done with minimal friction. The experience should reduce the time spent per load, eliminate manual errors, and provide a single place where load data is always accurate and up to date. Genie (Reader + Judge) enhances this flow by automating the most painful inputs while keeping the dispatcher in control.

| Requirement | User Story | Importance | Jira Issue | Notes |
|-------------|------------|------------|------------|-------|
| Create a new load manually | As a dispatcher, I want to create a load by entering key details so I can start managing it. | HIGH | | Basic fields: pickup, delivery, rate, equipment, customer, dates |
| Assign driver + truck | As a dispatcher, I want to assign a driver and truck so I know who is responsible for the load. | HIGH | | Should check for availability + conflicts |
| Track load status | As a dispatcher, I want to update load status (Created → picked up → In Transit → Delivered → Completed → Sent to Factoring → Factored) so everyone knows progress. | HIGH | | Manual updates; later automated via ELD |
| Upload + attach documents | As a dispatcher, I want to attach BOL/Images/RC so all documentation stays with the load. | HIGH | | Required for accounting + payroll |
| Add accessorials & expenses | As a dispatcher, I want to record expenses so profitability stays accurate. | HIGH | | Includes lumper fees, detention, etc. |
| Load timeline view | As a dispatcher, I want a clean timeline of important events so I can quickly review load progress. | MEDIUM | | Foundation for future automation |
| Notifications on missing required fields | As a dispatcher, I want alerts when required data is missing so I can complete the load correctly. | MEDIUM | | Reduces operational errors |
| Truck Location | As a dispatcher, I can view the exact location of my truck via ELD connection. | MEDIUM | | Only most popular ELD providers for MVP |

---

### Reporting

**Description:**
Reporting gives fleet owners and managers visibility into operational and financial performance: RPM, gross, net, expenses, and filters by dispatcher, driver, truck, or date range.

**Narrative:**
Legacy TMS reporting is ugly, slow, and requires exporting to Excel. For the MVP, reporting must be simple, fast, and actionable, showing fleets what they care about most: how much they made, how efficiently they're running, and how much loads are costing them. This is not a full BI platform, it's a crystal-clear snapshot of business health.

| Requirement | User Story | Importance | Jira Issue | Notes |
|-------------|------------|------------|------------|-------|
| RPM calculation view | As an owner, I want to see RPM so I understand load profitability. | HIGH | | Uses load revenue ÷ miles |
| Gross & net reporting | As an owner, I want gross and net views so I can see top-line and bottom-line performance. | HIGH | | Net = revenue − expenses |
| Filter by dates, driver, dispatcher, truck | As a manager, I want to filter KPIs so I can evaluate performance by role or asset. | HIGH | | Core MVP filtering |
| Summary dashboard | As a fleet owner, I want a simple dashboard showing weekly/monthly performance. | MEDIUM | | Chart + KPI boxes |
| Export basic reports | As an owner, I want to export reports if needed. | HIGH | | CSV export is enough |

---

### Compliance

**Description:**
Compliance stores and tracks all legally required documents for trucks, trailers, drivers, insurance, MC, and company credentials. It centralizes everything needed for audits or inspections.

**Narrative:**
Most fleets run compliance on spreadsheets or scattered PDFs. Your MVP must solve the centralization problem before solving automation. Fleets need a single place to store and track expiration dates so nothing slips through the cracks. Compliance is one of the strongest retention levers once it becomes the fleet's "source of truth."

| Requirement | User Story | Importance | Jira Issue | Notes |
|-------------|------------|------------|------------|-------|
| Upload driver documents | As a fleet admin, I want to upload CDLs, medical cards, training docs, etc. | HIGH | | Expiration date required. Hire date required |
| Upload equipment documents | As an admin, I want to upload truck/trailer registrations, inspections, insurance. | HIGH | | One view per asset |
| Document expiration tracking | As an admin, I want the system to track expiration dates so nothing lapses. | HIGH | | Core compliance feature |
| Asset Assignment | As an admin, I want to be able to assign vehicles/equipment with drivers. As an admin, I want to assign fuel cards to drivers. | HIGH | | Must have assignment and return date. |
| Alerts for upcoming expirations | As an admin, I want notifications before docs expire. | MEDIUM | | Simple in-app and email |
| Compliance dashboard | As an owner, I want to see what's expiring soon. | MEDIUM | | Red, yellow, green indicators |

---

### Accounting

**Description:**
Accounting centralizes financial data: revenue, expenses, fuel, and cost-per-load inputs. It supports payout preparation and reporting but does not aim to replace full accounting systems (yet).

**Narrative:**
For MVP, accounting must become the place where revenue + expenses + fuel come together. This enables fleets to understand their true cost structure and improves reporting accuracy. We're not building QuickBooks, we're building load-level and fleet-level financial clarity.

| Requirement | User Story | Importance | Jira Issue | Notes |
|-------------|------------|------------|------------|-------|
| Add expenses to a load | As a dispatcher, I want to add expenses so load profitability is accurate. As a dispatcher I want to be able to tie expense to driver. | HIGH | | Ties into reporting + payroll |
| Log fuel transactions | As an owner, I want to record fuel spend per truck. | HIGH | | Manual entry in MVP - bulk CSV |
| Load-level revenue & expense summary | As an owner, I want a financial view for each load. | MEDIUM | | Revenue, expenses, net |
| Fleet-level expense summary | As an owner, I want to see all expenses by category. | MEDIUM | | Simple table in MVP |
| Export financial data | As a bookkeeper, I want to export financial details for accounting. | HIGH | | CSV export only |

---

### Payroll (A part of Accounting)

**Description:**
Payroll calculates driver payouts using structured rules based on loads completed. It ensures accurate settlement with minimal manual adjustments.

**Narrative:**
Payroll is a massive pain point for fleets. For MVP, keep payout logic simple but powerful: percentage split, flat rate, or RPM-based payout. The system should let fleets generate weekly settlements with minimal manual edits.

| Requirement | User Story | Importance | Jira Issue | Notes |
|-------------|------------|------------|------------|-------|
| Assign driver pay rules | As an admin, I want to define pay types (RPM, % split, flat). | HIGH | | Core MVP feature |
| Auto-calculate payout per load | As a dispatcher, I want pay to calculate automatically when a load completes. | HIGH | | Pulls from load revenue |
| Weekly settlement generation | As an owner, I want to generate a payout summary. | HIGH | | MVP: simple PDF or summary view |
| Adjust payouts manually | As an owner, I want to edit final payout amounts. | HIGH | | Edge cases always happen |

---

### Genie AI

**Description:**
Genie powers AI-driven workflows: profitability calculation, document ingestion, and mechanical code explanation.

**Narrative:**
Genie differentiates your TMS from every legacy player. For MVP, Genie doesn't need to be perfect — but it must be useful, fast, and reliable in three high-impact workflows:
1. Creating loads faster (Reader)
2. Pricing and evaluating loads smarter (Judge)
3. Understanding ELD codes quickly (Mechanic)

| Requirement | User Story | Importance | Jira Issue | Notes |
|-------------|------------|------------|------------|-------|
| Optical Load Reader | As a dispatcher, I want Genie to extract load details from an RC. | HIGH | | Reads fields + builds load draft |
| Load Judge profitability estimate | As a dispatcher, I want Genie to show RPM/net before I accept a load. | HIGH | | Uses rate + miles in MVP. Truck miles would be ideal |
| Genie Mechanic code explanation | As a driver/dispatcher, I want Genie to explain ELD fault codes. | HIGH | | Basic code lookup + recommendations |
| Accept/override Genie suggestions | As a user, I want control over edits. | HIGH | | Builds trust and usability |
| Display confidence or extracted fields | As a user, I want to review extracted info before saving. | HIGH | | Prevents errors |

---

## ⚠️ Out of Scope

### Business Intelligence & Strategic Analytics

This future capability would use TMS data across loads, drivers, equipment, expenses, lanes, and fuel to generate strategic, top-down insights designed to optimize profitability and growth.

This includes Genie evolving into a **Fleet Analyst**, not just a task helper.

**What This Future BI Layer Would Eventually Include (Not in MVP):**

**Cost Per Mile (CPM) System**
- Automated CPM calculations by driver, truck, lane, and dispatcher
- Trend analysis across weeks/months/quarters
- Fuel, maintenance, and fixed cost allocation

**Rates Per Mile Benchmarking**
- Historical RPM comparisons by lane, region, or customer
- Optimal pricing recommendations
- Seasonal or demand-based suggestions

**Deep Historical Analytics**
- Expense pattern recognition
- Driver productivity trends
- Equipment lifecycle cost intelligence
- Lane profitability history over time

**Strategic Operational Insights**
- Which lanes are losing money and why
- Which drivers/equipment produce the best margins
- Where inefficiencies occur in routes or assignments
- Suggestions for ideal lane mix and load types

**AI Business Analyst (Future Genie Evolution)**

A Genie mode that acts like a virtual operations consultant, answering questions such as:
- "Which of my trucks is costing me the most?"
- "What lanes should I stop running?"
- "Where am I losing the most money per mile?"
- "How can I increase my weekly margin by 10%?"

---

## 🎨 Design

---

## ❓ Open Questions

| Question | Answer | Date Answered |
|----------|--------|---------------|
| | | |

---

## 🗂️ Reference Links
