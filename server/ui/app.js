const $ = s => document.querySelector(s);
const parameters = new URLSearchParams(location.search);
const embedded = parameters.get('embed') === '1' && window.parent !== window;
if (embedded) document.body.classList.add('embedded');
let focusedPhotoIndex = 0;
const indexValue = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
let csrf, catalog, current, data, revision, selectedId, dirty = false, saving = false, uploads = 0, deletedCount = 0, sectionIndex = 0;
const modified = new Set();
const sections = {
  profile: [
    {label:'基本資料',keys:['name','nameEn','title','affiliation','email','phone','office','bio','tagline','cvUrl']},
    {label:'學歷與經歷',keys:['highlights','education','experience','schools']},
    {label:'研究領域',keys:['researchAreas','interests']},
    {label:'照片',keys:['photo','photos']},
    {label:'相關連結',keys:['links']},
  ],
  lab: [
    {label:'基本資料',keys:['name','nameEn','intro','introEn','email','phone','office','address','addressEn']},
    {label:'研究與宗旨',keys:['researchTopics','mission']},
    {label:'照片與地圖',keys:['photos','campusMap']},
    {label:'相關連結',keys:['links']},
  ],
};
const imageKeys = new Set(['src','photo','image','campusMap']);
const labels = { name:'名稱', nameEn:'英文名稱', title:'標題／職稱', affiliation:'任職單位', email:'電子郵件', phone:'電話', office:'辦公室', photo:'頁首大頭照', bio:'個人簡介', tagline:'首頁簡介', highlights:'重點職務', role:'職務／角色', organization:'單位／機構', period:'期間', education:'學歷', degree:'學位', school:'學校', field:'領域／系所', year:'年份', experience:'經歷', order:'同年份內排序（數字愈小愈前面）', schools:'就讀學校', researchAreas:'研究領域', interests:'研究興趣', cvUrl:'履歷連結', photos:'照片集', src:'照片', caption:'照片說明', alt:'圖片替代文字', links:'相關連結', label:'連結名稱', url:'網址', intro:'中文介紹', introEn:'英文介紹', researchTopics:'研究主題', mission:'實驗室宗旨', address:'中文地址', addressEn:'英文地址', campusMap:'校園地圖', authors:'作者', venue:'期刊／會議', link:'參考連結', doi:'DOI', abstract:'摘要', status:'計畫進度', startTime:'開始時間', endTime:'結束時間', startYear:'開始年份', endYear:'結束年份', funding:'計畫來源', grant:'計畫編號', projectUrl:'計畫官方詳細頁面（選填）', image:'照片', detail:'詳細說明', sourceUrl:'來源連結', student:'學生姓名', thesis:'論文名稱', award:'獎項名稱', recipient:'獲獎人', category:'分類' };
function el(tag, text, className) { const n = document.createElement(tag); if (text) n.textContent = text; if (className) n.className = className; return n; }
function message(text, error = false) { $('#status').textContent = text; $('#status').className = error ? 'error' : 'success'; }
async function api(path, options = {}) {
  const response = await fetch('/admin/api/' + path, { ...options, headers: { 'Content-Type':'application/json', 'X-CSRF-Token':csrf || '', ...options.headers } });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== 'login') { $('#login').hidden = false; $('#workspace').hidden = true; $('#logout').hidden = true; }
    throw new Error(result.error || '連線失敗，請稍後再試');
  }
  return result;
}
const selectedRow = () => current.single ? data : data.find(row => row.id === selectedId);
function compareRowsByDate(a,b) {
  const year = row => row.year ?? (row.startTime ? Number((row.endTime || row.startTime).slice(0,4)) : row.endYear ?? row.startYear ?? 0);
  return year(b) - year(a) || (a.order ?? 0) - (b.order ?? 0);
}
const rowTitle = row => row?.title || row?.student || row?.caption || row?.role || '新增資料';
function updateState() {
  const count = modified.size + deletedCount;
  $('#draft-state').textContent = uploads ? '照片上傳中…' : count ? `${count} 筆修改尚未發布` : '所有修改皆已發布';
  $('#save').textContent = saving ? '發布中…' : count ? `儲存並發布（${count}）` : '儲存並發布';
  $('#save').disabled = saving || uploads > 0;
}
function changed() {
  dirty = true; modified.add(current.single ? current.name : selectedId);
  updateState(); renderList();
}
function initial(spec) {
  if (spec.type === 'object') return Object.fromEntries(Object.entries(spec.fields).filter(([k,v]) => !v.optional && k !== 'id').map(([k,v]) => [k, initial(v)]));
  if (spec.type === 'array') return [];
  if (spec.type === 'enum') return spec.options[0];
  return spec.type === 'number' ? new Date().getFullYear() : '';
}
function button(text, action, className) { const n = el('button', text, className); n.type = 'button'; n.onclick = action; return n; }
function safeImage(src) { return typeof src === 'string' && (/^\/(?!\/)/.test(src) || /^https:\/\//i.test(src)); }
function lockUploads() {
  $('#categories').inert = uploads > 0;
  $('#record-list').inert = uploads > 0;
  $('#add').disabled = uploads > 0;
  $('#delete-record').disabled = uploads > 0;
  updateState();
}
function imageField(key, spec, value, set) {
  const wrap = el('div', '', 'image-picker');
  wrap.dataset.required = String(!spec.optional);
  const image = el('img'); image.alt = '目前選用的照片'; image.className = 'image-preview'; image.hidden = true;
  const empty = el('div','尚未選擇照片','image-empty');
  const info = el('p','選擇電腦裡的照片，上傳後即可預覽。','hint');
  const source = el('input'); source.type = 'text'; source.value = value || ''; source.placeholder = '/images/… 或 https://…';
  source.setAttribute('aria-label',(labels[key] || key) + '的圖片網址');
  const draw = () => { wrap.dataset.empty = String(!source.value.trim()); image.hidden = !safeImage(source.value); empty.hidden = !image.hidden; if (!image.hidden) image.src = source.value; else image.removeAttribute('src'); };
  image.onerror = () => { image.hidden = true; empty.hidden = false; empty.textContent = '圖片無法顯示，請重新上傳或確認網址'; };
  const file = el('input'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp'; file.hidden = true;
  file.setAttribute('aria-label', '上傳' + (labels[key] || '照片'));
  const pick = button(value ? '更換照片' : '上傳照片', () => file.click(), 'upload-button');
  const remove = button('移除照片', () => { source.value = ''; set(undefined); draw(); pick.textContent = '上傳照片'; info.textContent = '已移除選用照片，儲存並發布後生效。'; });
  const actions = el('div','','image-actions'); actions.append(pick,remove);
  file.onchange = async () => {
    const photo = file.files[0]; if (!photo) return;
    if (photo.size > 10 * 1024 * 1024) { info.textContent = '照片不能超過 10 MB，請選擇其他檔案。'; file.value = ''; return; }
    uploads++; lockUploads(); wrap.inert = true; info.textContent = '正在上傳照片…';
    try {
      const result = await api('uploads',{method:'POST',headers:{'Content-Type':photo.type || 'application/octet-stream'},body:photo});
      source.value = result.src; set(result.src); draw(); pick.textContent = '更換照片';
      info.textContent = '照片上傳完成，記得按「儲存並發布」套用到網站。';
    } catch (error) { info.textContent = error.message; message(error.message,true); }
    finally { uploads--; lockUploads(); wrap.inert = false; file.value = ''; }
  };
  source.oninput = () => { set(source.value || undefined); draw(); };
  const advanced = el('details','','image-advanced'); advanced.append(el('summary','使用圖片網址（進階）'),source);
  draw(); wrap.append(image,empty,actions,file,el('p','JPG、PNG、WebP，每張最多 10 MB。','hint'),info,advanced);
  return wrap;
}
function updateProjectEndRequirement() {
  const end = $('#fields').querySelector('[data-project-end-time]');
  if (end) end.required = selectedRow()?.status === '已完成';
}
function field(key, spec, value, set) {
  const wrap = el('div', '', 'field');
  if (spec.type === 'object') {
    const obj = value || {};
    for (const [k,s] of Object.entries(spec.fields)) if (k !== 'id' && !(current.name === 'awards' && ['sourceUrl','order'].includes(k)) && !(current.name === 'publications' && ['doi','links'].includes(k)) && !(current.name === 'projects' && ['sourceUrl','startYear','endYear','period'].includes(k))) wrap.append(field(k,s,obj[k],v => { if (v === undefined) delete obj[k]; else obj[k] = v; set(obj); }));
    return wrap;
  }
  const label = el('label', (labels[key] || key) + (spec.optional ? '' : ' *')); wrap.append(label);
  if (spec.type === 'array') {
    const arr = value || []; const entries = el('div');
    if (spec.item.type === 'object') {
      let index = key === 'photos' ? Math.max(0,Math.min(focusedPhotoIndex,arr.length - 1)) : 0;
      const draw = () => {
        entries.replaceChildren();
        if (!arr.length) { entries.append(el('p','尚無項目，按下方按鈕新增。','hint')); return; }
        const choose = el('select'); choose.setAttribute('aria-label','選擇' + (labels[key] || '項目'));
        arr.forEach((item,i) => { const option = el('option', `${i + 1}. ${item.caption || item.role || item.degree || item.label || '新項目'}`); option.value = i; choose.append(option); });
        choose.value = index;
        choose.onchange = () => { if (uploads || !validCurrent()) { choose.value = index; return; } index = Number(choose.value); draw(); };
        const row = el('div','','nested');
        row.append(el('p',`${labels[key] || '項目'} ${index + 1} / ${arr.length}`,'nested-title'));
        row.append(field(key,spec.item,arr[index],v => { arr[index] = v; set(arr); }));
        row.append(button('移除此項',() => { if (uploads || !confirm('確定移除此項？儲存並發布後才會生效。')) return; arr.splice(index,1); index = Math.max(0,Math.min(index,arr.length - 1)); set(arr); draw(); },'danger'));
        entries.append(choose,row);
      };
      draw(); wrap.append(entries,button('＋ 新增' + (labels[key] || '項目'),() => { if (uploads || !validCurrent()) return; arr.push(initial(spec.item)); index = arr.length - 1; set(arr); draw(); }));
      return wrap;
    }
    const draw = () => {
      entries.replaceChildren();
      arr.forEach((v,i) => {
        const row = el('div', '', 'nested'); row.append(el('p',`${labels[key] || '項目'} ${i + 1}`,'nested-title'));
        row.append(field(key,spec.item,v,val => { arr[i] = val; set(arr); }));
        row.append(button('移除這個項目',() => { if (uploads) return; if (confirm('確定移除此項？儲存並發布後才會生效。')) { arr.splice(i,1); set(arr); draw(); } },'danger'));
        entries.append(row);
      });
    };
    draw(); wrap.append(entries,button('＋ 新增' + (labels[key] || '項目'),() => { if (uploads) return; arr.push(initial(spec.item)); set(arr); draw(); }));
    return wrap;
  }
  if (imageKeys.has(key)) { wrap.append(imageField(key,spec,value,set)); return wrap; }
  if (current.name === 'projects' && key === 'title') label.textContent = '計畫名稱';
  if (current.name === 'projects' && key === 'category') label.textContent = '計畫類型';
  if (current.name === 'publications' && key === 'link') label.textContent = '論文網址（選填）';
  if (current.name === 'publications' && key === 'venue') label.textContent = '發表資訊（期刊／會議、卷期、頁碼）';
  if (current.name === 'awards' && key === 'title') label.textContent = '活動／論文名稱';
  if (current.name === 'awards' && key === 'award') label.textContent = '獲得獎項';
  if (current.name === 'awards' && key === 'recipient') label.textContent = '獲獎人／團隊';
  if (current.name === 'awards' && key === 'organization') label.textContent = '相關單位／會議（選填）';
  if (current.name === 'awards' && key === 'detail') label.textContent = '補充說明（選填）';
  let input;
  if (spec.type === 'enum') {
    input = el('select'); if (spec.optional) { const o = el('option','未設定'); o.value = ''; input.append(o); }
    spec.options.forEach(v => { const o = el('option',v); o.value = v; input.append(o); });
  } else if (['bio','tagline','intro','introEn','detail','abstract','venue','authors','addressEn','thesis','title'].includes(key)) { input = el('textarea'); input.rows = ['intro','introEn','bio','abstract','detail'].includes(key) ? 5 : 2; }
  else { input = el('input'); input.type = spec.type === 'number' ? 'number' : key === 'email' ? 'email' : 'text'; if (spec.type === 'number') input.step = 'any'; }
  input.value = value ?? ''; input.required = !spec.optional; label.htmlFor = input.id = 'field-' + crypto.randomUUID();
  input.oninput = () => { const v = input.value; set(v === '' && spec.optional ? undefined : spec.type === 'number' ? (v === '' ? undefined : Number(v)) : v); if (key === 'status' && current.name === 'projects') updateProjectEndRequirement(); };
  wrap.append(input);
  if (current.name === 'projects' && ['startTime','endTime'].includes(key)) { input.placeholder = '例如：2021、2021/08、2021/08/01'; input.required = key === 'startTime' || selectedRow()?.status === '已完成'; if (key === 'endTime') input.setAttribute('data-project-end-time',''); wrap.append(el('p',key === 'startTime' ? '使用西元年；只知道年份就填年份，不必猜日期。' : '已完成的計畫必填，可只填年份；進行中可留空，顯示「至今」。','hint')); }
  if (key === 'status' && current.name === 'projects') wrap.append(el('p','儲存並發布後，卡片會顯示對應的進度標籤；年份與排序維持原設定。','hint'));
  if (current.name === 'publications' && key === 'link') { input.type = 'url'; input.placeholder = 'https://doi.org/… 或出版社的論文網址'; wrap.append(el('p','填一個網址即可。發布後點論文標題開啟，不會再重複顯示 DOI 或出版資訊按鈕。','hint')); }
  if (key === 'projectUrl') { input.type = 'url'; input.placeholder = 'https://…'; wrap.append(el('p','貼上機關網站中這一筆計畫的詳細頁面網址。發布後點計畫名稱即可開啟；留空則不加連結。','hint')); }
  if (current.name === 'awards' && key === 'title') wrap.append(el('p','只填活動或論文名稱，獎項請填下一欄。','hint'));
  if (current.name === 'awards' && key === 'detail') wrap.append(el('p','只填額外資訊，不用重複獲獎人、獎項或相關單位。','hint'));
  if (key === 'funding') { input.placeholder = '例如：教育部'; wrap.append(el('p','填寫來源機關名稱，例如科技部、教育部；不確定時可留空。','hint')); }
  return wrap;
}
function renderList() {
  if (current.single) return;
  const term = $('#search').value.toLocaleLowerCase();
  const rows = data.filter(row => JSON.stringify(row).toLocaleLowerCase().includes(term)).sort(compareRowsByDate);
  $('#count').textContent = term ? `找到 ${rows.length} 筆，共 ${data.length} 筆資料` : `共 ${data.length} 筆資料`;
  const target = $('#record-list'); const scroll = target.scrollTop; target.replaceChildren();
  rows.forEach(row => {
    const b = button('',() => select(row.id),'record-button' + (row.id === selectedId ? ' active' : ''));
    b.setAttribute('aria-current',row.id === selectedId ? 'true' : 'false');
    const src = row.src || row.image;
    if (safeImage(src)) { const img = el('img'); img.src = src; img.alt = ''; img.loading = 'lazy'; b.append(img); }
    const text = el('span','','record-text'); text.append(el('strong',rowTitle(row)));
    const date = row.startTime ? (row.endTime === row.startTime ? row.startTime : row.startTime + (row.endTime ? ' – ' + row.endTime : row.status === '進行中' ? ' – 至今' : '')) : row.year ?? (row.startYear ? `${row.startYear}${row.endYear ? ' – ' + row.endYear : ' – 至今'}` : undefined);
    const meta = [date,row.category || row.status].filter(Boolean).join(' · ');
    if (meta) text.append(el('small',meta));
    if (modified.has(row.id)) text.append(el('small','● 未發布','draft-badge'));
    if (row.id === selectedId) text.append(el('small','正在編輯','editing-badge'));
    b.append(text); target.append(b);
  });
  if (!rows.length) target.append(el('p',term ? '沒有符合的資料，請換個關鍵字。' : '尚無資料，按「新增一筆」開始。','hint'));
  target.scrollTop = scroll;
}
function validCurrent() {
  if (!$('#edit-form').reportValidity()) return false;
  const missing = $('#fields').querySelector('.image-picker[data-required="true"][data-empty="true"]');
  if (missing) { message('請先上傳目前項目需要的照片。',true); missing.querySelector('button').focus(); return false; }
  return true;
}
function select(id) {
  if (saving || uploads || id === selectedId) return;
  if (!validCurrent()) return;
  selectedId = id; renderEditor(); renderList();
  $('.record-editor').scrollIntoView({block:'nearest'});
}
function renderEditor() {
  const row = selectedRow(); $('#fields').replaceChildren();
  $('#delete-record').hidden = current.single || !row;
  $('#section-tabs').replaceChildren();
  if (row && current.single) {
    const groups = sections[current.name];
    groups.forEach((group,index) => {
      const b = button(group.label,() => { if (uploads || saving || index === sectionIndex || !validCurrent()) return; sectionIndex = index; renderEditor(); },index === sectionIndex ? 'section-selected' : '');
      b.setAttribute('aria-pressed',String(index === sectionIndex)); $('#section-tabs').append(b);
    });
    const fields = Object.fromEntries(groups[sectionIndex].keys.map(key => [key,current.schema.fields[key]]));
    $('#fields').append(field('',{...current.schema,fields},row,changed));
  } else if (row) $('#fields').append(field('',current.schema,row,changed));
  updateState();
}
function render() {
  $('#title').textContent = current.label; $('#add').hidden = current.single; $('#search').hidden = current.single;
  $('#record-list').hidden = current.single;
  $('#record-workspace').classList.toggle('single',current.single);
  if (current.single) $('#count').textContent = '基本資料';
  renderList(); renderEditor();
}
async function load(item, focus = {}) {
  if (saving || uploads || (dirty && !confirm('尚有未發布的修改，確定捨棄並切換類別？'))) return;
  try {
    const result = await api('content/' + item.name);
    current = item; data = item.single ? result.data : result.data.sort(compareRowsByDate); revision = result.revision; dirty = false; modified.clear(); deletedCount = 0; sectionIndex = Math.max(0,Math.min(indexValue(focus.section),(sections[item.name]?.length || 1) - 1));
    focusedPhotoIndex = Math.max(0,indexValue(focus.index));
    selectedId = current.single ? undefined : focus.id ? data.find(row => row.id === focus.id)?.id : data[0]?.id;
    $('#search').value = ''; message(focus.id && !selectedId && !current.single ? '這筆資料已不存在，請關閉編輯並重新整理網頁。' : ''); render();
    document.querySelectorAll('#categories button').forEach(b => { b.classList.toggle('selected',b.dataset.name === item.name); b.setAttribute('aria-current',b.dataset.name === item.name ? 'page' : 'false'); });
  } catch(e) { message(e.message,true); }
}
async function enter(result) {
  if (parameters.get('view') === 'visual') { location.replace('/admin/visual' + location.hash); return; }
  csrf = result.csrf; catalog = result.catalog;
  $('#login').hidden = true; $('#workspace').hidden = false; $('#logout').hidden = false;
  $('#categories').replaceChildren(...catalog.map(item => { const b = button(item.label,() => load(item)); b.dataset.name = item.name; return b; }));
  await load(catalog.find(item => item.name === parameters.get('collection')) || current || catalog[0],{id:parameters.get('record'),section:parameters.get('section'),index:parameters.get('index')});
}
$('#login-form').onsubmit = async e => { e.preventDefault(); const b = e.submitter; b.disabled = true; try { const result = await api('login',{method:'POST',body:JSON.stringify({password:$('#password').value})}); $('#password').value = ''; await enter(result); } catch(e) { message(e.message,true); } finally { b.disabled = false; } };
$('#logout').onclick = async () => { if (saving || uploads || (dirty && !confirm('尚有未發布的修改，確定登出？'))) return; try { await api('logout',{method:'POST'}); dirty = false; location.reload(); } catch(e) { message(e.message,true); } };
$('#search').oninput = renderList;
$('#add').onclick = () => {
  if (uploads || !validCurrent()) return;
  const row = initial(current.schema); row.id = current.name + '-' + crypto.randomUUID(); data.unshift(row); selectedId = row.id; $('#search').value = '';
  changed(); render(); $('#fields').querySelector('input:not([type=file]),textarea,select')?.focus();
};
$('#delete-record').onclick = () => {
  if (saving || uploads || !confirm('確定刪除這筆資料？儲存並發布後才會生效。')) return;
  const index = data.findIndex(row => row.id === selectedId);
  data.splice(index,1); modified.delete(selectedId); deletedCount++; dirty = true;
  selectedId = data[Math.min(index,data.length - 1)]?.id; render();
};
$('#edit-form').onsubmit = async e => {
  e.preventDefault(); if (saving || uploads) return;
  if (!validCurrent()) return;
  saving = true; $('#fields').inert = true; $('#record-list').inert = true; $('#categories').inert = true; $('#add').disabled = true; $('#delete-record').disabled = true; updateState();
  message('正在檢查內容並發布，請稍候…');
  try { const result = await api('content/' + current.name,{method:'PUT',body:JSON.stringify({data,revision})}); revision = result.revision; dirty = false; modified.clear(); deletedCount = 0; renderList(); message(result.message); if (embedded) window.parent.postMessage({type:'ical-published'},location.origin); }
  catch(e) { message(e.message,true); }
  finally { saving = false; $('#fields').inert = false; $('#record-list').inert = false; $('#categories').inert = false; $('#add').disabled = false; $('#delete-record').disabled = false; updateState(); }
};
window.addEventListener('message',event => {
  if (!embedded || event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'ical-request-close') return;
  if (saving || uploads) { message('正在上傳或發布，請稍候再關閉。',true); return; }
  if (dirty && !confirm('尚有未發布的修改，確定捨棄並關閉？')) return;
  dirty = false;
  window.parent.postMessage({type:'ical-close-approved'},location.origin);
});
window.addEventListener('beforeunload',e => { if (dirty || saving || uploads) { e.preventDefault(); e.returnValue = ''; } });
api('session').then(enter).catch(() => {});
