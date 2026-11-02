// A strict BibTeX reader: nested groups, quoted values, strings and concatenation.
// Fail on unsupported input rather than silently dropping website records.
export function parseBibtex(source) {
  let i = 0;
  const entries = [], keys = new Set();
  const strings = Object.fromEntries('jan feb mar apr may jun jul aug sep oct nov dec'.split(' ').map(s => [s, s]));
  const fail = message => { throw new Error(`${message} (line ${source.slice(0, i).split('\n').length})`); };
  function space() {
    while (i < source.length) {
      if (/\s/.test(source[i])) i++;
      else if (source[i] === '%') { while (i < source.length && source[i] !== '\n') i++; }
      else break;
    }
  }
  function group(open) {
    const close = open === '{' ? '}' : open === '(' ? ')' : '"';
    i++;
    let text = '', depth = 0;
    while (i < source.length) {
      const c = source[i++];
      if (c === '\\') { if (i >= source.length) fail('Incomplete escape'); text += c + source[i++]; }
      else if (c === close && depth === 0) return text;
      else {
        if (c === '{') depth++;
        if (c === '}') depth--;
        if (depth < 0) fail('Unbalanced braces');
        text += c;
      }
    }
    fail('Unclosed value');
  }
  function value() {
    let result = '';
    do {
      if (source[i] === '#') i++;
      space();
      if (source[i] === '{' || source[i] === '"') result += group(source[i]);
      else {
        const token = source.slice(i).match(/^[^\s,#})]+/)?.[0];
        if (!token) fail('Expected field value');
        i += token.length;
        if (/^\d+$/.test(token)) result += token;
        else if (Object.hasOwn(strings, token.toLowerCase())) result += strings[token.toLowerCase()];
        else fail(`Undefined BibTeX string: ${token}`);
      }
      space();
    } while (source[i] === '#');
    return result;
  }
  while (i < source.length) {
    space();
    if (i === source.length) break;
    // BibTeX permits free text outside entries.
    if (source[i] !== '@') { i++; continue; }
    i++;
    const type = source.slice(i).match(/^[a-z]+/i)?.[0]?.toLowerCase();
    if (!type) fail('Expected entry type');
    i += type.length;
    space();
    const open = source[i], close = open === '{' ? '}' : ')';
    if (!['{', '('].includes(open)) fail('Expected entry opening brace');
    if (type === 'comment' || type === 'preamble') { group(open); continue; }
    i++;
    space();
    if (type === 'string') {
      const name = source.slice(i).match(/^[\w:-]+/)?.[0];
      if (!name) fail('Expected string name');
      i += name.length; space();
      if (source[i++] !== '=') fail('Expected =');
      strings[name.toLowerCase()] = value();
      if (source[i] === ',') i++;
      space();
      if (source[i++] !== close) fail('Expected string closing brace');
      continue;
    }
    const key = source.slice(i).match(/^[^\s,{}()]+/)?.[0];
    if (!key) fail('Expected citation key');
    i += key.length; space();
    if (source[i++] !== ',') fail('Expected comma after citation key');
    if (keys.has(key.toLowerCase())) fail(`Duplicate citation key: ${key}`);
    keys.add(key.toLowerCase());
    const fields = {};
    space();
    while (i < source.length && source[i] !== close) {
      const field = source.slice(i).match(/^[\w:-]+/)?.[0]?.toLowerCase();
      if (!field) fail(`Expected field in ${key}`);
      i += field.length; space();
      if (source[i++] !== '=') fail('Expected =');
      if (Object.hasOwn(fields, field)) fail(`Duplicate field ${field} in ${key}`);
      fields[field] = value();
      if (source[i] === ',') { i++; space(); }
      else if (source[i] !== close) fail('Expected comma between fields');
    }
    if (source[i++] !== close) fail('Unclosed entry');
    entries.push({type, key, fields});
  }
  return entries;
}

export function latexText(value = '') {
  return value
    .replace(/\\(?:textbf|textit|emph|textrm|textsc)\s*/g, '')
    .replace(/\\(?:bf|it|rm)\b\s*/g, '')
    .replace(/\\([&%_$#{}])/g, '$1')
    .replace(/\\(?:LaTeX|TeX)\b/g, m => m.slice(1))
    .replace(/\\(['`^"~=.])\s*\{?([A-Za-z])\}?|\\([uvHckbdtr])(?:\{([A-Za-z])\}|\s+([A-Za-z]))/g, (m, symbol, base, command, grouped, spaced) => {
      const marks = {"'": '\u0301', '`': '\u0300', '^': '\u0302', '"': '\u0308', '~': '\u0303', '=': '\u0304', '.': '\u0307', u: '\u0306', v: '\u030c', H: '\u030b', c: '\u0327', k: '\u0328', b: '\u0331', d: '\u0323', r: '\u030a', t: '\u0361'};
      return ((base || grouped || spaced) + marks[symbol || command]).normalize('NFC');
    })
    .replace(/[{}]/g, '').replace(/~/g, ' ').replace(/--/g, '–').replace(/\s+/g, ' ').trim();
}

export function authorText(value = '') {
  return value.split(/\s+and\s+/i).map(author => {
    const parts = latexText(author).split(/\s*,\s*/);
    return parts.length === 2 ? `${parts[1]} ${parts[0]}` : parts.length === 3 ? `${parts[2]} ${parts[0]}, ${parts[1]}` : parts[0];
  }).join(' and ');
}
