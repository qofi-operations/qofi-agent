/**
 * Aggregates all tool modules into a single toolDefs array and dispatchTool function
 * for use in the Claude API agentic loop.
 */

'use strict';

const airtable = require('./airtable');
const persona = require('./persona');
const insightful = require('./insightful');
const gmail = require('./gmail');

const MODULES = [airtable, persona, insightful, gmail];

const toolDefs = MODULES.flatMap((m) => m.toolDefs);

async function dispatchTool(toolName, input) {
  for (const mod of MODULES) {
    try {
      return await mod.dispatchTool(toolName, input);
    } catch (err) {
      if (err.message.startsWith('Unknown tool:')) continue;
      throw err;
    }
  }
  throw new Error(`Unknown tool: ${toolName}`);
}

module.exports = { toolDefs, dispatchTool };
