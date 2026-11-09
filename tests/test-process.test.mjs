import test from "node:test";
import assert from "node:assert/strict";

test("integration command succeeds only when the real child exits successfully", async () => {
  const { runNode } = await import("./support/process.mjs");
  await runNode(["-e", "process.exit(0)"], { stdio: "ignore" });
});

test("integration command propagates nonzero exit without disclosing environment values", async () => {
  const { runNode } = await import("./support/process.mjs");
  await assert.rejects(runNode(["-e", "process.exit(7)"], { stdio: "ignore", env: { ...process.env, PROCESS_PROBE_SECRET: "synthetic-private-value" } }), error => {
    assert.match(error.message, /7/);
    assert.ok(!error.message.includes("synthetic-private-value"));
    return true;
  });
});

test("integration cleanup terminates its own running server process", async () => {
  const { startNode, stopNode } = await import("./support/process.mjs");
  const server = startNode(["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  await stopNode(server);
  assert.ok(server.child.exitCode !== null || server.child.signalCode !== null);
});

test("integration cleanup also handles an already exited process", async () => {
  const { startNode, stopNode } = await import("./support/process.mjs");
  const server = startNode(["-e", "process.exit(0)"], { stdio: "ignore" });
  assert.equal((await server.done).code, 0);
  await stopNode(server);
});
