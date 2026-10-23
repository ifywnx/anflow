import test from 'node:test';
import assert from 'node:assert/strict';
import health from '../api/health.js';
import captions from '../api/captions.js';
import translate from '../api/translate.js';
function fakeResponse(){
  const o={statusCode:200,headers:{},body:null};
  o.setHeader=(key,value)=>{o.headers[key.toLowerCase()]=value;return o;};
  o.status=status=>{o.statusCode=status;return o;};
  o.json=obj=>{o.body=obj;return o;};
  return o;
}
test('All three Vercel functions can be loaded as ES modules',()=>{
  assert.equal(typeof health,'function');
  assert.equal(typeof captions,'function');
  assert.equal(typeof translate,'function');
});
test('Health API runs and returns JSON',()=>{
  const r=fakeResponse();
  health({method:'GET'},r);
  assert.equal(r.statusCode,200);
  assert.equal(r.body.ok,true);
});
test('Captions API returns JSON validation errors before calling YouTube',async()=>{
  const r=fakeResponse();
  await captions({method:'POST',headers:{'x-vietflow':'1',host:'anflow-hazel.vercel.app',origin:'https://anflow-hazel.vercel.app'},body:{video_id:'bad',start:0,duration:120}},r);
  assert.equal(r.statusCode,400);
  assert.match(r.body.detail,/không hợp lệ/);
});
test('Captions API rejects missing application header as JSON',async()=>{
  const r=fakeResponse();
  await captions({method:'POST',headers:{host:'anflow-hazel.vercel.app'},body:{}},r);
  assert.equal(r.statusCode,403);
  assert.equal(typeof r.body.detail,'string');
});
test('Translation API returns JSON validation errors',async()=>{
  const r=fakeResponse();
  await translate({method:'POST',headers:{'x-vietflow':'1',host:'anflow-hazel.vercel.app'},body:{texts:[]}},r);
  assert.equal(r.statusCode,400);
  assert.equal(typeof r.body.detail,'string');
});
