export default function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({detail:'Method not allowed'});}
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:true,online_preview:true,whisper:false,elevenlabs_connected:false,translation:true,captions:true,supadata_test_enabled:Boolean(process.env.SUPADATA_API_KEY),elevenlabs_dubbing_ready:Boolean(process.env.ELEVENLABS_API_KEY&&process.env.ANFLOW_DUB_ACCESS_TOKEN),description:'Cloud caption retrieval is best-effort. Whisper and ElevenLabs remain local-only.'});
}
