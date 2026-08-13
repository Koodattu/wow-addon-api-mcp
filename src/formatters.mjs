function title(entryKind, entry) {
  return entry.fullName ?? entry.literalName ?? entry.name ?? entryKind;
}

export function datasetLabel(info) {
  const entry = info.selected ?? info;
  return `Retail ${entry.version} build ${entry.build ?? 'unknown'} (${entry.clientVersion})`;
}

function section(label, value) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0) || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)) return '';
  const body = typeof value === 'string' ? value : `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
  return `\n### ${label}\n\n${body}\n`;
}

function typeOf(value) {
  const base = value.Type ?? 'unknown';
  const container = value.InnerType ? `${base}<${value.InnerType}>` : base;
  return `${container}${value.Nilable ? '?' : ''}`;
}

function formatMethod(method) {
  const argumentsText = method.arguments.map((argument) => `${argument.Name}: ${typeOf(argument)}`).join(', ');
  const returnsText = method.returns.length > 0
    ? ` -> ${method.returns.map((value) => `${value.Name ? `${value.Name}: ` : ''}${typeOf(value)}`).join(', ')}`
    : '';
  const metadata = Object.keys(method.metadata).length > 0 ? ` ${JSON.stringify(method.metadata)}` : '';
  return `${method.fullName}(${argumentsText})${returnsText}${metadata}`;
}

export function formatEntry(entryKind, entry, sourceCommit = 'live') {
  const lines = [`## ${title(entryKind, entry)}`, '', `Kind: ${entryKind}`];
  if (entry.namespace) lines.push(`Namespace: ${entry.namespace}`);
  if (entry.owner) lines.push(`Owner: ${entry.owner}`);
  if (entry.sourceKind) lines.push(`Source kind: ${entry.sourceKind}`);
  if (entry.documentation?.length) lines.push('', entry.documentation.join('\n\n'));
  lines.push(section('Arguments', entry.arguments), section('Returns', entry.returns), section('Payload', entry.payload), section('Fields', entry.fields), section('Methods', entry.methods?.map(formatMethod).join('\n')), section('Metadata', entry.metadata));
  lines.push(`\nSource: https://github.com/Gethe/wow-ui-source/blob/${sourceCommit}/${entry.sourceFile}`);
  return lines.filter((line) => line !== '').join('\n').trim();
}

export function formatMatches(matches, info) {
  const header = info ? `Dataset: ${datasetLabel(info)}\n\n` : '';
  if (matches.length === 0) return `${header}No matching WoW API entries found.`;
  return `${header}${matches.map(({ entryKind, entry }) => formatEntry(entryKind, entry, info?.commit ?? info?.selected?.commit)).join('\n\n---\n\n')}`;
}

export function formatNamespace(namespace, result, info) {
  const names = (entries) => entries.map((entry) => entry.fullName ?? entry.literalName ?? entry.name);
  return `Dataset: ${datasetLabel(info)}\n\n# ${namespace}\n${section('Systems', names(result.systems))}${section('Functions and methods', names(result.functions))}${section('Events', names(result.events))}${section('Types', names(result.types))}`.trim();
}

export function formatVersions(entries) {
  return [`# Supported retail versions (${entries.length})`, '', ...entries.map((entry) => (
    `- ${entry.version}${entry.default ? ' (latest)' : ''}: build ${entry.build}, ${entry.commitDate.slice(0, 10)}, commit ${entry.commit.slice(0, 12)}`
  ))].join('\n');
}

export function formatComparison(result) {
  const lines = [`# API comparison: ${datasetLabel(result.from)} → ${datasetLabel(result.to)}`, ''];
  if (result.comparisons.length === 0) return `${lines.join('\n')}No exact matching entry exists in either version.`;
  for (const comparison of result.comparisons) {
    lines.push(`## ${comparison.identity}`, '', `Kind: ${comparison.entryKind}`, `Status: ${comparison.status}`);
    if (comparison.status === 'changed' || comparison.status === 'removed') lines.push(section('Before', comparison.before));
    if (comparison.status === 'changed' || comparison.status === 'added') lines.push(section('After', comparison.after));
  }
  return lines.join('\n').trim();
}

export function formatVersionDiff(result) {
  const lines = [
    `# Version diff: ${datasetLabel(result.from)} → ${datasetLabel(result.to)}`,
    '',
    `Changes: ${result.total} (added ${result.counts.added}, removed ${result.counts.removed}, changed ${result.counts.changed})`,
    '',
    ...result.changes.map((entry) => `- [${entry.status}] ${entry.entryKind}: ${entry.identity}`),
  ];
  if (result.filters.change !== 'all') lines.splice(4, 0, `Showing ${result.matching} ${result.filters.change} entries.`, '');
  if (result.truncated) lines.push('', `Results truncated; increase limit up to 100 (matching ${result.matching}).`);
  return lines.join('\n');
}

export function formatHistory(result) {
  const lines = [
    `# API history: ${result.name}`,
    '',
    `Range: ${datasetLabel(result.from)} → ${datasetLabel(result.to)}`,
    '',
  ];
  if (result.transitions.length === 0) return `${lines.join('\n')}No history found.`;
  for (const transition of result.transitions) {
    const matches = transition.matches.length ? transition.matches.map((match) => `${match.entryKind}:${match.identity}`).join(', ') : 'none';
    lines.push(`- ${transition.version.version} build ${transition.version.build}: ${transition.status} (${matches})`);
  }
  return lines.join('\n');
}
