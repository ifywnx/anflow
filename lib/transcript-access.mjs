import {createHmac,timingSafeEqual} from 'node:crypto';
export const PUBLIC_TEST_VIDEOS=new Set(['JGwWNGJdvx8','RBumgq5yVrA']);
export const OWNER_COOKIE='anflow_transcript_access';
const secret=()=>process.env.ANFLOW_TRANSCRIPT_ACCESS_TOKEN;
export function equalSecrets(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length<24||b.length<24)return false;
  const left=Buffer.from(a,'utf8'),right=Buffer.from(b,'utf8');
  return left.length===right.length&&timingSafeEqual(left,right);
}
function signedExpiry(expiry,value){
  return createHmac('sha256',value).update(OWNER_COOKIE+'|'+expiry).digest('hex');
}
export function createOwnerCookie(value,now=Date.now()){
  const expiry=Math.floor((now+7*24*3600*1000)/1000);
  const payload=expiry+'.'+signedExpiry(expiry,value);
  return OWNER_COOKIE+'='+encodeURIComponent(payload)+'; Path=/api; Max-Age=604800; HttpOnly; Secure; SameSite=Strict';
}
export function ownerAuthorized(req,now=Date.now()){
  const value=secret();if(!value||value.length<24)return false;
  const cookie=String(req?.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(OWNER_COOKIE+'='));
  if(!cookie)return false;
  const raw=cookie.slice(OWNER_COOKIE.length+1);
  const match=/^(\d{10})\.([0-9a-f]{64})$/.exec(raw);
  if(!match)return false;
  const expiry=Number(match[1]),current=Math.floor(now/1000);
  if(expiry<current||expiry>current+604800)return false;
  const given=Buffer.from(match[2]),expected=Buffer.from(signedExpiry(expiry,value));
  return given.length===expected.length&&timingSafeEqual(given,expected);
}
export function publicVideo(id){return PUBLIC_TEST_VIDEOS.has(id);}
