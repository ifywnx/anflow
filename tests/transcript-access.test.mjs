import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnerCookie,ownerAuthorized,equalSecrets,publicVideo} from '../lib/transcript-access.mjs';
import login from '../api/transcript-access.js';
function response(){return {code:200,headers:{},body:null,setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},status(c){this.code=c;return this;},json(d){this.body=d;return this;}};}
const secret='test-very-long-transcript-secret-2026';
test('Only two public demos use anonymous Supadata credits',()=>{
  assert.equal(publicVideo('JGwWNGJdvx8'),true);
  assert.equal(publicVideo('RBumgq5yVrA'),true);
  assert.equal(publicVideo('dQw4w9WgXcQ'),false);
});
test('Owner secret comparison requires a long matching code',()=>{
  assert.equal(equalSecrets(secret,secret),true);
  assert.equal(equalSecrets(secret,secret+'!'),false);
  assert.equal(equalSecrets('short','short'),false);
});
test('Signed secure cookie works and expires after seven days',()=>{
  const before=process.env.ANFLOW_TRANSCRIPT_ACCESS_TOKEN;
  try{
    process.env.ANFLOW_TRANSCRIPT_ACCESS_TOKEN=secret;
    const now=Date.UTC(2026,9,24,0,0,0);
    const cookie=createOwnerCookie(secret,now);
    assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
    const req={headers:{cookie:cookie.split(';')[0]}};
    assert.equal(ownerAuthorized(req,now+1000),true);
    assert.equal(ownerAuthorized(req,now+8*86400_000),false);
    const tampered={headers:{cookie:req.headers.cookie.replace(/[a-f0-9]$/,'0')}};
    // Defensive guarantee: either a changed signature is rejected, or original ended in 0.
    if(tampered.headers.cookie!==req.headers.cookie)assert.equal(ownerAuthorized(tampered,now),false);
    assert.equal(ownerAuthorized({headers:{cookie:''}},now),false);
  }finally{if(before===undefined)delete process.env.ANFLOW_TRANSCRIPT_ACCESS_TOKEN;else process.env.ANFLOW_TRANSCRIPT_ACCESS_TOKEN=before;}
});
test('One-time owner login sets httpOnly session and never returns the secret',()=>{
  const before=process.env.ANFLOW_TRANSCRIPT_ACCESS_TOKEN;
  try{
    process.env.ANFLOW_TRANSCRIPT_ACCESS_TOKEN=secret;
    const req={method:'POST',headers:{origin:'https://anflow-hazel.vercel.app',host:'anflow-hazel.vercel.app'},body:{code:secret}};
    const res=response();login(req,res);
    assert.equal(res.code,200);
    assert.equal(res.body.authorized,true);
    assert.match(res.headers['set-cookie'],/HttpOnly/);
    assert.equal(JSON.stringify(res.body).includes(secret),false);
    const fail=response();
    login({...req,body:{code:'wrong'}},fail);
    assert.equal(fail.code,401);
    const wrongOrigin=response();
    login({...req,headers:{...req.headers,origin:'https://evil.example'}},wrongOrigin);
    assert.equal(wrongOrigin.code,403);
  }finally{if(before===undefined)delete process.env.ANFLOW_TRANSCRIPT_ACCESS_TOKEN;else process.env.ANFLOW_TRANSCRIPT_ACCESS_TOKEN=before;}
});
