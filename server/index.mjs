import http from 'node:http';
import { readFile, writeFile, mkdir, rename, rm, copyFile, stat, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import yaml from 'js-yaml';
import {awardFields} from '../src/lib/award-fields.mjs';
import {publicationFields} from '../src/lib/publication-fields.mjs';
import {normalizeProjectTime} from '../src/lib/project-time.mjs';
import { projectFields } from '../src/lib/project-fields.mjs';
import { catalog, labels, revision, validate } from './content.mjs';
import { loadCredential, verifyPassword } from './auth.mjs';
import { MAX_IMAGE_BYTES, storePhoto } from './uploads.mjs';
import { reorderContent } from './reorder.mjs';

const root = resolve(import.meta.dirname, '..');
const dataDir = resolve(process.env.DATA_DIR || join(root, '.admin-data'));
const contentDir = resolve(process.env.CONTENT_DIR || join(root, 'src/content'));
const credentialPath = resolve(process.env.ADMIN_CREDENTIALS_FILE || join(root, '.admin-auth/credentials.json'));
const credential = await loadCredential(credentialPath);
let activeLogins = 0;
let activeUploads = 0;
const uploadDir = join(dataDir, 'uploads');
const sessions = new Map();
const attempts = new Map();
let busy = false;
let active = join(root, 'dist');
await mkdir(dataDir, { recursive: true, mode: 0o700 });
const pointer = join(dataDir, 'active-release.json');
const journal = join(dataDir, 'pending.json');
const fileFor = name => join(contentDir, `${name}.yaml`);
const exists = async path => stat(path).then(() => true, () => false);
async function atomic(path, text) {
  const temp = `${path}.tmp`;
  await writeFile(temp, text, { mode: 0o600 });
  await rename(temp, path);
}
// Complete or roll back a save interrupted by a container restart.
if (await exists(journal)) {
  const pending = JSON.parse(await readFile(journal, 'utf8'));
  const published = await readFile(pointer, 'utf8').then(JSON.parse, () => null);
  if (published?.release !== pending.release) await copyFile(pending.backup, fileFor(pending.name));
  await rm(journal);
}
if (await exists(pointer)) active = JSON.parse(await readFile(pointer, 'utf8')).release;
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const fail = (status, message) => Object.assign(new Error(message), { status });
async function body(req, max = 2_000_000) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > max) throw fail(413, '資料太大'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
const secure = process.env.COOKIE_SECURE !== 'false';
function cookie(res, value, age) { res.setHeader('Set-Cookie', `admin_session=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`); }
function session(req) {
  const token = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('admin_session='))?.slice(14);
  const found = sessions.get(token);
  if (!found || found.until < Date.now()) { sessions.delete(token); return null; }
  return { ...found, token };
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  const expected = process.env.ADMIN_ORIGIN || `${secure ? 'https' : 'http'}://${req.headers.host}`;
  if (origin !== expected) throw fail(403, '請從網站管理頁面操作');
}
async function build(outDir) {
  await new Promise((accept, reject) => {
    const child = spawn(process.execPath, [join(root, 'node_modules/astro/bin/astro.mjs'), 'build', '--outDir', outDir], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { log = (log + data).slice(-12000); });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 180_000);
    child.on('error', e => { clearTimeout(timeout); reject(e); });
    child.on('exit', code => { clearTimeout(timeout); if (code === 0) accept(); else { console.error(log); reject(new Error('網站建置失敗，已還原原本內容；請檢查欄位或聯絡維護者')); } });
  });
}
async function publish(name, input, transform) {
  if (busy) throw fail(409, '另一筆更新正在發布，請稍後重試');
  busy = true;
  let backup; let release; let committed = false;
  try {
    const path = fileFor(name);
    const old = await readFile(path, 'utf8');
    if (revision(old) !== input.revision) throw fail(409, '內容已被其他人更新，請重新載入後再編輯');
    const updated = transform ? transform(yaml.load(old)) : input.data;
    try { validate(name, updated); } catch (error) { throw fail(422, error.message); }
    if (name === 'projects') for (const row of updated) if (row.startTime !== undefined) {
      row.startTime = normalizeProjectTime(row.startTime);
      if (row.endTime) row.endTime = normalizeProjectTime(row.endTime);
      delete row.startYear; delete row.endYear; delete row.period;
    }
    const text = yaml.dump(updated, { lineWidth: -1, noRefs: true });
    const id = `${Date.now()}-${randomBytes(4).toString('hex')}`;
    const backups = join(dataDir, 'backups');
    await mkdir(backups, { recursive: true });
    backup = join(backups, `${id}-${name}.yaml`);
    release = join(dataDir, 'releases', id);
    await copyFile(path, backup);
    await atomic(journal, JSON.stringify({ name, backup, release }));
    await atomic(path, text);
    await build(release);
    await atomic(pointer, JSON.stringify({ release }));
    committed = true;
    active = release;
    await rm(journal).catch(error => console.error('清理發布紀錄失敗', error));
    // Retain five builds; YAML backups remain available to the operator.
    const releases = await readdir(join(dataDir, 'releases')).catch(() => []);
    for (const stale of releases.sort().slice(0, -5)) await rm(join(dataDir, 'releases', stale), { recursive: true, force: true }).catch(() => {});
    return { revision: revision(text), message: '已發布，網站內容已更新' };
  } catch (error) {
    if (backup && !committed) { await copyFile(backup, fileFor(name)); await rm(journal, { force: true }); if (release) await rm(release, { recursive: true, force: true }); }
    throw error;
  } finally { busy = false; }
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.woff2': 'font/woff2' };
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
      if (pathname.startsWith('/admin/api/')) {
        if (!['GET','POST','PUT'].includes(req.method)) throw fail(405, '不支援此操作');
        if (req.method !== 'GET') sameOrigin(req);
        if (pathname === '/admin/api/login' && req.method === 'POST') {
          const ip = req.socket.remoteAddress;
          const now = Date.now();
          const entry = attempts.get(ip);
          if (entry && entry.until > now && entry.count >= 5) throw fail(429, '嘗試次數過多，請 15 分鐘後再試');
          if (activeLogins >= 2) throw fail(429, '登入驗證忙碌中，請稍後再試');
          // Reserve the attempt before asynchronous hashing, so concurrent
          // requests cannot bypass the limit while verification is in progress.
          attempts.set(ip, { count: entry && entry.until > now ? entry.count + 1 : 1, until: entry && entry.until > now ? entry.until : now + 900_000 });
          activeLogins++;
          let valid;
          try {
            const input = JSON.parse((await body(req, 4096)).toString());
            valid = await verifyPassword(input.password, credential);
          } finally { activeLogins--; }
          if (!valid) throw fail(401, '密碼錯誤');
          attempts.delete(ip);
          const token = randomBytes(32).toString('hex');
          const csrf = randomBytes(24).toString('hex');
          sessions.set(token, { csrf, until: now + 8 * 3600_000 });
          cookie(res, token, 8 * 3600);
          return json(res, 200, { csrf, catalog });
        }
        const auth = session(req);
        if (!auth) throw fail(401, '請先登入');
        if (req.method !== 'GET' && req.headers['x-csrf-token'] !== auth.csrf) throw fail(403, '驗證已失效，請重新登入');
        if (pathname === '/admin/api/session' && req.method === 'GET') return json(res, 200, { csrf: auth.csrf, catalog });
        if (pathname === '/admin/api/logout' && req.method === 'POST') { sessions.delete(auth.token); cookie(res, '', 0); return json(res, 200, { ok: true }); }
        if (pathname === '/admin/api/uploads' && req.method === 'POST') {
          if (activeUploads >= 2) throw fail(429, '照片處理中，請稍後再試');
          if (Number(req.headers['content-length']) > MAX_IMAGE_BYTES) throw fail(413, '照片不能超過 10 MB');
          activeUploads++;
          try { return json(res, 201, await storePhoto(await body(req, MAX_IMAGE_BYTES), uploadDir)); }
          finally { activeUploads--; }
        }
        const sortName = pathname.match(/^\/admin\/api\/reorder\/([a-z]+)$/)?.[1];
        if (sortName && req.method === 'POST' && Object.hasOwn(labels, sortName)) {
          const input = JSON.parse((await body(req)).toString());
          return json(res,200,await publish(sortName,input,data => reorderContent(sortName,data,input.groups)));
        }
        const name = pathname.match(/^\/admin\/api\/content\/([a-z]+)$/)?.[1];
        if (!name || !Object.hasOwn(labels, name)) throw fail(404, '找不到此內容');
        if (req.method === 'GET') {
          if (busy) throw fail(409, '正在發布更新，請稍後載入');
          const text = await readFile(fileFor(name), 'utf8');
          return json(res, 200, { data: name === 'projects' ? yaml.load(text).map(projectFields) : name === 'publications' ? yaml.load(text).map(publicationFields) : name === 'awards' ? yaml.load(text).map(awardFields) : yaml.load(text), revision: revision(text) });
        }
        if (req.method === 'PUT') return json(res, 200, await publish(name, JSON.parse((await body(req)).toString())));
        throw fail(405, '不支援此操作');
      }
      const assets = { '/admin': 'index.html', '/admin/': 'index.html', '/admin/app.js': 'app.js', '/admin/style.css': 'style.css', '/admin/visual': 'visual.html', '/admin/visual.js': 'visual.js', '/admin/visual.css': 'visual.css', '/admin/inline.js': 'inline.js', '/admin/inline.css': 'inline.css' };
      if (!Object.hasOwn(assets, pathname)) throw fail(404, '找不到此頁面');
      res.setHeader('Content-Type', mime[extname(assets[pathname])]);
      return res.end(await readFile(join(root, 'server/ui', assets[pathname])));
    }
    if (!['GET','HEAD'].includes(req.method)) throw fail(405, '不支援此操作');
    if (pathname.startsWith('/images/uploads/')) {
      const name = pathname.slice('/images/uploads/'.length);
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$/.test(name)) throw fail(404, '找不到此照片');
      const path = join(uploadDir,name);
      if (!await exists(path)) throw fail(404, '找不到此照片');
      res.setHeader('Content-Type','image/webp');
      res.setHeader('Cache-Control','public, max-age=31536000, immutable');
      if (req.method === 'HEAD') return res.end();
      return createReadStream(path).on('error', () => res.destroy()).pipe(res);
    }
    let path = resolve(active, `.${pathname}`);
    if (!path.startsWith(active + sep) && path !== active) throw fail(404, '找不到此頁面');
    const info = await stat(path).catch(() => null);
    if (info?.isDirectory()) path = join(path, 'index.html');
    if (!await exists(path)) throw fail(404, '找不到此頁面');
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    if (req.method === 'HEAD') return res.end();
    createReadStream(path).on('error', () => res.destroy()).pipe(res);
  } catch (error) {
    if (!error.status && !(error instanceof SyntaxError)) console.error(error);
    json(res, error.status || 400, { error: error.status || error instanceof SyntaxError ? (error instanceof SyntaxError ? '資料格式錯誤' : error.message) : '更新失敗，內容未發布；請檢查欄位或聯絡維護者' });
  }
});
setInterval(() => {
  const now = Date.now();
  for (const [key,value] of sessions) if (value.until < now) sessions.delete(key);
  for (const [key,value] of attempts) if (value.until < now) attempts.delete(key);
}, 60_000).unref();
server.listen(Number(process.env.PORT || 4321), process.env.HOST || '0.0.0.0', () => console.log('網站及管理頁已啟動：http://localhost:' + server.address().port));
