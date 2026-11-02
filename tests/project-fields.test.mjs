import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectFields} from '../src/lib/project-fields.mjs';
test('舊計畫拆分欄位，保留期數與明確填寫的欄位',()=>{
 const legacy={id:'one',title:'[研究型] 計畫名稱 (4/4) (MOST 110-2224-E-390-001)'};
 const split=projectFields(legacy);
 assert.equal(split.title,'計畫名稱 (4/4)');
 assert.equal(split.category,'研究型');
 assert.equal(split.grant,'MOST 110-2224-E-390-001');
 assert.deepEqual(projectFields(split),split);
 assert.equal(legacy.title,'[研究型] 計畫名稱 (4/4) (MOST 110-2224-E-390-001)');
 assert.equal(projectFields({...legacy,grant:'新編號',category:'大專生'}).grant,'新編號');
 assert.equal(projectFields({title:'一般名稱 (說明)'}).title,'一般名稱 (說明)');
});
