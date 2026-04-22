import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supplierIntel/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/supplier-intel/admin/rescore
// Stubbed — would normally re-run analysis on all suppliers with drift.
export async function POST() {
  try {
    await requireAdminUser();

    // Fake latency
    await new Promise((r) => setTimeout(r, 1400));

    return NextResponse.json({
      data: {
        rescored: 0,
        skipped: 0,
        message: 'Rescore endpoint is stubbed in this build. Wiring to live Claude analyzer arrives in Session 2.',
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (e instanceof Error && e.message === 'Admin access required') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[POST /api/supplier-intel/admin/rescore]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
