import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import {root, configuration, syncBib, convertEntry, mergeEntries} from '../scripts/sync-bib.mjs';
import {parseBibtex, latexText} from '../scripts/lib/bibtex.mjs';
import {publicationFieldMap} from '../scripts/lib/journal.mjs';
import {projectFieldMap} from '../scripts/lib/project.mjs';
import {publicationDisplay} from '../src/lib/publication-fields.mjs';
import {projectFields} from '../src/lib/project-fields.mjs';
import {schemas} from '../src/lib/content-schemas.mjs';

test('all six sources map every field to schema-supported independent YAML fields', async () => {
  const {sources} = await configuration();
  const totals = {};
  for (const source of sources) {
    const entries = parseBibtex(await readFile(path.join(root, 'bibliography', source.file), 'utf8'));
    totals[source.file] = entries.length;
    for (const entry of entries) {
      const row = convertEntry(entry, source);
      const parsed = schemas[source.collection].parse(row);
      const project = source.collection === 'projects';
      for (const field of Object.keys(entry.fields)) {
        const target = project ? projectFieldMap[field] ?? {title:'sourceTitle', author:'authors', year:'year', number:'grant', url:'url', starttime:'startTime', endtime:'endTime', status:'status'}[field]
          : publicationFieldMap[field] ?? {title:'title', author:'authors', editor:'editors', year:'year', number:'issue', issue:'issue', doi:'doi', url:'url', ee:'ee', eprint:'eprint', keywords:'keywords'}[field];
        assert.ok(target, `Unmapped ${source.file}/${entry.key}/${field}`);
        assert.ok(Object.hasOwn(parsed, target), `Schema lost ${source.file}/${entry.key}/${field}`);
      }
      assert.ok(Array.isArray(row.authors));
      assert.equal(row.venue, undefined);
      if (project) {
        assert.equal(row.sourceTitle, latexText(entry.fields.title));
        assert.equal(row.institution, latexText(entry.fields.institution));
        assert.equal(row.projectType, latexText(entry.fields.type));
        assert.equal(row.note, latexText(entry.fields.note));
        assert.equal(row.detail, undefined);
        assert.equal(row.funding, undefined);
        assert.equal(row.role, undefined);
        assert.equal(projectFields(row).funding, row.projectType);
      } else {
        const display = publicationDisplay(parsed);
        assert.ok(display.venue.trim());
        assert.equal(row.link, undefined);
        if (entry.fields.editor) assert.ok(row.editors.length);
        if (entry.fields.note) assert.equal(row.note, latexText(entry.fields.note));
      }
    }
  }
  assert.deepEqual(Object.values(totals), [45,115,4,69,35,9]);
});

test('full synchronization preserves source bytes, stable IDs, website extras and all five patents', async () => {
  const {sources} = await configuration();
  const before = await Promise.all(sources.map(source => readFile(path.join(root, 'bibliography', source.file))));
  const originals = {};
  for (const name of ['publications', 'projects']) originals[name] = yaml.load(await readFile(path.join(root, `src/content/${name}.yaml`), 'utf8'));
  const folder = await mkdtemp(path.join(os.tmpdir(), 'all-bib-'));
  try {
    await syncBib({outDir: folder});
    for (const name of ['publications', 'projects']) {
      const rows = yaml.load(await readFile(path.join(folder, `src/content/${name}.yaml`), 'utf8'));
      assert.equal(rows.length, name === 'publications' ? 169 : 113);
      assert.deepEqual(rows.map(row => row.id).sort(), originals[name].map(row => row.id).sort());
      for (const row of rows) {
        const old = originals[name].find(item => item.id === row.id);
        if (!row.bibKey) assert.deepEqual(row, old);
        if (old.projectUrl) assert.equal(row.projectUrl, old.projectUrl);
        if (old.image) assert.equal(row.image, old.image);
      }
      const imported = rows.filter(row => row.bibKey);
      assert.deepEqual(mergeEntries(rows, imported, name, sources.filter(s => s.collection === name).map(s => s.file)), rows);
    }
    assert.deepEqual(await Promise.all(sources.map(source => readFile(path.join(root, 'bibliography', source.file)))), before);
  } finally {await rm(folder, {recursive: true, force: true});}
});

test('unrecognized conference/project fields fail instead of being discarded', () => {
  assert.throws(() => convertEntry({type:'inproceedings', key:'x', fields:{title:'Paper', author:'A Author', booktitle:'Conference', year:'2025', unknown:'value'}}, {file:'conference.bib',collection:'publications'}), /Unmapped publication field/);
  assert.throws(() => convertEntry({type:'techreport', key:'x', fields:{title:'Project', author:'', year:'2025', unknown:'value'}}, {file:'projects.bib',collection:'projects',category:'研究型'}), /Unmapped project field/);
});

test('project ordering uses end dates even when source years differ', () => {
  const rows = mergeEntries([], [
    {id:'earlier-end', year:2025, startTime:'2025', endTime:'2026'},
    {id:'later-end', year:2024, startTime:'2024', endTime:'2027'},
  ], 'projects');
  assert.equal(rows[0].id, 'later-end');
});
