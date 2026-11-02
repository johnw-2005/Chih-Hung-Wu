import {projectTimes} from './project-time.mjs';
/** Split legacy combined titles without changing the original stored records. */
export function projectFields(row) {
  const prefix = row.title.match(/^\[([^\]]+)\]\s*/);
  let title = (prefix ? row.title.slice(prefix[0].length) : row.title).trim();
  let grant;
  const trailing = title.match(/\s*\(([^()]+)\)\s*\)*$/);
  if (trailing && /^(?:(?:MOST|NSC)\s|\d{2,3}P\d+|\d{2,3}-\d{4}-|\d{2}M\d|\d{2}-EC-)/i.test(trailing[1].trim())) {
    grant = trailing[1].trim().replace(/\)+$/, '');
    title = title.slice(0,trailing.index).trim();
  }
  const sourceFields = row.type === 'project' ? {
    funding: row.projectType,
    role: row.note,
    detail: [row.institution, row.authors?.length ? `參與人員：${row.authors.join('、')}` : undefined].filter(Boolean).join('；'),
    projectUrl: row.projectUrl || (/^https:\/\//i.test(row.url ?? '') ? row.url : undefined),
  } : {};
  return {...row, ...sourceFields, ...projectTimes(row), title, category: row.category ?? prefix?.[1], grant: row.grant ?? grant};
}
