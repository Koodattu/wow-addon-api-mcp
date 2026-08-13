import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { parseLuaDocumentationSource, parseLuaMixinsSource } from './lua-doc-parser.mjs';
import { publicWidgetName, widgetParents } from './widget-names.mjs';

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

async function walkFiles(root, extension) {
  const files = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(fullPath, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) files.push(fullPath);
  }
  return files;
}

function documentation(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((line) => typeof line === 'string');
}

function metadataOf(value, omitted) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.has(key)));
}

const COMMON_OMITTED = new Set(['Name', 'Type', 'Documentation']);
const FUNCTION_OMITTED = new Set([...COMMON_OMITTED, 'Arguments', 'Returns']);
const EVENT_OMITTED = new Set([...COMMON_OMITTED, 'LiteralName', 'Payload']);
const TABLE_OMITTED = new Set([...COMMON_OMITTED, 'Fields']);

function normalizeFunction(raw, context) {
  const isMethod = context.kind === 'method';
  const fullName = isMethod
    ? `${context.owner}:${raw.Name}`
    : context.namespace
      ? `${context.namespace}.${raw.Name}`
      : raw.Name;

  return {
    name: raw.Name,
    fullName,
    namespace: context.namespace ?? null,
    owner: context.owner ?? null,
    kind: context.kind,
    documentation: documentation(raw.Documentation),
    arguments: Array.isArray(raw.Arguments) ? raw.Arguments : [],
    returns: Array.isArray(raw.Returns) ? raw.Returns : [],
    metadata: metadataOf(raw, FUNCTION_OMITTED),
    sourceFile: context.sourceFile,
    sourceKind: context.sourceKind,
  };
}

function normalizeEvent(raw, context) {
  return {
    name: raw.Name,
    literalName: raw.LiteralName ?? raw.Name,
    namespace: context.namespace ?? null,
    documentation: documentation(raw.Documentation),
    payload: Array.isArray(raw.Payload) ? raw.Payload : [],
    metadata: metadataOf(raw, EVENT_OMITTED),
    sourceFile: context.sourceFile,
  };
}

function normalizeTable(raw, context) {
  return {
    name: raw.Name,
    kind: raw.Type ?? 'Structure',
    namespace: context.namespace ?? null,
    documentation: documentation(raw.Documentation),
    fields: Array.isArray(raw.Fields) ? raw.Fields : [],
    metadata: metadataOf(raw, TABLE_OMITTED),
    sourceFile: context.sourceFile,
  };
}

