import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import { digest } from "../apps/web/server/core/crypto.mjs";
import { createGoogleProvider } from "../apps/web/server/accounts/google/provider.mjs";
const config={origin:"http://localhost:3000",clientId:"synthetic-client",clientSecret:"synthetic-secret"};

test("provider rejects HTTP errors, malformed/missing/oversized tokens, bounded response bodies and network failure",async()=>{
 const {publicKey}=await generateKeyPair("RS256");
 const replies=[()=>new Response("secret provider details",{status:400}),()=>new Response("invalid-json"),()=>Response.json({access_token:"never-use-for-auth"}),()=>Response.json({id_token:"a".repeat(16385)}),()=>new Response("{}",{headers:{"content-length":"65537"}}),()=>new Response("x".repeat(65537)),()=>{throw new Error("sensitive upstream failure");}];
 for(const reply of replies){const provider=createGoogleProvider(config,{keys:publicKey,fetch:async()=>reply()});await assert.rejects(provider.exchange({code:"synthetic-code",verifier:"v".repeat(43),nonceHash:digest("nonce")}));}
});

test("provider supplies an abort deadline and forbids token endpoint redirects",async()=>{
 const {publicKey}=await generateKeyPair("RS256");
 let signal;
 const provider=createGoogleProvider(config,{keys:publicKey,fetch:async(_url,options)=>{signal=options.signal;assert.equal(options.redirect,"error");throw new DOMException("aborted","AbortError");}});
 await assert.rejects(provider.exchange({code:"synthetic-code",verifier:"v".repeat(43),nonceHash:digest("nonce")}));assert.ok(signal instanceof AbortSignal);
});

test("provider requires expiration, issued-at, nonce, email and matching authorized party before returning identity",async()=>{
 const {privateKey,publicKey}=await generateKeyPair("RS256"),now=Math.floor(Date.now()/1000);
 for(const claims of [{exp:undefined},{iat:undefined},{nonce:undefined},{email:undefined},{email_verified:undefined},{azp:"other-client"},{aud:["synthetic-client","other-client"],azp:undefined},{iat:now+600}]){
 const payload={iss:"https://accounts.google.com",aud:"synthetic-client",sub:"sub",exp:now+300,iat:now,nonce:"nonce",email:"teacher@example.test",email_verified:true,...claims};
 const token=await new SignJWT(payload).setProtectedHeader({alg:"RS256"}).sign(privateKey);
 const provider=createGoogleProvider(config,{keys:publicKey,fetch:async()=>Response.json({id_token:token})});
 await assert.rejects(provider.exchange({code:"synthetic-code",verifier:"v".repeat(43),nonceHash:digest("nonce")}),JSON.stringify(claims));
 }
});
