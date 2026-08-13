import luaparse from 'luaparse';

function decodeLuaString(raw) {
  const longString = raw.match(/^\[(=*)\[([\s\S]*)\]\1\]$/);
  if (longString) return longString[2].replace(/^\r?\n/, '');

  const value = raw.slice(1, -1);
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '\\') {
      result += value[index];
      continue;
    }

    index += 1;
    const escape = value[index];
    const simple = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
    if (simple[escape]) result += simple[escape];
    else if (escape === '\n') result += '\n';
    else if (escape === '\r') {
      if (value[index + 1] === '\n') index += 1;
      result += '\n';
    } else if (escape === 'z') {
      while (/\s/.test(value[index + 1] ?? '')) index += 1;
    } else if (escape === 'x') {
      const hex = value.slice(index + 1, index + 3);
      result += String.fromCharCode(Number.parseInt(hex, 16));
      index += 2;
    } else if (/\d/.test(escape)) {
      const decimal = value.slice(index).match(/^\d{1,3}/)[0];
      result += String.fromCharCode(Number.parseInt(decimal, 10));
      index += decimal.length - 1;
    } else result += escape;
  }
  return result;
}

function memberName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') {
    const base = memberName(node.base);
    const identifier = memberName(node.identifier);
    return base && identifier ? `${base}${node.indexer}${identifier}` : null;
  }
  if (node.type === 'IndexExpression') {
    const base = memberName(node.base);
    const index = evaluateNode(node.index);
    return base && index != null ? `${base}[${JSON.stringify(index)}]` : null;
  }
  return null;
}

function evaluateBinary(operator, left, right) {
  switch (operator) {
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': return left / right;
    case '%': return left % right;
    case '^': return left ** right;
    case '..': return `${left}${right}`;
    case 'and': return left && right;
    case 'or': return left || right;
    default: return { expression: `${left} ${operator} ${right}` };
  }
}

export function evaluateNode(node) {
  if (!node) return null;

  switch (node.type) {
    case 'StringLiteral':
      return node.value ?? decodeLuaString(node.raw);
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value;
    case 'NilLiteral':
      return null;
    case 'Identifier':
      return node.name;
    case 'MemberExpression':
    case 'IndexExpression':
      return memberName(node);
    case 'UnaryExpression': {
      const value = evaluateNode(node.argument);
      if (node.operator === '-' && typeof value === 'number') return -value;
      if (node.operator === '+' && typeof value === 'number') return value;
      if (node.operator === 'not') return !value;
      return { expression: `${node.operator}${value}` };
    }
    case 'BinaryExpression':
    case 'LogicalExpression':
      return evaluateBinary(node.operator, evaluateNode(node.left), evaluateNode(node.right));
    case 'TableConstructorExpression': {
      const hasNamedFields = node.fields.some((field) => field.type !== 'TableValue');
      if (!hasNamedFields) {
        return node.fields.map((field) => evaluateNode(field.value));
      }

      const result = {};
      let arrayIndex = 1;
      for (const field of node.fields) {
        if (field.type === 'TableValue') {
          result[arrayIndex] = evaluateNode(field.value);
          arrayIndex += 1;
        } else if (field.type === 'TableKeyString') {
          result[field.key.name] = evaluateNode(field.value);
        } else if (field.type === 'TableKey') {
          result[String(evaluateNode(field.key))] = evaluateNode(field.value);
        }
      }
      return result;
    }
    default:
      return { unsupportedNode: node.type };
  }
}

function parse(source, filename) {
  try {
    return luaparse.parse(source, {
      comments: false,
      locations: false,
      luaVersion: '5.1',
      ranges: false,
      scope: false,
    });
  } catch (error) {
    error.message = `${filename}: ${error.message}`;
    throw error;
  }
}

export function parseLuaDocumentationSource(source, filename = '<source>') {
  const ast = parse(source, filename);
  const candidates = [];

  for (const statement of ast.body) {
    if (statement.type !== 'LocalStatement') continue;
    for (let index = 0; index < statement.variables.length; index += 1) {
      const value = evaluateNode(statement.init[index]);
      const isDocumentationTable = value && typeof value === 'object' && !Array.isArray(value)
        && ['Functions', 'Events', 'Tables'].some((key) => Array.isArray(value[key]));
      if (isDocumentationTable) {
        candidates.push({ Name: statement.variables[index]?.name, Type: 'Constants', ...value });
      }
    }
  }

  if (candidates.length !== 1) {
    throw new Error(`${filename}: expected exactly one documentation table, found ${candidates.length}`);
  }

  return candidates[0];
}

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visitor);
    } else if (value && typeof value === 'object') {
      walk(value, visitor);
    }
  }
}

export function parseLuaMixinsSource(source, filename = '<source>') {
  const ast = parse(source, filename);
  const methods = [];
  const inheritance = [];

  walk(ast, (node) => {
    if (node.type === 'FunctionDeclaration' && node.identifier?.type === 'MemberExpression' && node.identifier.indexer === ':') {
      const owner = memberName(node.identifier.base);
      const name = memberName(node.identifier.identifier);
      if (owner && name) {
        methods.push({
          owner,
          name,
          arguments: node.parameters
            .filter((parameter) => parameter.type === 'Identifier')
            .map((parameter) => ({ Name: parameter.name, Type: 'unknown', Nilable: false })),
        });
      }
    }

    if (node.type !== 'AssignmentStatement') return;
    for (let index = 0; index < node.variables.length; index += 1) {
      const target = memberName(node.variables[index]);
      const value = node.init[index];
      if (!target || value?.type !== 'CallExpression' || memberName(value.base) !== 'CreateFromMixins') continue;
      inheritance.push({
        target,
        parents: value.arguments.map(memberName).filter(Boolean),
      });
    }
  });

  return { methods, inheritance };
}
