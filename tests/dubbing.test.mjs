import test from 'node:test';
import assert from 'node:assert/strict';
import dubbing,{authorized,checkDubInput} from '../api/dubbing.js';
function fakeResponse(){return {statusCode:200,body:null,headers:{},
  setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},
  status(n){this.statusCode=n;return this;},
  json(obj){this.body=obj;return this;}
};}
test('Public dubbing status reveals only readiness, no API secrets',async()=>{
  const r=fakeResponse();
  await dubbing({method:'GET',headers:{}},r);
  assert.equal(r.statusCode,200);
  assert.equal(r.body.access_required,true);
  assert.equal(r.body.mode,'eleven_flash_v2_5');
  assert.equal(r.body.elevenlabs_ready,false);
  assert.ok(!Object.keys(r.body).some(k=>/key|token|secret/i.test(k)));
});
test('Paid speech never works without two server-only keys',async()=>{
  const r=fakeResponse();
  await dubbing({method:'POST',headers:{host:'anflow-hazel.vercel.app'},body:{video_id:'JGwWNGJdvx8',text:'Xin chào'}},r);
  assert.equal(r.statusCode,503);
});
test('Server rejects abusive clips and unrelated videos',()=>{
  assert.match(checkDubInput({video_id:'other',text:'Xin chào'}),/Ed Sheeran/);
  assert.match(checkDubInput({video_id:'JGwWNGJdvx8',text:'a'.repeat(221)}),/220/);
  assert.equal(checkDubInput({video_id:'JGwWNGJdvx8',text:'Xin chào'}),'');
});
test('Admin-only access code is timing-safe and must be long',()=>{
  assert.equal(authorized('Bearer trial-password-not-real-123','trial-password-not-real-123'),true);
  assert.equal(authorized('Bearer wrong','trial-password-not-real-123'),false);
  assert.equal(authorized('Bearer short','short'),false);
});
