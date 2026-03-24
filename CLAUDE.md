Qofi Contractor Agent
What this project is
Automated contractor application, onboarding, and payout agent for Qofi — a marketplace connecting ex-IB professionals with AI labs for financial modeling and training data work.
Key contacts
Founder: Christian (christian@qofi.ai)
Outbound emails: operations@qofi.ai
---
Stack
Tool	Purpose
Claude API	Orchestration (tool use + agentic loop)
Airtable	Source of truth for all contractor data
Persona	Identity verification (IDV)
Checkr	Background checks — MANUAL, no API
Gusto	Payments + W-9 — MANUAL, no API
Insightful	Time tracking and hour logging
nodemailer via Google Workspace	Outbound email from operations@qofi.ai
Google Cloud Functions (Node.js)	Runtime
GitHub (personal)	All code lives here — not work repos
---
Live API integrations (agent owns these)
Airtable — source of truth for all contractor data
Persona — IDV inquiry creation and status polling
Insightful — employee creation and hours pulling
Gmail via nodemailer — kickoff email when contractor clears onboarding; payout notification email each week
Manual steps (agent sets Airtable status to "Pending - Manual" and logs ACTION REQUIRED)
Checkr → sets "Checkr Status" = "Pending - Manual"
Gusto → sets "Gusto Status" = "Pending - Manual"
Slack → sets "Slack Status" = "Pending - Manual"
Folder access → sets "Folder Access Status" = "Pending - Manual"
---
Agent stages
1. application_scoring
Read application from Airtable, score against IB/PE rubric, update status.
2. assessment_grading
Grade M&A accretion/dilution model, update 20-min and 90-min scores.
3. onboarding_monitor
Daily sweep of all pending onboarding records. Advance automated steps, flag manual blockers, send kickoff email when fully cleared.
Automated sequence:
Persona IDV link sent → poll for clear
On Persona clear → flag Checkr as "Pending - Manual"
On Checkr manual clear → trigger Insightful employee creation (40hr/week default limit)
Flag Gusto, Slack, Folder Access as "Pending - Manual"
When all steps cleared → send kickoff email from operations@qofi.ai
If verification stuck > 5 days → flag for Christian's review, do not auto-resolve.
4. payout_calculator
Pull Insightful hours (Sat–Fri pay period), compute pay, update Weekly Activity table, send payout notification email, flag anomalies.
Billing logic:
Pay rate: $150/hr (contractors and project leads)
Assessment bonus: $50 flat (one-time, when contractor crosses 10 cumulative hours)
Only send payment emails to contractors with hours > 0 for that week
Flag hours discrepancy > 2hrs before running payment — do not auto-resolve
Confirm weekly totals match Billing Summary before batch sending
Before sending batch payment emails:
Sum all contractor hours → must match Billing Summary "Total Expert Hours" for that week
Sum all pay → must match "Total Expert Pay" in Billing Summary
Log confirmed totals, then send
Known billing nuance: All-time hours in emails = writing hours only (from Billing Calcs tab). Active tab "Total Hours Billed" includes model test bonus hours (0.3333 hrs = $50 bonus) — do not use Active tab hours for email figures.
---
Payment email template
From: operations@qofi.ai
Subject: `Qofi payment processed — week ending {WEEK_ENDING}`
```
Hi {first_name},

The payment for your work so far on the Qofi project has been processed. Here's your summary:

Week ending {WEEK_ENDING}
  • Hours logged: {w3_hours}
  • Technical assessment bonus earned (10+ cumulative hours): {milestone_yes_no}
  • Pay for hours: {hours_pay}
  • Assessment bonus: {assessment_bonus}
  • Total: {total_pay}

All-time totals
  • Hours: {alltime_hours}
  • Pay: {alltime_pay}

Payments typically arrive within 3–5 business days depending on your bank. If you have any questions reply to this email or reach out on Slack.

We look forward to another week of building the future of finance together!

Thanks,
Qofi Team
```
---
Override mode
Each stage accepts conversational override instructions. For `onboarding_monitor`, pass:
```json
{ "override_message": "Send kickoff email to Jane Doe even though Checkr is still pending" }
```
The agent will honour the instruction and note the override in its response.
---
GCF entry point
`exports.qofiAgent` in `src/index.js`. POST with `{ stage, payload }`.
---
Airtable tables
`Contractor Database` — Status, Total Hours Logged, Total $ Paid Out
`Contractor Onboarding` — Persona Status, Checkr Status, Gusto Status, Insightful Status, Slack Status, Folder Access Status, Onboarding Status, 20-min Model Score, 90-min Model Score
`Projects`
`Weekly Activity`
---
Pay period
Saturday through Friday (inclusive). Pass the Saturday date as `week_of` in the payout_calculator payload.
---
Agent behavior rules
Never send payment emails without confirming totals match Billing Summary first
Never auto-resolve flags — hours discrepancy > 2hrs or verification stuck > 5 days → flag for Christian
Always send from operations@qofi.ai — never christian@qofi.ai or personal email
Log every action — write a log entry for every email sent, payment triggered, or status change
Personal infrastructure only — all code in personal GitHub, personal Anthropic account, personal Google Drive
---
International contractors
Gusto is US-focused. For international contractors:
W-8BEN collected via DocuSign or Dropbox Sign (instead of W-9)
Payments via Wise or Deel (instead of Gusto direct deposit)
Flag international contractors in Airtable for separate payment run
---
Environment variables
See `.env` for all required keys:
`ANTHROPIC_API_KEY`, `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `PERSONA_API_KEY`, `PERSONA_TEMPLATE_ID`, `INSIGHTFUL_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`
---
Current status (as of March 2026)
Week 3 payment emails: ready to send (25 contractors, $59,807.88 total payout)
nodemailer / Gmail: needs to be wired to operations@qofi.ai for batch send
Agent scaffold: started in GitHub Codespace, continue on work computer before May 8
Gusto: confirmed for US contractor payments — manual step
International payment solution: Gusto - manual step
