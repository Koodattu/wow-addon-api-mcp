import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import path from 'node:path';

import { evaluateNode, memberName, parseLuaSource } from './lua-doc-parser.mjs';

const words = (value = '') => value.toLowerCase().split(/[\s,]+/).filter(Boolean);
const retail = (value) => words(value).some((word) => word === 'mainline' || word === 'standard');

export function parseAttributes(source) {
  return Object.fromEntries([...source.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1], match[2] ?? match[3]]));
}

function allowed(attributes) {
  const lower = Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key.toLowerCase(), value]));
  return (!lower.allowloadgametype || retail(lower.allowloadgametype))
    && (!lower.excludeloadgametype || !retail(lower.excludeloadgametype))
    && (!lower.allowload || words(lower.allowload).some((word) => word === 'game' || word === 'both'));
}

export function parseResourceXml(source) {
  const cleaned = source.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, (text) => text.replace(/[^\n]/g, ' '));
  const entries = [];
  const includes = [];
  const stack = [];
  const tags = /<(\/?)([A-Za-z][\w:.-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  for (const match of cleaned.matchAll(tags)) {
    if (match[1]) {
      const open = stack.pop();
      if (!open || open.tag !== match[2]) throw new Error('Unbalanced XML tag ' + match[2]);
      continue;
    }
    const attributes = parseAttributes(match[3]);
    const parent = stack.at(-1);
    const enabled = (parent?.enabled ?? true) && allowed(attributes);
    const inTemplate = (parent?.inTemplate ?? false) || attributes.virtual === 'true';
    const line = cleaned.slice(0, match.index).split('\n').length;
    if (enabled) {
      if (['Include', 'Script'].includes(match[2]) && attributes.file) includes.push(attributes.file);
      if (attributes.atlas) entries.push({
        name: attributes.atlas, kind: 'atlas', sourceKind: 'framexml-reference',
        sourceLine: line, metadata: { elementType: match[2] },
      });
      if (attributes.name && !['Script', 'Include'].includes(match[2])) {
        entries.push({
          name: attributes.name,
          kind: attributes.virtual === 'true' ? 'template' : 'frame',
          sourceKind: 'framexml-declaration',
          sourceLine: line,
          metadata: {
            elementType: match[2], ...attributes,
            inheritedTemplates: (attributes.inherits ?? '').split(/\s*,\s*/).filter(Boolean),
            mixins: (attributes.mixin ?? '').split(/\s*,\s*/).filter(Boolean),
            namePattern: attributes.name.includes('$parent'),
            templateChild: Boolean(parent?.inTemplate),
          },
        });
      }
    }
    if (!/\/\s*$/.test(match[3])) stack.push({ tag: match[2], enabled, inTemplate });
  }
  if (stack.length) throw new Error('Unclosed XML tag ' + stack.at(-1).tag);
  return { entries, includes };
}

function globalName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.isLocal ? null : node.name;
  if (node.type === 'MemberExpression' && globalName(node.base)) return memberName(node);
  return null;
}

