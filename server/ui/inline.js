const collections = {profile:'教授簡介',lab:'實驗室',publications:'論文',projects:'計畫',graduates:'指導論文',awards:'獲獎紀錄',honors:'榮譽',services:'一般服務',academics:'學術服務',photos:'照片'};
const response = await fetch('/admin/api/session');
if (response.ok) {
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/admin/inline.css'; document.head.append(style);
  for (const target of document.querySelectorAll('[data-edit-collection]')) {
    const collection = target.dataset.editCollection;
    if (!Object.hasOwn(collections,collection)) continue;
    const host = target.tagName === 'TR' ? target.cells[1] : target;
    host.classList.add('ical-edit-target');
    const pencil = document.createElement('button'); pencil.type = 'button'; pencil.className = 'ical-pencil';
    pencil.textContent = '✎'; pencil.title = '編輯' + collections[collection];
    pencil.setAttribute('aria-label','編輯' + collections[collection]);
    pencil.onclick = event => {
      event.preventDefault(); event.stopPropagation();
      const edit = {type:'ical-edit',collection,id:target.dataset.editId,section:target.dataset.editSection,index:target.dataset.editIndex};
      if (window.parent !== window) window.parent.postMessage(edit,location.origin);
      else {
        const url = new URL('/admin',location.origin); url.searchParams.set('collection',collection);
        if (edit.id) url.searchParams.set('record',edit.id);
        if (edit.section) url.searchParams.set('section',edit.section);
        if (edit.index) url.searchParams.set('index',edit.index);
        location.assign(url);
      }
    };
    host.append(pencil);
  }
  // Keep internal navigation inside the editing preview.
  document.addEventListener('click',event => {
    const anchor = event.target.closest('a'); if (!anchor || anchor.target === '_blank') return;
    const url = new URL(anchor.href,location.href);
    if (url.origin === location.origin && url.pathname === '/') {
      url.searchParams.set('edit','1'); anchor.href = url.href;
    }
  });
}

// Sort handles are available only inside the authenticated visual editor.
if (response.ok && window.parent !== window) {
  const snapshots = new Map();
  const parents = new Map();
  let locked = false;
  window.addEventListener('message',event => {
    if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'ical-sort-lock') locked = Boolean(event.data.locked);
  });
  const report = text => window.parent.postMessage({type:'ical-sort-status',text},location.origin);
  const snapshot = name => {
    if (!snapshots.has(name)) snapshots.set(name,fetch('/admin/api/content/'+name).then(async result => {
      const value = await result.json(); if (!result.ok) throw new Error(value.error || '無法載入排序資料'); return value.revision;
    }).catch(error => {snapshots.delete(name);throw error;}));
    return snapshots.get(name);
  };
  for (const node of document.querySelectorAll('[data-edit-collection]')) {
    const nested = node.dataset.editIndex !== undefined;
    if (!node.dataset.editId && !nested) continue;
    const name = node.dataset.editCollection;
    const parent = node.parentElement;
    if (!parents.has(parent)) parents.set(parent,new Map());
    const key = name + ':' + (nested ? 'photos' : (node.dataset.editYear || '0') + ':' + (node.dataset.editSortYear || node.dataset.editYear || '0'));
    const groups = parents.get(parent);
    if (!groups.has(key)) groups.set(key,{name,parent,nested,nodes:[],key:crypto.randomUUID()});
    const group = groups.get(key); group.nodes.push(node); node.dataset.sortKey = group.key;
  }
  for (const groups of parents.values()) for (const group of groups.values()) {
    if (group.nodes.length < 2) continue;
    const ordered = () => group.nodes.slice().sort((a,b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const ids = () => ordered().map(node => group.nested ? node.dataset.editIndex : node.dataset.editId);
    const visible = () => ordered().filter(node => node.getClientRects().length && getComputedStyle(node).display !== 'none');
    async function notify(previous,before) {
      if (ids().join('|') === before.join('|')) return;
      try {
        const revision = await snapshot(group.name);
        window.parent.postMessage({type:'ical-sort-changed',collection:group.name,group:group.key,ids:ids(),field:group.nested ? 'photos' : undefined,revision},location.origin);
      } catch(error) {group.parent.append(...previous); report(error.message);}
    }
    for (const node of group.nodes) {
      const host = node.tagName === 'TR' ? node.cells[1] : node;
      const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'ical-sort-handle'; handle.textContent = '⋮⋮';
      handle.setAttribute('aria-label','調整'+collections[group.name]+'順序');
      handle.title = '拖拉調整同年份順序，也可使用上下方向鍵'; host.append(handle);
      handle.onkeydown = event => {
        if (locked || !['ArrowUp','ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const nodes = visible(); const index = nodes.indexOf(node); const other = nodes[index + (event.key === 'ArrowUp' ? -1 : 1)];
        if (!other) {report('已到此年份或區塊的最前／最後一筆。');return;}
        const previous = [...group.parent.childNodes]; const before = ids();
        if (event.key === 'ArrowUp') group.parent.insertBefore(node,other); else group.parent.insertBefore(other,node);
        handle.focus(); notify(previous,before);
      };
      handle.onpointerdown = event => {
        if (locked || event.button !== 0) return;
        event.preventDefault(); handle.focus();
        const previous = [...group.parent.childNodes]; const before = ids(); const pointerId = event.pointerId;
        snapshot(group.name).catch(() => {});
        let pointerY = event.clientY; let frame;
        node.classList.add('ical-sorting');
        try {handle.setPointerCapture(pointerId);} catch {}
        const scroll = () => {
          if (pointerY < 70) window.scrollBy(0,-12); else if (pointerY > innerHeight - 70) window.scrollBy(0,12);
          frame = requestAnimationFrame(scroll);
        }; frame = requestAnimationFrame(scroll);
        const move = event => {
          if (event.pointerId !== pointerId) return;
          event.preventDefault(); pointerY = event.clientY;
          const hit = document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-sort-key]');
          if (!hit || hit === node || hit.dataset.sortKey !== group.key) return;
          const rect = hit.getBoundingClientRect(); const isGrid = getComputedStyle(group.parent).display === 'grid';
          const source = node.getBoundingClientRect();
          const sameLine = isGrid && Math.abs((source.top+source.bottom)/2 - (rect.top+rect.bottom)/2) < rect.height/2;
          const beforeTarget = sameLine ? event.clientX < (rect.left+rect.right)/2 : event.clientY < (rect.top+rect.bottom)/2;
          group.parent.insertBefore(node,beforeTarget ? hit : hit.nextSibling);
          try {handle.setPointerCapture(pointerId);} catch {}
        };
        const finish = event => {
          if (event.pointerId !== pointerId) return;
          window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);
          cancelAnimationFrame(frame);node.classList.remove('ical-sorting');
          try {handle.releasePointerCapture(pointerId);} catch {}
          if (event.type === 'pointercancel') group.parent.append(...previous); else notify(previous,before);
        };
        window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
      };
    }
  }
}
