import { proxyBackend } from "../../../../lib/backend-proxy.mjs";

export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = proxyBackend;
export const HEAD = proxyBackend;
export const POST = proxyBackend;
export const PUT = proxyBackend;
export const PATCH = proxyBackend;
export const DELETE = proxyBackend;
