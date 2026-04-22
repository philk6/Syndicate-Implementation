/**
 * Seed realistic Supplier Intel demo data for a filming walkthrough.
 *
 * Creates for a given Syndicate admin:
 *   • 2 supplier lists (Q1 Trade-Show Leads, Beauty Vertical Expansion)
 *   • 15 suppliers split across both lists
 *   • 10 supplier analyses (varied recommendations / scores)
 *   • 12 outreach events (emails, calls, replies, notes)
 *   • 5 follow-ups (mix of overdue / upcoming)
 *   • 3 email templates (first-touch, follow-up, break-up)
 *   • 2 discovery searches with 8 candidates each (16 total)
 *
 * Writes use the service-role client, so RLS is bypassed. The ownership
 * relationship is correct because lists/searches get the provided user_id.
 *
 * Prerequisites:
 *   export NEXT_PUBLIC_SUPABASE_URL=...
 *   export SUPABASE_SERVICE_ROLE_KEY=...
 *   export SEED_USER_EMAIL=philipkeipp@gmail.com   # or a user UUID in SEED_USER_ID
 *
 * Run:
 *   npx tsx scripts/seed-supplier-intel-demo.ts
 *
 * Idempotency: first nukes any prior si_* rows owned by this user
 * (cascades handle children), then inserts fresh.
 */

import { createClient } from '@supabase/supabase-js';
import { createId } from '@paralleldrive/cuid2';
import { generateStubAnalysis } from '../syndicate/src/lib/supplierIntel/stubAnalysis';

const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) {
    console.error(`Missing env: ${k}`);
    process.exit(2);
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function resolveUserId(): Promise<string> {
  if (process.env.SEED_USER_ID) return process.env.SEED_USER_ID;
  const email = process.env.SEED_USER_EMAIL;
  if (!email) {
    console.error('Must set SEED_USER_ID (UUID) or SEED_USER_EMAIL.');
    process.exit(2);
  }
  const { data, error } = await supabase
    .from('users')
    .select('user_id,email')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    console.error(`No public.users row for ${email}`);
    process.exit(2);
  }
  return (data as { user_id: string }).user_id;
}

// ─── Demo content ──────────────────────────────────────────────────────────

const LIST_A_SUPPLIERS = [
  { name: 'Vermont Natural Goods Co.', site: 'https://vermontnatural.com' },
  { name: 'Prairie Supply & Trade', site: 'https://prairiesupply.com' },
  { name: 'Cascade Outdoor Wholesale', site: 'https://cascade-outdoor.com' },
  { name: 'Riverbend Distributors', site: 'https://riverbenddist.com' },
  { name: 'Meridian Brands Group', site: 'https://meridianbrands.co' },
  { name: 'Northstar Pet Supply', site: 'https://northstarpet.com' },
  { name: 'Ember Home Collective', site: 'https://emberhome.co' },
  { name: 'Copperline Wholesale', site: 'https://copperline-ws.com' },
] as const;

const LIST_B_SUPPLIERS = [
  { name: 'Luminary Beauty Co.', site: 'https://luminarybeauty.com' },
  { name: 'PureCraft Skin Collective', site: 'https://purecraftskin.com' },
  { name: 'Radiance Source LLC', site: 'https://radiancesource.com' },
  { name: 'Bellaform Distribution', site: 'https://bellaform.co' },
  { name: 'Glowworks Supply Partners', site: 'https://glowworks-supply.com' },
  { name: 'Clean Canvas Wholesale', site: 'https://cleancanvaswholesale.com' },
  { name: 'Everleaf Botanicals', site: 'https://everleafbotanicals.com' },
] as const;

