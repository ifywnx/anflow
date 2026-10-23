import {createHmac,timingSafeEqual} from 'node:crypto';
import {getTranscript} from '../lib/supadata-preview.mjs';
import {ownerAuthorized,publicVideo} from '../lib/transcript-access.mjs';
function jobSignature(videoId,jobId,key){
  return createHmac('sha256',key).update(videoId+'|'+jobId).digest('hex');
}
function isAuthorizedJob(videoId,jobId,signature,key){
  if(typeof jobId!=='string'||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!key)return false;
  return timingSafeEqual(Buffer.from(jobSignature(videoId,jobId,key)),Buffer.from(signature));
}
/**
 * Public trial for two tested videos; owner-session unlock for others.
 * Prevents unauthenticated visitors from draining arbitrary transcript credits.
 */
export default async function handler(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');return res.status(405).json({detail:'Method not allowed'});
  }
  // Refuse arbitrary query parameters that could bypass CDN caching and waste
  // billable Supadata credits for repeated calls to the same video.
  if(Object.keys(req.query||{}).some(k=>!['video_id','job_id','job_token'].includes(k)))
    return res.status(400).json({detail:'Tham số không được hỗ trợ.'});
  const videoId=req.query?.video_id;
  if(typeof videoId!=='string'||!/^[a-zA-Z0-9_-]{11}$/.test(videoId))
    return res.status(400).json({detail:'Mã video YouTube không hợp lệ.'});
  // Anonymous visitors can only consume the credits for two verified test videos.
  // Arbitrary URLs require a 7-day owner-only HttpOnly, SameSite=Strict session.
  if(!publicVideo(videoId)&&!ownerAuthorized(req))
    return res.status(401).json({detail:'Đăng nhập quyền chủ sở hữu một lần để ANFLOW lấy phụ đề video mới bằng Supadata.',owner_access_required:true});
  if(req.query?.job_id&&!isAuthorizedJob(videoId,req.query.job_id,req.query.job_token,process.env.SUPADATA_API_KEY))
    return res.status(403).json({detail:'Không có quyền xem tác vụ này.'});
  try{
    const data=await getTranscript({
      key:process.env.SUPADATA_API_KEY,
      videoId,
      jobId:req.query.job_id||undefined,
    });
    if(data.pending)data.job_token=jobSignature(videoId,data.job_id,process.env.SUPADATA_API_KEY);
    else if(publicVideo(videoId))res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=3600');
    else res.setHeader('Cache-Control','private, max-age=300');
    return res.status(200).json(data);
  }catch(error){
    return res.status(502).json({detail:String(error.message||'Không thể lấy phụ đề Supadata').slice(0,240)});
  }
}
