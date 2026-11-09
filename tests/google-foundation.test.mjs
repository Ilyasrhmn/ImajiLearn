import test from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./support/database.mjs";
import { createProfileHandlers } from "../apps/web/server/accounts/profile.mjs";
import { createSessionHandlers } from "../apps/web/server/accounts/sessions.mjs";
import { hashPassword } from "../apps/web/server/accounts/password.mjs";

const origin = "http://localhost:3000";
function request(method, cookie, body) { return new Request(`${origin}/api/v1/me`, {method, headers:{origin,"content-type":"application/json",...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}); }

test("Google upgrade preserves password credentials and owned rows while allowing passwordless teachers", async () => {
  const storage = await testDatabase();
  try {
    const migration = storage.migrations.find(name => name.includes("google"));
    assert.ok(migration, "Google identity upgrade migration must exist");
    for (const name of storage.migrations.filter(name => name < migration)) await storage.migrate(name);
    const originalHash=await hashPassword("Existing strong password");
    await storage.sql(`INSERT INTO "Teacher" ("id","name","email","passwordHash") VALUES ('00000000-0000-4000-8000-000000000001','Existing','existing@example.test',$1)`,[originalHash]);
    await storage.sql(`INSERT INTO "Material" ("id","userId","title","text","revision") VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Existing lesson','Preserved teacher content',$1)`,["a".repeat(64)]);
    for (const name of storage.migrations.filter(name => name >= migration)) await storage.migrate(name);
    const existing = await storage.db.teacher.findUnique({where:{email:"existing@example.test"}});
    assert.equal(existing.passwordHash, originalHash);
    const material=await storage.db.material.findUnique({where:{id:"00000000-0000-4000-8000-000000000002"}});
    assert.equal(material.userId,existing.id);assert.equal(material.text,"Preserved teacher content");
    assert.equal((await createSessionHandlers(storage.db,{origin}).login(request("POST",null,{email:existing.email,password:"Existing strong password"}))).status,200);
    const teacher = await storage.db.teacher.create({data:{name:"Google only",email:"google@example.test",passwordHash:null}});
    await storage.db.googleIdentity.create({data:{teacherId:teacher.id,sub:"synthetic-sub"}});
    await assert.rejects(storage.db.googleIdentity.create({data:{teacherId:existing.id,sub:"synthetic-sub"}}),{code:"P2002"});
    await assert.rejects(storage.db.googleIdentity.create({data:{teacherId:teacher.id,sub:"other-sub"}}),{code:"P2002"});
    const { issueSession } = await import("../apps/web/server/accounts/session-issuer.mjs");
    const session = await storage.db.$transaction(tx=>issueSession(tx,teacher.id,{secure:false,absoluteSeconds:3600}));
    const cookie = session.cookie.split(";")[0], profile=createProfileHandlers(storage.db,{origin,googleEnabled:true});
    const response = await profile.get(request("GET",cookie));
    assert.deepEqual((await response.json()).data.auth,{hasPassword:false,googleLinked:true,googleEnabled:true});
    const updated=await profile.patch(request("PATCH",cookie,{name:"Updated"}));
    assert.deepEqual((await updated.json()).data.auth,{hasPassword:false,googleLinked:true,googleEnabled:true});
    const login=await createSessionHandlers(storage.db,{origin}).login(request("POST",null,{email:teacher.email,password:"irrelevant-password"}));
    assert.equal(login.status,401); assert.equal((await login.json()).error.code,"INVALID_CREDENTIALS");
    const changed=await profile.password(request("POST",cookie,{currentPassword:"irrelevant",newPassword:"new-password",confirmPassword:"new-password"}));
    assert.equal(changed.status,422); assert.equal((await changed.json()).error.code,"PASSWORD_UNAVAILABLE");
  } finally { await storage.close(); }
});
