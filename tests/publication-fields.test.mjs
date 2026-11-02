import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicationFields} from '../src/lib/publication-fields.mjs';
test('論文連結統一並保留發表資訊，不重複或在清空後復活',()=>{
 const row={title:'論文',venue:'期刊卷期頁碼',link:'https://doi.org/10.1234/paper',doi:'10.1234/paper',links:[{label:'出版資訊',url:'https://publisher.example/paper'}]};
 const result=publicationFields(row);
 assert.deepEqual(result,{title:row.title,venue:row.venue,link:row.link});
 assert.ok(row.doi);
 assert.deepEqual(publicationFields(result),result);
 delete result.link;
 assert.equal(publicationFields(result).link,undefined);
 assert.equal(publicationFields({doi:'10.1234/paper'}).link,'https://doi.org/10.1234/paper');
 assert.equal(publicationFields({links:row.links}).link,row.links[0].url);
 assert.equal(publicationFields({title:'無連結'}).link,undefined);
});
