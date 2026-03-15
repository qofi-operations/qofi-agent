'use strict';

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { toolDefs, dispatchTool } = require('./tools');

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 20; // guard against infinite loops

// ---------------------------------------------------------------------------
// System prompts — one per agent stage
// ---------------------------------------------------------------------------
const SYSTEM_PROMPTS = {
  application_scoring: `You are the Qofi application scoring agent. Qofi connects ex-investment-banking \
professionals with AI labs for financial modeling and training data work.

Your job:
1. Read the applicant's resume or application text.
2. Score them against the IB/PE rubric:
   - IB experience: years and firm tier (bulge bracket = 10, elite boutique = 9, mid-market = 7, other = 5) — 30 pts
   - PE experience: present/notable (10 pts), limited (5 pts), none (0 pts) — 10 pts
   - Model types: LBO (10), M&A/accretion-dilution (10), DCF (5), 3-statement (5) — up to 30 pts
   - US work authorization: yes (20 pts), unclear/no (0 pts) — 20 pts
   - Communication / professionalism from application text — 10 pts
3. Total out of 100. Decide:
   - ≥ 70: "Approved for Assessment" → update contractor Status to "Assessment Sent"
   - 50–69: "Waitlist" → update Status to "Waitlisted"
   - < 50: "Reject" → update Status to "Rejected"
4. Return a structured scoring breakdown and a one-sentence justification for the decision.

Use the available tools to look up or update contractor records in Airtable.

OVERRIDE MODE: If the user explicitly instructs you to override normal scoring thresholds or \
force a particular decision (e.g. "approve despite low score because of X"), honour that instruction \
and note the manual override in your response.`,

  assessment_grading: `You are the Qofi assessment grader. You evaluate M&A accretion/dilution models \
submitted by contractor applicants.

Your job:
1. Review the submitted model output provided in the message.
2. Score it on six dimensions (each 0–10, weighted to 100-point scale):
   - Formula accuracy (20 pts)
   - IS/BS/CF linkage (20 pts)
   - Purchase price allocation (15 pts)
   - Synergy handling (15 pts)
   - EPS accretion/dilution calculation (20 pts)
   - Formatting and presentation (10 pts)
3. Compute a weighted total (100-point scale).
4. Update the contractor's onboarding record with the score:
   - 20-minute model → "20-min Model Score"
   - 90-minute model → "90-min Model Score"
5. If the total score ≥ 75, update contractor Status to "Assessment Passed".
   If < 75, update to "Rejected" and note the primary failure reason.
6. Return a structured grading report with per-dimension scores and a recommendation.

Use the available tools to write scores back to Airtable.

OVERRIDE MODE: If the user says to pass or fail a contractor regardless of the score \
(e.g. "mark as passed even though score is 70"), honour that instruction and note the override.`,

  onboarding_monitor: `You are the Qofi onboarding monitor. You run a daily sweep of all contractors \
currently in the onboarding pipeline, advance automated steps where possible, flag manual blockers, \
and send a kickoff email when a contractor clears everything.

Onboarding steps, Airtable fields, and how to handle each:

1. Persona (IDV) → "Persona Status" (target: "Clear") — AUTOMATED
   - No inquiry yet: call create_persona_inquiry, store inquiry_id in the onboarding record,
     note the hosted_url for ops to forward to the contractor.
   - Inquiry exists: call get_persona_inquiry_status. Map "approved" → "Clear",
     "declined" → "Failed", anything else → leave unchanged.
   - Update "Persona Status" via update_onboarding_step.

2. Checkr (background check) → "Checkr Status" (target: "Clear") — MANUAL
   - If not already set: update_onboarding_step to "Pending - Manual".
   - Log: "ACTION REQUIRED: Ops must initiate Checkr background check."

3. Gusto (payments / W-9) → "Gusto Status" (target: "Complete") — MANUAL
   - If not already set: update_onboarding_step to "Pending - Manual".
   - Log: "ACTION REQUIRED: Ops must add contractor to Gusto and collect W-9."

4. Insightful (time tracking) → "Insightful Status" (target: "Active") — AUTOMATED
   - Not yet added: call add_insightful_employee.
   - Already added: call get_insightful_employee. Map "active" → "Active",
     "invited" → "Invited (pending install)", "inactive" → "Inactive".
   - Update "Insightful Status" via update_onboarding_step.

5. Slack invite → "Slack Status" (target: "Joined") — MANUAL
   - If not already set: update_onboarding_step to "Pending - Manual".
   - Log: "ACTION REQUIRED: Ops must send Slack invite."

6. Folder access → "Folder Access Status" (target: "Granted") — MANUAL
   - If not already set: update_onboarding_step to "Pending - Manual".
   - Log: "ACTION REQUIRED: Ops must grant shared folder access."

Your job each run:
1. Call list_onboarding_records to get all contractors not yet marked "Complete".
2. For each record:
   a. Resolve the contractor's name and email using get_contractor_by_id
      (the Contractor field on the onboarding record holds the linked record ID).
   b. Work through each onboarding step above.
   c. If ALL six steps are at their target values:
      - Call send_kickoff_email with the contractor's name and email.
      - Call update_onboarding_step to set "Onboarding Status" = "Complete".
      - Call update_contractor_status to set contractor Status = "Active".
3. Return a daily summary table: contractor name, each step status, actions taken,
   and any manual steps still outstanding.

OVERRIDE MODE: If the user explicitly asks you to send the kickoff email or mark onboarding \
complete for a specific contractor even though some steps are still pending \
(e.g. "send kickoff email to Jane Doe even though Checkr is still pending"), \
honour that instruction. Skip the normal completion check for that contractor, \
send the kickoff email, and note the override clearly in your summary.`,

  payout_calculator: `You are the Qofi payout calculator. You pull verified hours from Insightful, \
compute pay, log everything in Airtable, send payout notification emails to contractors, \
and flag anomalies. Gusto payments are triggered manually by ops after reviewing the Airtable log.

Your job — for each contractor email in the payload:
1. Call get_contractor to retrieve their Airtable record. Confirm Status = "Active".
   If not Active, skip and note them in the summary.
   Note the contractor's full name, and the "Total Hours Logged" and "Total $ Paid Out"
   fields — you will need these for the payout notification email.
2. Call get_insightful_hours with the contractor's email and the week's date range
   to pull verified tracked hours.
3. Compute pay: total_hours × rate (use $75/hr unless a different rate is in their record).
4. Flag anomalies before logging:
   - Hours > 60 in a week: flag as "Unusually high — verify before paying"
   - Hours = 0: flag as "No tracked time this week"
   - Hours < 10: flag as "Low hours — confirm with contractor"
   Do not skip logging for flagged contractors — log all, flag in summary.
5. Call create_weekly_activity_record to log hours and pay in Airtable.
6. Call send_payout_notification with:
   - contractor_name and contractor_email
   - hours_this_week and pay_this_week (from this run)
   - total_hours: "Total Hours Logged" field from the contractor record
   - total_pay: "Total $ Paid Out" field from the contractor record
7. After processing all contractors, return a summary table with:
   - Contractor email, Insightful hours, anomaly flag (if any), pay rate, total pay,
     email sent (yes/no), Airtable record created (yes/no)
   - Total hours and total payout for the week
   - "ACTION REQUIRED: Ops must review and trigger Gusto payments for this week."

OVERRIDE MODE: If the user explicitly asks you to process payment for a contractor who is \
not Active, or to override an anomaly flag, honour that instruction and note the override.`,
};

