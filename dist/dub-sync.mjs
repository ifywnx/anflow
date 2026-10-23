/** Helpers for ahead-of-playhead Vietnamese dubbing. */
export function upcomingDubbingCues(cues,playhead,{lookahead=9,maxCues=3}={}){
  if(!Array.isArray(cues)||!Number.isFinite(playhead))return [];
  return cues.filter(c=>c&&typeof c.translation==='string'&&c.translation.trim()
    &&Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end>playhead
    &&c.start<=playhead+lookahead&&c.end>c.start).slice(0,maxCues);
}
export function shouldPlayDub(cue,now){
  return Boolean(cue&&typeof cue.translation==='string'&&cue.translation.trim()&&Number.isFinite(now)
    &&now>=cue.start-.25&&now<cue.end-.25);
}
export function voiceRate(text,seconds){
  return Math.min(1.65,Math.max(.92,String(text).length/(12*Math.max(.6,Number(seconds)||.6))));
}
