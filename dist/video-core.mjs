export function videoId(value){try{const u=new URL(value.trim());if(!['https:','http:'].includes(u.protocol))return null;let id=null;if(['youtu.be','www.youtu.be'].includes(u.hostname))id=u.pathname.split('/')[1];else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','www.youtube-nocookie.com'].includes(u.hostname)){id=u.searchParams.get('v');if(!id&&/^\/(embed|shorts|live)\//.test(u.pathname))id=u.pathname.split('/')[2];}return /^[\w-]{11}$/.test(id||'')?id:null;}catch{return null;}}
export function timestamp(value){if(typeof value==='number')return value;const parts=String(value).trim().replace(',','.').split(':');if(parts.length<2||parts.length>3||parts.some(p=>!/^\d+(\.\d+)?$/.test(p)))return NaN;return parts.reduce((t,p)=>t*60+Number(p),0);}
export function timeLabel(n){n=Math.max(0,Math.floor(n||0));const h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;return (h?h+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
const clean=text=>String(text||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').trim();
export function parseSubtitles(text){const cues=[];for(const block of text.replace(/^\uFEFF/,'').replace(/\r/g,'').split(/\n\s*\n/)){const lines=block.split('\n');if(/^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0]))continue;const i=lines.findIndex(l=>l.includes('-->'));if(i<0)continue;const match=lines[i].match(/(\d{1,3}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}(?::\d{2})?[.,]\d{1,3})/);if(!match)continue;const start=timestamp(match[1]),end=timestamp(match[2]),original=clean(lines.slice(i+1).join('\n'));if(Number.isFinite(start)&&end>start&&original)cues.push({start,end,original,translation:''});}if(!cues.length)throw Error('Không tìm thấy phụ đề hợp lệ. Hãy chọn file SRT hoặc WebVTT có mốc thời gian.');if(cues.length>20000)throw Error('File quá nhiều câu. Giới hạn 20.000 câu mỗi video.');return cues.sort((a,b)=>a.start-b.start);}
export function normalizeGenerated(data,start,end){if(!data||!Array.isArray(data.cues))throw Error('AI trả dữ liệu không hợp lệ. Hãy thử lại hoặc nhập SRT/VTT.');const cues=data.cues.map(c=>({start:Number(c.start),end:Number(c.end),original:typeof c.original==='string'?c.original.trim():'',translation:typeof c.translation==='string'?c.translation.trim():''}));if(cues.some(c=>!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<start||c.start>=end||c.end<=c.start||c.end>end+1||!c.original||!c.translation))throw Error('Mốc thời gian hoặc nội dung AI không hợp lệ. Chưa lưu kết quả; hãy thử lại.');return cues.sort((a,b)=>a.start-b.start);}
export function cueAt(cues,time){let low=0,high=cues.length-1,best=-1;while(low<=high){const mid=(low+high)>>1;if(cues[mid].start<=time){best=mid;low=mid+1;}else high=mid-1;}return best>=0&&time<cues[best].end?best:-1;}
export function mergeRange(cues,additional,start,end){return [...cues.filter(c=>c.start<start||c.start>=end),...additional].sort((a,b)=>a.start-b.start);}
export function srt(cues){const t=n=>{const ms=Math.round(n*1000);return String(Math.floor(ms/3600000)).padStart(2,'0')+':'+String(Math.floor(ms%3600000/60000)).padStart(2,'0')+':'+String(Math.floor(ms%60000/1000)).padStart(2,'0')+','+String(ms%1000).padStart(3,'0');};return cues.map((c,i)=>`${i+1}\n${t(c.start)} --> ${t(c.end)}\n${c.translation||c.original}\n`).join('\n');}

/** Accent-insensitive search: works for Vietnamese and Latin scripts. */
export function studyKey(value){
  return String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,ch=>ch==='Đ'?'D':'d').toLocaleLowerCase('vi-VN').replace(/\s+/g,' ');
}
export function cueMatchesSearch(cue,term){
  const q=studyKey(term);
  return !q||studyKey(cue?.original).includes(q)||studyKey(cue?.translation).includes(q);
}
/** Keep manually corrected translations if a source is downloaded again. */
export function mergeRangeKeepingEdits(current,additional,start,end){
  const edited=current.filter(c=>c.edited===true&&c.start>=start&&c.start<end);
  const merged=additional.map(next=>{
    const existing=edited.find(c=>Math.abs(c.start-next.start)<.151&&studyKey(c.original)===studyKey(next.original));
    return existing?{...next,translation:existing.translation,edited:true}:next;
  });
  return mergeRange(current,merged,start,end);
}
function safeCell(value){
  let text=String(value??'');
  // Spreadsheet formula injection prevention, including leading whitespace.
  if(/^[\s\u0000-\u001f]*[=+@-]/u.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
export function vocabularyCsv(words,videoId){
  const rows=[['Từ / cụm từ','Nghĩa tiếng Việt','Ví dụ trong video','Thời điểm','Liên kết video']];
  for(const w of words){
    const time=Number.isFinite(w.start)?w.start:0;
    rows.push([w.word,w.meaning||'',w.example||'',timeLabel(time),'https://www.youtube.com/watch?v='+videoId+'&t='+Math.floor(time)+'s']);
  }
  return '\uFEFF'+rows.map(row=>row.map(safeCell).join(',')).join('\r\n')+'\r\n';
}

/** Validate an exported video notebook before restoring it from a user-selected JSON. */
export function readStudyBackup(value,expectedVideoId){
  const d=typeof value==='string'?JSON.parse(value):value;
  if(!d||d.version!==1||d.videoId!==expectedVideoId||!Array.isArray(d.words)||!Array.isArray(d.bookmarks))
    throw Error('Bản sao không hợp lệ hoặc không thuộc video đang mở.');
  const words=[];
  for(const w of d.words.slice(0,500)){
    if(!w||typeof w.word!=='string'||typeof w.meaning!=='string'||!Number.isFinite(w.start))continue;
    const word=w.word.trim(),meaning=w.meaning.trim();
    if(!word||word.length>120||meaning.length>500||w.start<0||w.start>172800)continue;
    if(words.some(x=>studyKey(x.word)===studyKey(word)))continue;
    words.push({word,meaning,example:typeof w.example==='string'?w.example.slice(0,2000):'',start:w.start});
  }
  const bookmarks=[];
  for(const b of d.bookmarks.slice(0,300)){
    if(!b||!Number.isFinite(b.start)||b.start<0||b.start>172800||typeof b.label!=='string')continue;
    if(bookmarks.some(x=>Math.abs(x.start-b.start)<.5))continue;
    bookmarks.push({start:b.start,label:b.label.slice(0,110)});
  }
  let captions=[];
  if(Array.isArray(d.captions)&&d.captions.length<=20000){
    const valid=d.captions.every(c=>c&&Number.isFinite(c.start)&&Number.isFinite(c.end)&&
      c.start>=0&&c.end>c.start&&c.end<=172800&&typeof c.original==='string'&&c.original.length<=5000&&
      typeof c.translation==='string'&&c.translation.length<=5000);
    if(valid)captions=d.captions.map(c=>({start:c.start,end:c.end,original:c.original,translation:c.translation,edited:c.edited===true})).sort((a,b)=>a.start-b.start);
  }
  return {words,bookmarks,captions};
}

/**
 * Decide which 2-minute transcript interval to prepare, without issuing duplicate
 * work or scheduling beyond the end of a video. Prioritize the active interval.
 * Pure function for tests and use with any transcript provider.
 */
export function nextCaptionWindow(seconds,duration,ranges,{windowSize=120,leadSeconds=85}={}){
  if(!Number.isFinite(seconds)||!Number.isFinite(duration)||duration<=0||windowSize<=0)return null;
  const at=Math.max(0,Math.min(seconds,duration-0.001));
  const start=Math.floor(at/windowSize)*windowSize;
  const covered=s=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&Number.isFinite(r[0])&&Number.isFinite(r[1])&&r[0]<=s&&r[1]>=Math.min(duration,s+windowSize)-0.001);
  if(!covered(start))return start;
  const upcoming=start+windowSize;
  if(upcoming<duration&&upcoming-at<=leadSeconds&&!covered(upcoming))return upcoming;
  return null;
}
