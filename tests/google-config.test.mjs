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

test("PWA Google callback uses only the configured public origin and requires HTTPS in production", async () => {
 const { pwaGoogleConfig } = await import("../apps/web/server/accounts/google/config.mjs");
 const env = { APP_ORIGIN: "https://web.example.test", PWA_PUBLIC_ORIGIN: "https://pwa.example.test", GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret", NODE_ENV: "production" };
 const config = pwaGoogleConfig(env);
 assert.equal(config.origin, env.PWA_PUBLIC_ORIGIN);
 assert.equal(config.redirectUri, "https://pwa.example.test/app/api/v1/auth/google/pwa/callback");
 assert.equal(config.applicationPath, "/app");
 for (const value of [undefined, "http://pwa.example.test", "https://pwa.example.test/path", "https://user:pass@pwa.example.test"]) {
   assert.throws(() => pwaGoogleConfig({ ...env, PWA_PUBLIC_ORIGIN: value }), error => error.code === "GOOGLE_UNAVAILABLE");
 }
});
