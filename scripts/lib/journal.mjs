import {latexText, authorText} from './bibtex.mjs';

// These are data fields, not the formatted citation shown by the website.
export const journalFieldMap = {
  journal: 'journal', volume: 'volume', pages: 'pages', month: 'month',
  issn: 'issn', publisher: 'publisher', address: 'address', abstract: 'abstract',
  note: 'note', issue_date: 'issueDate', numpages: 'pageCount',
  acmid: 'acmid', bibsource: 'bibSource', biburl: 'bibUrl', owner: 'owner',
  timestamp: 'timestamp', 'added-at': 'addedAt', interhash: 'interhash', intrahash: 'intrahash',
};
export const journalFields = ['type', ...Object.values(journalFieldMap), 'issue', 'indexes', 'doi', 'url', 'ee', 'eprint', 'keywords'];
export const publicationFieldMap = {
  ...journalFieldMap, booktitle: 'booktitle', series: 'series', isbn: 'isbn',
  eventdate: 'eventDate', location: 'location', howpublished: 'howPublished',
};
export const publicationFields = [...journalFields, ...Object.values(publicationFieldMap), 'editors'];

export function convertJournal(entry, common, validateUrl) {
  return convertPublication(entry, common, validateUrl);
}

export function convertPublication(entry, common, validateUrl) {
  const f = entry.fields;
  const isJournal = entry.type === 'article';
  if (isJournal && !f.journal?.trim()) throw new Error('Journal article needs journal');
  const fieldMap = isJournal ? journalFieldMap : publicationFieldMap;
  const known = new Set(['title', 'author', 'editor', 'year', 'number', 'issue', 'doi', 'url', 'ee', 'eprint', 'keywords', ...Object.keys(fieldMap)]);
  for (const field of Object.keys(f)) {
    if (!known.has(field)) throw new Error(`Unmapped ${isJournal ? 'journal' : 'publication'} field: ${field}; add an explicit YAML mapping before importing`);
  }
  const number = f.number?.trim(), issue = f.issue?.trim();
  if (number && issue && number !== issue) throw new Error(`Conflicting number (${number}) and issue (${issue})`);
  const names = value => value.split(/\s+and\s+/i).filter(name => name.trim()).map(name => {
    const marker = name.trim().match(/\*+$/)?.[0] ?? '';
    return authorText(name.trim().slice(0, marker ? -marker.length : undefined)) + marker;
  });
  const type = isJournal ? 'journal' : ['conference', 'inproceedings'].includes(entry.type) ? 'conference' : entry.type === 'incollection' ? 'book-chapter' : entry.type === 'book' ? 'book' : 'other';
  const row = {...common, type, authors: names(f.author), year: Number(f.year)};
  if (Object.hasOwn(f, 'editor')) row.editors = names(f.editor);
  for (const [source, target] of Object.entries(fieldMap)) {
    // Empty fields remain empty; absence remains absence.
    if (Object.hasOwn(f, source)) row[target] = latexText(f[source]);
  }
  if (Object.hasOwn(f, 'number') || Object.hasOwn(f, 'issue')) row.issue = number || issue || '';
  if (Object.hasOwn(f, 'keywords')) row.keywords = f.keywords.split(f.keywords.includes(';') ? ';' : ',').map(latexText).filter(Boolean);
  const indexes = [...new Set([...String(f.note ?? '').matchAll(/\((SCIE|SSCI|ESCI|SCI|EI)\)/gi)].map(m => m[1].toUpperCase()))];
  if (indexes.length) row.indexes = indexes;
  if (Object.hasOwn(f, 'doi')) {
    row.doi = f.doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
    if (row.doi) validateUrl(`https://doi.org/${row.doi}`);
  }
  for (const field of ['url', 'ee', 'eprint']) {
    if (Object.hasOwn(f, field)) row[field] = f[field].trim() ? validateUrl(f[field]) : '';
  }
  return row;
}
