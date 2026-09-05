import { readFile, stat } from 'node:fs/promises';
import * as z from 'zod/v4';

const name = z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:$\/-]+$/);
const names = z.array(name).max(2000).refine((values) => new Set(values).size === values.length, 'Duplicate requested name');
const flag = z.boolean();
const dimension = z.number().finite().nonnegative();
const coordinate = z.number().finite();
export const runtimeSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    kind: z.literal('wow-client-observation'), channel: z.literal('retail'),
    clientVersion: z.string().regex(/^\d+\.\d+\.\d+\.\d+$/),
    locale: z.enum(['deDE', 'enUS', 'esES', 'esMX', 'frFR', 'itIT', 'koKR', 'ptBR', 'ruRU', 'zhCN', 'zhTW']),
    collectorVersion: z.literal('1'),
    capturedAt: z.string().datetime(), interfaceVersion: z.number().int().positive(), projectId: z.literal(1),
  }).strict(),
  requested: z.object({ cvars: names, atlases: names, symbols: names, globalStrings: names }).strict(),
  records: z.object({
    cvars: z.array(z.object({ name, defaultValue: z.string().max(65536),
      isStoredServerAccount: flag, isStoredServerCharacter: flag, isLockedFromUser: flag, isSecure: flag, isReadOnly: flag }).strict()).max(2000),
    atlases: z.array(z.object({ name, width: dimension, height: dimension,
      leftTexCoord: coordinate, rightTexCoord: coordinate, topTexCoord: coordinate, bottomTexCoord: coordinate,
      tilesHorizontally: flag, tilesVertically: flag }).strict()).max(2000),
    symbols: z.array(z.object({ name, type: z.enum(['function', 'table', 'string', 'number', 'boolean', 'userdata', 'thread']) }).strict()).max(2000),
    globalStrings: z.array(z.object({ name, value: z.string().max(65536) }).strict()).max(2000),
  }).strict(),
  failed: z.object({ cvars: names, atlases: names, symbols: names, globalStrings: names }).strict(),
  missing: z.object({ cvars: names, atlases: names, symbols: names, globalStrings: names }).strict(),
}).strict().superRefine((data, context) => {
  for (const kind of Object.keys(data.records)) {
    const requested = new Set(data.requested[kind]);
    const found = data.records[kind].map((record) => record.name);
    const accounted = [...found, ...data.failed[kind], ...data.missing[kind]];
    if (new Set(accounted).size !== accounted.length || accounted.some((key) => !requested.has(key))
      || accounted.length !== requested.size) {
      context.addIssue({ code: 'custom', path: ['records', kind], message: 'Records must be unique requested names and separate from failed queries' });
    }
  }
});

export async function loadRuntimeData(file) {
  if (!file) return null;
  if ((await stat(file)).size > 10 * 1024 * 1024) throw new Error('Runtime snapshot exceeds the 10 MB limit');
  let data;
  try { data = JSON.parse(await readFile(file, 'utf8')); } catch { throw new Error('Runtime snapshot must be a data-only JSON file'); }
  const result = runtimeSchema.safeParse(data);
  if (!result.success) throw new Error('Runtime snapshot does not match the documented schema; current CVar values and unrequested fields are not accepted');
  return result.data;
}

export function runtimeLookup(snapshot, name, kind, info, locale) {
  if (!snapshot) return { available: false, reason: 'No local runtime snapshot loaded. Collect selected names with tools/WowApiSnapshot and start with --runtime-data snapshot.json.' };
  if (snapshot.source.clientVersion !== info.clientVersion || (locale && snapshot.source.locale !== locale)) {
    return { available: false, source: snapshot.source, reason: 'The local snapshot does not match the selected build or requested locale.' };
  }
  const category = { cvar: 'cvars', atlas: 'atlases', symbol: 'symbols', globalstring: 'globalStrings' }[kind];
  const requested = snapshot.requested[category].includes(name);
  const entry = snapshot.records[category].find((record) => record.name === name);
  return { available: true, source: snapshot.source, requested, found: Boolean(entry),
    failed: snapshot.failed[category].includes(name), missing: snapshot.missing[category].includes(name), ...(entry ? { entry } : {}),
    limitation: 'An observation from one client session, not a complete registry, API signature, or permission to redistribute captured content. Unrequested or failed queries do not establish absence.' };
}
