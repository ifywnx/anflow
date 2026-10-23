export default function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({detail:'Method not allowed'});}
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:true,online_preview:true,whisper:false,elevenlabs_connected:false,translation:true,captions:true,description:'Cloud caption retrieval is best-effort. Whisper and ElevenLabs remain local-only.'});
}
