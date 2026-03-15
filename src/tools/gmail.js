/**
 * Gmail / nodemailer tool implementations + Claude API tool definitions.
 * Used to send kickoff and payout notification emails.
 *
 * Required env vars:
 *   GMAIL_USER         — the sending address (e.g. operations@qofi.ai via Google Workspace)
 *   GMAIL_APP_PASSWORD — Gmail / Google Workspace App Password
 */

'use strict';

require('dotenv').config();
const nodemailer = require('nodemailer');

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

// ---------------------------------------------------------------------------
// send_kickoff_email
// Sends a welcome / kickoff email to a contractor who has cleared all onboarding
// steps. Returns { accepted, messageId } on success.
// ---------------------------------------------------------------------------
async function send_kickoff_email(contractor_name, contractor_email) {
  const transporter = createTransport();

  const info = await transporter.sendMail({
    from: `"Qofi Ops" <${process.env.GMAIL_USER}>`,
    to: contractor_email,
    subject: "You're cleared to start — welcome to Qofi!",
    text: [
      `Hi ${contractor_name},`,
      '',
      "Great news — you've completed all onboarding steps and are officially cleared to start work on the Qofi platform.",
      '',
      "Here's what to expect next:",
      "  \u2022 You'll receive project assignments directly from your Qofi project lead.",
      '  • Track all time in the Insightful desktop app (already set up during onboarding).',
      "  \u2022 Payouts are processed weekly \u2014 you'll see them reflected in Gusto.",
      '',
      'If you have any questions, reply to this email or reach out on Slack.',
      '',
      'Welcome aboard,',
      'Qofi Ops',
    ].join('\n'),
  });

  return {
    accepted: info.accepted,
    messageId: info.messageId,
  };
}

// ---------------------------------------------------------------------------
// send_payout_notification
// Sends a weekly payout summary to a contractor after their hours are logged.
// Includes hours and pay for the current week, plus cumulative totals pulled
// from the contractor's Airtable record ("Total Hours Logged", "Total $ Paid Out").
// ---------------------------------------------------------------------------
async function send_payout_notification(
  contractor_name,
  contractor_email,
  hours_this_week,
  pay_this_week,
  total_hours,
  total_pay
) {
  const transporter = createTransport();

  const info = await transporter.sendMail({
    from: `"Qofi Operations" <${process.env.GMAIL_USER}>`,
    to: contractor_email,
    subject: `Your Qofi payout summary — $${pay_this_week.toFixed(2)} this week`,
    text: [
      `Hi ${contractor_name},`,
      '',
      "Here's your payout summary for this week:",
      '',
      `  Hours logged this week:   ${hours_this_week.toFixed(2)} hrs`,
      `  Payout this week:         $${pay_this_week.toFixed(2)}`,
      '',
      `  Cumulative hours to date: ${total_hours.toFixed(2)} hrs`,
      `  Cumulative payout to date:$${total_pay.toFixed(2)}`,
      '',
      'Payment will be processed via Gusto within 2–3 business days after ops review.',
      '',
      'Questions? Reply to this email or reach out on Slack.',
      '',
      'Qofi Operations',
    ].join('\n'),
  });

  return {
    accepted: info.accepted,
    messageId: info.messageId,
  };
}

// ---------------------------------------------------------------------------
// Claude API tool definitions
// ---------------------------------------------------------------------------
const toolDefs = [
  {
    name: 'send_kickoff_email',
    description:
      'Send a kickoff / welcome email to a contractor who has completed all onboarding steps. ' +
      'Only call this when Persona Status = "Clear", Checkr Status = "Clear", ' +
      'Gusto Status = "Complete", Insightful Status = "Active", ' +
      'Slack Status = "Joined", and Folder Access Status = "Granted".',
    input_schema: {
      type: 'object',
      properties: {
        contractor_name: {
          type: 'string',
          description: "Contractor's full name for the email greeting.",
        },
        contractor_email: {
          type: 'string',
          description: "Contractor's email address (recipient).",
        },
      },
      required: ['contractor_name', 'contractor_email'],
    },
  },
  {
    name: 'send_payout_notification',
    description:
      'Send a weekly payout summary email to a contractor after their hours are logged in Airtable. ' +
      'Include hours and pay for the current week, plus cumulative totals from the contractor record ' +
      '("Total Hours Logged" and "Total $ Paid Out" fields in Contractor Database).',
    input_schema: {
      type: 'object',
      properties: {
        contractor_name: {
          type: 'string',
          description: "Contractor's full name for the email greeting.",
        },
        contractor_email: {
          type: 'string',
          description: "Contractor's email address (recipient).",
        },
        hours_this_week: {
          type: 'number',
          description: 'Hours tracked this week (from Insightful).',
        },
        pay_this_week: {
          type: 'number',
          description: 'Pay amount (USD) for this week.',
        },
        total_hours: {
          type: 'number',
          description: 'Cumulative hours from the "Total Hours Logged" field on the contractor record.',
        },
        total_pay: {
          type: 'number',
          description: 'Cumulative payout from the "Total $ Paid Out" field on the contractor record.',
        },
      },
      required: [
        'contractor_name',
        'contractor_email',
        'hours_this_week',
        'pay_this_week',
        'total_hours',
        'total_pay',
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------
async function dispatchTool(toolName, input) {
  switch (toolName) {
    case 'send_kickoff_email':
      return send_kickoff_email(input.contractor_name, input.contractor_email);
    case 'send_payout_notification':
      return send_payout_notification(
        input.contractor_name,
        input.contractor_email,
        input.hours_this_week,
        input.pay_this_week,
        input.total_hours,
        input.total_pay
      );
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = {
  send_kickoff_email,
  send_payout_notification,
  toolDefs,
  dispatchTool,
};
