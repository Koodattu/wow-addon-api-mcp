function title(entryKind, entry) {
  return entry.fullName ?? entry.literalName ?? entry.name ?? entryKind;
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

export function formatEntry(entryKind, entry) {
  const lines = [`## ${title(entryKind, entry)}`, '', `Kind: ${entryKind}`];
  if (entry.namespace) lines.push(`Namespace: ${entry.namespace}`);
  if (entry.owner) lines.push(`Owner: ${entry.owner}`);
  if (entry.sourceKind) lines.push(`Source kind: ${entry.sourceKind}`);
  if (entry.documentation?.length) lines.push('', entry.documentation.join('\n\n'));
  lines.push(section('Arguments', entry.arguments), section('Returns', entry.returns), section('Payload', entry.payload), section('Fields', entry.fields), section('Methods', entry.methods?.map(formatMethod).join('\n')), section('Metadata', entry.metadata));
  lines.push(`\nSource: https://github.com/Gethe/wow-ui-source/blob/${entry.sourceCommit ?? 'live'}/${entry.sourceFile}`);
  return lines.filter((line) => line !== '').join('\n').trim();
}

export function formatMatches(matches) {
  if (matches.length === 0) return 'No matching WoW API entries found.';
  return matches.map(({ entryKind, entry }) => formatEntry(entryKind, entry)).join('\n\n---\n\n');
}

export function formatNamespace(namespace, result) {
  const names = (entries) => entries.map((entry) => entry.fullName ?? entry.literalName ?? entry.name);
  return `# ${namespace}\n${section('Systems', names(result.systems))}${section('Functions and methods', names(result.functions))}${section('Events', names(result.events))}${section('Types', names(result.types))}`.trim();
}
