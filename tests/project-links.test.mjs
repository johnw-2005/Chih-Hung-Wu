import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {schemas} from '../src/lib/content-schemas.mjs';

test('各筆計畫使用獨立詳細頁面網址，拒絕不安全網址',()=>{
  const project={title:'計畫',status:'進行中',startYear:2026};
  assert.equal(schemas.projects.safeParse(project).success,true);
  assert.equal(schemas.projects.safeParse({...project,projectUrl:'https://example.gov.tw/project/123'}).success,true);
  const credentialUrl = new URL('https://example.com');
  credentialUrl.username = randomBytes(8).toString('hex');
  credentialUrl.password = randomBytes(32).toString('hex');
  for(const projectUrl of ['javascript:alert(1)','http://example.com',credentialUrl.href,'not a URL']) {
    assert.equal(schemas.projects.safeParse({...project,projectUrl}).success,false);
  }
});
