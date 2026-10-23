
import {timingSafeEqual} from 'node:crypto';
import {Readable} from 'node:stream';

const TRIAL_ID='JGwWNGJdvx8';
const voiceId=()=>process.env.ELEVENLABS_VOICE_ID||'JBFqnCBsd6RMkjVDRZzb';
const available=()=>Boolean(process.env.ELEVENLABS_API_KEY&&process.env.ANFLOW_DUB_ACCESS_TOKEN);

export function authorized(header,secret){
  if(typeof header!=='string'||typeof secret!=='string'||secret.length<20)return false;
  if(!header.startsWith('Bearer '))return false;
  const received=Buffer.from(header.slice(7));
  const expected=Buffer.from(secret);
  return received.length===expected.length&&timingSafeEqual(received,expected);
}
export function checkDubInput(body){
  if(!body||body.video_id!==TRIAL_ID)return 'Bản thử ElevenLabs chỉ hỗ trợ video Ed Sheeran.';
  if(typeof body.text!=='string')return 'Chưa có bản dịch tiếng Việt.';
  const text=body.text.trim();
  if(!text||text.length>220||/[\\u0000-\\u001F]/.test(text))return 'Mỗi câu lồng tiếng phải có từ 1 đến 220 ký tự.';
  return '';
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='GET'){
    return res.status(200).json({
      elevenlabs_ready:available(),
      access_required:true,
      mode:'eleven_flash_v2_5',
      scope:'single-video-trial',
      // Neither paid-provider credentials nor the admin access token are returned.
    });
  }
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({detail:'Method not allowed'});}
  if(!available())return res.status(503).json({detail:'Chưa cấu hình ELEVENLABS_API_KEY và ANFLOW_DUB_ACCESS_TOKEN trên Vercel. Giọng miễn phí trên thiết bị vẫn dùng được.'});
  const origin=req.headers?.origin,host=req.headers?.host;
  if(origin){try{const u=new URL(origin);if(u.protocol!=='https:'||u.host!==host)return res.status(403).json({detail:'Origin không hợp lệ.'});}
    catch{return res.status(403).json({detail:'Origin không hợp lệ.'});}}
  if(!authorized(req.headers?.authorization,process.env.ANFLOW_DUB_ACCESS_TOKEN))
    return res.status(401).json({detail:'Cần mã quyền sử dụng lồng tiếng ElevenLabs.'});
  const error=checkDubInput(req.body);
  if(error)return res.status(400).json({detail:error});
  // Only a single explicitly authorized video and text <= 220 chars per call.
  // The owner controls paid TTS activation using a separate access token.
  const endpoint='https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voiceId())+'/stream?output_format=mp3_22050_32';
  try{
    const upstream=await fetch(endpoint,{
      method:'POST',signal:AbortSignal.timeout(16000),
      headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json','Accept':'audio/mpeg'},
      body:JSON.stringify({
        text:req.body.text.trim(),model_id:'eleven_flash_v2_5',
        voice_settings:{stability:0.5,similarity_boost:0.75,speed:1.0}
      })
    });
    if(!upstream.ok){
      return res.status(upstream.status===401?502:upstream.status===429?429:502).json({
        detail:upstream.status===429?'ElevenLabs hết lượt hoặc đang giới hạn.':'ElevenLabs chưa tạo được giọng đọc (HTTP '+upstream.status+').'
      });
    }
    if(!upstream.body)return res.status(502).json({detail:'ElevenLabs không trả âm thanh.'});
    res.setHeader('Content-Type','audio/mpeg');
    res.setHeader('Cache-Control','private, no-store');
    // Node streaming avoids buffering whole provider audio in memory.
    await new Promise((resolve,reject)=>{
      const stream=Readable.fromWeb(upstream.body);
      stream.on('error',reject);
      res.on?.('close',()=>{if(!res.writableEnded)stream.destroy();});
      stream.pipe(res).on('finish',resolve).on('error',reject);
    });
  }catch(error){
    if(!res.headersSent)return res.status(502).json({detail:'Mạng hoặc dịch vụ ElevenLabs gặp lỗi.'});
    res.end();
  }
}
