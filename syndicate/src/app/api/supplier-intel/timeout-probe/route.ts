// THROWAWAY DIAGNOSTIC — delete after use.
//
// Purpose: verify Railway (and any intermediate proxies / Fastly edge)
// allow a single Syndicate API request to run for 60 seconds synchronously.
// Supplier Intel's /api/analyze/[supplierId] endpoint blocks for 30-90s
// while scraping + calling Claude. If Railway kills the request before
// 60s, the port plan needs a job-and-poll refactor. If it returns cleanly,
// the existing synchronous pattern ports as-is.
//
// Usage: hit it on the deployed preview URL with ?key=timeout-probe and
// wait. The response body contains actual elapsed time — if a proxy
// short-circuits the response, elapsed will be < 60000 AND the status
// code you see in the browser may be 502/504 instead of 200.

import { NextResponse } from 'next/server';

// Must be dynamic + Node runtime. Edge runtime has a 25s hard limit on
// most platforms; Node has whatever the host allows.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90; // Next.js hint; Railway honors process limits

const SECRET = 'timeout-probe';

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('key') !== SECRET) {
    return NextResponse.json({ ok: false, reason: 'missing-key' }, { status: 401 });
  }

  const startedAt = Date.now();
  const sleepMs = Math.min(
    Math.max(parseInt(url.searchParams.get('ms') ?? '60000', 10) || 60000, 1000),
    85000,
  );

  console.log(`[timeout-probe] starting ${sleepMs}ms sleep at ${new Date().toISOString()}`);

  await new Promise<void>((resolve) => setTimeout(resolve, sleepMs));

  const elapsedMs = Date.now() - startedAt;
  console.log(`[timeout-probe] completed after ${elapsedMs}ms`);

  return NextResponse.json({
    ok: true,
    requestedSleepMs: sleepMs,
    actualElapsedMs: elapsedMs,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    node: process.version,
    region: process.env.RAILWAY_REGION ?? null,
    deployId: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
  });
}
