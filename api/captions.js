import {readPlayerResponse,chooseCaptionTrack,captionUrl,parseCaptionEvents,pairVietnamese} from '../lib/youtube-captions.mjs';
const WATCH_URL='https://www.youtube.com/watch?v=';
const BROWSER_HEADERS={
  'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language':'en-US,en;q=0.9',
  'Accept':'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.7'
};
async function boundedText(url,maxLength=3500000){
  const response=await fetch(url,{headers:BROWSER_HEADERS,redirect:'follow',signal:AbortSignal.timeout(9500)});
  if(!response.ok)throw Error('YouTube trả HTTP '+response.status+'.');
  if(Number(response.headers.get('content-length')||0)>maxLength)throw Error('Dữ liệu phụ đề vượt giới hạn.');
  const body=await response.text();
  if(body.length>maxLength)throw Error('Dữ liệu phụ đề vượt giới hạn.');
  return body;
}
async function getJson(url){
  const body=await boundedText(url,1800000);
  try{return JSON.parse(body);}
  catch{throw Error('YouTube không trả phụ đề JSON3; có thể đã chặn máy chủ cloud.');}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({detail:'Method not allowed'});}
  if(req.headers['x-vietflow']!=='1')return res.status(403).json({detail:'Thiếu tiêu đề ứng dụng.'});
  const origin=req.headers.origin;
  if(origin){try{const u=new URL(origin);if(u.protocol!=='https:'||u.host!==req.headers.host)return res.status(403).json({detail:'Origin không hợp lệ.'});}
    catch{return res.status(403).json({detail:'Origin không hợp lệ.'});}}
  const id=req.body?.video_id,start=req.body?.start??0,duration=req.body?.duration??120;
  if(typeof id!=='string'||!(/^[A-Za-z0-9_-]{11}$/).test(id)||!Number.isFinite(start)||start<0||start>86400||!Number.isInteger(duration)||duration<10||duration>120)
    return res.status(400).json({detail:'Thông số video hoặc khoảng phụ đề không hợp lệ.'});
  if(req.body?.force_whisper)return res.status(400).json({detail:'Whisper chỉ hoạt động trên ứng dụng Mac hiện tại.'});
  try{
    const end=start+duration;
    const html=await boundedText(WATCH_URL+encodeURIComponent(id)+'&hl=en',3000000);
    const player=readPlayerResponse(html);
    const track=chooseCaptionTrack(player);
    const primary=await getJson(captionUrl(track));
    const cues=parseCaptionEvents(primary,start,end);
    if(!cues.length)throw Error('Đoạn này chưa có lời thoại/phụ đề.');
    if(track.languageCode==='vi')cues.forEach(c=>c.translation=c.original);
    else{
      try{
        const target=await getJson(captionUrl(track,true));
        const vi=parseCaptionEvents(target,start,end);
        if(vi.length){const paired=pairVietnamese(cues,vi);cues.forEach((c,i)=>{c.translation=paired[i].translation;});}
      }catch{/* Translation fallback remains available via /api/translate. */}
    }
    return res.status(200).json({
      cues,source:'youtube-cloud',language:track.languageCode||'unknown',
      start,end,warnings:[],fallbacks:[],
    });
  }catch(error){
    return res.status(502).json({detail:'Không lấy được phụ đề tự động trên Vercel: '+String(error.message||'Lỗi không xác định').slice(0,180)+' Video vẫn phát được; bạn có thể nhập SRT/VTT trong Tùy chỉnh.'});
  }
}
