import test from 'node:test';
import assert from 'node:assert/strict';
import {videoId,timestamp,parseSubtitles,normalizeGenerated,cueAt,mergeRange,mergeRangeKeepingEdits,studyKey,cueMatchesSearch,vocabularyCsv,readStudyBackup,nextCaptionWindow,readApiResponse,srt,timeLabel} from '../dist/video-core.mjs';
test('YouTube links: exact hosts, no spoofing or injected schemes',()=>{for(const url of ['https://youtu.be/lfmg-EJ8gm4?si=x','https://www.youtube.com/watch?v=lfmg-EJ8gm4&t=31','https://m.youtube.com/shorts/lfmg-EJ8gm4','https://youtube.com/live/lfmg-EJ8gm4'])assert.equal(videoId(url),'lfmg-EJ8gm4');for(const url of ['https://youtube.com.attacker.test/watch?v=lfmg-EJ8gm4','javascript:alert(1)','https://example.com/lfmg-EJ8gm4','https://youtube.com/watch?v=bad'])assert.equal(videoId(url),null);});
test('SRT BOM, CRLF, multiline and markup handled',()=>{const cues=parseSubtitles('\uFEFF1\r\n00:00:01,250 --> 00:00:04,000\r\nHello <i>world</i>\r\nSecond line\r\n\r\n2\r\n01:02:03,000 --> 01:02:05,500\r\nLong video');assert.equal(cues[0].start,1.25);assert.equal(cues[0].original,'Hello world\nSecond line');assert.equal(cues[1].start,3723);assert.equal(timeLabel(3723),'1:02:03');});
test('WebVTT settings and NOTE blocks',()=>{const cues=parseSubtitles('WEBVTT\n\nNOTE note\nignore\n\ncue-a\n00:09.000 --> 00:15.000 align:start\nHello &amp; welcome');assert.deepEqual(cues,[{start:9,end:15,original:'Hello & welcome',translation:''}]);assert.throws(()=>parseSubtitles('no timing'));});
test('Cue lookup respects gaps, exact ends, overlapping starts',()=>{const cues=[{start:1,end:3},{start:4,end:6},{start:5,end:7}];assert.equal(cueAt(cues,0),-1);assert.equal(cueAt(cues,1),0);assert.equal(cueAt(cues,3),-1);assert.equal(cueAt(cues,4),1);assert.equal(cueAt(cues,5),2);assert.equal(cueAt(cues,7),-1);});
test('Reject hallucinated/out of range/missing subtitle values',()=>{const c={start:120,end:124,original:'Hello',translation:'Xin chào'};assert.equal(normalizeGenerated({cues:[c]},120,240).length,1);for(const patch of [{start:0},{end:300},{start:'abc'},{translation:''},{end:119}])assert.throws(()=>normalizeGenerated({cues:[{...c,...patch}]},120,240));assert.deepEqual(normalizeGenerated({cues:[]},0,120),[]);});
test('Replacing a prepared window preserves other windows',()=>{const cues=[{start:1,end:3},{start:122,end:125},{start:241,end:245}];assert.deepEqual(mergeRange(cues,[{start:123,end:126}],120,240),[cues[0],{start:123,end:126},cues[2]]);});
test('SRT export round trips hour and millisecond timestamps',()=>{const cues=[{start:3723.125,end:3725.5,original:'Hello',translation:'Xin chào'}];const back=parseSubtitles(srt(cues));assert.equal(back[0].start,cues[0].start);assert.equal(back[0].end,cues[0].end);assert.equal(back[0].original,'Xin chào');assert.ok(Number.isNaN(timestamp('oops')));});

test('Vietnamese accent-insensitive transcript search covers original and translated lines',()=>{
  assert.equal(studyKey('  Đường  phố  '),'duong pho');
  assert.equal(cueMatchesSearch({original:'Machine Learning',translation:'Học máy'},'machine'),true);
  assert.equal(cueMatchesSearch({original:'Hello',translation:'Công nghệ'},'cong nghe'),true);
  assert.equal(cueMatchesSearch({original:'Hello',translation:'Xin chào'},'không khớp'),false);
  assert.equal(cueMatchesSearch({original:'Hello',translation:''},''),true);
});
test('Manually corrected translations survive regeneration of a matching time range',()=>{
  const old=[{start:1,end:2,original:'Good morning',translation:'Chào buổi sáng',edited:true},{start:121,end:122,original:'Keep',translation:'Giữ'}];
  const incoming=[{start:1.05,end:2.15,original:'Good morning',translation:'Buổi sáng tốt lành'},{start:4,end:5,original:'New',translation:'Mới'}];
  const out=mergeRangeKeepingEdits(old,incoming,0,120);
  assert.equal(out[0].translation,'Chào buổi sáng');assert.equal(out[0].edited,true);
  assert.equal(out[1].translation,'Mới');assert.equal(out[2].original,'Keep');
});
test('Edited translations never override unrelated subtitles',()=>{
  const old=[{start:1,end:2,original:'Apple',translation:'Táo',edited:true}];
  const generated=[{start:1.02,end:2,original:'Application',translation:'Ứng dụng'}];
  assert.equal(mergeRangeKeepingEdits(old,generated,0,120)[0].translation,'Ứng dụng');
});
test('Vocabulary export escapes spreadsheet formulas, quotes and retains timestamps',()=>{
  const csv=vocabularyCsv([{word:'=IMPORTXML("evil")',meaning:'"+SUM(1,1)',example:'hello, "world"',start:62.9}], '4ycKrWTvzNY');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes("'=IMPORTXML"));
  assert.ok(csv.includes("'"+'"'+ '+SUM')===false); // Meaning starts with a quote, not a formula
  assert.ok(csv.includes('hello, ""world""'));
  assert.ok(csv.includes('01:02'));
  assert.ok(csv.includes('4ycKrWTvzNY&t=62s'));
});

