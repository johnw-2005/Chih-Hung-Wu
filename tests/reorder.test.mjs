import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reorderContent} from '../server/reorder.mjs';

test('同年份拖拉順序保存，其他年份及隱藏項目的位置不變',()=>{
  const rows=[{id:'new',year:2026,title:'new',order:9},{id:'a',year:2024,title:'a',order:0},{id:'hidden',year:2024,title:'hidden',order:1},{id:'b',year:2024,title:'b',order:2},{id:'old',year:2020,title:'old',order:0}];
  const before=structuredClone(rows);
  const sorted=reorderContent('publications',rows,[{ids:['b','a']}]);
  assert.deepEqual(rows,before);
  assert.deepEqual(sorted.filter(row=>row.year===2024).sort((a,b)=>a.order-b.order).map(row=>row.id),['b','hidden','a']);
  assert.deepEqual(sorted.find(row=>row.id==='new'),before[0]);
  assert.deepEqual(sorted.find(row=>row.id==='old'),before[4]);
  assert.deepEqual(sorted.map(({order,...row})=>row),before.map(({order,...row})=>row));
});
test('不同年份、重複或不存在的項目不能混排',()=>{
  const rows=[{id:'a',year:2026},{id:'b',year:2025},{id:'c',year:2026}];
  for(const groups of [[],[{ids:['a','b']}],[{ids:['a','a']}],[{ids:['a','missing']}],[{ids:['a','c']},{ids:['c','a']}],[{ids:['a']}]] ) {
    assert.throws(()=>reorderContent('awards',rows,groups),error=>error.status===422);
  }
});
test('期間資料以結束年份分組，未填結束年時使用開始年',()=>{
  const rows=[{id:'a',startYear:2010,endYear:2024},{id:'b',startYear:2024},{id:'c',startYear:2020,endYear:2023}];
  const sorted=reorderContent('projects',rows,[{ids:['b','a']}]);
  assert.equal(sorted.find(row=>row.id==='b').order,0);
  assert.equal(sorted.find(row=>row.id==='a').order,1);
  assert.throws(()=>reorderContent('projects',rows,[{ids:['a','c']}]),error=>error.status===422);
});
test('個人及實驗室照片集直接改變陣列順序，保留說明及其他欄位',()=>{
  const profile={name:'teacher',photos:[{src:'/a.jpg',caption:'A'},{src:'/b.jpg',caption:'B'},{src:'/c.jpg',caption:'C'}],links:[{url:'https://example.com'}]};
  const result=reorderContent('profile',profile,[{field:'photos',ids:['2','0','1']}]);
  assert.deepEqual(result.photos,[profile.photos[2],profile.photos[0],profile.photos[1]]);
  assert.deepEqual(result.links,profile.links);
  assert.equal(profile.photos[0].caption,'A');
  for(const group of [{field:'photos',ids:['1','1','0']},{field:'photos',ids:['1','0']},{field:'links',ids:['2','0','1']}]) {
    assert.throws(()=>reorderContent('profile',profile,[group]),error=>error.status===422);
  }
});
