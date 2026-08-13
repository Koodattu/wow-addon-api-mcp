import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';

import { loadStore } from './data-store.mjs';
import { formatEntry, formatMatches, formatNamespace } from './formatters.mjs';

const KINDS = ['function', 'event', 'enumeration', 'structure', 'widget', 'system'];
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function textResponse(text) {
  return { content: [{ type: 'text', text }] };
}

export async function createServer({ datasetPath, version = '0.1.0' } = {}) {
  const store = await loadStore(datasetPath);
  const server = new McpServer({ name: 'wow-addon-api', version }, {
    instructions: 'Use this server for current World of Warcraft mainline AddOn API facts. Prefer exact lookup before search. Treat security metadata such as SecretArguments, HasRestrictions, RequiresUnitAuraAccess, and ConditionalSecretContents as authoritative constraints. Results come from Blizzard UI source mirrored by Gethe and bundled with this package.',
  });

  server.registerTool('get_dataset_info', {
    description: 'Report the bundled WoW client version, upstream commit, and API entry counts.',
    annotations: READ_ONLY,
  }, async () => textResponse(JSON.stringify(store.info(), null, 2)));

  server.registerTool('lookup_api', {
    description: 'Look up an exact WoW API function, method, event, enum, structure, widget, or system name.',
    annotations: READ_ONLY,
    inputSchema: {
      name: z.string().min(1).describe('Exact full or short name, for example C_UnitAuras.GetAuraDataByIndex or AuraContainer'),
      kind: z.enum(KINDS).optional().describe('Optional result category'),
    },
  }, async ({ name, kind }) => textResponse(formatMatches(store.lookup(name, kind))));

  server.registerTool('search_api', {
    description: 'Search WoW API names and official documentation text. Exact and prefix matches rank first.',
    annotations: READ_ONLY,
    inputSchema: {
      query: z.string().min(1).describe('Name fragment or documentation term'),
      kind: z.enum(KINDS).optional().describe('Optional result category'),
      limit: z.number().int().min(1).max(50).default(20).describe('Maximum results'),
    },
  }, async ({ query, kind, limit }) => textResponse(formatMatches(store.search(query, { kind, limit }))));

  server.registerTool('get_namespace', {
    description: 'List functions, events, types, and systems belonging to an exact WoW API namespace.',
    annotations: READ_ONLY,
    inputSchema: {
      namespace: z.string().min(1).describe('Namespace such as C_UnitAuras or C_Discord'),
    },
  }, async ({ namespace }) => textResponse(formatNamespace(namespace, store.namespace(namespace))));

  server.registerTool('get_widget_methods', {
    description: 'Get a WoW ScriptObject or FrameXML intrinsic widget and its public methods.',
    annotations: READ_ONLY,
    inputSchema: {
      name: z.string().min(1).describe('Widget name such as Frame, AuraButton, or AuraContainer'),
      include_inherited: z.boolean().default(true).describe('Include methods inherited from documented parent widgets'),
    },
  }, async ({ name, include_inherited }) => {
    const widget = store.widget(name, include_inherited);
    return textResponse(widget ? formatEntry('widget', widget) : 'No matching WoW widget found.');
  });

  server.registerTool('get_enum', {
    description: 'Get an exact WoW enumeration and all of its values and metadata.',
    annotations: READ_ONLY,
    inputSchema: {
      name: z.string().min(1).describe('Enumeration name, with or without the Enum. prefix'),
    },
  }, async ({ name }) => {
    const normalizedName = name.startsWith('Enum.') ? name.slice(5) : name;
    const match = store.lookup(normalizedName, 'enumeration')[0];
    return textResponse(match ? formatEntry(match.entryKind, match.entry) : 'No matching WoW enumeration found.');
  });

  server.registerTool('get_event', {
    description: 'Get an exact WoW frame event and its documented payload and restrictions.',
    annotations: READ_ONLY,
    inputSchema: {
      name: z.string().min(1).describe('Literal event name such as PLAYER_LOGIN or UNIT_AURA'),
    },
  }, async ({ name }) => {
    const match = store.lookup(name, 'event')[0];
    return textResponse(match ? formatEntry(match.entryKind, match.entry) : 'No matching WoW event found.');
  });

  server.registerTool('search_restrictions', {
    description: 'Find APIs carrying combat, secret-value, taint, secure-code, or unit-aura access restrictions.',
    annotations: READ_ONLY,
    inputSchema: {
      query: z.string().default('').describe('Optional API name or documentation filter'),
      limit: z.number().int().min(1).max(100).default(50).describe('Maximum results'),
    },
  }, async ({ query, limit }) => textResponse(formatMatches(store.restrictions(query, limit).map((entry) => ({ entryKind: entry.kind, entry })))));

  return { server, store };
}
