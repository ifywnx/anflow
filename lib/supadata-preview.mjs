/**
 * Restricted Supadata trial for a single previously-tested YouTube video.
 * Never make this a generic paid-API proxy without authentication, quotas
 * and shared caching. Native-caption mode only; never AI-generate for this trial.
 */
export const TRIAL_VIDEO_ID='JGwWNGJdvx8';
export const PASSENGER_VIDEO_ID='RBumgq5yVrA';
const API_BASE='https://api.supadata.ai/v1/transcript';
export function normalizeTranscript(result){
  if(!result||!Array.isArray(result.content))throw Error('Supadata chưa cung cấp danh sách phụ đề có thời gian.');
  const cues=result.content.slice(0,2000).map(item=>{
    const start=Number(item.offset)/1000,duration=Number(item.duration)/1000;
    const original=String(item.text??'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,2400);
    return {original,translation:'',start,end:start+(Number.isFinite(duration)&&duration>0?duration:2)};
  }).filter(item=>Number.isFinite(item.start)&&item.start>=0&&item.start<=86400&&
      Number.isFinite(item.end)&&item.end>item.start&&item.original);
  if(!cues.length)throw Error('Supadata trả lời thành công nhưng video không có lời thoại.');
  cues.sort((a,b)=>a.start-b.start);
  if(result.content.length>2000)throw Error('Video có quá nhiều câu để sử dụng bản thử.');
  return {
    cues,source:'supadata',language:typeof result.lang==='string'?result.lang:'unknown',
    start:0,end:86400,warnings:[],fallbacks:[]
  };
}
export async function getTranscript({key,videoId,jobId,fetchFn=fetch}){
  if(typeof videoId!=='string'||!/^[a-zA-Z0-9_-]{11}$/.test(videoId))throw Error('Mã YouTube không hợp lệ.');
  if(!key)throw Error('Chưa cài SUPADATA_API_KEY trong Vercel.');
  const url=new URL(jobId?API_BASE+'/'+jobId:API_BASE);
  if(!jobId){
    url.searchParams.set('url','https://www.youtube.com/watch?v='+videoId);
    url.searchParams.set('mode','native');  // Never spend AI transcription credits
    url.searchParams.set('lang','en');
    url.searchParams.set('text','false');
  }else if(!/^[a-zA-Z0-9_-]{6,128}$/.test(jobId))throw Error('Job ID không hợp lệ.');
  let response;
  try{response=await fetchFn(url,{headers:{'x-api-key':key,'accept':'application/json'},signal:AbortSignal.timeout(13000)});}
  catch{throw Error('Không kết nối được Supadata.');}
  let data;
  try{data=await response.json();}
  catch{throw Error('Supadata trả phản hồi không đúng định dạng JSON.');}
  if(!response.ok&&response.status!==202){
    if(response.status===401||response.status===403)throw Error('Supadata từ chối API key. Kiểm tra lại khóa trong Vercel.');
    if(response.status===402||response.status===429)throw Error('Supadata hết credits hoặc giới hạn lượt gọi.');
    throw Error('Supadata không lấy được phụ đề video này (HTTP '+response.status+').');
  }
  if(data?.status==='failed')throw Error('Supadata không xử lý được phụ đề video này.');
  if(response.status===202||data?.status==='processing'||data?.status==='pending'||data?.status==='queued'){
    const id=data?.jobId||jobId;
    if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{6,128}$/.test(id))
      throw Error('Supadata trả mã công việc không hợp lệ.');
    return {pending:true,job_id:id};
  }
  return normalizeTranscript(data);
}
