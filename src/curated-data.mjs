import { readFile } from 'node:fs/promises';

export async function loadCuratedData() {
  const data = JSON.parse(await readFile(new URL('../data/curated/engine-apis.json', import.meta.url), 'utf8'));
  if (data.schemaVersion !== 1) throw new Error('Unsupported curated documentation schema');
  return data;
}

export function curatedLookup(data, name, info, { migration = false } = {}) {
  const records = migration ? data.migrations : data.entries;
  const entry = records.find((record) => record.name === name.trim());
  const available = Boolean(entry && data.reviewedClientVersion === info.clientVersion);
  return {
    available, sourceKind: data.sourceKind, reviewedClientVersion: data.reviewedClientVersion,
    selectedClientVersion: info.clientVersion, license: data.license, licenseUrl: data.licenseUrl,
    attribution: data.attribution, validation: data.validation,
    ...(!available ? { reason: entry ? 'This contract has not been reviewed for the selected build; no historical or future applicability is inferred.' : 'No curated record is available for this name.' } : { entry }),
  };
}
