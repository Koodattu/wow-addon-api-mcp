import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';

import { loadCatalog } from './data-store.mjs';
import {
  datasetLabel,
  formatComparison,
  formatEntry,
  formatHistory,
  formatMatches,
  formatNamespace,
  formatVersionDiff,
  formatVersions,
} from './formatters.mjs';
import { apiHistory, compareApi, diffVersions } from './version-tools.mjs';

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

function versionField(description = 'Retail patch, full client build, build number, or latest') {
  return z.string().optional().describe(description);
}

export async function createServer({ manifestPath, packageVersion = '0.1.0' } = {}) {
  const catalog = await loadCatalog(manifestPath);
  const server = new McpServer({ name: 'wow-addon-api', version: packageVersion }, {
    instructions: 'Use this server for World of Warcraft retail AddOn API facts from patch 10.0.0 through the current mainline patch. Calls default to latest. For addon migrations, resolve the source patch, use compare_api or get_api_history, and keep every claim tied to the dataset label returned by the tool. Treat security metadata such as SecretArguments, HasRestrictions, RequiresUnitAuraAccess, and ConditionalSecretContents as authoritative constraints. Historical presence does not by itself prove an official replacement.',
  });

  server.registerTool('get_dataset_info', {
    description: 'Report the resolved WoW retail dataset, upstream commit, entry counts, and archive coverage.',
    annotations: READ_ONLY,
    inputSchema: { version: versionField() },
  }, async ({ version }) => textResponse(JSON.stringify(catalog.info(version), null, 2)));

  server.registerTool('list_versions', {
    description: 'List every bundled retail patch snapshot, build, date, and source commit. Use this before migration comparisons.',
    annotations: READ_ONLY,
  }, async () => textResponse(formatVersions(catalog.listVersions())));

  server.registerTool('lookup_api', {
    description: 'Look up an exact WoW API function, method, event, enum, structure, widget, or system in one retail patch.',
    annotations: READ_ONLY,
    inputSchema: {
      name: z.string().min(1).describe('Exact full or short name, for example C_UnitAuras.GetAuraDataByIndex or AuraContainer'),
      kind: z.enum(KINDS).optional().describe('Optional result category'),
      version: versionField(),
    },
  }, async ({ name, kind, version }) => {
    const info = catalog.entry(version);
    const store = await catalog.store(info.version);
    return textResponse(formatMatches(store.lookup(name, kind), info));
  });

  server.registerTool('search_api', {
    description: 'Search API names and official documentation text within one retail patch. Exact and prefix matches rank first.',
    annotations: READ_ONLY,
    inputSchema: {
      query: z.string().min(1).describe('Name fragment or documentation term'),
      kind: z.enum(KINDS).optional().describe('Optional result category'),
      version: versionField(),
      limit: z.number().int().min(1).max(50).default(20).describe('Maximum results'),
    },
  }, async ({ query, kind, version, limit }) => {
    const info = catalog.entry(version);
    const store = await catalog.store(info.version);
    return textResponse(formatMatches(store.search(query, { kind, limit }), info));
  });

  server.registerTool('get_namespace', {
    description: 'List functions, events, types, and systems belonging to an exact namespace in one retail patch.',
    annotations: READ_ONLY,
    inputSchema: {
      namespace: z.string().min(1).describe('Namespace such as C_UnitAuras or C_Discord'),
      version: versionField(),
    },
  }, async ({ namespace, version }) => {
    const info = catalog.entry(version);
    const store = await catalog.store(info.version);
    return textResponse(formatNamespace(namespace, store.namespace(namespace), info));
  });

  server.registerTool('get_widget_methods', {
    description: 'Get a ScriptObject or FrameXML intrinsic widget and its public methods in one retail patch.',
    annotations: READ_ONLY,
    inputSchema: {
      name: z.string().min(1).describe('Widget name such as Frame, AuraButton, or AuraContainer'),
      version: versionField(),
      include_inherited: z.boolean().default(true).describe('Include methods inherited from documented parent widgets'),
    },
  }, async ({ name, version, include_inherited }) => {
    const info = catalog.entry(version);
    const store = await catalog.store(info.version);
    const widget = store.widget(name, include_inherited);
    return textResponse(widget
      ? `Dataset: ${datasetLabel(info)}\n\n${formatEntry('widget', widget, info.commit)}`
      : `Dataset: ${datasetLabel(info)}\n\nNo matching WoW widget found.`);
  });

  server.registerTool('get_enum', {
    description: 'Get an exact WoW enumeration and all values and metadata in one retail patch.',
    annotations: READ_ONLY,
    inputSchema: {
      name: z.string().min(1).describe('Enumeration name, with or without the Enum. prefix'),
      version: versionField(),
    },
  }, async ({ name, version }) => {
    const info = catalog.entry(version);
    const store = await catalog.store(info.version);
    const match = store.lookup(name, 'enumeration')[0];
    return textResponse(match
      ? `Dataset: ${datasetLabel(info)}\n\n${formatEntry(match.entryKind, match.entry, info.commit)}`
      : `Dataset: ${datasetLabel(info)}\n\nNo matching WoW enumeration found.`);
  });

  server.registerTool('get_event', {
    description: 'Get an exact WoW frame event, payload, and restrictions in one retail patch.',
    annotations: READ_ONLY,
    inputSchema: {
      name: z.string().min(1).describe('Literal event name such as PLAYER_LOGIN or UNIT_AURA'),
      version: versionField(),
    },
  }, async ({ name, version }) => {
    const info = catalog.entry(version);
    const store = await catalog.store(info.version);
    const match = store.lookup(name, 'event')[0];
    return textResponse(match
      ? `Dataset: ${datasetLabel(info)}\n\n${formatEntry(match.entryKind, match.entry, info.commit)}`
      : `Dataset: ${datasetLabel(info)}\n\nNo matching WoW event found.`);
  });

  server.registerTool('search_restrictions', {
    description: 'Find APIs carrying combat, secret-value, taint, secure-code, or unit-aura restrictions in one retail patch.',
    annotations: READ_ONLY,
    inputSchema: {
      query: z.string().default('').describe('Optional API name or documentation filter'),
      version: versionField(),
      limit: z.number().int().min(1).max(100).default(50).describe('Maximum results'),
    },
  }, async ({ query, version, limit }) => {
    const info = catalog.entry(version);
    const store = await catalog.store(info.version);
    const matches = store.restrictions(query, limit).map((entry) => ({ entryKind: 'function', entry }));
    return textResponse(formatMatches(matches, info));
  });

  server.registerTool('compare_api', {
    description: 'Compare one exact API, event, enum, structure, widget, or system between two retail patches.',
    annotations: READ_ONLY,
    inputSchema: {
      name: z.string().min(1).describe('Exact full API or object name'),
      from_version: z.string().describe('Older retail patch or build'),
      to_version: z.string().default('latest').describe('Newer retail patch or build'),
      kind: z.enum(KINDS).optional().describe('Optional result category'),
    },
  }, async ({ name, from_version, to_version, kind }) => textResponse(formatComparison(
    await compareApi(catalog, name, from_version, to_version, kind),
  )));

  server.registerTool('diff_versions', {
    description: 'List APIs added, removed, or structurally changed between two retail patches, with optional kind and namespace filters.',
    annotations: READ_ONLY,
    inputSchema: {
      from_version: z.string().describe('Older retail patch or build'),
      to_version: z.string().default('latest').describe('Newer retail patch or build'),
      kind: z.enum(KINDS).optional().describe('Optional result category'),
      namespace: z.string().optional().describe('Optional exact C_ namespace'),
      change: z.enum(['all', 'added', 'removed', 'changed']).default('all').describe('Change type filter'),
      limit: z.number().int().min(1).max(100).default(50).describe('Maximum listed changes'),
    },
  }, async ({ from_version, to_version, kind, namespace, change, limit }) => textResponse(formatVersionDiff(
    await diffVersions(catalog, from_version, to_version, { kind, namespace, change, limit }),
  )));

  server.registerTool('get_api_history', {
    description: 'Show the retail patches where one exact API appeared, disappeared, or changed structure.',
    annotations: READ_ONLY,
    inputSchema: {
      name: z.string().min(1).describe('Exact full API or object name'),
      kind: z.enum(KINDS).optional().describe('Optional result category'),
      from_version: versionField('Optional first patch; defaults to the oldest bundled retail patch'),
      to_version: versionField('Optional last patch; defaults to latest'),
    },
  }, async ({ name, kind, from_version, to_version }) => textResponse(formatHistory(
    await apiHistory(catalog, name, { kind, fromVersion: from_version, toVersion: to_version }),
  )));

  return { server, catalog };
}
