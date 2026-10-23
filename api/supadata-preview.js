import {createHmac,timingSafeEqual} from 'node:crypto';
import {TRIAL_VIDEO_ID,getTranscript} from '../lib/supadata-preview.mjs';
function jobSignature(jobId,key){
  return createHmac('sha256',key).update(TRIAL_VIDEO_ID+'|'+jobId).digest('hex');
}
function isAuthorizedJob(jobId,signature,key){
  if(typeof jobId!=='string'||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!key)return false;
  return timingSafeEqual(Buffer.from(jobSignature(jobId,key)),Buffer.from(signature));
}
/**
 * Read-only cached trial, intentionally restricted to one video so an
 * unauthenticated public website cannot drain a general Supadata quota.
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
  if(req.query?.job_id&&!isAuthorizedJob(req.query.job_id,req.query.job_token,process.env.SUPADATA_API_KEY))
    return res.status(403).json({detail:'Không có quyền xem tác vụ này.'});
  if(req.query?.video_id!==TRIAL_VIDEO_ID)
    return res.status(403).json({detail:'Bản thử API chỉ hỗ trợ video Ed Sheeran hiện tại.'});
  try{
    const data=await getTranscript({
      key:process.env.SUPADATA_API_KEY,
      videoId:req.query.video_id,
      jobId:req.query.job_id||undefined,
    });
    if(data.pending)data.job_token=jobSignature(data.job_id,process.env.SUPADATA_API_KEY);
    else res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json(data);
  }catch(error){
    return res.status(502).json({detail:String(error.message||'Không thể lấy phụ đề Supadata').slice(0,240)});
  }
}
