import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { generateKeyPair, SignJWT } from "jose";
import { digest } from "../apps/web/server/core/crypto.mjs";
import { createRegistrationHandler } from "../apps/web/server/accounts/registration.mjs";
import { createSessionHandlers } from "../apps/web/server/accounts/sessions.mjs";
import { createProfileHandlers } from "../apps/web/server/accounts/profile.mjs";
import { testDatabase } from "./support/database.mjs";

const origin="http://localhost:3000", password="Synthetic password 123";
const config={origin,clientId:"synthetic-client",clientSecret:"synthetic-secret",googleEnabled:true,googleStartLimit:300};
let storage,handlers,createGoogleHandlers,createGoogleProvider,privateKey,publicKey,token,exchangeCount=0,exchangeHook;
function req(method,path,body,{cookie,headers={}}={}) { return new Request(`${origin}/api/v1/${path}`,{method,headers:{...(method==="GET"?{}:{origin,"content-type":"application/json"}),...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}); }
async function account(label) { const r=await createRegistrationHandler(storage.db,{origin,registerLimit:300})(req("POST","auth/register",{name:label,email:`${label}@example.test`,password})); assert.equal(r.status,201);return {...(await r.json()).data.user,cookie:r.headers.get("set-cookie").split(";")[0]}; }
async function signed(nonce,claims={},key=privateKey) {return new SignJWT({nonce,email:"new-google@example.test",email_verified:true,name:"Google Teacher",...claims}).setProtectedHeader({alg:"RS256"}).setSubject(claims.sub??"new-sub").setIssuer(claims.iss??"https://accounts.google.com").setAudience(claims.aud??config.clientId).setIssuedAt().setExpirationTime(claims.exp??"5m").sign(key);}
async function begin(user) {const r=await handlers[user?"link":"start"](req("POST",user?"me/google/link":"auth/google",user?{currentPassword:password}:undefined,{cookie:user?.cookie}));assert.equal(r.status,200);const url=new URL((await r.json()).data.url);return {url,cookie:r.headers.get("set-cookie").split(";")[0],user};}
function callback(flow,query="",cookie=flow.cookie) {return req("GET",`auth/google/callback?state=${flow.url.searchParams.get("state")}&${query||"code=synthetic-code"}`,undefined,{cookie:cookie+(flow.user?`; ${flow.user.cookie}`:"")});}
const location=r=>r.headers.get("location");
before(async()=>{
  ({createGoogleHandlers}=await import("../apps/web/server/accounts/google/handlers.mjs"));
  ({createGoogleProvider}=await import("../apps/web/server/accounts/google/provider.mjs"));
  ({privateKey,publicKey}=await generateKeyPair("RS256")); storage=await testDatabase();for(const name of storage.migrations)await storage.migrate(name);
  const provider=createGoogleProvider(config,{keys:publicKey,fetch:async(url,options)=>{exchangeCount++;assert.equal(url,"https://oauth2.googleapis.com/token");const body=options.body;assert.equal(body.get("grant_type"),"authorization_code");assert.equal(body.get("redirect_uri"),`${origin}/api/v1/auth/google/callback`);assert.equal(body.get("client_secret"),"synthetic-secret");assert.ok(body.get("code_verifier").length>=43);await exchangeHook?.();return Response.json({id_token:token,access_token:"never-persist-me",token_type:"Bearer",expires_in:3600});}});
  handlers=createGoogleHandlers(storage.db,config,{provider});
});
after(async()=>{await storage?.close();});

test("start is same-origin, throttled, browser-bound and uses nonce/state/PKCE with fixed Google endpoints",async()=>{
  assert.equal((await handlers.start(req("POST","auth/google",undefined,{headers:{origin:"https://attacker.test"}}))).status,403);
  const flow=await begin(); assert.equal(flow.url.origin,"https://accounts.google.com"); assert.equal(flow.url.pathname,"/o/oauth2/v2/auth");
  for(const name of ["state","nonce","code_challenge"])assert.ok(flow.url.searchParams.get(name).length>=43);
  assert.equal(flow.url.searchParams.get("scope"),"openid email profile");assert.equal(flow.url.searchParams.get("code_challenge_method"),"S256");assert.equal(flow.url.searchParams.get("redirect_uri"),`${origin}/api/v1/auth/google/callback`);assert.equal(flow.url.searchParams.has("access_type"),false);
  const row=await storage.db.googleOAuthFlow.findUnique({where:{tokenHash:digest(flow.cookie.split("=")[1])}});assert.ok(row);assert.notEqual(row.stateHash,flow.url.searchParams.get("state"));assert.notEqual(row.nonceHash,flow.url.searchParams.get("nonce"));assert.ok(row.expiresAt.getTime()-Date.now()<=600000);
  const limited=createGoogleHandlers(storage.db,{...config,googleStartLimit:1},{provider:{}});await storage.db.rateLimit.deleteMany();assert.equal((await limited.start(req("POST","auth/google"))).status,200);assert.equal((await limited.start(req("POST","auth/google"))).status,429);
  await storage.db.rateLimit.deleteMany();
});

test("verified identity creates a passwordless account and local session; stable sub preserves profile and rotates old session",async()=>{
  const old=await account("rotate-google"),flow=await begin();token=await signed(flow.url.searchParams.get("nonce"));const r=await handlers.callback(callback(flow,"",`${flow.cookie}; ${old.cookie}`));assert.equal(location(r),"/beranda?google=signed_in");assert.match(r.headers.get("set-cookie"),/HttpOnly/);
  const user=await storage.db.teacher.findUnique({where:{email:"new-google@example.test"},include:{googleIdentity:true}});assert.equal(user.passwordHash,null);assert.equal(user.googleIdentity.sub,"new-sub");assert.equal(user.school,"");assert.equal(await storage.db.session.count({where:{tokenHash:digest(old.cookie.split("=")[1])}}),0);
  const flow2=await begin();token=await signed(flow2.url.searchParams.get("nonce"),{email:"changed@example.test",name:"Changed"});assert.equal(location(await handlers.callback(callback(flow2))),"/beranda?google=signed_in");assert.equal((await storage.db.teacher.findUnique({where:{id:user.id}})).email,"new-google@example.test");assert.equal(await storage.db.teacher.count({where:{email:"changed@example.test"}}),0);
  assert.equal(await storage.db.googleOAuthFlow.count({where:{tokenHash:digest(flow.cookie.split("=")[1])}}),0);
});

test("invalid binding, ambiguous callback, cancellation and replay cannot exchange or create accounts",async()=>{
  for(const kind of ["no-cookie","duplicate-cookie","wrong-state","duplicate-state","duplicate-code","cancel","expired"]){const flow=await begin();let request=callback(flow);if(kind==="no-cookie")request=callback(flow,"","");if(kind==="duplicate-cookie")request=callback(flow,"",`${flow.cookie}; ${flow.cookie}`);if(kind==="wrong-state")request=req("GET","auth/google/callback?state=wrong&code=code",undefined,{cookie:flow.cookie});if(kind==="duplicate-state")request=callback(flow,`state=${flow.url.searchParams.get("state")}&code=code`);if(kind==="duplicate-code")request=callback(flow,"code=a&code=b");if(kind==="cancel")request=callback(flow,"error=access_denied");if(kind==="expired")await storage.db.googleOAuthFlow.update({where:{tokenHash:digest(flow.cookie.split("=")[1])},data:{expiresAt:new Date(0)}});const count=exchangeCount,r=await handlers.callback(request);assert.match(location(r),/^\/masuk\?google=(expired|failed|cancelled)$/);assert.match(r.headers.get("set-cookie"),/Max-Age=0/);assert.equal(exchangeCount,count,kind);}
  const flow=await begin();token=await signed(flow.url.searchParams.get("nonce"),{sub:"replay-sub",email:"replay@example.test"});const count=exchangeCount;assert.equal(location(await handlers.callback(callback(flow))),"/beranda?google=signed_in");assert.equal(location(await handlers.callback(callback(flow))),"/masuk?google=expired");assert.equal(exchangeCount,count+1);
});

test("signature and required Google claims reject forged, expired, unverified or mismatched tokens",async()=>{
  const foreign=await generateKeyPair("RS256");
  for(const changes of [{nonce:"wrong"},{aud:"wrong"},{iss:"https://attacker.test"},{exp:1},{email_verified:false},{email:"not-an-email"},{sub:""},{sub:"x".repeat(256)},{foreign:true},{email_verified:"true"}]){const flow=await begin();token=await signed(flow.url.searchParams.get("nonce"),{sub:"bad-sub",email:"bad@example.test",...changes},changes.foreign?foreign.privateKey:privateKey);const before=await storage.db.teacher.count();const r=await handlers.callback(callback(flow));assert.equal(location(r),"/masuk?google=failed",JSON.stringify(changes));assert.equal(await storage.db.teacher.count(),before);assert.ok(!(await r.text()).includes("synthetic-secret"));}
});

test("matching password email never merges implicitly or creates a local session",async()=>{const user=await account("email-collision"),flow=await begin();token=await signed(flow.url.searchParams.get("nonce"),{sub:"collision-sub",email:user.email});const count=await storage.db.session.count();assert.equal(location(await handlers.callback(callback(flow))),"/masuk?google=email_exists");assert.equal(await storage.db.googleIdentity.count({where:{teacherId:user.id}}),0);assert.equal(await storage.db.session.count(),count);});

test("link requires current password, teacher expectation and unchanged authenticated session; only matching verified email links",async()=>{
  const user=await account("link-user");assert.equal((await handlers.link(req("POST","me/google/link",{currentPassword:password}))).status,401);assert.equal((await handlers.link(req("POST","me/google/link",{currentPassword:"wrong"},{cookie:user.cookie}))).status,422);assert.equal((await handlers.link(req("POST","me/google/link",{currentPassword:password},{cookie:user.cookie,headers:{"x-teacher-id":"00000000-0000-4000-8000-000000000000"}}))).status,409);
  const mismatch=await begin(user);token=await signed(mismatch.url.searchParams.get("nonce"),{sub:"link-sub",email:"different@example.test"});assert.equal(location(await handlers.callback(callback(mismatch))),"/akun?google=email_mismatch");assert.equal(await storage.db.googleIdentity.count({where:{teacherId:user.id}}),0);
  const flow=await begin(user);token=await signed(flow.url.searchParams.get("nonce"),{sub:"link-sub",email:user.email});assert.equal(location(await handlers.callback(callback(flow))),"/akun?google=linked");assert.equal((await storage.db.googleIdentity.findUnique({where:{sub:"link-sub"}})).teacherId,user.id);assert.equal((await handlers.link(req("POST","me/google/link",{currentPassword:password},{cookie:user.cookie}))).status,409);
});

test("logout, password change and browser account switch during provider exchange invalidate linking",async()=>{
  for(const action of ["logout","password","switch"]){const user=await account(`link-${action}`),other=await account(`other-${action}`),flow=await begin(user);token=await signed(flow.url.searchParams.get("nonce"),{sub:`${action}-sub`,email:user.email});
    exchangeHook=async()=>{if(action==="logout")assert.equal((await createSessionHandlers(storage.db,config).logout(req("POST","auth/logout",undefined,{cookie:user.cookie}))).status,204);if(action==="password")assert.equal((await createProfileHandlers(storage.db,config).password(req("POST","me/password",{currentPassword:password,newPassword:"New password 123",confirmPassword:"New password 123"},{cookie:user.cookie}))).status,204);};
    try{const request=action==="switch"?callback({...flow,user:other}):callback(flow);assert.equal(location(await handlers.callback(request)),"/akun?google=expired");assert.equal(await storage.db.googleIdentity.count({where:{teacherId:user.id}}),0);}finally{exchangeHook=undefined;}
  }
});

test("identity/session insert failures roll back teacher creation and previous session revocation",async()=>{
  const user=await account("callback-rollback"),flow=await begin();token=await signed(flow.url.searchParams.get("nonce"),{sub:"rollback-sub",email:"callback-rollback-new@example.test"});await storage.sql('ALTER TABLE "Session" ADD CONSTRAINT synthetic_google_failure CHECK (false) NOT VALID');
  try{const r=await handlers.callback(callback(flow,"",`${flow.cookie}; ${user.cookie}`));assert.equal(location(r),"/masuk?google=failed");assert.equal(await storage.db.teacher.count({where:{email:"callback-rollback-new@example.test"}}),0);assert.equal(await storage.db.googleIdentity.count({where:{sub:"rollback-sub"}}),0);assert.equal(await storage.db.session.count({where:{tokenHash:digest(user.cookie.split("=")[1])}}),1);}finally{await storage.sql('ALTER TABLE "Session" DROP CONSTRAINT synthetic_google_failure');}
});

test("expired flow cleanup is bounded and secure origin uses host-only flow cookies",async()=>{
  const flow=await begin();await storage.db.googleOAuthFlow.update({where:{tokenHash:digest(flow.cookie.split("=")[1])},data:{expiresAt:new Date(0)}});await begin();assert.equal(await storage.db.googleOAuthFlow.count({where:{expiresAt:{lte:new Date(0)}}}),0);
  const secure=createGoogleHandlers(storage.db,{...config,origin:"https://imajilearn.example"},{provider:{}});const r=await secure.start(req("POST","auth/google",undefined,{headers:{origin:"https://imajilearn.example",host:"attacker.test"}}));assert.equal(r.status,200);assert.match(r.headers.get("set-cookie"),/^__Host-imajilearn_google_flow=.*; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);assert.equal(new URL((await r.json()).data.url).searchParams.get("redirect_uri"),"https://imajilearn.example/api/v1/auth/google/callback");
});

test("PostgreSQL: parallel callbacks consume a browser flow exactly once",{skip:!process.env.TEST_DATABASE_URL},async()=>{const flow=await begin();token=await signed(flow.url.searchParams.get("nonce"),{sub:"race-sub",email:"race@example.test"});const count=exchangeCount;const responses=await Promise.all([1,2].map(()=>handlers.callback(callback(flow))));assert.deepEqual(responses.map(location).sort(),["/beranda?google=signed_in","/masuk?google=expired"].sort());assert.equal(exchangeCount,count+1);assert.equal(await storage.db.googleIdentity.count({where:{sub:"race-sub"}}),1);});

async function blockedQuery(fragment) {
  const deadline=Date.now()+8000;
  while(Date.now()<deadline){
    const result=await storage.sql("SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND position($1 in query) > 0",[fragment]);
    if(result.rows.length)return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.fail(`Expected a database lock wait for ${fragment}`);
}

test("PostgreSQL: logout commits while callback waits for teacher lock, so linking rejects the revoked session",{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const user=await account("link-lock-logout"),flow=await begin(user);token=await signed(flow.url.searchParams.get("nonce"),{sub:"lock-logout-sub",email:user.email});
  const locker=storage.connect();let unlock,ready;
  const held=new Promise(resolve=>{ready=resolve;});const release=new Promise(resolve=>{unlock=resolve;});
  const lock=locker.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Teacher" WHERE "id" = ${user.id}::uuid FOR UPDATE`;ready();await release;},{timeout:20000});
  try{await held;const pending=handlers.callback(callback(flow));await blockedQuery('SELECT "id", "email", "passwordHash" FROM "Teacher"');
    const logout=await createSessionHandlers(storage.db,config).logout(req("POST","auth/logout",undefined,{cookie:user.cookie}));assert.equal(logout.status,204);
    unlock();await lock;assert.equal(location(await pending),"/akun?google=expired");assert.equal(await storage.db.googleIdentity.count({where:{teacherId:user.id}}),0);
  }finally{unlock();await lock;await locker.$disconnect();}
});

test("PostgreSQL: password rotation holding teacher lock commits before waiting callback and invalidates its credential snapshot",{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const user=await account("link-lock-password"),flow=await begin(user);token=await signed(flow.url.searchParams.get("nonce"),{sub:"lock-password-sub",email:user.email});
  const locker=storage.connect();let unlock,ready;
  const held=new Promise(resolve=>{ready=resolve;});const release=new Promise(resolve=>{unlock=resolve;});
  const tokenHash=digest(user.cookie.split("=")[1]);
  let lock;
  const scheduled={teacher:storage.db.teacher,session:storage.db.session,rateLimit:storage.db.rateLimit,
    async $transaction(operation){
      // Acquire the session lock only after outer session/password validation has completed.
      lock=locker.$transaction(async tx=>{await tx.$queryRaw`SELECT "tokenHash" FROM "Session" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;ready();await release;},{timeout:20000});
      await held;return storage.db.$transaction(operation);
    }};
  try{const changing=createProfileHandlers(scheduled,config).password(req("POST","me/password",{currentPassword:password,newPassword:"Concurrent new password 123",confirmPassword:"Concurrent new password 123"},{cookie:user.cookie}));
    await blockedQuery('Session');const pending=handlers.callback(callback(flow));await blockedQuery('SELECT "id", "email", "passwordHash" FROM "Teacher"');
    unlock();await lock;assert.equal((await changing).status,204);assert.equal(location(await pending),"/akun?google=expired");assert.equal(await storage.db.googleIdentity.count({where:{teacherId:user.id}}),0);
  }finally{unlock();await lock;await locker.$disconnect();}
});

test("PostgreSQL: competing browser flows cannot attach the same identity twice or leave an orphan teacher",{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const flows=await Promise.all([begin(),begin()]);
  const tokens=await Promise.all(flows.map(flow=>signed(flow.url.searchParams.get("nonce"),{sub:"parallel-new-sub",email:"parallel-new@example.test"})));
  const raceProvider={async exchange({nonceHash}){const index=flows.findIndex(flow=>digest(flow.url.searchParams.get("nonce"))===nonceHash);return createGoogleProvider(config,{keys:publicKey,fetch:async()=>Response.json({id_token:tokens[index]})}).exchange({code:"code",verifier:"v".repeat(43),nonceHash});}};
  const racing=createGoogleHandlers(storage.db,config,{provider:raceProvider});
  const results=await Promise.all(flows.map(flow=>racing.callback(callback(flow))));
  assert.ok(results.some(result=>location(result)==="/beranda?google=signed_in"));
  assert.ok(results.every(result=>["/beranda?google=signed_in","/masuk?google=conflict","/masuk?google=email_exists"].includes(location(result))));
  assert.equal(await storage.db.teacher.count({where:{email:"parallel-new@example.test"}}),1);assert.equal(await storage.db.googleIdentity.count({where:{sub:"parallel-new-sub"}}),1);
});

test("a flow expiring during provider exchange cannot sign in or link",async()=>{
 for(const linking of [false,true]){const user=linking?await account("flow-expiring-link"):undefined,flow=await begin(user);await storage.db.googleOAuthFlow.update({where:{tokenHash:digest(flow.cookie.split("=")[1])},data:{expiresAt:new Date(Date.now()+120)}});token=await signed(flow.url.searchParams.get("nonce"),{sub:linking?"expiring-link-sub":"expiring-login-sub",email:user?.email??"expiring-new@example.test"});
 exchangeHook=()=>new Promise(resolve=>setTimeout(resolve,180));
 try{assert.equal(location(await handlers.callback(callback(flow))),linking?"/akun?google=expired":"/masuk?google=expired");assert.equal(await storage.db.googleIdentity.count({where:{sub:linking?"expiring-link-sub":"expiring-login-sub"}}),0);}finally{exchangeHook=undefined;}
 }
});

test("an already-owned Google identity cannot be linked to another teacher even when its verified email changes",async()=>{
 const user=await account("link-owned-sub"),flow=await begin(user);token=await signed(flow.url.searchParams.get("nonce"),{sub:"new-sub",email:user.email});
 const r=await handlers.callback(callback(flow));assert.equal(location(r),"/akun?google=conflict");assert.equal(await storage.db.googleIdentity.count({where:{teacherId:user.id}}),0);assert.equal((await storage.db.googleIdentity.findUnique({where:{sub:"new-sub"},include:{teacher:true}})).teacher.email,"new-google@example.test");
});

test("provider failure consumes the valid flow and never exposes upstream details or issues an application session",async()=>{
 const flow=await begin(),count=await storage.db.session.count();
 const failed=createGoogleHandlers(storage.db,config,{provider:{async exchange(){throw new Error("synthetic-secret provider-token private-network-detail");}}});
 const r=await failed.callback(callback(flow));assert.equal(location(r),"/masuk?google=failed");assert.ok(!(JSON.stringify([...r.headers])+await r.text()).includes("synthetic-secret"));assert.equal(await storage.db.session.count(),count);assert.equal(await storage.db.googleOAuthFlow.count({where:{tokenHash:digest(flow.cookie.split("=")[1])}}),0);
});
