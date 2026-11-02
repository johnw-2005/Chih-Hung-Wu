import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, cp, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import yaml from 'js-yaml';
import sharp from 'sharp';
import { storePhoto, MAX_IMAGE_BYTES } from '../server/uploads.mjs';
import { catalog, validate } from '../server/content.mjs';
import { hashPassword, verifyPassword, saveCredential, loadCredential } from '../server/auth.mjs';
const root = resolve(import.meta.dirname, '..');
// Each test run creates its own credentials, separate from the local admin.
const newPassword = () => randomBytes(32).toString('hex');

test('所有現有 YAML 通過與 Astro 共用的後台驗證', async () => {
  for (const item of catalog) {
    const data = yaml.load(await readFile(join(root,'src/content',`${item.name}.yaml`),'utf8'));
    assert.equal(validate(item.name,data),data);
  }
  assert.throws(() => validate('projects',[{id:'x',title:'test',startYear:2026,status:'錯誤分類'}]));
  assert.throws(() => validate('honors',[{id:'x',title:'test',year:2026},{id:'x',title:'test',year:2026}]));
  assert.throws(() => validate('photos',[{id:'x',caption:'test',src:'javascript:alert(1)',category:'其他'}]));
});

test('管理登入、權限、發布、衝突與建置失敗還原', { timeout: 90_000 }, async t => {
  const fixture = await mkdtemp(join(tmpdir(),'ical-admin-test-'));
  t.after(() => rm(fixture,{recursive:true,force:true}));
  for (const name of ['server','src','public','astro.config.mjs','package.json','tsconfig.json']) await cp(join(root,name),join(fixture,name),{recursive:true});
  await symlink(join(root,'node_modules'),join(fixture,'node_modules'));
  await cp(join(root,'dist'),join(fixture,'dist'),{recursive:true});
  const password = newPassword();
  const wrongPassword = password + '-invalid';
  await saveCredential(join(fixture,'.admin-auth/credentials.json'),await hashPassword(password));
  const child = spawn(process.execPath,[join(fixture,'server/index.mjs')], {cwd:fixture,env:{...process.env,ADMIN_CREDENTIALS_FILE:join(fixture,'.admin-auth/credentials.json'),COOKIE_SECURE:'false',PORT:'0',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  t.after(() => child.kill());
  let logs = ''; child.stderr.on('data',d => logs += d);
  const origin = await new Promise((accept,reject) => {
    child.stdout.on('data',d => { const match = d.toString().match(/localhost:(\d+)/); if (match) accept(`http://127.0.0.1:${match[1]}`); });
    child.on('exit',code => reject(new Error(`Server exited ${code}: ${logs}`)));
  });
  let cookie = '', csrf = '';
  const request = (path,method='GET',data,headers={}) => fetch(origin+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf,...headers},body:data === undefined ? undefined : JSON.stringify(data)});
  assert.equal((await request('/')).status,200);
  const admin = await request('/admin'); assert.equal(admin.status,200); assert.equal(admin.headers.get('x-robots-tag'),'noindex, nofollow');
  assert.equal((await request('/admin/visual')).status,200);
  assert.match((await request('/admin')).headers.get('content-security-policy'),/frame-ancestors 'self'/);
  assert.equal((await request('/admin/inline.js')).status,200);
  const publicHtml = await (await request('/')).text();
  for (const collection of ['profile','lab','publications','projects','graduates','awards','honors','services','academics','photos']) {
    assert.ok(publicHtml.includes('data-edit-collection="'+collection+'"'),collection+' must have an edit target');
  }
  assert.ok(!publicHtml.includes('class="ical-pencil"'));
  assert.equal((await request('/admin/api/content/profile')).status,401);
  assert.equal((await request('/admin/api/uploads','POST',{})).status,401);
  assert.equal((await request('/admin/api/reorder/awards','POST',{})).status,401);
  assert.equal((await request('/admin/api/login','POST',{password:wrongPassword})).status,401);
  const login = await request('/admin/api/login','POST',{password});
  assert.equal(login.status,200); assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  cookie = login.headers.get('set-cookie').split(';')[0]; csrf = (await login.json()).csrf;
  const photo = await sharp({create:{width:40,height:20,channels:3,background:'#296b53'}}).png().toBuffer();
  const upload = (bytes,headers={}) => fetch(origin+'/admin/api/uploads',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'image/png',...headers},body:bytes});
  assert.equal((await upload(photo,{'X-CSRF-Token':''})).status,403);
  assert.equal((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).status,415);
  assert.equal((await upload(Buffer.from([0xff,0xd8,0xff,0,0]))).status,415);
  const uploaded = await upload(photo); assert.equal(uploaded.status,201);
  const image = await uploaded.json(); assert.match(image.src,/^\/images\/uploads\/[a-f0-9-]+\.webp$/);
  const imageResponse = await request(image.src);
  assert.equal(imageResponse.status,200); assert.equal(imageResponse.headers.get('content-type'),'image/webp');
  const uploadedBytes = Buffer.from(await imageResponse.arrayBuffer());
  const metadata = await sharp(uploadedBytes).metadata();
  assert.equal(metadata.width,40); assert.equal(metadata.height,20); assert.equal(metadata.exif,undefined);
  assert.equal((await request('/images/uploads/invalid.webp')).status,404);

  assert.equal((await request('/admin/api/content/profile','PUT',{}, {'X-CSRF-Token':''})).status,403);
  assert.equal((await request('/admin/api/logout','POST',{}, {Origin:'https://other.example'})).status,403);
  const awardsBefore = await (await request('/admin/api/content/awards')).json();
  const pair = awardsBefore.data.filter(row=>row.year===2022).sort((a,b)=>(a.order??0)-(b.order??0)).slice(0,2);
  assert.equal(pair.length,2);
  const sortRequest = {revision:awardsBefore.revision,groups:[{ids:pair.map(row=>row.id).reverse()}]};
  assert.equal((await request('/admin/api/reorder/awards','POST',sortRequest,{'X-CSRF-Token':''})).status,403);
  const sorting = await request('/admin/api/reorder/awards','POST',sortRequest);
  assert.equal(sorting.status,200,await sorting.clone().text());
  const awardsAfter = await (await request('/admin/api/content/awards')).json();
  assert.notEqual(awardsAfter.revision,awardsBefore.revision);
  assert.ok(awardsAfter.data.find(row=>row.id===pair[1].id).order < awardsAfter.data.find(row=>row.id===pair[0].id).order);
  const sortedHtml = await (await request('/')).text();
  assert.ok(sortedHtml.indexOf('data-edit-id="'+pair[1].id+'"') < sortedHtml.indexOf('data-edit-id="'+pair[0].id+'"'));
  assert.equal((await request('/admin/api/reorder/awards','POST',sortRequest)).status,409);
  const projectsBefore = await (await request('/admin/api/content/projects')).json();
  const projectId = projectsBefore.data[0].id;
  const projectRequest = structuredClone(projectsBefore);
  projectRequest.data[0].status = '進行中';
  projectRequest.data[0].funding = '教育部';
  delete projectRequest.data[0].projectUrl;
  const projectSave = await request('/admin/api/content/projects','PUT',projectRequest);
  assert.equal(projectSave.status,200,await projectSave.clone().text());
  const projectHtml = await (await request('/')).text();
  const projectCard = projectHtml.split('data-edit-id="'+projectId+'"')[1].split('</li>')[0];
  assert.ok(projectCard.includes('data-project-status="進行中"'));
  assert.ok(!projectCard.includes('data-project-link'));
  assert.ok(!projectCard.includes('href="https://www.moe.gov.tw'));
  if (projectRequest.data[0].sourceUrl) assert.ok(!projectCard.includes('href="'+projectRequest.data[0].sourceUrl+'"'));
  assert.ok(!projectCard.includes('補助單位：'));
  assert.ok(!projectCard.includes('經費來源：'));
  const projectRevision = (await projectSave.json()).revision;
  projectRequest.revision = projectRevision;
  projectRequest.data[0].status = '已完成';
  delete projectRequest.data[0].endTime;
  assert.equal((await request('/admin/api/content/projects','PUT',projectRequest)).status,422);
  projectRequest.data[0].startTime = '2021/8';
  projectRequest.data[0].endTime = '2022/7/31';
  projectRequest.data[0].projectUrl = 'https://example.gov.tw/projects/123';
  assert.equal((await request('/admin/api/content/projects','PUT',projectRequest)).status,200);
  const completedCard = (await (await request('/')).text()).split('data-edit-id="'+projectId+'"')[1].split('</li>')[0];
  assert.ok(completedCard.includes('data-project-status="已完成"'));
  assert.ok(completedCard.includes('2021/08 – 2022/07/31'));
  const timeSaved = (await (await request('/admin/api/content/projects')).json()).data[0];
  assert.equal(timeSaved.startTime,'2021/08');
  assert.equal(timeSaved.startYear,undefined);
  assert.equal(timeSaved.period,undefined);
  assert.ok(completedCard.includes('href="https://example.gov.tw/projects/123"'));
  assert.match(completedCard, /<h3[^>]*>\s*<a[^>]*data-project-link[^>]*>/);
  assert.ok(completedCard.includes('target="_blank"'));
  const before = await (await request('/admin/api/content/profile')).json();
  const invalid = structuredClone(before); invalid.data.email = 'invalid';
  assert.equal((await request('/admin/api/content/profile','PUT',invalid)).status,422);
  assert.deepEqual(await (await request('/admin/api/content/profile')).json(),before);
  const update = structuredClone(before); update.data.tagline = '管理發布整合測試文字'; update.data.photo = image.src;
  const saved = await request('/admin/api/content/profile','PUT',update);
  assert.equal(saved.status,200,await saved.clone().text());
  assert.match(await (await request('/')).text(),/管理發布整合測試文字/);
  assert.ok((await (await request('/')).text()).includes(image.src));
  assert.equal((await request('/admin/api/content/profile','PUT',before)).status,409);
  const after = await (await request('/admin/api/content/profile')).json();
  await writeFile(join(fixture,'astro.config.mjs'),"throw new Error('intentional build failure');\n");
  const failing = structuredClone(after); failing.data.tagline = '不應發布的內容';
  assert.equal((await request('/admin/api/content/profile','PUT',failing)).status,400);
  assert.deepEqual(await (await request('/admin/api/content/profile')).json(),after);
  assert.match(await (await request('/')).text(),/管理發布整合測試文字/);
  assert.equal((await request('/admin/api/logout','POST')).status,200);
  assert.equal((await request('/admin/api/session')).status,401);
  for (let i = 0; i < 5; i++) assert.equal((await request('/admin/api/login','POST',{password:wrongPassword})).status,401);
  assert.equal((await request('/admin/api/login','POST',{password:wrongPassword})).status,429);
  const pointer = JSON.parse(await readFile(join(fixture,'.admin-data/active-release.json'),'utf8'));
  assert.match(await readFile(join(pointer.release,'index.html'),'utf8'),/管理發布整合測試文字/);
  // Simulate a process crash after YAML was written but before publishing.
  child.kill();
  await new Promise(accept => child.once('exit',accept));
  const contentPath = join(fixture,'src/content/profile.yaml');
  const backup = join(fixture,'.admin-data/recovery-backup.yaml');
  await cp(contentPath,backup);
  const interrupted = yaml.load(await readFile(contentPath,'utf8'));
  interrupted.tagline = '中斷的未發布內容';
  await writeFile(contentPath,yaml.dump(interrupted));
  await writeFile(join(fixture,'.admin-data/pending.json'),JSON.stringify({name:'profile',backup,release:join(fixture,'.admin-data/releases/interrupted')}));
  const restarted = spawn(process.execPath,[join(fixture,'server/index.mjs')],{cwd:fixture,env:{...process.env,ADMIN_CREDENTIALS_FILE:join(fixture,'.admin-auth/credentials.json'),COOKIE_SECURE:'false',PORT:'0',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  t.after(() => restarted.kill());
  const restartedOrigin = await new Promise((accept,reject) => {
    restarted.stdout.on('data',d => { const match = d.toString().match(/localhost:(\d+)/); if (match) accept(`http://127.0.0.1:${match[1]}`); });
    restarted.on('exit',code => reject(new Error(`Restart failed: ${code}`)));
  });
  assert.equal(yaml.load(await readFile(contentPath,'utf8')).tagline,after.data.tagline);
  assert.match(await (await fetch(restartedOrigin)).text(),/管理發布整合測試文字/);
  assert.deepEqual(Buffer.from(await (await fetch(restartedOrigin+image.src)).arrayBuffer()),uploadedBytes);
  assert.equal((await fetch(restartedOrigin+'/admin/api/session',{headers:{Cookie:cookie}})).status,401);
});


test('加鹽雜湊、憑證損壞與密碼輪替', async t => {
  const folder = await mkdtemp(join(tmpdir(),'ical-auth-test-'));
  t.after(() => rm(folder,{recursive:true,force:true}));
  const password = newPassword();
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first.salt,second.salt);
  assert.notEqual(first.key,second.key);
  assert.equal(JSON.stringify(first).includes(password),false);
  assert.equal(await verifyPassword(password,first),true);
  assert.equal(await verifyPassword(password + '-invalid',first),false);
  assert.equal(await verifyPassword({password},first),false);
  const shortPassword = newPassword().slice(0,1);
  const short = await hashPassword(shortPassword);
  assert.equal(await verifyPassword(shortPassword,short),true);
  await assert.rejects(() => hashPassword(''));
  await assert.rejects(() => hashPassword('   '));
  await assert.rejects(() => hashPassword(newPassword().repeat(17)));
  const path = join(folder,'private/credentials.json');
  await saveCredential(path,first);
  assert.deepEqual(await loadCredential(path),first);
  const replacementPassword = newPassword();
  const replacement = await hashPassword(replacementPassword);
  await saveCredential(path,replacement);
  assert.equal(await verifyPassword(password,await loadCredential(path)),false);
  assert.equal(await verifyPassword(replacementPassword,await loadCredential(path)),true);
  await writeFile(path,JSON.stringify({...first,N:1}),{mode:0o600}).catch(async () => {
    await rm(path); await writeFile(path,JSON.stringify({...first,N:1}));
  });
  await assert.rejects(() => loadCredential(path));
  await assert.rejects(() => loadCredential(join(folder,'missing')));
});


test('沒有有效憑證時拒絕啟動，不接受環境變數密碼作為替代', async () => {
  const run = promisify(execFile);
  const rejectedPassword = newPassword();
  await assert.rejects(() => run(process.execPath,[join(root,'server/index.mjs')],{
    env:{...process.env,ADMIN_PASSWORD:rejectedPassword,ADMIN_CREDENTIALS_FILE:join(tmpdir(),'ical-missing-'+Date.now()),PORT:'0'},
  }), error => { assert.match(error.stderr,/尚未設定管理密碼/); assert.equal(error.stderr.includes(rejectedPassword),false); return true; });
  await assert.rejects(() => run(process.execPath,[join(root,'server/set-password.mjs')]),error => {
    assert.match(error.stderr,/互動式終端機/); return true;
  });
});


test('照片處理限制大小、格式，且轉檔縮小尺寸', async t => {
  const folder = await mkdtemp(join(tmpdir(),'ical-upload-test-'));
  t.after(() => rm(folder,{recursive:true,force:true}));
  await assert.rejects(() => storePhoto(Buffer.alloc(MAX_IMAGE_BYTES+1),folder),error => error.status === 413);
  await assert.rejects(() => storePhoto(Buffer.from('not a photo'),folder),error => error.status === 415);
  const photo = await sharp({create:{width:3000,height:1000,channels:3,background:'#235941'}}).jpeg().toBuffer();
  const result = await storePhoto(photo,folder);
  assert.equal(result.width,2560);
  assert.equal(result.height,853);
  const saved = await sharp(join(folder,result.src.split('/').at(-1))).metadata();
  assert.equal(saved.format,'webp');
  assert.equal(saved.exif,undefined);
});
