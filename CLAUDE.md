# Qofi Contractor Agent

## What this project is
Automated contractor application, onboarding, and payout agent for Qofi — a marketplace connecting ex-IB professionals with AI labs for financial modeling and training data work.

## Stack
- Orchestration: Claude API (tool use + agentic loop)
- Database: Airtable (contractor records, onboarding steps, assessments, payouts)
- Identity: Persona (IDV)
- Background checks: Checkr (domestic), Certn (international)
- Payments + W-9: Gusto (not Stripe — Stripe won't provide W-9s)
- Time tracking: Insightful
- Simple triggers: Make (form → Airtable → send email)
- Runtime: Google Cloud Functions (Node.js)

## Agent stages
1. Application intake — parse resume, score vs rubric, triage
2. Assessment grader — grade M&A accretion/dilution model
3. Onboarding orchestrator — poll Persona/Checkr/Gusto, nudge blockers
4. Work matching — match cleared contractors to open batches
5. Payout agent — pull Insightful hours, compute pay, trigger Gusto

## Airtable tables
Contractors, Assessments, Onboarding Steps, Work Batches, Payouts
