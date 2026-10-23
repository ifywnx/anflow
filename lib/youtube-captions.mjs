/**
 * YouTube caption extraction, independent of a particular cloud provider.
 * Captions exist only for videos that expose transcript tracks to this server.
 * Never assume access to YouTube from a datacenter is guaranteed.
 */
export function readPlayerResponse(html){
  const marker='ytInitialPlayerResponse';
  const at=String(html).indexOf(marker);
  if(at<0)throw Error('YouTube không cung cấp dữ liệu phụ đề ở máy chủ này.');
  let start=html.indexOf('{',at);
  if(start<0)throw Error('Không tìm thấy thông tin trình phát.');
  let depth=0,quoted=false,escaped=false;
  for(let i=start;i<Math.min(html.length,start+1600000);i++){
    const char=html[i];
    if(quoted){
      if(escaped)escaped=false;
      else if(char==='\\')escaped=true;
      else if(char==='"')quoted=false;
    }else{
      if(char==='"')quoted=true;
      else if(char==='{')depth++;
      else if(char==='}'&&--depth===0){
        try{return JSON.parse(html.slice(start,i+1));}
        catch{throw Error('Dữ liệu phụ đề YouTube không hợp lệ.');}
      }
    }
  }
  throw Error('Không đọc được dữ liệu phụ đề từ YouTube.');
}
export function chooseCaptionTrack(player){
  const tracks=player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if(!Array.isArray(tracks)||!tracks.length)throw Error('Video không có phụ đề mà máy chủ có thể truy cập.');
  return [...tracks].sort((a,b)=>{
    const rank=t=>{
      const l=String(t.languageCode||'').toLowerCase();
      return (l==='en'?0:l==='vi'?1:l.startsWith('en')?2:4)+(t.kind==='asr'?1:0);
    };
    return rank(a)-rank(b);
  })[0];
}
export function captionUrl(track,translated=false){
  const url=new URL(track.baseUrl);
  if(url.protocol!=='https:'||(!url.hostname.endsWith('.youtube.com')&&url.hostname!=='youtube.com'))
    throw Error('URL phụ đề không an toàn.');
  url.searchParams.set('fmt','json3');
  if(translated)url.searchParams.set('tlang','vi');
  return url.toString();
}
export function parseCaptionEvents(data,start,end,max=500){
  if(!Array.isArray(data?.events))throw Error('YouTube trả phụ đề không đúng định dạng.');
  return data.events.filter(e=>Array.isArray(e?.segs))
    .map(e=>{
      const raw=e.segs.map(s=>String(s?.utf8||'')).join('').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
      const t=Number(e.tStartMs)/1000,d=Number(e.dDurationMs)/1000;
      return {start:t,end:t+(Number.isFinite(d)&&d>0?d:2),original:raw.slice(0,4500),translation:''};
    })
    .filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start>=0&&c.end>start&&c.start<end&&c.end>c.start&&c.original)
    .sort((a,b)=>a.start-b.start)
    .slice(0,max);
}
export function pairVietnamese(original,translated){
  const translatedArray=Array.isArray(translated)?translated:[];
  return original.map(c=>{
    const matched=translatedArray.find(t=>Math.abs(t.start-c.start)<0.3);
    return {...c,translation:matched?.original||''};
  });
}
