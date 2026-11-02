import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import {convertEntry, mergeEntries, syncBib, root} from '../scripts/sync-bib.mjs';
import {parseBibtex} from '../scripts/lib/bibtex.mjs';
import {journalFieldMap} from '../scripts/lib/journal.mjs';
import {publicationDisplay} from '../src/lib/publication-fields.mjs';
import {schemas} from '../src/lib/content-schemas.mjs';

const source = {file: 'Johnw_Journal.bib', collection: 'publications'};
const entry = fields => ({type: 'article', key: 'test', fields: {title: 'Paper', author: 'Wu, Chih-Hung* and Lee, Shie-Jue', journal: 'Journal', year: '2025', ...fields}});

test('journal fields remain separate; number/issue fallback and conflict detection', () => {
  for (const fields of [{number: '3'}, {issue: '3'}, {number: '3', issue: '3'}, {number: '', issue: '3'}]) {
    const row = convertEntry(entry(fields), source);
    assert.equal(row.issue, '3');
    assert.equal(row.venue, undefined);
    assert.deepEqual(row.authors, ['Chih-Hung Wu*', 'Shie-Jue Lee']);
  }
  assert.throws(() => convertEntry(entry({number: '1', issue: '3'}), source), /Conflicting/);
  assert.throws(() => convertEntry(entry({futurefield: 'value'}), source), /Unmapped journal field/);
});

test('DOI and all source links are preserved; note is independent of index labels', () => {
  const row = convertEntry(entry({doi: 'http://dx.doi.org/10.1234/test', url: 'https://publisher.example/paper',
    ee: 'https://example.org/electronic', eprint: 'https://example.org/fulltext',
    volume: '22', number: '1', pages: '182--213', note: 'Under Revision (SCI)', keywords: 'AI, scheduling'}), source);
  assert.equal(row.doi, '10.1234/test');
  assert.equal(row.url, 'https://publisher.example/paper');
  assert.equal(row.ee, 'https://example.org/electronic');
  assert.equal(row.eprint, 'https://example.org/fulltext');
  assert.equal(row.note, 'Under Revision (SCI)');
  assert.deepEqual(row.indexes, ['SCI']);
  assert.deepEqual(row.keywords, ['AI', 'scheduling']);
  const display = publicationDisplay(row);
  assert.equal(display.data.link, 'https://doi.org/10.1234/test');
  assert.equal(display.data.url, row.url);
  assert.match(display.venue, /vol. 22, no. 1, pp. 182–213, 2025, Under Revision/);
  assert.deepEqual(display.indexes, ['SCI']);
  assert.equal(display.authors, 'Chih-Hung Wu* and Shie-Jue Lee');
});

test('scoped updates preserve other sources and remove deleted records only from selected source', () => {
  const other = {id: 'conference-x', bibKey: 'Other.bib:x', title: 'Other', year: 2025};
  const deleted = {id: 'journal-x', bibKey: `${source.file}:x`, title: 'Deleted', year: 2025};
  assert.deepEqual(mergeEntries([other, deleted], [], 'publications', [source.file]), [other]);
});

test('all 45 real journal entries retain their mapped fields; scoped conversion is repeatable and leaves sources unchanged', async () => {
  const sourcePath = path.join(root, 'bibliography', source.file);
  const before = await readFile(sourcePath, 'utf8');
  const originals = yaml.load(await readFile(path.join(root, 'src/content/publications.yaml'), 'utf8'));
  const entries = parseBibtex(before);
  assert.equal(entries.length, 45);
  for (const e of entries) {
    const row = convertEntry(e, source);
    const parsed = schemas.publications.parse(row);
    for (const field of Object.keys(e.fields)) {
      const target = journalFieldMap[field] ?? ({title:'title', author:'authors', year:'year', number:'issue', issue:'issue', doi:'doi', url:'url', ee:'ee', eprint:'eprint', keywords:'keywords'})[field];
      assert.ok(target, `Missing mapping for ${field}`);
      assert.ok(Object.hasOwn(parsed, target), `Schema dropped ${field} in ${e.key}`);
    }
    if (e.fields.issue) assert.equal(row.issue, e.fields.issue);
  }
  const folder = await mkdtemp(path.join(os.tmpdir(), 'journal-conversion-'));
  try {
    await syncBib({sourceFile: source.file, outDir: folder});
    const generated = await readFile(path.join(folder, 'src/content/publications.yaml'), 'utf8');
    const rows = yaml.load(generated);
    const journals = rows.filter(row => row.bibKey?.startsWith(`${source.file}:`));
    assert.equal(journals.length, 45);
    const untouched = rows.filter(row => !row.bibKey?.startsWith(`${source.file}:`));
    assert.deepEqual(untouched, originals.filter(row => !row.bibKey?.startsWith(`${source.file}:`)));
    assert.deepEqual(mergeEntries(rows, journals, 'publications', [source.file]), rows);
    assert.equal(await readFile(sourcePath, 'utf8'), before);
    await assert.rejects(readFile(path.join(folder, 'src/content/projects.yaml')), {code: 'ENOENT'});
  } finally { await rm(folder, {recursive: true, force: true}); }
});
