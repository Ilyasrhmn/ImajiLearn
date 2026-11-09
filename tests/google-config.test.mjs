import test from "node:test";
import assert from "node:assert/strict";

test("Google configuration exposes availability only and rejects incomplete credentials and invalid app origins",async()=>{
 const {googleConfig,isGoogleAuthEnabled}=await import("../apps/web/server/accounts/google/config.mjs");
 const valid={APP_ORIGIN:"http://localhost:3000",GOOGLE_CLIENT_ID:"synthetic-client",GOOGLE_CLIENT_SECRET:"synthetic-secret"};
 assert.equal(isGoogleAuthEnabled(valid),true);
 for(const changes of [{GOOGLE_CLIENT_SECRET:""},{GOOGLE_CLIENT_ID:""},{APP_ORIGIN:"https://attacker.test/path"},{APP_ORIGIN:"https://user:synthetic-secret@example.test"},{GOOGLE_START_LIMIT:"0"},{APP_ORIGIN:"http://localhost:3000",NODE_ENV:"production"}]){
 const env={...valid,...changes}; assert.equal(isGoogleAuthEnabled(env),false);
 assert.throws(()=>googleConfig(env),e=>e.code==="GOOGLE_UNAVAILABLE"&&!e.message.includes("synthetic-secret"));
 }
 const config=googleConfig({...valid,GOOGLE_START_LIMIT:"7"});assert.equal(config.origin,valid.APP_ORIGIN);assert.equal(config.googleStartLimit,7);assert.equal(config.googleEnabled,true);
});
