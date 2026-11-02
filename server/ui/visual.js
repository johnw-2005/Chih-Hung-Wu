const preview = document.querySelector('#site-preview');
const editor = document.querySelector('#inline-editor');
const dialog = document.querySelector('#edit-dialog');
const status = document.querySelector('#visual-status');
let published = false;
let csrf = '';
let sortSaving = false;
const sorts = new Map();
const saveSort = document.querySelector('#save-sort');
const cancelSort = document.querySelector('#cancel-sort');
function reloadPreview() { const url = new URL(preview.contentWindow.location.href); if (url.searchParams.get('edit') === '1') preview.contentWindow.location.reload(); else {url.searchParams.set('edit','1');preview.src = url.href;} }
function sortState(text) {saveSort.hidden = cancelSort.hidden = sorts.size === 0;status.hidden = !text;status.textContent = text || ''; }

const labels = {profile:'教授簡介',lab:'實驗室',publications:'論文',projects:'計畫',graduates:'指導論文',awards:'獲獎紀錄',honors:'榮譽',services:'一般服務',academics:'學術服務',photos:'照片'};
const close = () => editor.contentWindow?.postMessage({type:'ical-request-close'},location.origin);
document.querySelector('#close-editor').onclick = close;
dialog.addEventListener('cancel',event => {event.preventDefault();close();});
window.addEventListener('message',event => {
  if (event.origin !== location.origin || !event.data || typeof event.data !== 'object') return;
  const message = event.data;
  if (event.source === preview.contentWindow && message.type === 'ical-edit' && Object.hasOwn(labels,message.collection)) {
    if (dialog.open || sortSaving) return;
    if (sorts.size) {sortState('請先儲存或取消排序，再編輯內容。');return;}
    const url = new URL('/admin',location.origin); url.searchParams.set('embed','1');url.searchParams.set('collection',message.collection);
    if (typeof message.id === 'string') url.searchParams.set('record',message.id);
    if (/^\d+$/.test(message.section || '')) url.searchParams.set('section',message.section);
    if (/^\d+$/.test(message.index || '')) url.searchParams.set('index',message.index);
    document.querySelector('#dialog-title').textContent = '編輯' + labels[message.collection];
    published = false; editor.src = url.href; dialog.showModal();
  }
  if (event.source === preview.contentWindow && message.type === 'ical-sort-status' && typeof message.text === 'string') sortState(message.text);
  if (event.source === preview.contentWindow && message.type === 'ical-sort-changed' && !sortSaving && Object.hasOwn(labels,message.collection)
      && typeof message.group === 'string' && Array.isArray(message.ids) && message.ids.length >= 2 && message.ids.length <= 2000
      && message.ids.every(id => typeof id === 'string') && /^[a-f0-9]{64}$/.test(message.revision || '')) {
    if (!sorts.has(message.collection)) sorts.set(message.collection,{revision:message.revision,groups:new Map()});
    sorts.get(message.collection).groups.set(message.group,{ids:message.ids,field:message.field});
    sortState('排序尚未發布。確認位置後，按「儲存排序並發布」。');
  }
  if (event.source === editor.contentWindow && message.type === 'ical-published') published = true;
  if (event.source === editor.contentWindow && message.type === 'ical-close-approved') {
    dialog.close(); editor.removeAttribute('src');
    if (published) reloadPreview();
  }
});
fetch('/admin/api/session').then(async response => {
  if (response.status === 401) {location.replace('/admin?view=visual' + location.hash);return;}
  if (!response.ok) throw new Error('無法載入管理權限，請稍後重試。');
  csrf = (await response.json()).csrf;
  status.hidden = true;preview.hidden = false;
  preview.src = '/?edit=1' + (location.hash || '#profile');
}).catch(error => {status.textContent=error.message;});

cancelSort.onclick = () => {if (sortSaving) return;sorts.clear();sortState('已取消未發布的排序。');reloadPreview();};
saveSort.onclick = async () => {
  if (sortSaving || !sorts.size) return;
  sortSaving = true;saveSort.disabled = cancelSort.disabled = true;preview.inert = true;
  preview.contentWindow.postMessage({type:'ical-sort-lock',locked:true},location.origin);
  let completed = 0;
  try {
    for (const [name,input] of sorts) {
      sortState('正在發布'+labels[name]+'的排序，請稍候…');
      const response = await fetch('/admin/api/reorder/'+name,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({revision:input.revision,groups:[...input.groups.values()]})});
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '發布失敗');
      sorts.delete(name);completed++;
    }
    sortState('排序已發布。');reloadPreview();
  } catch(error) {sortState((completed ? '部分排序已發布。' : '')+error.message+'；未發布部分仍保留，可重試或取消。');}
  finally {sortSaving = false;saveSort.disabled = cancelSort.disabled = false;preview.inert = false;preview.contentWindow.postMessage({type:'ical-sort-lock',locked:false},location.origin);}
};
window.addEventListener('beforeunload',event => {if (sorts.size || sortSaving) {event.preventDefault();event.returnValue='';}});
