import {equalSecrets,createOwnerCookie,ownerAuthorized,OWNER_COOKIE} from '../lib/transcript-access.mjs';
export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='GET')return res.status(200).json({authorized:ownerAuthorized(req),login_available:Boolean(process.env.ANFLOW_TRANSCRIPT_ACCESS_TOKEN)});
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({detail:'Method not allowed'});}
  if(req.headers?.origin){
    try{const origin=new URL(req.headers.origin);
      if(origin.protocol!=='https:'||origin.host!==req.headers.host)return res.status(403).json({detail:'Yêu cầu không hợp lệ.'});
    }catch{return res.status(403).json({detail:'Yêu cầu không hợp lệ.'});}
  }
  const code=process.env.ANFLOW_TRANSCRIPT_ACCESS_TOKEN;
  if(!code||!equalSecrets(req.body?.code,code))return res.status(401).json({detail:'Mã mở khóa chưa chính xác.'});
  res.setHeader('Set-Cookie',createOwnerCookie(code));
  return res.status(200).json({authorized:true});
}
