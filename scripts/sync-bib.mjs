import {readFile, writeFile, mkdir, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import yaml from 'js-yaml';
import {schemas} from '../src/lib/content-schemas.mjs';
import {projectTimes, projectSortYear} from '../src/lib/project-time.mjs';
import {parseBibtex, latexText} from './lib/bibtex.mjs';
import {convertPublication, publicationFields} from './lib/journal.mjs';
import {convertProject, projectFields as sourceProjectFields} from './lib/project.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const configFile = 'bibliography/config.json';
export const outputFiles = ['src/content/publications.yaml', 'src/content/projects.yaml'];
export async function configuration() {
  const config = JSON.parse(await readFile(path.join(root, configFile), 'utf8'));
  if (!Array.isArray(config.sources) || !config.sources.length) throw new Error('No bibliography sources configured');
  const seen = new Set();
  for (const source of config.sources) {
    if (!/^[\w.-]+\.bib$/i.test(source.file) || !['publications', 'projects'].includes(source.collection)) throw new Error('Invalid bibliography source');
    if (seen.has(source.file)) throw new Error(`Duplicate source: ${source.file}`);
    seen.add(source.file);
  }
  return config;
}
const normalized = title => latexText(title).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const dateToken = '(?:\\d{3,4}/\\d{1,2}(?:/\\d{1,2})?|\\d{4})';
const dateRange = new RegExp(`(?<!\\d)(${dateToken})\\s*(?:[～~–—-]|\\s)\\s*(${dateToken})(?![\\d/])`);
function projectDates(title) {
  const text = title.replace(/\s*\/\s*/g, '/');
  const range = text.match(dateRange);
  const normalize = token => {
    const parts = token.split('/');
    if (parts[0].length === 3) parts[0] = String(Number(parts[0]) + 1911);
    return parts.map((part, i) => i ? part.padStart(2, '0') : part).join('/');
  };
  if (!range && /\d{3,4}\/\d/.test(text)) throw new Error('Unrecognized project date range; use starttime/endtime fields or a complete date pair');
  return {title: text.replace(dateRange, '').replace(/[（(]\s*[）)]/g, '').trim(), dates: range ? [normalize(range[1]), normalize(range[2])] : []};
}
function url(value) {
  if (!value) return undefined;
  const text = value.replace(/\\([&_#%])/g, '$1').trim();
  const parsed = new URL(text);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(`Unsupported URL: ${text}`);
  return text;
}
export function convertEntry(entry, source) {
  const f = Object.fromEntries(Object.entries(entry.fields).map(([key, value]) => [key, latexText(value)]));
  if (f.crossref) throw new Error('crossref is not supported; please include the referenced fields');
  if (!f.title || !/^\d{4}$/.test(f.year ?? '')) throw new Error('title and four-digit year are required');
  if (Object.values(f).some(value => /\\[a-zA-Z]+/.test(value))) throw new Error('Unsupported LaTeX command; please use plain text or add explicit conversion support');
  const bibKey = `${source.file}:${entry.key}`;
  const id = source.legacyIds?.[entry.key] || `bib-${createHash('sha256').update(bibKey).digest('hex').slice(0, 20)}`;
  const common = {id, bibKey, bibType: entry.type, title: f.title, order: 0};
  if (source.collection === 'publications') {
    if (!['article', 'inproceedings', 'conference', 'incollection', 'book', 'misc'].includes(entry.type)) throw new Error(`Unsupported publication type: ${entry.type}`);
    if (!f.author || !(f.journal || f.booktitle || f.publisher || f.howpublished)) throw new Error('Publication needs author and journal/booktitle/publisher/howpublished');
    return convertPublication(entry, common, url);
  }
  if (entry.type !== 'techreport') throw new Error(`Unsupported project type: ${entry.type}`);
  // Dates remain at the precision recorded by the teacher. No invented month/day.
  const {dates, title} = projectDates(f.title);
  const startTime = f.starttime || dates[0] || f.year;
  const endTime = f.endtime || dates[1] || f.year;
  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '/');
  const status = f.status || (dates[1] && dates[1] >= today.slice(0, dates[1].length) ? '進行中' : '已完成');
  return convertProject(entry, {...common, category: source.category, status, startTime,
    ...(status === '進行中' && !f.endtime && !dates[1] ? {} : {endTime})}, title, url);
}

const ownedFields = {
  publications: ['title', 'authors', 'venue', 'year', 'link', 'doi', 'links', 'abstract', 'order', ...publicationFields],
  projects: ['title', 'category', 'grant', 'status', 'startTime', 'endTime', 'startYear', 'endYear', 'period', 'funding', 'role', 'detail', 'order', ...sourceProjectFields],
};
function matchTitle(row, collection) {
  let title = row.title;
  if (collection === 'projects') title = projectDates(title).title.replace(/^\[[^\]]+\]\s*/, '').replace(/\((?:(?:MOST|NSC)\s)[^()]+\)/gi, '');
  return normalized(title);
}
export function mergeEntries(existing, imported, collection, sourceFiles) {
  const used = new Set();
  const rows = imported.map(row => {
    let matches = existing.filter(old => old.bibKey === row.bibKey || (!old.bibKey && old.id === row.id));
    if (!matches.length) matches = existing.filter(old => !old.bibKey && matchTitle(old, collection) === matchTitle(row, collection)
      && (collection !== 'projects' || projectTimes(old).startTime?.slice(0, 4) === row.startTime.slice(0, 4))
      && (collection !== 'publications' || old.id.startsWith(row.bibType === 'article' ? 'journal-' : ['inproceedings', 'conference'].includes(row.bibType) ? 'conference-' : 'other-')));
    if (matches.length > 1 && collection === 'publications') matches = matches.filter(old => old.year === row.year);
    if (matches.length > 1) throw new Error(`Ambiguous existing title: ${row.title}. Resolve duplicate YAML records before syncing.`);
    const old = matches[0];
    if (!old) return row;
    if (used.has(old.id)) throw new Error(`Two BibTeX entries match ${old.id}; resolve duplicate source titles`);
    used.add(old.id);
    const keep = {...old};
    for (const field of ownedFields[collection]) delete keep[field];
    // Keep existing IDs and website-only fields (photos and official project links).
    return {...keep, ...row, id: old.id};
  });
  // Unmanaged YAML records such as patents are preserved. Managed removals follow .bib.
  return [...rows, ...existing.filter(row => !used.has(row.id) && (!row.bibKey || (sourceFiles && !sourceFiles.some(file => row.bibKey.startsWith(`${file}:`)))))]
    .sort((a, b) => (collection === 'projects' ? projectSortYear(b) - projectSortYear(a) : b.year - a.year) || a.id.localeCompare(b.id, 'en'));
}

export async function syncBib({check = false, outDir, sourceFile} = {}) {
  const config = await configuration();
  const sources = sourceFile ? config.sources.filter(source => source.file === sourceFile) : config.sources;
  if (!sources.length) throw new Error(`Unknown source: ${sourceFile}`);
  const imported = {publications: [], projects: []};
  for (const source of sources) {
    const bytes = await readFile(path.join(root, 'bibliography', source.file));
    const input = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    const entries = parseBibtex(input);
    if (!entries.length) throw new Error(`Empty bibliography: ${source.file}; refusing to remove records`);
    for (const entry of entries) {
      try { imported[source.collection].push(convertEntry(entry, source)); }
      catch (error) { throw new Error(`${source.file} / ${entry.key}: ${error.message}`); }
    }
    console.log(`${source.file}: ${entries.length} 筆`);
  }
  const plans = [];
  for (const collection of ['publications', 'projects']) {
    const sourceFiles = sources.filter(source => source.collection === collection).map(source => source.file);
    if (!sourceFiles.length) continue;
    const relative = `src/content/${collection}.yaml`;
    const original = await readFile(path.join(root, relative), 'utf8');
    const existing = yaml.load(original);
    if (!Array.isArray(existing)) throw new Error(`Expected YAML list: ${relative}`);
    const rows = mergeEntries(existing, imported[collection], collection, sourceFiles);
    const ids = new Set();
    for (const row of rows) {
      schemas[collection].parse(row);
      if (!row.id || ids.has(row.id)) throw new Error(`Duplicate or missing id in ${relative}`);
      ids.add(row.id);
    }
    const target = path.join(outDir ? path.resolve(outDir) : root, relative);
    const content = '# 論文／計畫請編輯 bibliography/*.bib，再執行 npm run bib:sync。\n# 有 bibKey 的項目由腳本管理；其他項目保留手動維護。\n' + yaml.dump(rows, {lineWidth: -1, noRefs: true, sortKeys: false});
    plans.push({target, content, original});
    console.log(`${collection}: 匯入 ${imported[collection].length} 筆，保留 ${rows.length - imported[collection].length} 筆其他來源／手動資料`);
  }
  if (check) { console.log('檢查通過，未寫入檔案。'); return; }
  const written = [];
  try {
    for (const plan of plans) {
      await mkdir(path.dirname(plan.target), {recursive: true});
      await writeFile(`${plan.target}.bib-tmp`, plan.content);
    }
    for (const plan of plans) { await rename(`${plan.target}.bib-tmp`, plan.target); written.push(plan); }
  } catch (error) {
    // Restore website data if the second file cannot be replaced.
    for (const plan of written) {
      if (outDir) await rm(plan.target, {force: true});
      else await writeFile(plan.target, plan.original);
    }
    throw error;
  } finally {
    for (const plan of plans) await rm(`${plan.target}.bib-tmp`, {force: true});
  }
  console.log('YAML 已更新；請檢查差異後 commit。');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    const options = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--check') options.check = true;
      else if (['--out-dir', '--source'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
        options[args[i] === '--source' ? 'sourceFile' : 'outDir'] = args[++i];
      } else throw new Error('Usage: npm run bib:sync -- [--check] [--source FILENAME] [--out-dir DIRECTORY]');
    }
    await syncBib(options);
  } catch (error) { console.error(`轉換失敗：${error.message}`); process.exitCode = 1; }
}
