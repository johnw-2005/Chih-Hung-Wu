import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validProjectTime,projectTimes,formatProjectTime,projectSortYear} from '../src/lib/project-time.mjs';
import {schemas} from '../src/lib/content-schemas.mjs';
import {reorderContent} from '../server/reorder.mjs';

test('時間精確度與有效日期驗證',()=>{
 for(const value of ['2021','2021/08','2021/8/1','2024/02/29']) assert.ok(validProjectTime(value),value);
 for(const value of ['110','2021/13','2021/02/29','2021/04/31','2021/00','2021/08/00','2021-08-01','']) assert.ok(!validProjectTime(value),value);
 const base={title:'計畫',status:'已完成',startTime:'2021/08'};
 assert.ok(!schemas.projects.safeParse(base).success);
 assert.ok(schemas.projects.safeParse({...base,status:'進行中'}).success);
 assert.ok(schemas.projects.safeParse({...base,endTime:'2022'}).success);
 assert.ok(!schemas.projects.safeParse({...base,endTime:''}).success);
 assert.ok(!schemas.projects.safeParse({...base,endTime:'2021/02/30'}).success);
 assert.ok(schemas.projects.safeParse({title:'舊計畫',status:'已完成',startYear:2020,endYear:2021}).success);
 assert.ok(!schemas.projects.safeParse({...base,endTime:'2020'}).success);
 assert.ok(schemas.projects.safeParse({...base,endTime:'2021'}).success);
 assert.ok(!schemas.projects.safeParse({...base,startTime:undefined}).success);
});
test('舊資料保留日期精確度，民國轉西元，既有新欄位優先',()=>{
 assert.deepEqual(projectTimes({period:'110/08/01-111/06/30'}),{startTime:'2021/08/01',endTime:'2022/06/30'});
 assert.deepEqual(projectTimes({period:'2015/01/01～2015/12 /31'}),{startTime:'2015/01/01',endTime:'2015/12/31'});
 assert.deepEqual(projectTimes({period:'2018/12～2020/07'}),{startTime:'2018/12',endTime:'2020/07'});
 assert.deepEqual(projectTimes({startYear:2021,endYear:2022}),{startTime:'2021',endTime:'2022'});
 assert.deepEqual(projectTimes({startTime:'2025',period:'2021/08/01～2022/07/31',endYear:2022}),{startTime:'2025',endTime:undefined});
 assert.equal(formatProjectTime({startTime:'2021',status:'進行中'}),'2021 – 至今');
 assert.equal(formatProjectTime({startTime:'2021',status:'已完成'}),'2021');
 assert.equal(formatProjectTime({startTime:'2021',endTime:'2021'}),'2021');
 assert.equal(projectSortYear({startTime:'2021/08',endTime:'2022/07'}),2022);
 const rows=[{id:'a',startTime:'2021',endTime:'2022/07'},{id:'b',startTime:'2022/01'}];
 assert.equal(reorderContent('projects',rows,[{ids:['b','a']}])[1].order,0);
});
