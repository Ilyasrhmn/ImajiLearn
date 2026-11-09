import { profileRoute } from "@/server/accounts/runtime.mjs";

export const runtime = "nodejs";
export const GET = profileRoute("get");
export const PATCH = profileRoute("patch");
