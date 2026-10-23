import {TRIAL_VIDEO_ID,getTranscript} from '../lib/supadata-preview.mjs';
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
  if(req.query?.video_id!==TRIAL_VIDEO_ID)
    return res.status(403).json({detail:'Bản thử API chỉ hỗ trợ video Ed Sheeran hiện tại.'});
  try{
    const data=await getTranscript({
      key:process.env.SUPADATA_API_KEY,
      videoId:req.query.video_id,
      jobId:req.query.job_id||undefined,
    });
    if(!data.pending)res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json(data);
  }catch(error){
    return res.status(502).json({detail:String(error.message||'Không thể lấy phụ đề Supadata').slice(0,240)});
  }
}