const EMAIL_TEMPLATES = [
  {
    name: 'First-Touch · Authorized Reseller Intro',
    subject: 'Wholesale inquiry — established Amazon reseller',
    body: `Hi {{company}} team,

My name is [Your name] and I run an established Amazon wholesale operation (4+ years, 99% feedback) focused on vetted, authorization-compliant sellers. I'd like to submit an application to carry your catalog.

Quick profile:
• EIN + resale certificate on file for all 50 states
• Average order cycle: 30-day replenishment on ~40 SKUs
• Fully TOS-compliant (no MAP violations, no price undercutting)
• References available from 6 current distribution partners

Could you point me toward your reseller application, or loop in the right person on your wholesale team?

Thanks,
[Your name]`,
    sequence_step: 1,
    priority: 'ALL',
  },
  {
    name: 'Follow-Up · Day 5 nudge',
    subject: 'Re: Wholesale inquiry — just making sure this landed',
    body: `Hi again,

Circling back on my note from earlier this week — just wanted to make sure my wholesale inquiry reached the right desk. Happy to send over EIN + resale cert upfront if that moves it along.

If now isn't a good time, just let me know when to circle back and I'll get out of your inbox.

Thanks,
[Your name]`,
    sequence_step: 2,
    priority: 'ALL',
  },
  {
    name: 'Break-up · Final touch',
    subject: 'Closing the loop on my wholesale inquiry',
    body: `Hi {{company}} team,

I've reached out a couple times over the last few weeks without hearing back — totally understand if wholesale isn't a fit right now, so I'll stop cluttering your inbox.

If anything changes on your side, here's my direct line: [phone / email]. Wishing you a strong quarter.

Best,
[Your name]`,
    sequence_step: 3,
    priority: 'ALL',
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

async function nuke(userId: string) {
  console.log('🧹 Removing prior demo data for user…');

  // Delete discovery searches (cascades candidates)
  await supabase.from('si_discovery_searches').delete().eq('user_id', userId);

  // Delete lists (cascades suppliers → analyses → outreach → follow-ups)
  await supabase.from('si_supplier_lists').delete().eq('user_id', userId);

  // Remove demo email templates we own by name prefix
  await supabase
    .from('si_email_templates')
    .delete()
    .in(
      'name',
      EMAIL_TEMPLATES.map((t) => t.name),
    );
}

async function insertLists(userId: string): Promise<{ aListId: string; bListId: string }> {
  const aListId = createId();
  const bListId = createId();

  const { error } = await supabase.from('si_supplier_lists').insert([
    { id: aListId, user_id: userId, name: 'Q1 Trade-Show Leads' },
    { id: bListId, user_id: userId, name: 'Beauty Vertical Expansion' },
  ]);
  if (error) throw error;

  console.log(`📂 Created 2 lists`);
  return { aListId, bListId };
}

async function insertSuppliers(
  aListId: string,
  bListId: string,
): Promise<{ supplierIdsA: string[]; supplierIdsB: string[] }> {
  const aRows = LIST_A_SUPPLIERS.map((s) => ({
    id: createId(),
    list_id: aListId,
    company_name: s.name,
    website: s.site,
  }));
  const bRows = LIST_B_SUPPLIERS.map((s) => ({
    id: createId(),
    list_id: bListId,
    company_name: s.name,
    website: s.site,
  }));

  const { error } = await supabase.from('si_suppliers').insert([...aRows, ...bRows]);
  if (error) throw error;

  console.log(`🏭 Created ${aRows.length + bRows.length} suppliers`);
  return { supplierIdsA: aRows.map((r) => r.id), supplierIdsB: bRows.map((r) => r.id) };
}

async function insertAnalyses(supplierIds: string[], companyNames: string[], websites: string[]) {
  // Analyze 10 of the 15 suppliers to leave some "not analyzed" for the demo
  const pairs = supplierIds.slice(0, 10);
  const rows = pairs.map((id, i) => {
    const result = generateStubAnalysis(companyNames[i], websites[i]);
    return {
      id: createId(),
      supplier_id: id,
      classification: result.classification,
      confidence_level: result.confidenceLevel,
      supplier_quality_score: result.supplierQualityScore,
      amazon_fit_score: result.amazonFitScore,
      priority_level: result.priorityLevel,
      score: result.score,
      legitimacy_score: result.scoreBreakdown.legitimacy.score,
      wholesale_structure_score: result.scoreBreakdown.wholesaleStructure.score,
      supply_chain_doc_score: result.scoreBreakdown.supplyChainDoc.score,
      amazon_wholesale_fit_score: result.scoreBreakdown.amazonWholesaleFit.score,
      red_flag_penalty: result.scoreBreakdown.redFlagPenalty.penalty,
      recommendation: result.recommendation,
      score_breakdown: result.scoreBreakdown,
      green_flags: result.greenFlags,
      red_flags: result.redFlags,
      reasoning_summary: result.reasoningSummary,
      extracted_signals: result.extractedSignals,
      scrape_diagnostics: result.scrapeDiagnostics,
      raw_llm_response: result.rawLlmResponse,
    };
  });

  const { error } = await supabase.from('si_supplier_analyses').insert(rows);
  if (error) throw error;

  // Mark those suppliers as DONE
  await supabase.from('si_suppliers').update({ status: 'DONE' }).in('id', pairs);
  console.log(`🧠 Created ${rows.length} analyses (suppliers marked DONE)`);
}

async function insertOutreachEvents(userId: string, supplierIds: string[]) {
  const seedData: Array<{
    supplierIdx: number;
    type: string;
    subject?: string;
    body?: string;
    outcome?: string;
    note?: string;
    step: number;
  }> = [
    {
      supplierIdx: 0,
      type: 'EMAIL_LOGGED',
      subject: 'Wholesale inquiry — established Amazon reseller',
      body: 'Sent first-touch email with EIN offer attached.',
      step: 1,
    },
    {
      supplierIdx: 0,
      type: 'REPLY_LOGGED',
      subject: 'Re: Wholesale inquiry',
      body: "They asked for our resale cert and a sample order size estimate. Sent both.",
      outcome: 'POSITIVE',
      step: 2,
    },
    {
      supplierIdx: 1,
      type: 'EMAIL_LOGGED',
      subject: 'Introducing our wholesale program',
      body: 'First touch sent to their generic contact address.',
      step: 1,
    },
    {
      supplierIdx: 1,
      type: 'FOLLOW_UP_LOGGED',
      subject: 'Re: Introducing our wholesale program',
      body: 'Day-5 follow-up nudge. No reply yet.',
      step: 2,
    },
    {
      supplierIdx: 2,
      type: 'CALL_LOGGED',
      body: 'Spoke with their wholesale manager. Sending docs next week.',
      outcome: 'POSITIVE',
      step: 1,
    },
    {
      supplierIdx: 3,
      type: 'EMAIL_LOGGED',
      subject: 'Wholesale application — next step?',
      body: 'Sent via contact form on /wholesale.',
      step: 1,
    },
    {
      supplierIdx: 4,
      type: 'NOTE',
      note: 'Flagged as HIGH_RISK by analysis — skip outreach, revisit after rescore.',
      step: 0,
    },
    {
      supplierIdx: 5,
      type: 'EMAIL_LOGGED',
      subject: 'Pet supply wholesale inquiry',
      body: 'Introduction + request for reseller application link.',
      step: 1,
    },
    {
      supplierIdx: 8,
      type: 'EMAIL_LOGGED',
      subject: 'Beauty vertical — authorized reseller inquiry',
      body: 'Sent first-touch using the beauty-specific template.',
      step: 1,
    },
    {
      supplierIdx: 8,
      type: 'REPLY_LOGGED',
      subject: 'Re: Beauty vertical inquiry',
      body: 'Declined — they only work with in-person buyers. Archived.',
      outcome: 'DECLINED',
      step: 2,
    },
    {
      supplierIdx: 9,
      type: 'EMAIL_LOGGED',
      subject: 'Clean beauty wholesale — intro',
      body: 'First touch.',
      step: 1,
    },
    {
      supplierIdx: 10,
      type: 'NOTE',
      note: 'Their /wholesale page 404s — skip until we can scrape a fresh signal.',
      step: 0,
    },
  ];

  for (const row of seedData) {
    const supplierId = supplierIds[row.supplierIdx];
    if (!supplierId) continue;
    const id = createId();
    const { error } = await supabase.rpc('si_log_outreach_event', {
      p_id: id,
      p_supplier_id: supplierId,
      p_type: row.type,
      p_subject: row.subject ?? null,
      p_body: row.body ?? null,
      p_outcome: row.outcome ?? null,
      p_note: row.note ?? null,
      p_logged_by: userId,
      p_sequence_step: row.step,
    });
    if (error) throw error;
  }
  console.log(`📨 Created ${seedData.length} outreach events`);
}

async function insertFollowUps(supplierIds: string[]) {
  const now = Date.now();
  const day = 86400_000;

  const rows = [
    {
      supplier: supplierIds[1],
      tier: 'TIER_1',
      priority: 'HIGH',
      notes: 'Engaged on first-touch — waiting on docs. Strong candidate.',
      next_follow_up_date: new Date(now + 2 * day).toISOString(),
      contact_method: 'EMAIL',
    },
    {
      supplier: supplierIds[2],
      tier: 'TIER_1',
      priority: 'HIGH',
      notes: 'Promised docs on Friday — call if no reply by next Tue.',
      next_follow_up_date: new Date(now - 1 * day).toISOString(),
      contact_method: 'EMAIL',
    },
    {
      supplier: supplierIds[3],
      tier: 'TIER_2',
      priority: 'MEDIUM',
      notes: 'Day-5 nudge pending.',
      next_follow_up_date: new Date(now + 1 * day).toISOString(),
      contact_method: 'EMAIL',
    },
    {
      supplier: supplierIds[5],
      tier: 'TIER_2',
      priority: 'MEDIUM',
      notes: 'Pet vertical — good fit, waiting for reseller form reply.',
      next_follow_up_date: new Date(now + 4 * day).toISOString(),
      contact_method: 'EMAIL',
    },
    {
      supplier: supplierIds[10],
      tier: 'TIER_3',
      priority: 'LOW',
      notes: 'Cold prospect — revisit after we get a strong inbound.',
      next_follow_up_date: new Date(now + 14 * day).toISOString(),
      contact_method: 'EMAIL',
    },
  ];

  const inserts = rows.map((r) => ({
    id: createId(),
    supplier_id: r.supplier,
    tier: r.tier,
    priority: r.priority,
    notes: r.notes,
    next_follow_up_date: r.next_follow_up_date,
    contact_method: r.contact_method,
  }));

  const { error } = await supabase.from('si_follow_ups').insert(inserts);
  if (error) throw error;
  console.log(`📌 Created ${inserts.length} follow-ups`);
}

async function insertTemplates() {
  const rows = EMAIL_TEMPLATES.map((t) => ({
    id: createId(),
    name: t.name,
    subject: t.subject,
    body: t.body,
    sequence_step: t.sequence_step,
    priority: t.priority,
  }));
  const { error } = await supabase.from('si_email_templates').insert(rows);
  if (error) throw error;
  console.log(`📝 Created ${rows.length} email templates`);
}

async function insertDiscovery(userId: string) {
  const searches = [
    {
      brand: 'Yeti',
      category: 'outdoor drinkware',
      location: 'Texas',
      candidates: [
        { name: 'Lone Star Outdoor Supply Co.', site: 'https://lonestaroutdoor.com', level: 'STRONG', reason: 'Authorized Yeti distributor serving the US Southwest. Dedicated /wholesale portal with resale-cert requirement.', evidence: ['wholesale_portal_present', 'resale_cert_required', 'map_policy_listed'], conf: 9, rel: 0.94 },
        { name: 'Alamo Beverage Gear Wholesale', site: 'https://alamo-beverage-gear.com', level: 'STRONG', reason: 'Listed on Yeti\'s authorized distributor page. Strong B2B surface.', evidence: ['on_brand_authorized_page', 'b2b_portal'], conf: 9, rel: 0.91 },
        { name: 'HillCountry Supply Partners', site: 'https://hillcountry-supply.com', level: 'MODERATE', reason: 'Directory listing under outdoor drinkware distributors. Requires direct outreach to confirm authorization.', evidence: ['directory_listing'], conf: 6, rel: 0.68 },
        { name: 'Gulf Coast Ops Gear', site: 'https://gulfcoastops.com', level: 'MODERATE', reason: 'B2B storefront with wholesale inquiry form. Mentions Yeti among carried brands.', evidence: ['b2b_contact_page', 'brand_mention'], conf: 6, rel: 0.62 },
        { name: 'SouthLine Trading Company', site: 'https://southline-trading.com', level: 'WEAK', reason: 'Mentioned in a 2024 press release as a distribution partner. No public portal.', evidence: ['press_release_mention_2024'], conf: 4, rel: 0.48 },
        { name: 'Plainsman Wholesale LLC', site: 'https://plainsman-ws.com', level: 'WEAK', reason: 'Regional wholesaler with unclear Yeti authorization path.', evidence: ['regional_wholesaler'], conf: 4, rel: 0.41 },
        { name: 'Brazos Brands Inc.', site: 'https://brazosbrands.com', level: 'NONE', reason: 'Loose match only — mentioned Yeti once in a blog post.', evidence: ['keyword_surface_match'], conf: 2, rel: 0.28 },
        { name: 'Rio Grande Distributors', site: 'https://riograndedist.com', level: 'NONE', reason: 'Unclear relevance. Include only if nothing stronger surfaces.', evidence: ['keyword_surface_match'], conf: 2, rel: 0.22 },
      ],
    },
    {
      brand: '',
      category: 'pet supplements',
      location: '',
      candidates: [
        { name: 'PawPrint Supplement Supply', site: 'https://pawprintsupply.com', level: 'STRONG', reason: 'Dedicated wholesale portal for pet supplement retailers. Resale cert required, MAP policy enforced.', evidence: ['wholesale_portal_present', 'resale_cert_required', 'map_policy_listed', 'physical_warehouse'], conf: 9, rel: 0.93 },
        { name: 'TailWise Distribution Co.', site: 'https://tailwise-dist.co', level: 'STRONG', reason: 'Authorized distributor for 8 pet supplement brands. Verified warehouse in Ohio.', evidence: ['on_brand_authorized_page', 'physical_warehouse'], conf: 8, rel: 0.88 },
        { name: 'FurForward Wholesale Group', site: 'https://furforward-group.com', level: 'MODERATE', reason: 'Listed on ThomasNet under pet nutrition wholesalers. B2B contact surface present.', evidence: ['directory_listing', 'b2b_contact_page'], conf: 7, rel: 0.74 },
        { name: 'BarkSource Supply Partners', site: 'https://barksource-supply.com', level: 'MODERATE', reason: 'Trade-show exhibitor list 2024. Requires confirmation of Amazon-reseller eligibility.', evidence: ['trade_show_exhibitor'], conf: 6, rel: 0.65 },
        { name: 'Petluxe Wholesale LLC', site: 'https://petluxe-ws.com', level: 'MODERATE', reason: 'Mid-sized wholesaler — unclear authorization path for Amazon channel.', evidence: ['b2b_contact_page'], conf: 5, rel: 0.58 },
        { name: 'Kibble & Crunch Trading', site: 'https://kibblecrunch-trading.com', level: 'WEAK', reason: 'Press mention as a 2024 distribution partner. No wholesale portal visible.', evidence: ['press_release_mention_2024'], conf: 4, rel: 0.44 },
        { name: 'Nosework Brands Inc.', site: 'https://nosework-brands.com', level: 'WEAK', reason: 'Brand-adjacent mention. No direct authorization signal.', evidence: ['brand_mention'], conf: 3, rel: 0.37 },
        { name: 'Whisker Lane Distributors', site: 'https://whiskerlane-dist.com', level: 'NONE', reason: 'Weak keyword match — pet supplement vertical but no authorization signals.', evidence: ['keyword_surface_match'], conf: 2, rel: 0.25 },
      ],
    },
  ];

  for (const s of searches) {
    const searchId = createId();
    const now = new Date().toISOString();

    const search = {
      id: searchId,
      user_id: userId,
      brand: s.brand || null,
      category: s.category || null,
      location: s.location || null,
      supplier_type: 'all',
      must_have_signals: [],
      exclude_filters: [],
      status: 'DONE',
      error: null,
      total_found: s.candidates.length,
      diagnostics: { anglesGenerated: 6, stubbed: true, durationMs: 2100 },
      created_at: now,
      completed_at: now,
    };

    const candidates = s.candidates.map((c, i) => ({
      id: createId(),
      company_name: c.name,
      website: c.site,
      location: s.location || null,
      estimated_type:
        c.level === 'STRONG' ? 'Authorized Distributor' : c.level === 'MODERATE' ? 'Regional Wholesaler' : c.level === 'WEAK' ? 'Brand Partner' : 'Unknown',
      authorization_level: c.level,
      authorization_evidence: c.evidence,
      authorization_reasoning: c.reason,
      source_context: `Surfaced via discovery angle sweep for "${s.brand || s.category}"`,
      source_angles:
        c.level === 'STRONG'
          ? ['authorized_distributor', 'wholesale_application']
          : c.level === 'MODERATE'
          ? ['directory_listing']
          : ['press_mention'],
      source_angle_count: 2,
      relevance_score: c.rel,
      confidence_score: c.conf,
      rank_position: i + 1,
    }));

    const { error } = await supabase.rpc('si_insert_discovery_with_candidates', {
      p_search: search,
      p_candidates: candidates,
    });
    if (error) throw error;
  }

  console.log(`🧭 Created ${searches.length} discovery searches with ${searches.reduce((a, s) => a + s.candidates.length, 0)} candidates`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 Supplier Intel demo seed\n');

  const userId = await resolveUserId();
  console.log(`User: ${userId}\n`);

  await nuke(userId);
  const { aListId, bListId } = await insertLists(userId);
  const { supplierIdsA, supplierIdsB } = await insertSuppliers(aListId, bListId);

  // Analyze first 10 across both lists
  const allIds = [...supplierIdsA, ...supplierIdsB];
  const allNames = [...LIST_A_SUPPLIERS.map((s) => s.name), ...LIST_B_SUPPLIERS.map((s) => s.name)];
  const allSites = [...LIST_A_SUPPLIERS.map((s) => s.site), ...LIST_B_SUPPLIERS.map((s) => s.site)];
  await insertAnalyses(allIds, allNames, allSites);

  await insertOutreachEvents(userId, allIds);
  await insertFollowUps(allIds);
  await insertTemplates();
  await insertDiscovery(userId);

  console.log('\n✅ Demo data seeded successfully.\n');
  console.log('   Open /supplier-intel/dashboard to see it all wired up.\n');
}

main().catch((err) => {
  console.error('\n💥 Seed failed:', err);
  process.exit(1);
});
