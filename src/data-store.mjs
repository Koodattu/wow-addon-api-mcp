import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
const DEFAULT_DATASET = new URL('../data/mainline.json.gz', import.meta.url);
const SECURITY_KEY = /(secret|restriction|taint|unsecure|secure|combat|unittoken|unitaura|forbidden|protected)/i;

function normalized(value) {
  return value.toLocaleLowerCase('en-US');
}

function score(entry, query) {
  const names = [entry.fullName, entry.literalName, entry.name, entry.namespace].filter(Boolean).map(normalized);
  if (names.includes(query)) return 0;
  if (names.some((name) => name.startsWith(query))) return 1;
  if (names.some((name) => name.includes(query))) return 2;
  const documentation = (entry.documentation ?? []).join(' ').toLocaleLowerCase('en-US');
  return documentation.includes(query) ? 3 : Number.POSITIVE_INFINITY;
}

function hasSecurityMetadata(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => (
    (SECURITY_KEY.test(key) && nested !== false && nested != null) || hasSecurityMetadata(nested)
  ));
}

export class WowApiStore {
  constructor(dataset) {
    this.dataset = dataset;
    this.categories = {
      function: dataset.functions,
      event: dataset.events,
      enumeration: dataset.enumerations,
      structure: dataset.structures,
      widget: dataset.widgets,
      system: dataset.systems,
    };
  }

  info() {
    return { schemaVersion: this.dataset.schemaVersion, source: this.dataset.source, stats: this.dataset.stats };
  }

  search(query, { kind, limit = 20 } = {}) {
    const needle = normalized(query.trim());
    if (!needle) return [];
    const categories = kind ? [[kind, this.categories[kind] ?? []]] : Object.entries(this.categories);
    return categories
      .flatMap(([entryKind, entries]) => entries.map((entry) => ({ entryKind, entry, rank: score(entry, needle) })))
      .filter((result) => Number.isFinite(result.rank))
      .sort((a, b) => a.rank - b.rank || (a.entry.fullName ?? a.entry.literalName ?? a.entry.name).localeCompare(b.entry.fullName ?? b.entry.literalName ?? b.entry.name))
      .slice(0, Math.min(Math.max(limit, 1), 50));
  }

  lookup(name, kind) {
    const needle = normalized(name.trim());
    const needles = new Set([needle]);
    if (needle.startsWith('enum.')) needles.add(needle.slice(5));
    const categories = kind ? [[kind, this.categories[kind] ?? []]] : Object.entries(this.categories);
    const matches = categories.flatMap(([entryKind, entries]) => entries
      .filter((entry) => [
        entry.fullName,
        entry.literalName,
        entry.name,
        ...(entryKind === 'system' ? [entry.namespace] : []),
      ].filter(Boolean).some((value) => needles.has(normalized(value))))
      .map((entry) => ({ entryKind, entry })));

    if (matches.length === 0 && (!kind || kind === 'function') && name.includes(':')) {
      const separator = name.indexOf(':');
      const widget = this.widget(name.slice(0, separator));
      const methodName = normalized(name.slice(separator + 1));
      const method = widget?.methods.find((entry) => normalized(entry.name) === methodName);
      if (method) matches.push({ entryKind: 'function', entry: method });
    }
    return matches;
  }

  namespace(namespace) {
    const needle = normalized(namespace.trim());
    return {
      systems: this.dataset.systems.filter((entry) => normalized(entry.namespace ?? entry.name) === needle),
      functions: this.dataset.functions.filter((entry) => normalized(entry.namespace ?? '') === needle),
      events: this.dataset.events.filter((entry) => normalized(entry.namespace ?? '') === needle),
      types: [...this.dataset.enumerations, ...this.dataset.structures].filter((entry) => normalized(entry.namespace ?? '') === needle),
    };
  }

  widget(name, includeInherited = true) {
    const direct = this.lookup(name, 'widget')[0]?.entry;
    if (!direct || !includeInherited) return direct;

    const methods = new Map(direct.methods.map((method) => [method.name, method]));
    const visited = new Set([direct.name]);
    const addParents = (widget) => {
      for (const parentName of widget.inherits ?? []) {
        if (visited.has(parentName)) continue;
        visited.add(parentName);
        const parent = this.lookup(parentName, 'widget')[0]?.entry;
        if (!parent) continue;
        for (const method of parent.methods) {
          if (!methods.has(method.name)) methods.set(method.name, method);
        }
        addParents(parent);
      }
    };
    addParents(direct);
    return { ...direct, methods: [...methods.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  }

  restrictions(query = '', limit = 50) {
    const needle = normalized(query.trim());
    return this.dataset.functions
      .filter((entry) => hasSecurityMetadata(entry.metadata) || entry.arguments.some(hasSecurityMetadata) || entry.returns.some(hasSecurityMetadata))
      .filter((entry) => !needle || normalized(`${entry.fullName} ${(entry.documentation ?? []).join(' ')}`).includes(needle))
      .slice(0, Math.min(Math.max(limit, 1), 100));
  }
}

export async function loadStore(datasetPath = DEFAULT_DATASET) {
  const buffer = await readFile(datasetPath);
  return new WowApiStore(JSON.parse(gunzipSync(buffer)));
}
