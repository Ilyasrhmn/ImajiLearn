import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import { digest } from "../apps/web/server/core/crypto.mjs";
import { createGoogleProvider } from "../apps/web/server/accounts/google/provider.mjs";
const config={origin:"http://localhost:3000",clientId:"synthetic-client",clientSecret:"synthetic-secret"};

test("verified Google picture claims are returned only for allowed profile-photo hosts", async () => {
 const { privateKey, publicKey } = await generateKeyPair("RS256");
 const picture = "https://lh3.googleusercontent.com/a/example=s96-c";
 for (const value of [picture, "https://unrelated.example.test/tracker", undefined]) {
  const token = await new SignJWT({ nonce: "nonce", email: "teacher@example.test", email_verified: true, name: "Guru", ...(value ? { picture: value } : {}) })
   .setProtectedHeader({ alg: "RS256" }).setSubject("teacher-sub").setIssuer("https://accounts.google.com").setAudience(config.clientId).setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const provider = createGoogleProvider(config, { keys: publicKey, fetch: async () => Response.json({ id_token: token }) });
  const identity = await provider.exchange({ code: "code", verifier: "v".repeat(43), nonceHash: digest("nonce") });
  assert.equal(identity.avatarUrl, value === picture ? picture : null);
 }
});

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

test("Google login tolerates small clock skew but rejects future and expired tokens outside tolerance", async () => {
 const {privateKey,publicKey}=await generateKeyPair("RS256");
 const now=Math.floor(Date.now()/1000);
 for(const [claims,accepted] of [[{iat:now+5,exp:now+300},true],[{iat:now+120,exp:now+300},false],[{iat:now-300,exp:now-120},false]]) {
  const token=await new SignJWT({sub:"teacher-sub",iss:"https://accounts.google.com",aud:config.clientId,nonce:"nonce",email:"teacher@example.test",email_verified:true,...claims}).setProtectedHeader({alg:"RS256"}).sign(privateKey);
  const provider=createGoogleProvider(config,{keys:publicKey,fetch:async()=>Response.json({id_token:token})});
  const result=provider.exchange({code:"code",verifier:"v".repeat(43),nonceHash:digest("nonce")});
  if(accepted) assert.equal((await result).email,"teacher@example.test");
  else await assert.rejects(result);
 }
});
