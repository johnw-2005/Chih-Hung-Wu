import {test} from 'node:test';
import assert from 'node:assert/strict';
import {awardFields} from '../src/lib/award-fields.mjs';
test('獲獎內容拆欄並移除重複作者與單位，保留額外資訊',()=>{
 const row={title:'論文題目',award:'優良論文獎',recipient:'甲、乙',organization:'研討會',detail:'研討會\n作者：甲、乙\n領域：人工智慧\n領域：人工智慧',sourceUrl:'https://old.example'};
 const result=awardFields(row);
 assert.equal(result.detail,'領域：人工智慧');
 assert.equal(result.sourceUrl,undefined);
 assert.equal(row.sourceUrl,'https://old.example');
 assert.deepEqual(awardFields(result),result);
 const legacy=awardFields({title:'Example conference. Best Paper Award.'});
 assert.equal(legacy.title,'Example conference');
 assert.equal(legacy.award,'Best Paper Award');
 assert.deepEqual(awardFields(legacy),legacy);
});
