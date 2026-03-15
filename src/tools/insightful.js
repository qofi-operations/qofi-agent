/**
 * Insightful (formerly Workpuls) time-tracking tool implementations + Claude API tool definitions.
 * Docs: https://developers.insightful.io
 *
 * Required env vars:
 *   INSIGHTFUL_API_KEY  — Bearer token from Settings → Integrations → API
 *
 * NOTE: Insightful calls contractors "employees" in their API.
 */

'use strict';

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'https://api.insightful.io/v1';

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.INSIGHTFUL_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// add_insightful_employee
// Adds a contractor to Insightful so their desktop app can start tracking time.
// Returns employee_id and activation status.
// ---------------------------------------------------------------------------
async function add_insightful_employee(email, first_name, last_name) {
  const { data } = await axios.post(
    `${BASE_URL}/employees`,
    { email, first_name, last_name, employee_type: 'contractor' },
    { headers: authHeaders() }
  );

  return {
    employee_id: data.id,
    email: data.email,
    first_name: data.first_name,
    last_name: data.last_name,
    status: data.status,      // "active" | "invited" | "inactive"
    created_at: data.created_at,
  };
}

// ---------------------------------------------------------------------------
// get_insightful_employee
// Looks up a contractor by email. Returns their id and current tracking status.
// status: "active" means the agent is installed and tracking.
// ---------------------------------------------------------------------------
async function get_insightful_employee(email) {
  const { data } = await axios.get(`${BASE_URL}/employees`, {
    headers: authHeaders(),
    params: { email },
  });

  const employees = data.employees || data.data || [];
  const employee = employees.find(
    (e) => e.email?.toLowerCase() === email.toLowerCase()
  );

  if (!employee) throw new Error(`No Insightful employee found with email: ${email}`);

  return {
    employee_id: employee.id,
    email: employee.email,
    first_name: employee.first_name,
    last_name: employee.last_name,
    status: employee.status,
  };
}

// ---------------------------------------------------------------------------
// get_insightful_hours
// Returns total tracked hours for a contractor between start_date and end_date
// (inclusive, ISO format "YYYY-MM-DD").
// Also returns a day-by-day breakdown for transparency.
// ---------------------------------------------------------------------------
async function get_insightful_hours(email, start_date, end_date) {
  const employee = await get_insightful_employee(email);

  const { data } = await axios.get(
    `${BASE_URL}/employees/${employee.employee_id}/time-and-attendance`,
    {
      headers: authHeaders(),
      params: { start_date, end_date },
    }
  );

  // Normalise response — Insightful returns seconds; convert to hours.
  const entries = data.entries || data.data || [];
  const dailyBreakdown = entries.map((entry) => ({
    date: entry.date,
    hours: parseFloat(((entry.tracked_time_seconds || entry.tracked_seconds || 0) / 3600).toFixed(2)),
  }));

  const total_hours = dailyBreakdown.reduce((sum, d) => sum + d.hours, 0);

  return {
    employee_id: employee.employee_id,
    email,
    start_date,
    end_date,
    total_hours: parseFloat(total_hours.toFixed(2)),
    daily_breakdown: dailyBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Claude API tool definitions
// ---------------------------------------------------------------------------
const toolDefs = [
  {
    name: 'add_insightful_employee',
    description:
      'Add a contractor to Insightful time tracking. Sends them an invitation to install ' +
      'the desktop tracking agent. Required during onboarding before work can begin.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: "Contractor's email address." },
        first_name: { type: 'string', description: "Contractor's first name." },
        last_name: { type: 'string', description: "Contractor's last name." },
      },
      required: ['email', 'first_name', 'last_name'],
    },
  },
  {
    name: 'get_insightful_employee',
    description:
      'Look up a contractor in Insightful by email and return their tracking status. ' +
      '"active" means the desktop agent is installed and recording time.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: "Contractor's email address." },
      },
      required: ['email'],
    },
  },
  {
    name: 'get_insightful_hours',
    description:
      'Retrieve total tracked hours for a contractor over a date range. ' +
      'Returns total_hours and a day-by-day breakdown. Use this in the payout stage ' +
      'to get verified hours before computing pay.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: "Contractor's email address." },
        start_date: {
          type: 'string',
          description: 'Start of the period (ISO date, e.g. "2026-03-09").',
        },
        end_date: {
          type: 'string',
          description: 'End of the period inclusive (ISO date, e.g. "2026-03-15").',
        },
      },
      required: ['email', 'start_date', 'end_date'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------
async function dispatchTool(toolName, input) {
  switch (toolName) {
    case 'add_insightful_employee':
      return add_insightful_employee(input.email, input.first_name, input.last_name);
    case 'get_insightful_employee':
      return get_insightful_employee(input.email);
    case 'get_insightful_hours':
      return get_insightful_hours(input.email, input.start_date, input.end_date);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = {
  add_insightful_employee,
  get_insightful_employee,
  get_insightful_hours,
  toolDefs,
  dispatchTool,
};