function parseAttributes(source) {
  return Object.fromEntries([...source.matchAll(/([\w:.-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

async function extractIntrinsicWidgets(interfaceRoot, sourceRoot) {
  const xmlFiles = await walkFiles(interfaceRoot, '.xml');
  const widgets = [];
  const sourceDirectories = new Set();

  for (const file of xmlFiles) {
    const source = await readFile(file, 'utf8');
    const elementPattern = /<([A-Za-z][\w]*)\b([^>]*\bintrinsic="true"[^>]*)>/g;
    for (const match of source.matchAll(elementPattern)) {
      const baseType = match[1];
      const attributes = parseAttributes(match[2]);
      if (!attributes.name) continue;

      const closingIndex = source.indexOf(`</${baseType}>`, match.index + match[0].length);
      const body = source.slice(match.index + match[0].length, closingIndex === -1 ? match.index + match[0].length + 4000 : closingIndex);
      const mixins = [...body.matchAll(/<Mixin\b([^>]*)\/?\s*>/g)]
        .map((mixinMatch) => parseAttributes(mixinMatch[1]))
        .filter((mixin) => mixin.key && (mixin.source !== 'secure' || mixin.targetPartition === 'public'));

      widgets.push({
        name: attributes.name,
        baseType,
        mixins,
        sourceFile: toPosix(path.relative(sourceRoot, file)),
      });
      sourceDirectories.add(path.dirname(file));
    }
  }

  const methodsByMixin = new Map();
  const parentsByMixin = new Map();
  for (const directory of sourceDirectories) {
    for (const file of await walkFiles(directory, '.lua')) {
      let parsed;
      try {
        parsed = parseLuaMixinsSource(await readFile(file, 'utf8'), file);
      } catch {
        continue;
      }
      const sourceFile = toPosix(path.relative(sourceRoot, file));
      for (const method of parsed.methods) {
        const methods = methodsByMixin.get(method.owner) ?? [];
        methods.push({ ...method, sourceFile });
        methodsByMixin.set(method.owner, methods);
      }
      for (const inheritance of parsed.inheritance) {
        parentsByMixin.set(inheritance.target, inheritance.parents);
      }
    }
  }

  function resolveMixinMethods(mixin, seen = new Set()) {
    if (seen.has(mixin)) return [];
    seen.add(mixin);
    const ownMethods = methodsByMixin.get(mixin) ?? [];
    const inheritedMethods = (parentsByMixin.get(mixin) ?? []).flatMap((parent) => resolveMixinMethods(parent, seen));
    return [...ownMethods, ...inheritedMethods];
  }

  return widgets.map((widget) => {
    const methods = new Map();
    for (const mixin of widget.mixins) {
      for (const method of resolveMixinMethods(mixin.key)) {
        if (!methods.has(method.name)) methods.set(method.name, method);
      }
    }
    return {
      name: widget.name,
      kind: 'Intrinsic',
      inherits: [widget.baseType],
      documentation: [],
      metadata: { Mixins: widget.mixins },
      sourceFile: widget.sourceFile,
      methods: [...methods.values()].map((method) => ({
        name: method.name,
        fullName: `${widget.name}:${method.name}`,
        namespace: null,
        owner: widget.name,
        kind: 'method',
        documentation: [],
        arguments: method.arguments,
        returns: [],
        metadata: { SourceMixin: method.owner },
        sourceFile: method.sourceFile,
        sourceKind: 'framexml',
      })),
    };
  });
}

function deduplicate(items, key, label) {
  const result = new Map();
  for (const item of items) {
    const itemKey = key(item);
    const existing = result.get(itemKey);
    if (existing && JSON.stringify(existing) !== JSON.stringify(item)) {
      throw new Error(`Conflicting ${label} entries for ${itemKey}: ${existing.sourceFile} and ${item.sourceFile}`);
    }
    result.set(itemKey, item);
  }
  return [...result.values()];
}

export async function extractDataset(sourceRoot, source) {
  const documentationRoot = path.join(sourceRoot, 'Interface', 'AddOns', 'Blizzard_APIDocumentationGenerated');
  const documentationFiles = (await walkFiles(documentationRoot, '.lua')).sort();
  const systems = [];
  const functions = [];
  const events = [];
  const types = [];
  const widgets = [];

  for (const file of documentationFiles) {
    const sourceFile = toPosix(path.relative(sourceRoot, file));
    const raw = parseLuaDocumentationSource(await readFile(file, 'utf8'), sourceFile);
    const namespace = raw.Namespace ?? null;
    const isWidget = (raw.Type ?? 'System') === 'ScriptObject';
    const systemName = isWidget ? publicWidgetName(raw.Name) : raw.Name;
    const system = {
      name: systemName,
      kind: raw.Type ?? 'System',
      namespace,
      documentation: documentation(raw.Documentation),
      metadata: {
        ...metadataOf(raw, new Set([...COMMON_OMITTED, 'Namespace', 'Functions', 'Events', 'Tables'])),
        ...(systemName === raw.Name ? {} : { BlizzardSystemName: raw.Name }),
      },
      sourceFile,
    };
    systems.push(system);

    const systemFunctions = (Array.isArray(raw.Functions) ? raw.Functions : []).map((entry) => normalizeFunction(entry, {
      namespace: isWidget ? null : namespace,
      owner: isWidget ? systemName : null,
      kind: isWidget ? 'method' : 'function',
      sourceFile,
      sourceKind: 'blizzard-documentation',
    }));
    functions.push(...systemFunctions);

    if (isWidget) {
      widgets.push({
        name: system.name,
        kind: 'ScriptObject',
        inherits: Array.isArray(raw.Inherits) ? raw.Inherits : raw.Parent ? [raw.Parent] : widgetParents(system.name),
        documentation: system.documentation,
        metadata: system.metadata,
        sourceFile,
        methods: systemFunctions,
      });
    }

    events.push(...(Array.isArray(raw.Events) ? raw.Events : []).map((entry) => normalizeEvent(entry, { namespace, sourceFile })));
    types.push(...(Array.isArray(raw.Tables) ? raw.Tables : []).map((entry) => normalizeTable(entry, { namespace, sourceFile })));
  }

  const intrinsicWidgets = await extractIntrinsicWidgets(path.join(sourceRoot, 'Interface'), sourceRoot);
  for (const intrinsic of intrinsicWidgets) {
    const existing = widgets.find((widget) => widget.name === intrinsic.name);
    if (existing) {
      const methodNames = new Set(existing.methods.map((method) => method.name));
      for (const method of intrinsic.methods) {
        if (!methodNames.has(method.name)) existing.methods.push(method);
      }
      existing.metadata.Intrinsic = intrinsic.metadata;
      existing.inherits = [...new Set([...existing.inherits, ...intrinsic.inherits])];
    } else {
      widgets.push(intrinsic);
    }
    functions.push(...intrinsic.methods);
  }

  const normalizedFunctions = deduplicate(functions, (entry) => entry.fullName, 'function')
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const normalizedEvents = deduplicate(events, (entry) => `${entry.literalName}\0${entry.namespace ?? ''}`, 'event')
    .sort((a, b) => a.literalName.localeCompare(b.literalName));
  const normalizedTypes = deduplicate(types, (entry) => entry.name, 'type')
    .sort((a, b) => a.name.localeCompare(b.name));
  const normalizedWidgets = deduplicate(widgets, (entry) => entry.name, 'widget')
    .map((widget) => ({ ...widget, methods: widget.methods.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const normalizedSystems = deduplicate(systems, (entry) => `${entry.kind}\0${entry.name}\0${entry.namespace ?? ''}`, 'system')
    .sort((a, b) => a.name.localeCompare(b.name));

  const enumerations = normalizedTypes.filter((entry) => entry.kind === 'Enumeration');
  const structures = normalizedTypes.filter((entry) => entry.kind !== 'Enumeration');

  return {
    schemaVersion: 1,
    source,
    stats: {
      systems: normalizedSystems.length,
      functions: normalizedFunctions.filter((entry) => entry.kind === 'function').length,
      methods: normalizedFunctions.filter((entry) => entry.kind === 'method').length,
      events: normalizedEvents.length,
      enumerations: enumerations.length,
      structures: structures.length,
      widgets: normalizedWidgets.length,
    },
    systems: normalizedSystems,
    functions: normalizedFunctions,
    events: normalizedEvents,
    enumerations,
    structures,
    widgets: normalizedWidgets,
  };
}