export function parseResourceLua(source, filename) {
  const ast = parseLuaSource(source, filename);
  const entries = [];
  const add = (node, name, kind, sourceKind, metadata = {}) => {
    if (name) entries.push({ name, kind, sourceKind, sourceLine: node.loc.start.line, metadata });
  };
  function definition(node, identifier) {
    const name = globalName(identifier);
    if (!name) return;
    const owner = identifier.type === 'MemberExpression' ? globalName(identifier.base) : null;
    const parameters = node.parameters.map((parameter) => parameter.name ?? parameter.value ?? '...');
    add(node, name, 'symbol', 'framexml-definition', { parameters, signatureComplete: false });
    if (owner && /Mixin$/.test(owner)) {
      add(node, owner, 'mixin', 'framexml-definition', { method: identifier.identifier.name, parameters });
    }
  }
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && !node.isLocal) definition(node, node.identifier);
    if (node.type === 'AssignmentStatement') {
      node.variables.forEach((variable, index) => {
        const name = globalName(variable);
        const value = node.init[index];
        if (value?.type === 'FunctionDeclaration') definition(value, variable);
        const factory = memberName(value?.base);
        if (name && value && (/Mixin$/.test(name) || ['CreateFromMixins', 'Mixin'].includes(factory))) {
          let parents = [];
          if (value.type === 'CallExpression' && ['CreateFromMixins', 'Mixin'].includes(memberName(value.base))) {
            parents = value.arguments.map(globalName).filter(Boolean);
          } else if (value.type === 'TableCallExpression' && memberName(value.base) === 'CreateFromMixins') {
            parents = value.arguments.fields.map((field) => globalName(field.value)).filter(Boolean);
          }
          const kind = /Mixin$/.test(name) || factory === 'CreateFromMixins' ? 'mixin' : 'symbol';
          add(node, name, kind, 'framexml-definition', { parents, ...(factory === 'Mixin' ? { mixinApplication: true } : {}) });
        }
      });
    }
    if (['CallExpression', 'TableCallExpression', 'StringCallExpression'].includes(node.type)) {
      const name = globalName(node.base);
      // Colon calls have an object receiver; they do not establish a global function.
      if (name && !name.includes(':')) add(node, name, 'symbol', 'framexml-reference');
      if (node.type === 'CallExpression') {
        const argument = node.arguments[0];
        const literal = argument?.type === 'StringLiteral' ? evaluateNode(argument) : null;
        if (literal && /^(?:C_CVar\.)?(?:GetCVar|GetCVarBool|GetCVarDefault|SetCVar|RegisterCVar)$/.test(name ?? '')) {
          add(node, literal, 'cvar', 'framexml-reference');
        }
        if (literal && (node.base?.identifier?.name === 'SetAtlas' || name === 'C_Texture.GetAtlasInfo')) {
          add(node, literal, 'atlas', 'framexml-reference');
        }
        if (name === 'CreateFrame' && node.arguments[1]?.type === 'StringLiteral') {
          add(node, evaluateNode(node.arguments[1]), 'frame', 'framexml-reference', {
            elementType: literal, namePattern: false,
          });
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'globals') continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  for (const identifier of ast.globals) add(identifier, identifier.name, 'symbol', 'framexml-reference');
  return entries;
}

export async function extractFrameXmlResources(sourceRoot, tocFiles) {
  const files = new Map();
  const entries = [];
  const excluded = [];
  const relative = (file) => path.relative(sourceRoot, file).split(path.sep).join('/');
  const directories = new Map();
  function sourcePath(file) {
    const name = relative(file);
    if (name.startsWith('../') || path.isAbsolute(name)) throw new Error('Source include leaves checkout: ' + name);
    let current = path.resolve(sourceRoot);
    for (const part of name.split('/')) {
      if (!directories.has(current)) directories.set(current, readdirSync(current));
      const matches = directories.get(current).filter((entry) => entry.toLowerCase() === part.toLowerCase());
      if (matches.length > 1) throw new Error('Ambiguous source filename: ' + name);
      if (!matches.length) return null;
      current = path.join(current, matches[0]);
    }
    return current;
  }
  const paths = new Set(tocFiles);
  const selected = tocFiles.filter((file) => {
    const addon = path.basename(path.dirname(file));
    return path.basename(file) === addon + '_Mainline.toc'
      || (path.basename(file) === addon + '.toc' && !paths.has(path.join(path.dirname(file), addon + '_Mainline.toc')));
  }).sort((a, b) => relative(a) < relative(b) ? -1 : relative(a) > relative(b) ? 1 : 0);

  async function include(file, addon) {
    if (files.has(file)) return;
    if (!['.lua', '.xml'].includes(path.extname(file))) return;
    const sourceFile = relative(file);
    if (sourceFile.startsWith('../') || path.isAbsolute(sourceFile)) throw new Error('Source include leaves checkout: ' + sourceFile);
    // Generated contracts are already indexed in the authoritative API catalog.
    if (sourceFile.includes('/Blizzard_APIDocumentation')) return;
    files.set(file, addon);
    const source = await readFile(file, 'utf8');
    if (file.endsWith('.xml')) {
      const parsed = parseResourceXml(source);
      entries.push(...parsed.entries.map((entry) => ({ ...entry, sourceFile, addon })));
      for (const included of parsed.includes) await include(resolveInclude(file, included, addon), addon);
    } else {
      entries.push(...parseResourceLua(source, sourceFile).map((entry) => ({ ...entry, sourceFile, addon })));
    }
  }

  function resolveInclude(from, target, addon) {
    const replaced = target.replaceAll('[Family]', 'Mainline').replaceAll('[Game]', 'Standard').replaceAll('\\', '/');
    if (/^Interface\//i.test(replaced)) {
      const file = sourcePath(path.resolve(sourceRoot, replaced));
      if (!file) throw new Error('Missing source include: ' + relative(from) + ' -> ' + target);
      return file;
    }
    const addonRoot = selected.find((toc) => path.basename(path.dirname(toc)) === addon);
    const sibling = sourcePath(path.resolve(path.dirname(from), replaced));
    const rootRelative = sourcePath(path.resolve(addonRoot ? path.dirname(addonRoot) : path.dirname(from), replaced));
    if (sibling && rootRelative && sibling !== rootRelative) {
      throw new Error('Ambiguous source include: ' + relative(from) + ' -> ' + target);
    }
    if (!sibling && !rootRelative) throw new Error('Missing source include: ' + relative(from) + ' -> ' + target);
    return sibling ?? rootRelative;
  }

  for (const toc of selected) {
    const source = await readFile(toc, 'utf8');
    const headers = Object.fromEntries([...source.matchAll(/^##\s*(AllowLoad(?:GameType)?):\s*(.*)$/gmi)]
      .map((match) => [match[1], match[2].trim()]));
    if (!allowed(headers)) {
      excluded.push(relative(toc));
      continue;
    }
    const addon = path.basename(path.dirname(toc));
    for (const raw of source.split(/\r?\n/)) {
      if (!raw.trim() || raw.trim().startsWith('#')) continue;
      const conditions = Object.fromEntries([...raw.matchAll(/\[(AllowLoad(?:GameType)?|ExcludeLoadGameType)\s+([^\]]+)\]/gi)]
        .map((match) => [match[1], match[2]]));
      if (!allowed(conditions)) continue;
      const target = raw.replace(/\[(?!Family\]|Game\])[^\]]+\]/g, '').trim();
      if (target) await include(resolveInclude(toc, target, addon), addon);
    }
  }

  // Keep every distinct definition, but only one reference per symbol and file.
  const unique = new Map();
  for (const entry of entries) {
    const key = JSON.stringify([entry.kind, entry.name, entry.sourceKind, entry.sourceFile, entry.metadata]);
    if (!unique.has(key)) unique.set(key, entry);
  }
  const sorted = [...unique.values()].sort((a, b) => a.kind.localeCompare(b.kind)
    || a.name.localeCompare(b.name) || a.sourceFile.localeCompare(b.sourceFile) || a.sourceLine - b.sourceLine);
  return {
    schemaVersion: 1,
    scope: 'mainline-source',
    coverage: { files: files.size, excludedAddOns: excluded },
    counts: Object.fromEntries(['symbol', 'template', 'mixin', 'frame', 'cvar', 'atlas']
      .map((kind) => [kind, new Set(sorted.filter((entry) => entry.kind === kind).map((entry) => entry.name)).size])),
    entries: sorted,
  };
}
