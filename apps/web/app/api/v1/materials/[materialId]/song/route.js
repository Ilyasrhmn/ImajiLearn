import { songRoute } from "@/server/materials/song-runtime.mjs";
export const runtime = "nodejs";
export const maxDuration = 300;
export const GET = songRoute("get");
export const POST = songRoute("start");
