# Qofi Contractor Agent

## What this project is
Automated contractor application, onboarding, and payout agent for Qofi — a marketplace connecting ex-IB professionals with AI labs for financial modeling and training data work.

## Stack
- Orchestration: Claude API (tool use + agentic loop)
- Database: Airtable (contractor records, onboarding steps, assessments, payouts)
- Identity: Persona (IDV)
- Background checks: Checkr (domestic) — MANUAL, no API integration
- Payments + W-9: Gusto — MANUAL, no API integration
- Time tracking: Insightful
- Email: nodemailer via Google Workspace (operations@qofi.ai)
- Runtime: Google Cloud Functions (Node.js)

## LIVE API integrations (agent owns these)
- **Airtable** — source of truth for all contractor data
- **Persona** — IDV inquiry creation and status polling
- **Insightful** — employee creation and hours pulling
- **Gmail via nodemailer** — kickoff email when contractor clears onboarding; payout notification email each week

## MANUAL steps (agent sets Airtable status to "Pending - Manual" and logs ACTION REQUIRED)
- **Checkr** → sets "Checkr Status" = "Pending - Manual"
- **Gusto** → sets "Gusto Status" = "Pending - Manual"
- **Slack** → sets "Slack Status" = "Pending - Manual"
- **Folder access** → sets "Folder Access Status" = "Pending - Manual"

## Agent stages
1. **application_scoring** — read application from Airtable, score against IB/PE rubric, update status
2. **assessment_grading** — grade M&A accretion/dilution model, update 20-min and 90-min scores
3. **onboarding_monitor** — daily sweep of all pending onboarding records, advance automated steps, flag manual blockers, send kickoff email when fully cleared
4. **payout_calculator** — pull Insightful hours (Sat–Fri pay period), compute pay, update Weekly Activity, send payout notification email, flag anomalies

## Override mode
Each stage accepts conversational override instructions. For `onboarding_monitor`, pass:
```json
{ "override_message": "Send kickoff email to Jane Doe even though Checkr is still pending" }
```
The agent will honour the instruction and note the override in its response.

## GCF entry point
`exports.qofiAgent` in `src/index.js`. POST with `{ stage, payload }`.

## Airtable tables
- `Contractor Database` — Status, Total Hours Logged, Total $ Paid Out
- `Contractor Onboarding` — Persona Status, Checkr Status, Gusto Status, Insightful Status, Slack Status, Folder Access Status, Onboarding Status, 20-min Model Score, 90-min Model Score
- `Projects`
- `Weekly Activity`

## Pay period
Saturday through Friday (inclusive). Pass the Saturday date as `week_of` in the payout_calculator payload.

## Environment variables
See `.env` for all required keys:
`ANTHROPIC_API_KEY`, `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `PERSONA_API_KEY`, `PERSONA_TEMPLATE_ID`, `INSIGHTFUL_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`
