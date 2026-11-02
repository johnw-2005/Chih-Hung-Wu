import {latexText, authorText} from './bibtex.mjs';

export const projectFieldMap = {
  institution: 'institution', type: 'projectType', note: 'note', owner: 'owner', timestamp: 'timestamp',
};
export const projectFields = ['type', 'sourceTitle', 'year', 'authors', 'url', ...Object.values(projectFieldMap)];

export function convertProject(entry, common, titleWithoutDates, validateUrl) {
  const f = entry.fields;
  const known = new Set(['title', 'author', 'year', 'number', 'url', 'starttime', 'endtime', 'status', ...Object.keys(projectFieldMap)]);
  for (const field of Object.keys(f)) {
    if (!known.has(field)) throw new Error(`Unmapped project field: ${field}; add an explicit YAML mapping before importing`);
  }
  const grant = latexText(f.number) || titleWithoutDates.match(/\(((?:NSC|MOST|NSTC)[^()]+)\)/i)?.[1];
  const title = titleWithoutDates.replace(/\((?:NSC|MOST|NSTC)[^()]+\)/gi, '').replace(/\(\s*\)/g, '').trim();
  const row = {...common, type: 'project', title, sourceTitle: latexText(f.title), year: Number(f.year),
    authors: f.author?.trim() ? authorText(f.author).split(' and ') : []};
  for (const [source, target] of Object.entries(projectFieldMap)) {
    if (Object.hasOwn(f, source)) row[target] = latexText(f[source]);
  }
  if (Object.hasOwn(f, 'number') || grant) row.grant = grant?.replace(/[【】]/g, '') || '';
  if (Object.hasOwn(f, 'url')) row.url = f.url.trim() ? validateUrl(f.url) : '';
  return row;
}
