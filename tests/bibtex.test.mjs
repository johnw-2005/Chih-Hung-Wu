import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBibtex, latexText, authorText} from '../scripts/lib/bibtex.mjs';
import {convertEntry, mergeEntries} from '../scripts/sync-bib.mjs';

test('BibTeX nested groups, comments, quoted values, macros and concatenation', () => {
  const entries = parseBibtex(`% @article{ignored}
    @string{venue = "A journal"}
    @comment{ignored {nested text}}
    @article(Key, TITLE={A {GAN} study}, journal=venue, month="11-14~" # sep,
      year=2025, author="Wu, Chih-Hung and Lee, Shie-Jue")`);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].fields.journal, 'A journal');
  assert.equal(entries[0].fields.month, '11-14~sep');
  assert.equal(latexText(entries[0].fields.title), 'A GAN study');
  assert.equal(authorText(entries[0].fields.author), 'Chih-Hung Wu and Shie-Jue Lee');
});

test('malformed input and duplicate keys fail instead of silently dropping records', () => {
  for (const input of ['@article{x,title={Unclosed}', '@article{x, year=unknown}', '@article{x,title="a" title="b"}', '@misc{x,year=2025}@misc{X,year=2026}']) {
    assert.throws(() => parseBibtex(input));
  }
});

test('DOI links and LaTeX are converted, unsafe URLs fail', () => {
  const source = {file: 'papers.bib', collection: 'publications'};
  const entry = parseBibtex('@article{x,title={An {AI} study},author={Wu, Chih-Hung},journal={Journal},year=2025,doi={10.1234/a}}')[0];
  const row = convertEntry(entry, source);
  assert.equal(row.doi, '10.1234/a');
  assert.equal(row.link, undefined);
  assert.equal(row.venue, undefined);
  assert.deepEqual(row.authors, ['Chih-Hung Wu']);
  assert.equal(row.title, 'An AI study');
  assert.throws(() => convertEntry({...entry, fields: {...entry.fields, title: String.raw`A \url{link}`}}, source), /Unsupported LaTeX/);
  assert.throws(() => convertEntry({...entry, fields: {...entry.fields, doi: '', url: 'javascript:alert(1)'}}, source));
});

test('project dates support ROC years, months and spaces without invented days', () => {
  const source = {file: 'projects.bib', collection: 'projects', category: '研究型'};
  const row = convertEntry(parseBibtex('@techreport{x,title={計畫（109/08/01-110/06 /30）},year=2020}')[0], source);
  assert.equal(row.startTime, '2020/08/01');
  assert.equal(row.endTime, '2021/06/30');
  assert.equal(row.title, '計畫');
  const monthly = convertEntry(parseBibtex('@techreport{x,title={計畫 (2015/4～2015/12)},year=2015}')[0], source);
  assert.equal(monthly.startTime, '2015/04');
  assert.equal(monthly.endTime, '2015/12');
});

test('sync preserves existing IDs and manual entries, tracks updates and deletions', () => {
  const old = [{id: 'journal-old', title: 'Old', bibKey: 'papers.bib:x', year: 2024, image: '/a.jpg', abstract: 'removed'},
    {id: 'journal-deleted', title: 'Deleted', bibKey: 'papers.bib:y', year: 2024},
    {id: 'patent-a', title: 'Patent', year: 2020}];
  const incoming = [{id: 'new-id', title: 'Changed', bibKey: 'papers.bib:x', year: 2025}];
  const rows = mergeEntries(old, incoming, 'publications');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'journal-old');
  assert.equal(rows[0].image, '/a.jpg');
  assert.equal(rows[0].abstract, undefined);
  assert.equal(rows[1].id, 'patent-a');
  assert.deepEqual(mergeEntries(rows, incoming, 'publications'), rows);
});

test('ambiguous migration fails and explicit legacy IDs resolve same-title papers', () => {
  const old = [{id: 'conference-a', title: 'Same', year: 2020}, {id: 'conference-b', title: 'Same', year: 2020}];
  const row = {id: 'new', bibKey: 'papers.bib:x', bibType: 'inproceedings', title: 'Same', year: 2020};
  assert.throws(() => mergeEntries(old, [row], 'publications'), /Ambiguous/);
  assert.equal(mergeEntries(old, [{...row, id: 'conference-a'}], 'publications').find(r => r.bibKey).id, 'conference-a');
});
