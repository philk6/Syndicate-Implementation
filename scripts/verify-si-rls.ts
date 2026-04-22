/**
 * Supplier Intel RLS verification script.
 *
 * Purpose: exercise every si_* RLS policy end-to-end using two separate
 * authenticated anon clients (users A and B). Run locally with test
 * credentials BEFORE Session 2 of the port ships the write surface.
 *
 * Prerequisites (run these manually in Supabase dashboard first):
 *   1. Create two test users in Supabase Auth (Dashboard → Authentication
 *      → Users → Add User). Any email/password, confirmed.
 *   2. Ensure each has a row in public.users (via Syndicate's existing
 *      signup flow, or insert one manually with role='user').
 *   3. Export their credentials before running:
 *
 *      export SI_TEST_USER_A_EMAIL="a@test.example"
 *      export SI_TEST_USER_A_PASSWORD="..."
 *      export SI_TEST_USER_B_EMAIL="b@test.example"
 *      export SI_TEST_USER_B_PASSWORD="..."
 *      export NEXT_PUBLIC_SUPABASE_URL=...
 *      export NEXT_PUBLIC_SUPABASE_ANON_KEY=...
 *      export SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Run:
 *   npx tsx scripts/verify-si-rls.ts
 *
 * Exit codes:
 *   0  all assertions passed
 *   1  at least one assertion failed (details in stderr)
 *   2  prerequisites missing (missing env vars or users)
 */

import { createClient } from '@supabase/supabase-js';
import { createId } from '@paralleldrive/cuid2';

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SI_TEST_USER_A_EMAIL',
  'SI_TEST_USER_A_PASSWORD',
  'SI_TEST_USER_B_EMAIL',
  'SI_TEST_USER_B_PASSWORD',
] as const;

function assertEnv(): Record<(typeof REQUIRED_ENV)[number], string> {
  const missing: string[] = [];
  const out = {} as Record<string, string>;
  for (const key of REQUIRED_ENV) {
    const val = process.env[key];
    if (!val) missing.push(key);
    else out[key] = val;
  }
  if (missing.length) {
    console.error(
      `\n❌ Missing required env vars:\n  ${missing.join('\n  ')}\n\nCreate two test users in Supabase, then:\n  export SI_TEST_USER_A_EMAIL=...\n  export SI_TEST_USER_A_PASSWORD=...\n  export SI_TEST_USER_B_EMAIL=...\n  export SI_TEST_USER_B_PASSWORD=...\n\nDo NOT use admin users — RLS gating depends on role='user' vs role='admin',\nand admins can bypass via the admin policy.\n`,
    );
    process.exit(2);
  }
  return out as Record<(typeof REQUIRED_ENV)[number], string>;
}

// ─── State ─────────────────────────────────────────────────────────────────

const env = assertEnv();
const failures: string[] = [];
let passed = 0;

