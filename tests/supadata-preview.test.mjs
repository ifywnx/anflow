import test from 'node:test';
import assert from 'node:assert/strict';
import {TRIAL_VIDEO_ID,normalizeTranscript,getTranscript} from '../lib/supadata-preview.mjs';
import endpoint from '../api/supadata-preview.js';
function fakeResponse(){
  return {statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},status(x){this.statusCode=x;return this;},json(obj){this.body=obj;return this;}};
}
test('Supadata native timestamped chunks normalize to ANFLOW cues',()=>{
  const output=normalizeTranscript({lang:'en',content:[{text:'  I am in love ',offset:1520,duration:2800},{text:' Hello!',offset:4340,duration:1500}]});
  assert.equal(output.cues.length,2);assert.equal(output.cues[0].start,1.52);
  assert.equal(output.cues[0].end,4.32);assert.equal(output.source,'supadata');
  assert.equal(output.end,86400);
});
test('Supadata never requests AI generation and never leaks the key into the URL',async()=>{
  let called=0;
  const result=await getTranscript({key:'test-not-real',videoId:TRIAL_VIDEO_ID,fetchFn:async(url,options)=>{
    called++;
    assert.equal(url.searchParams.get('mode'),'native');
    assert.equal(url.searchParams.get('lang'),'en');
    assert.equal(url.searchParams.get('text'),'false');
    assert.equal(url.toString().includes('test-not-real'),false);
    assert.equal(options.headers['x-api-key'],'test-not-real');
    return {status:200,ok:true,json:async()=>({lang:'en',content:[{text:'Test',offset:0,duration:3000}]})};
  }});
  assert.equal(called,1);assert.equal(result.cues.length,1);
});
test('Supadata jobs can be polled without creating new billable transcripts',async()=>{
  const response=await getTranscript({key:'test',videoId:TRIAL_VIDEO_ID,fetchFn:async()=>({
    status:202,ok:true,json:async()=>({jobId:'abcdef123456'})
  })});
  assert.equal(response.pending,true);assert.equal(response.job_id,'abcdef123456');
  await getTranscript({key:'test',videoId:TRIAL_VIDEO_ID,jobId:response.job_id,fetchFn:async(url)=>{
    assert.equal(url.pathname,'/v1/transcript/abcdef123456');
    assert.equal(url.searchParams.has('mode'),false);
    return {status:200,ok:true,json:async()=>({status:'completed',lang:'en',content:[{text:'Okay',offset:0,duration:1000}]})};
  }});
});
test('Preview endpoint refuses unrelated videos before fetching',async()=>{
  const res=fakeResponse();
  await endpoint({method:'GET',query:{video_id:'dQw4w9WgXcQ'}},res);
  assert.equal(res.statusCode,403);assert.equal(typeof res.body.detail,'string');
});
test('API handles missing provider key safely',async()=>{
  const saved=process.env.SUPADATA_API_KEY;delete process.env.SUPADATA_API_KEY;
  try{
    const res=fakeResponse();
    await endpoint({method:'GET',query:{video_id:TRIAL_VIDEO_ID}},res);
    assert.equal(res.statusCode,502);assert.match(res.body.detail,/SUPADATA_API_KEY/);
  }finally{if(saved!==undefined)process.env.SUPADATA_API_KEY=saved;}
});

test('Cached trial endpoint rejects cache-busting parameters before provider calls',async()=>{
  const res=fakeResponse();
  await endpoint({method:'GET',query:{video_id:TRIAL_VIDEO_ID,random:'cache-buster'}},res);
  assert.equal(res.statusCode,400);
});
test('Polling arbitrary Supadata jobs requires a signature',async()=>{
  const res=fakeResponse();
  await endpoint({method:'GET',query:{video_id:TRIAL_VIDEO_ID,job_id:'arbitrarytask'}},res);
  assert.equal(res.statusCode,403);
});
