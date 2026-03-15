/**
 * Airtable tool implementations + Claude API tool definitions
 * Tables: Contractor Database, Contractor Onboarding, Projects, Weekly Activity
 */

'use strict';

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'https://api.airtable.com/v0';
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const API_KEY = process.env.AIRTABLE_API_KEY;

const TABLES = {
  CONTRACTORS: 'Contractor Database',
  ONBOARDING: 'Contractor Onboarding',
  PROJECTS: 'Projects',
  WEEKLY_ACTIVITY: 'Weekly Activity',
};

function tableUrl(table) {
  return `${BASE_URL}/${BASE_ID}/${encodeURIComponent(table)}`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Search a table with a filterByFormula and return matching records.
 */
async function searchRecords(table, formula, fields) {
  const params = { filterByFormula: formula };
  if (fields) params.fields = fields;

  const { data } = await axios.get(tableUrl(table), {
    headers: authHeaders(),
    params,
  });
  return data.records;
}

// ---------------------------------------------------------------------------
// 1. get_contractor(email)
//    Returns the Contractor Database record for the given email.
// ---------------------------------------------------------------------------
async function get_contractor(email) {
  const formula = `{Email}="${email}"`;
  const records = await searchRecords(TABLES.CONTRACTORS, formula);
  if (!records.length) throw new Error(`No contractor found with email: ${email}`);
  return records[0];
}

// ---------------------------------------------------------------------------
// 2. update_contractor_status(email, status)
//    Finds the contractor by email, then patches their Status field.
// ---------------------------------------------------------------------------
async function update_contractor_status(email, status) {
  const record = await get_contractor(email);
  const recordId = record.id;

  const { data } = await axios.patch(
    `${tableUrl(TABLES.CONTRACTORS)}/${recordId}`,
    { fields: { Status: status } },
    { headers: authHeaders() }
  );
  return data;
}

// ---------------------------------------------------------------------------
// 3. get_onboarding_record(contractor_id)
//    Returns the Contractor Onboarding record linked to the given Airtable
//    contractor record ID (e.g. "recXXXXXXXXXXXXXX").
// ---------------------------------------------------------------------------
async function get_onboarding_record(contractor_id) {
  // Linked fields are arrays; FIND checks whether the record ID appears in them.
  const formula = `FIND("${contractor_id}", ARRAYJOIN({Contractor}))`;
  const records = await searchRecords(TABLES.ONBOARDING, formula);
  if (!records.length) {
    throw new Error(`No onboarding record found for contractor ID: ${contractor_id}`);
  }
  return records[0];
}

// ---------------------------------------------------------------------------
// 4. update_onboarding_step(onboarding_id, field, value)
//    Patches a single field on a Contractor Onboarding record.
//    Valid fields: Onboarding Status, Model Submission Date, 20-min Model Score,
//    90-min Model Score, Checkr Status, Persona Status, Insightful Status,
//    Gusto Status, Slack Status
// ---------------------------------------------------------------------------
async function update_onboarding_step(onboarding_id, field, value) {
  const { data } = await axios.patch(
    `${tableUrl(TABLES.ONBOARDING)}/${onboarding_id}`,
    { fields: { [field]: value } },
    { headers: authHeaders() }
  );
  return data;
}

// ---------------------------------------------------------------------------
// 5. list_onboarding_records()
//    Returns all Contractor Onboarding records where Onboarding Status is not
//    "Complete". Used by the onboarding monitor to do a daily sweep.
// ---------------------------------------------------------------------------
async function list_onboarding_records() {
  const formula = `NOT({Onboarding Status}="Complete")`;
  return searchRecords(TABLES.ONBOARDING, formula);
}

// ---------------------------------------------------------------------------
// 6. get_contractor_by_id(record_id)
//    Returns the Contractor Database record for the given Airtable record ID.
//    Used when you have a record ID (e.g. from a linked field) but not the email.
// ---------------------------------------------------------------------------
async function get_contractor_by_id(record_id) {
  const { data } = await axios.get(
    `${tableUrl(TABLES.CONTRACTORS)}/${record_id}`,
    { headers: authHeaders() }
  );
  return data;
}

// ---------------------------------------------------------------------------
// 8. list_contractors_by_source_and_project(source, project_name)
//    Returns contractors matching Source (text) and, optionally, a linked Project
//    by name. Looks up the project record ID first when project_name is provided.
// ---------------------------------------------------------------------------
async function list_contractors_by_source_and_project(source, project_name) {
  let formula;

  if (project_name) {
    // Resolve the project record ID by name first.
    const projectRecords = await searchRecords(
      TABLES.PROJECTS,
      `{Project Name}="${project_name}"`
    );
    if (!projectRecords.length) {
      throw new Error(`No project found with name: ${project_name}`);
    }
    const projectId = projectRecords[0].id;

    formula = `AND(
      {Source}="${source}",
      FIND("${projectId}", ARRAYJOIN({Project}))
    )`;
  } else {
    formula = `{Source}="${source}"`;
  }

  return searchRecords(TABLES.CONTRACTORS, formula);
}

// ---------------------------------------------------------------------------
// 9. create_weekly_activity_record(contractor_id, project_id, week_of, hours, pay)
//    Creates a new Weekly Activity row.
//    contractor_id / project_id are Airtable record IDs ("recXXX...").
//    week_of is an ISO date string ("2026-03-09").
//    hours and pay are numbers.
// ---------------------------------------------------------------------------
async function create_weekly_activity_record(contractor_id, project_id, week_of, hours, pay) {
  const { data } = await axios.post(
    tableUrl(TABLES.WEEKLY_ACTIVITY),
    {
      fields: {
        Contractor: [contractor_id],
        Project: [project_id],
        'Week of': week_of,
        Hours: hours,
        Pay: pay,
      },
    },
    { headers: authHeaders() }
  );
  return data;
}

// ---------------------------------------------------------------------------
// Claude API tool definitions
// Pass `toolDefs` to the `tools` array when calling claude-sonnet-4-6.
// ---------------------------------------------------------------------------
const toolDefs = [
  {
    name: 'get_contractor',
    description:
      'Retrieve a contractor record from the Contractor Database by email address.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: "The contractor's email address.",
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'update_contractor_status',
    description:
      'Update the Status field of a contractor record identified by email. ' +
      'Typical values: Applied, Assessment Sent, Assessment Passed, Onboarding, Active, Inactive, Rejected.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: "The contractor's email address.",
        },
        status: {
          type: 'string',
          description: 'The new status value to set.',
        },
      },
      required: ['email', 'status'],
    },
  },
  {
    name: 'get_onboarding_record',
    description:
      'Retrieve the Contractor Onboarding record linked to a given contractor Airtable record ID.',
    input_schema: {
      type: 'object',
      properties: {
        contractor_id: {
          type: 'string',
          description: "The Airtable record ID of the contractor (e.g. 'recABCDEF12345678').",
        },
      },
      required: ['contractor_id'],
    },
  },
  {
    name: 'update_onboarding_step',
    description:
      'Update a single field on a Contractor Onboarding record. ' +
      'Use this to advance individual steps such as Checkr Status, Persona Status, ' +
      'Gusto Status, Slack Status, Insightful Status, Onboarding Status, etc.',
    input_schema: {
      type: 'object',
      properties: {
        onboarding_id: {
          type: 'string',
          description: "The Airtable record ID of the onboarding row (e.g. 'recXXX...').",
        },
        field: {
          type: 'string',
          description:
            'The exact field name to update. Valid fields: ' +
            '"Onboarding Status", "Model Submission Date", "20-min Model Score", ' +
            '"90-min Model Score", "Persona Status", "Checkr Status", ' +
            '"Gusto Status", "Insightful Status", "Slack Status", "Folder Access Status".',
        },
        value: {
          description: 'The new value for the field (string, number, or date ISO string).',
        },
      },
      required: ['onboarding_id', 'field', 'value'],
    },
  },
  {
    name: 'list_onboarding_records',
    description:
      'Return all Contractor Onboarding records where Onboarding Status is not "Complete". ' +
      'Use this in the onboarding monitor to get the full list of contractors still in pipeline.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_contractor_by_id',
    description:
      'Retrieve a contractor record from the Contractor Database by Airtable record ID. ' +
      'Use this when you have the record ID (e.g. from a linked field in an onboarding record) ' +
      'but not the email address.',
    input_schema: {
      type: 'object',
      properties: {
        record_id: {
          type: 'string',
          description: "The Airtable record ID of the contractor (e.g. 'recABCDEF12345678').",
        },
      },
      required: ['record_id'],
    },
  },
  {
    name: 'list_contractors_by_source_and_project',
    description:
      'List contractors filtered by their Source and, optionally, by a linked project name.',
    input_schema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'The Source value to filter by (e.g. "LinkedIn", "Referral", "Inbound").',
        },
        project_name: {
          type: 'string',
          description:
            '(Optional) Filter to contractors linked to this project by its Project Name.',
        },
      },
      required: ['source'],
    },
  },
  {
    name: 'create_weekly_activity_record',
    description:
      'Create a new Weekly Activity record to log hours and pay for a contractor on a project.',
    input_schema: {
      type: 'object',
      properties: {
        contractor_id: {
          type: 'string',
          description: "Airtable record ID of the contractor (e.g. 'recXXX...').",
        },
        project_id: {
          type: 'string',
          description: "Airtable record ID of the project (e.g. 'recXXX...').",
        },
        week_of: {
          type: 'string',
          description: 'ISO date string for the Monday that starts the work week (e.g. "2026-03-09").',
        },
        hours: {
          type: 'number',
          description: 'Total hours worked during the week.',
        },
        pay: {
          type: 'number',
          description: 'Total pay amount in USD for the week.',
        },
      },
      required: ['contractor_id', 'project_id', 'week_of', 'hours', 'pay'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool dispatcher — call this from your agentic loop with a tool_use block.
// ---------------------------------------------------------------------------
async function dispatchTool(toolName, input) {
  switch (toolName) {
    case 'get_contractor':
      return get_contractor(input.email);
    case 'update_contractor_status':
      return update_contractor_status(input.email, input.status);
    case 'get_onboarding_record':
      return get_onboarding_record(input.contractor_id);
    case 'update_onboarding_step':
      return update_onboarding_step(input.onboarding_id, input.field, input.value);
    case 'list_onboarding_records':
      return list_onboarding_records();
    case 'get_contractor_by_id':
      return get_contractor_by_id(input.record_id);
    case 'list_contractors_by_source_and_project':
      return list_contractors_by_source_and_project(input.source, input.project_name);
    case 'create_weekly_activity_record':
      return create_weekly_activity_record(
        input.contractor_id,
        input.project_id,
        input.week_of,
        input.hours,
        input.pay
      );
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = {
  get_contractor,
  get_contractor_by_id,
  update_contractor_status,
  get_onboarding_record,
  update_onboarding_step,
  list_onboarding_records,
  list_contractors_by_source_and_project,
  create_weekly_activity_record,
  toolDefs,
  dispatchTool,
};
