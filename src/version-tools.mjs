const SOURCE_FIELDS = new Set(['sourceFile', 'AlternateSourceFiles']);

function stripSource(value) {
  if (Array.isArray(value)) return value.map(stripSource);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SOURCE_FIELDS.has(key))
    .map(([key, nested]) => [key, stripSource(nested)]));
}

export function entryIdentity(entryKind, entry) {
  if (entryKind === 'function') return entry.fullName;
  if (entryKind === 'event') return entry.namespace ? `${entry.namespace}.${entry.literalName}` : entry.literalName;
  if (entryKind === 'system') return `${entry.kind}:${entry.namespace ?? ''}:${entry.name}`;
  return entry.name;
}

export function entryFingerprint(entry) {
  return JSON.stringify(stripSource(entry));
}

function entryMap(store, kind, namespace) {
  const categories = kind ? [[kind, store.categories[kind] ?? []]] : Object.entries(store.categories);
  return new Map(categories.flatMap(([entryKind, entries]) => entries
    .filter((entry) => !namespace || entry.namespace === namespace || entry.fullName?.startsWith(`${namespace}.`))
    .map((entry) => [`${entryKind}\0${entryIdentity(entryKind, entry)}`, { entryKind, entry }])));
}

export async function compareApi(catalog, name, fromVersion, toVersion, kind) {
  const from = catalog.entry(fromVersion);
  const to = catalog.entry(toVersion);
  const [fromStore, toStore] = await Promise.all([catalog.store(from.version), catalog.store(to.version)]);
  const before = new Map(fromStore.lookup(name, kind).map((match) => [`${match.entryKind}\0${entryIdentity(match.entryKind, match.entry)}`, match]));
  const after = new Map(toStore.lookup(name, kind).map((match) => [`${match.entryKind}\0${entryIdentity(match.entryKind, match.entry)}`, match]));
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  return {
    from,
    to,
    comparisons: keys.map((key) => {
      const oldMatch = before.get(key);
      const newMatch = after.get(key);
      const status = !oldMatch ? 'added' : !newMatch ? 'removed'
        : entryFingerprint(oldMatch.entry) === entryFingerprint(newMatch.entry) ? 'unchanged' : 'changed';
      return { identity: key.split('\0')[1], entryKind: (oldMatch ?? newMatch).entryKind, status, before: oldMatch?.entry, after: newMatch?.entry };
    }),
  };
}

export async function diffVersions(catalog, fromVersion, toVersion, { kind, namespace, change = 'all', limit = 50 } = {}) {
  const from = catalog.entry(fromVersion);
  const to = catalog.entry(toVersion);
  const [fromStore, toStore] = await Promise.all([catalog.store(from.version), catalog.store(to.version)]);
  const before = entryMap(fromStore, kind, namespace);
  const after = entryMap(toStore, kind, namespace);
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  const allChanges = keys.map((key) => {
    const oldMatch = before.get(key);
    const newMatch = after.get(key);
    const status = !oldMatch ? 'added' : !newMatch ? 'removed'
      : entryFingerprint(oldMatch.entry) === entryFingerprint(newMatch.entry) ? 'unchanged' : 'changed';
    return { identity: key.split('\0')[1], entryKind: (oldMatch ?? newMatch).entryKind, status };
  }).filter((entry) => entry.status !== 'unchanged');

  const counts = allChanges.reduce((result, entry) => ({ ...result, [entry.status]: result[entry.status] + 1 }), { added: 0, removed: 0, changed: 0 });
  const matchingChanges = change === 'all' ? allChanges : allChanges.filter((entry) => entry.status === change);
  return {
    from,
    to,
    filters: { kind: kind ?? null, namespace: namespace ?? null, change },
    counts,
    total: allChanges.length,
    matching: matchingChanges.length,
    changes: matchingChanges.slice(0, limit),
    truncated: matchingChanges.length > limit,
  };
}

export async function apiHistory(catalog, name, { kind, fromVersion, toVersion } = {}) {
  const versions = catalog.versionsBetween(fromVersion, toVersion);
  const transitions = [];
  let previous = null;

  for (const version of versions) {
    const store = await catalog.store(version.version);
    const matches = store.lookup(name, kind);
    const current = matches.map((match) => ({
      entryKind: match.entryKind,
      identity: entryIdentity(match.entryKind, match.entry),
      fingerprint: entryFingerprint(match.entry),
    })).sort((left, right) => left.identity.localeCompare(right.identity));
    const fingerprint = JSON.stringify(current.map(({ entryKind, identity, fingerprint: hash }) => ({ entryKind, identity, hash })));
    if (previous == null || fingerprint !== previous.fingerprint) {
      const status = previous == null ? (current.length ? 'present' : 'absent')
        : previous.matches.length === 0 ? 'introduced'
          : current.length === 0 ? 'removed' : 'changed';
      transitions.push({ version, status, matches: current.map(({ fingerprint: _, ...match }) => match) });
    }
    previous = { fingerprint, matches: current };
  }

  return { name, kind: kind ?? null, from: versions[0], to: versions.at(-1), transitions };
}