test('Backup import validates video identity and strips unexpected data',()=>{
  const data=readStudyBackup({version:1,videoId:'4ycKrWTvzNY',words:[
    {word:'Hello',meaning:'Xin chào',start:3,example:'Hello there'},
    {word:' hello ',meaning:'duplicate',start:4},
    {word:'bad',meaning:'',start:-1}
  ],bookmarks:[{start:10,label:'Important'},{start:10.1,label:'duplicate'}],
  captions:[{start:1,end:3,original:'Hello',translation:'Xin chào',edited:true}]},'4ycKrWTvzNY');
  assert.equal(data.words.length,1);assert.equal(data.bookmarks.length,1);
  assert.equal(data.captions[0].edited,true);
  assert.throws(()=>readStudyBackup({version:1,videoId:'other',words:[],bookmarks:[]},'4ycKrWTvzNY'));
});
test('Backup import rejects poisoned or malformed captions without corrupting saved words',()=>{
  const data=readStudyBackup({version:1,videoId:'4ycKrWTvzNY',words:[{word:'AI',meaning:'Trí tuệ nhân tạo',start:0}],bookmarks:[],captions:[{start:0,end:-2,original:'Bad',translation:''}]},'4ycKrWTvzNY');
  assert.equal(data.captions.length,0);assert.equal(data.words.length,1);
  assert.throws(()=>readStudyBackup('broken json','4ycKrWTvzNY'));
});

test('Continuous subtitle scheduler prioritizes current missing segment',()=>{
  assert.equal(nextCaptionWindow(0,465,[]),0);
  assert.equal(nextCaptionWindow(119,465,[[0,120]]),120);
  assert.equal(nextCaptionWindow(245,465,[[0,120],[120,240]]),240);
});
test('Prefetch starts with 85 seconds lead and never repeats prepared windows',()=>{
  assert.equal(nextCaptionWindow(30,465,[[0,120]]),null);
  assert.equal(nextCaptionWindow(35,465,[[0,120]]),120);
  assert.equal(nextCaptionWindow(84,465,[[0,120],[120,240]]),null);
  assert.equal(nextCaptionWindow(154,465,[[0,120],[120,240]]),null);
  assert.equal(nextCaptionWindow(155,465,[[0,120],[120,240]]),240);
});
test('Prefetch bounds last partial window and invalid playback values',()=>{
  assert.equal(nextCaptionWindow(115,119,[[0,119]]),null);
  assert.equal(nextCaptionWindow(118,131,[[0,120]]),120);
  assert.equal(nextCaptionWindow(120,131,[[0,120],[120,131]]),null);
  assert.equal(nextCaptionWindow(NaN,600,[]),null);
  assert.equal(nextCaptionWindow(10,0,[]),null);
});
test('Playback scheduler handles window seeking and does not request past the video end',()=>{
  assert.equal(nextCaptionWindow(395,400,[[0,120],[120,240],[240,360]]),360);
  assert.equal(nextCaptionWindow(399,400,[[0,120],[120,240],[240,360],[360,400]]),null);
  assert.equal(nextCaptionWindow(-4,400,[]),0);
});

test('Read API success JSON payload',async()=>{
  const obj=await readApiResponse(new Response(JSON.stringify({cues:[],source:'youtube'}),{status:200,headers:{'content-type':'application/json'}}));
  assert.equal(obj.source,'youtube');
});
test('A Vercel FUNCTION_INVOCATION_FAILED plain text response produces a Vietnamese error',async()=>{
  const r=new Response('A server error has occurred\nFUNCTION_INVOCATION_FAILED',{status:500,headers:{'content-type':'text/plain'}});
  await assert.rejects(readApiResponse(r),err=>err.message.includes('Máy chủ')&&err.message.includes('HTTP 500')&&!err.message.includes('Unexpected token'));
});
test('API honors useful JSON details on expected errors',async()=>{
  const r=new Response(JSON.stringify({detail:'YouTube không cung cấp phụ đề trong video này.'}),{status:502});
  await assert.rejects(readApiResponse(r),/YouTube không cung cấp phụ đề/);
});
test('API detects unexpected non-object payloads',async()=>{
  await assert.rejects(readApiResponse(new Response('"bad"',{status:200})),/không hợp lệ/);
});
