const MAX_TEXTS=20,MAX_TEXT_LENGTH=600,MAX_TOTAL=4000;
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({detail:'Method not allowed'});}
  if(req.headers['x-vietflow']!=='1')return res.status(403).json({detail:'Thiếu tiêu đề ứng dụng.'});
  const origin=req.headers.origin,host=req.headers.host;
  if(origin){try{const url=new URL(origin);if(url.protocol!=='https:'||url.host!==host)return res.status(403).json({detail:'Origin không hợp lệ.'});}catch{return res.status(403).json({detail:'Origin không hợp lệ.'});}}
  const texts=req.body?.texts;
  if(!Array.isArray(texts)||texts.length<1||texts.length>MAX_TEXTS||texts.some(t=>typeof t!=='string'||t.length>MAX_TEXT_LENGTH)||texts.reduce((n,t)=>n+t.length,0)>MAX_TOTAL)
    return res.status(400).json({detail:'Tối đa 20 câu, mỗi câu 600 ký tự, tổng 4000 ký tự.'});
  const translations=Array(texts.length).fill('');
  let errors=0;
  const worker=async(start)=>{for(let i=start;i<texts.length;i+=4){
    const item=texts[i].trim();if(!item)continue;
    try{
      const uri=new URL('https://translate.googleapis.com/translate_a/single');
      uri.searchParams.set('client','gtx');uri.searchParams.set('sl','auto');
      uri.searchParams.set('tl','vi');uri.searchParams.set('dt','t');uri.searchParams.set('q',item);
      const response=await fetch(uri,{signal:AbortSignal.timeout(7000),headers:{'Accept':'application/json'}});
      if(!response.ok)throw Error('Translate '+response.status);
      const data=await response.json();translations[i]=(data?.[0]||[]).map(p=>typeof p?.[0]==='string'?p[0]:'').join('');
    }catch{errors++;}
  }};
  await Promise.all([0,1,2,3].map(worker));
  res.status(200).json({translations,warnings:errors?['Dịch miễn phí không xử lý hết câu; những câu chưa dịch vẫn giữ nguyên bản gốc.']:[]});
}
