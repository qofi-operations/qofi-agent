/**
 * Persona identity verification (IDV) tool implementations + Claude API tool definitions.
 * Docs: https://docs.withpersona.com/reference
 */

'use strict';

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'https://withpersona.com/api/v1';

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
    'Persona-Version': '2023-01-05',
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// create_persona_inquiry
// Creates a hosted-flow inquiry and returns the URL to send to the contractor.
// ---------------------------------------------------------------------------
async function create_persona_inquiry(contractor_id, email, first_name, last_name) {
  const { data } = await axios.post(
    `${BASE_URL}/inquiries`,
    {
      data: {
        attributes: {
          'inquiry-template-id': process.env.PERSONA_TEMPLATE_ID,
          'reference-id': contractor_id,
          fields: {
            'email-address': { value: email },
            'name-first': { value: first_name },
            'name-last': { value: last_name },
          },
        },
      },
    },
    { headers: authHeaders() }
  );

  const attrs = data.data.attributes;
  return {
    inquiry_id: data.data.id,
    status: attrs.status,
    hosted_url: attrs['session-token']
      ? `https://withpersona.com/verify?inquiry-id=${data.data.id}&session-token=${attrs['session-token']}`
      : null,
  };
}

// ---------------------------------------------------------------------------
// get_persona_inquiry_status
// Returns the current status of an inquiry.
// Statuses: created | pending | completed | failed | expired | needs_review | approved | declined
// ---------------------------------------------------------------------------
async function get_persona_inquiry_status(inquiry_id) {
  const { data } = await axios.get(`${BASE_URL}/inquiries/${inquiry_id}`, {
    headers: authHeaders(),
  });

  const attrs = data.data.attributes;
  return {
    inquiry_id: data.data.id,
    status: attrs.status,
    created_at: attrs['created-at'],
    completed_at: attrs['completed-at'] || null,
    reference_id: attrs['reference-id'],
  };
}

// ---------------------------------------------------------------------------
// Claude API tool definitions
// ---------------------------------------------------------------------------
const toolDefs = [
  {
    name: 'create_persona_inquiry',
    description:
      'Create a Persona identity verification (IDV) inquiry for a contractor and return ' +
      'the hosted verification URL to send to them.',
    input_schema: {
      type: 'object',
      properties: {
        contractor_id: {
          type: 'string',
          description: "Airtable record ID of the contractor (used as Persona reference-id).",
        },
        email: { type: 'string', description: "Contractor's email address." },
        first_name: { type: 'string', description: "Contractor's first name." },
        last_name: { type: 'string', description: "Contractor's last name." },
      },
      required: ['contractor_id', 'email', 'first_name', 'last_name'],
    },
  },
  {
    name: 'get_persona_inquiry_status',
    description:
      'Retrieve the current status of a Persona IDV inquiry. ' +
      'Status is "approved" when identity is verified, "declined" if rejected.',
    input_schema: {
      type: 'object',
      properties: {
        inquiry_id: {
          type: 'string',
          description: "Persona inquiry ID (e.g. 'inq_XXXX').",
        },
      },
      required: ['inquiry_id'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------
async function dispatchTool(toolName, input) {
  switch (toolName) {
    case 'create_persona_inquiry':
      return create_persona_inquiry(
        input.contractor_id,
        input.email,
        input.first_name,
        input.last_name
      );
    case 'get_persona_inquiry_status':
      return get_persona_inquiry_status(input.inquiry_id);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = {
  create_persona_inquiry,
  get_persona_inquiry_status,
  toolDefs,
  dispatchTool,
};
