import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

export function startNode(args, { env = process.env, cwd = root, stdio = "inherit" } = {}) {
  const child = spawn(process.execPath, args, { env, cwd, stdio, windowsHide: true });
  const done = new Promise(resolve => {
    child.once("error", () => resolve({ code: null, failedToStart: true }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  return { child, done };
}

export async function runNode(args, options) {
  const result = await startNode(args, options).done;
  if (result.failedToStart) throw new Error("Test subprocess could not start.");
  if (result.code !== 0) throw new Error(`Test subprocess exited with ${result.signal ?? `code ${result.code}`}.`);
}

export async function stopNode(server) {
  if (!server) return;
  const { child, done } = server;
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) { await done; return; }
  child.kill();
  let timer;
  try {
    await Promise.race([done, new Promise(resolve => { timer = setTimeout(resolve, 5000); timer.unref(); })]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await done;
    }
  } finally { clearTimeout(timer); }
}