function pass(label: string) {
  passed++;
  console.log(`  ✅ ${label}`);
}
function fail(label: string, detail?: string) {
  failures.push(label + (detail ? ` — ${detail}` : ''));
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function signInAnonClient(email: string, password: string) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message ?? 'no user returned'}`);
  }
  return { client, userId: data.user.id };
}

const serviceClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔒 Supplier Intel RLS verification\n');

  console.log('Signing in test users...');
  const a = await signInAnonClient(env.SI_TEST_USER_A_EMAIL, env.SI_TEST_USER_A_PASSWORD);
  const b = await signInAnonClient(env.SI_TEST_USER_B_EMAIL, env.SI_TEST_USER_B_PASSWORD);
  console.log(`  A: ${a.userId}`);
  console.log(`  B: ${b.userId}\n`);

  if (a.userId === b.userId) {
    console.error('❌ Users A and B are the same account. Use two different users.');
    process.exit(2);
  }

  const createdIds: { lists: string[]; suppliers: string[] } = { lists: [], suppliers: [] };

  try {
    // ── A creates a list ────────────────────────────────────────────────
    console.log('Test: A creates a list');
    const aListId = createId();
    {
      const { error } = await a.client
        .from('si_supplier_lists')
        .insert({ id: aListId, name: `RLS test list for A ${Date.now()}`, user_id: a.userId });
      if (error) fail('A insert into si_supplier_lists', error.message);
      else {
        pass('A can insert into si_supplier_lists');
        createdIds.lists.push(aListId);
      }
    }

    // ── B cannot see A's list ────────────────────────────────────────────
    console.log('Test: B cannot see A\'s list');
    {
      const { data, error } = await b.client
        .from('si_supplier_lists')
        .select('id')
        .eq('id', aListId);
      if (error) fail('B select si_supplier_lists by id', error.message);
      else if ((data ?? []).length > 0) fail('B SHOULD NOT see A\'s list', `found ${data?.length} row(s)`);
      else pass('B cannot see A\'s list (filtered by RLS)');
    }

    // ── B cannot update A's list ────────────────────────────────────────
    console.log('Test: B cannot update A\'s list');
    {
      const { data, error } = await b.client
        .from('si_supplier_lists')
        .update({ name: 'HACKED' })
        .eq('id', aListId)
        .select();
      // Success case: RLS returns 0 rows affected, no error
      if (error) pass(`B update blocked with error: ${error.message}`);
      else if ((data ?? []).length > 0) fail('B SHOULD NOT be able to update A\'s list', `updated ${data?.length} row(s)`);
      else pass('B update silently affected 0 rows');
    }

    // ── B cannot delete A's list ────────────────────────────────────────
    console.log('Test: B cannot delete A\'s list');
    {
      const { data, error } = await b.client
        .from('si_supplier_lists')
        .delete()
        .eq('id', aListId)
        .select();
      if (error) pass(`B delete blocked with error: ${error.message}`);
      else if ((data ?? []).length > 0) fail('B SHOULD NOT be able to delete A\'s list', `deleted ${data?.length} row(s)`);
      else pass('B delete silently affected 0 rows');
    }

    // ── A inserts a supplier into A's list ──────────────────────────────
    console.log('Test: A inserts a supplier into A\'s list');
    const aSupplierId = createId();
    {
      const { error } = await a.client
        .from('si_suppliers')
        .insert({ id: aSupplierId, list_id: aListId, company_name: 'RLS test supplier' });
      if (error) fail('A insert into si_suppliers', error.message);
      else {
        pass('A can insert into si_suppliers via A\'s list');
        createdIds.suppliers.push(aSupplierId);
      }
    }

    // ── B cannot see A's supplier ───────────────────────────────────────
    console.log('Test: B cannot see A\'s supplier (child-via-parent policy)');
    {
      const { data, error } = await b.client
        .from('si_suppliers')
        .select('id')
        .eq('id', aSupplierId);
      if (error) fail('B select si_suppliers', error.message);
      else if ((data ?? []).length > 0) fail('B SHOULD NOT see A\'s supplier', `found ${data?.length} row(s)`);
      else pass('B cannot see A\'s supplier (child-via-parent RLS works)');
    }

    // ── B cannot insert a supplier into A's list ────────────────────────
    console.log('Test: B cannot insert a supplier into A\'s list (WITH CHECK)');
    {
      const rogueId = createId();
      const { error } = await b.client
        .from('si_suppliers')
        .insert({ id: rogueId, list_id: aListId, company_name: 'rogue' });
      if (error) pass(`B insert blocked with error: ${error.message}`);
      else {
        fail('B SHOULD NOT be able to insert into A\'s list');
        // Cleanup the rogue row via service role
        await serviceClient.from('si_suppliers').delete().eq('id', rogueId);
      }
    }

    // ── Email templates are shared ──────────────────────────────────────
    console.log('Test: email templates are shared across users');
    {
      // Service role inserts one template
      const templateId = createId();
      const insRes = await serviceClient.from('si_email_templates').insert({
        id: templateId,
        name: `RLS test template ${Date.now()}`,
        subject: 'Test',
        body: 'Test body',
        sequence_step: 0,
      });
      if (insRes.error) {
        fail('service role insert si_email_templates', insRes.error.message);
      } else {
        const aRes = await a.client.from('si_email_templates').select('id').eq('id', templateId);
        const bRes = await b.client.from('si_email_templates').select('id').eq('id', templateId);
        if (aRes.error || bRes.error) {
          fail('A or B cannot read si_email_templates', aRes.error?.message ?? bRes.error?.message);
        } else if ((aRes.data ?? []).length !== 1 || (bRes.data ?? []).length !== 1) {
          fail('email templates not visible to both A and B', `A=${aRes.data?.length} B=${bRes.data?.length}`);
        } else {
          pass('Both A and B can read si_email_templates (shared)');
        }
        // Cleanup
        await serviceClient.from('si_email_templates').delete().eq('id', templateId);
      }
    }
  } finally {
    // ── Cleanup ────────────────────────────────────────────────────────
    console.log('\nCleanup...');
    if (createdIds.suppliers.length) {
      await serviceClient
        .from('si_suppliers')
        .delete()
        .in('id', createdIds.suppliers);
    }
    if (createdIds.lists.length) {
      await serviceClient
        .from('si_supplier_lists')
        .delete()
        .in('id', createdIds.lists);
    }
    console.log('  ✓ test rows removed\n');
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('─'.repeat(60));
  console.log(`RLS verification: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  • ${f}`));
    process.exit(1);
  }
  console.log('\n✅ All RLS policies working correctly.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n💥 Uncaught error:', err);
  process.exit(1);
});
