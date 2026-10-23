import test from 'node:test';
import assert from 'node:assert/strict';
import {readPlayerResponse,chooseCaptionTrack,captionUrl,parseCaptionEvents,pairVietnamese} from '../lib/youtube-captions.mjs';
test('Parse initial player response while ignoring braces in quoted strings',()=>{
  const payload=JSON.stringify({x:'has " { braces',captions:{playerCaptionsTracklistRenderer:{captionTracks:[{languageCode:'en',baseUrl:'https://www.youtube.com/api/timedtext?v=abc'},{languageCode:'vi',baseUrl:'https://www.youtube.com/api/timedtext?v=abc&lang=vi'}]}}});
  const html='<script>var ytInitialPlayerResponse = '+payload+';</script>';
  const data=readPlayerResponse(html);
  assert.equal(chooseCaptionTrack(data).languageCode,'en');
  const url=new URL(captionUrl(chooseCaptionTrack(data),true));
  assert.equal(url.searchParams.get('tlang'),'vi');
  assert.equal(url.searchParams.get('fmt'),'json3');
});
test('Refuse dangerous caption host',()=>{
  assert.throws(()=>captionUrl({baseUrl:'http://evil.example/caption'}));
  assert.throws(()=>captionUrl({baseUrl:'https://youtube.com.attacker.example/api'}));
});
test('Normalize partial JSON3 cues and align Vietnamese translation',()=>{
  const data={events:[{tStartMs:1234,dDurationMs:2011,segs:[{utf8:'Good'},{utf8:' morning'}]},{tStartMs:5000,dDurationMs:2000,segs:[{utf8:'Again'}]},{tStartMs:9200,segs:[{utf8:'\n'}]}]};
  const cues=parseCaptionEvents(data,0,4);
  assert.equal(cues.length,1);assert.equal(cues[0].original,'Good morning');
  const vi=[{start:1.3,original:'Chào buổi sáng'}];
  assert.equal(pairVietnamese(cues,vi)[0].translation,'Chào buổi sáng');
  assert.equal(parseCaptionEvents(data,6,8).length,1);
});
test('Reject malformed payloads and protect empty track list',()=>{
  assert.throws(()=>readPlayerResponse('<h1>Sign in</h1>'));
  assert.throws(()=>chooseCaptionTrack({captions:{playerCaptionsTracklistRenderer:{captionTracks:[]}}}));
  assert.throws(()=>parseCaptionEvents({},0,120));
});