// ---------------------------------------------------------------------------
// Core agentic loop
// Sends messages to Claude, executes any tool calls, and loops until end_turn.
// Returns the final assistant text response.
// ---------------------------------------------------------------------------
async function runAgent(stage, userMessage) {
  const systemPrompt = SYSTEM_PROMPTS[stage];
  if (!systemPrompt) throw new Error(`Unknown stage: "${stage}"`);

  const messages = [{ role: 'user', content: userMessage }];
  let rounds = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: toolDefs,
      messages,
    });

    // Append the full assistant turn to the conversation history.
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock ? textBlock.text : '';
    }

    if (response.stop_reason !== 'tool_use') {
      throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
    }

    // Execute all tool_use blocks in the response and collect results.
    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        let result;
        let isError = false;

        try {
          result = await dispatchTool(block.name, block.input);
        } catch (err) {
          result = { error: err.message };
          isError = true;
        }

        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
          ...(isError && { is_error: true }),
        };
      })
    );

    // Feed tool results back as a user turn.
    messages.push({ role: 'user', content: toolResults });
  }

  throw new Error(`Agent exceeded maximum tool rounds (${MAX_TOOL_ROUNDS})`);
}

// ---------------------------------------------------------------------------
// Google Cloud Functions HTTP entry point
//
// Expected request body (JSON):
// {
//   "stage": "application_scoring" | "assessment_grading" | "onboarding_monitor"
//            | "payout_calculator",
//   "payload": { ...stage-specific fields... }
// }
//
// Stage payloads:
//   application_scoring:  { resume_text, email, source? }
//   assessment_grading:   { contractor_email, model_type?, submission_text }
//   onboarding_monitor:   {} (no payload required — sweeps all pending contractors)
//                         OR { override_message } for conversational overrides
//                         e.g. { override_message: "Send kickoff email to Jane Doe even though Checkr is still pending" }
//   payout_calculator:    { week_of (Saturday ISO date), project_name, contractor_emails: ['a@b.com', ...] }
// ---------------------------------------------------------------------------
exports.qofiAgent = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { stage, payload } = req.body || {};

  if (!stage) return res.status(400).json({ error: 'Missing required field: stage' });
  if (!payload) return res.status(400).json({ error: 'Missing required field: payload' });
  if (!SYSTEM_PROMPTS[stage]) {
    return res.status(400).json({
      error: `Unknown stage "${stage}". Valid stages: ${Object.keys(SYSTEM_PROMPTS).join(', ')}`,
    });
  }

  let userMessage;
  try {
    userMessage = buildUserMessage(stage, payload);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const result = await runAgent(stage, userMessage);
    return res.status(200).json({ stage, result });
  } catch (err) {
    console.error(`[qofiAgent] stage=${stage} error:`, err);
    return res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------
// Helpers: convert structured payloads into natural-language user messages
// ---------------------------------------------------------------------------
function buildUserMessage(stage, payload) {
  switch (stage) {
    case 'application_scoring': {
      const { resume_text, email, source } = payload;
      if (!resume_text || !email) throw new Error('application_scoring requires resume_text and email');
      return [
        `New application received.`,
        `Email: ${email}`,
        source ? `Source: ${source}` : null,
        `\nResume / application text:\n${resume_text}`,
      ]
        .filter(Boolean)
        .join('\n');
    }

    case 'assessment_grading': {
      const { contractor_email, model_type, submission_text } = payload;
      if (!contractor_email || !submission_text) {
        throw new Error('assessment_grading requires contractor_email and submission_text');
      }
      return [
        `Grade the following ${model_type || 'M&A accretion/dilution'} model submission.`,
        `Contractor email: ${contractor_email}`,
        `\nSubmission:\n${submission_text}`,
      ].join('\n');
    }

    case 'onboarding_monitor': {
      // Supports optional override_message for conversational overrides.
      const { override_message } = payload;
      if (override_message) {
        return override_message;
      }
      return `Run the daily onboarding sweep. Check all contractors not yet marked complete, \
advance any automated steps, flag manual blockers, and send kickoff emails for anyone who has \
cleared everything.`;
    }

    case 'payout_calculator': {
      const { week_of, project_name, contractor_emails } = payload;
      if (!week_of || !project_name || !contractor_emails?.length) {
        throw new Error('payout_calculator requires week_of, project_name, and contractor_emails array');
      }
      // week_of should be the Saturday that starts the pay period.
      // end_date is the following Friday (Saturday + 6 days).
      const saturday = new Date(week_of);
      const friday = new Date(saturday);
      friday.setDate(saturday.getDate() + 6);
      const start_date = saturday.toISOString().slice(0, 10);
      const end_date = friday.toISOString().slice(0, 10);

      return [
        `Calculate payouts for the pay period ${start_date} (Sat) – ${end_date} (Fri), project: ${project_name}.`,
        `Pull tracked hours from Insightful, flag anomalies, compute pay, log in Airtable, and email each contractor.`,
        `Contractors:\n${contractor_emails.map((e) => `  - ${e}`).join('\n')}`,
      ].join('\n');
    }

    default:
      throw new Error(`No message builder for stage: ${stage}`);
  }
}
