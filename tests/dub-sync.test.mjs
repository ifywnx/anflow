import test from 'node:test';
import assert from 'node:assert/strict';
import {upcomingDubbingCues,shouldPlayDub,voiceRate} from '../dist/dub-sync.mjs';
const cues=[{start:0,end:2,translation:'Chào'},{start:4,end:6,translation:'Xin chào Việt Nam'},{start:8,end:10,translation:'Tạm biệt'},{start:20,end:22,translation:'Later'}];
test('Prefetch a bounded number of future translated cues',()=>{
 assert.deepEqual(upcomingDubbingCues(cues,3,{lookahead:8,maxCues:2}).map(c=>c.start),[4,8]);
 assert.equal(upcomingDubbingCues(cues,11,{lookahead:4}).length,0);
});
test('Never speak an audio clip after its caption expired',()=>{
 assert.equal(shouldPlayDub(cues[1],4.2),true);
 assert.equal(shouldPlayDub(cues[1],5.9),false);
 assert.equal(shouldPlayDub(cues[1],2),false);
});
test('Speech speed stays bounded',()=>{
 assert.ok(voiceRate('a'.repeat(150),.2)<=1.65);
 assert.ok(voiceRate('Xin chào',3)>=.92);
});
