import { NextRequest, NextResponse } from 'next/server';
import { createId } from '@paralleldrive/cuid2';
import {
  getSupabaseServerClient,
  requireAuthenticatedUser,
} from '@/lib/supplierIntel/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/supplier-intel/discovery
// Body: { brand?: string; category?: string; location?: string; notes?: string }
// Stubbed — fabricates 8 plausible candidates and inserts via RPC.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();

    const body = await req.json().catch(() => ({}));
    const brand: string = (body.brand ?? '').toString().trim();
    const category: string = (body.category ?? '').toString().trim();
    const location: string = (body.location ?? '').toString().trim();

    if (!brand && !category) {
      return NextResponse.json({ error: 'At least one of brand or category is required' }, { status: 400 });
    }

    // Fake latency
    await new Promise((r) => setTimeout(r, 1800));

    const candidates = generateCandidates({ brand, category, location });

    const searchId = createId();
    const now = new Date().toISOString();

    const search = {
      id: searchId,
      user_id: user.id,
      brand: brand || null,
      category: category || null,
      location: location || null,
      supplier_type: 'all',
      must_have_signals: [],
      exclude_filters: [],
      status: 'DONE',
      error: null,
      total_found: candidates.length,
      diagnostics: {
        anglesGenerated: 6,
        websitesVerified: candidates.length,
        durationMs: 1800,
        stubbed: true,
      },
      created_at: now,
      completed_at: now,
    };

    const candidateRows = candidates.map((c, i) => ({
      id: createId(),
      company_name: c.companyName,
      website: c.website,
      location: c.location,
      estimated_type: c.estimatedType,
      authorization_level: c.authorizationLevel,
      authorization_evidence: c.evidence,
      authorization_reasoning: c.reasoning,
      source_context: c.sourceContext,
      source_angles: c.sourceAngles,
      source_angle_count: c.sourceAngles.length,
      relevance_score: c.relevanceScore,
      confidence_score: c.confidenceScore,
      rank_position: i + 1,
    }));

    const { error } = await supabase.rpc('si_insert_discovery_with_candidates', {
      p_search: search,
      p_candidates: candidateRows,
    });

    if (error) {
      console.error('[POST /api/supplier-intel/discovery] rpc error', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { data: { searchId, candidatesFound: candidates.length } },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/supplier-intel/discovery]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/supplier-intel/discovery — list recent searches for user
export async function GET() {
  try {
    const { user } = await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();

    const { data, error } = await supabase
      .from('si_discovery_searches')
      .select('*, candidates:si_discovery_candidates(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/supplier-intel/discovery]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Stub candidate generator ──────────────────────────────────────────────

type Auth = 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';

interface GeneratedCandidate {
  companyName: string;
  website: string;
  location: string;
  estimatedType: string;
  authorizationLevel: Auth;
  evidence: string[];
  reasoning: string;
  sourceContext: string;
  sourceAngles: string[];
  relevanceScore: number;
  confidenceScore: number;
}

const DISTRIBUTOR_SUFFIXES = [
  'Distribution Co.',
  'Wholesale Group',
  'Supply LLC',
  'Trading Company',
  'Brands Inc.',
  'Distributors',
  'Supply Co.',
  'Wholesale Partners',
];

const CATEGORY_WORDS: Record<string, string[]> = {
  default: ['Apex', 'Summit', 'Continental', 'Heartland', 'Atlas', 'Pacific', 'Midwest', 'Evergreen'],
  beauty: ['Radiance', 'Lumiere', 'BellaSource', 'SkinCraft', 'GlowWorks', 'PureForm'],
  pet: ['PawPrint', 'TailWise', 'FurForward', 'BarkSource', 'Petluxe'],
  home: ['HomeStead', 'Nestwell', 'DwellCraft', 'HearthSource', 'Homeworks'],
  electronics: ['VoltEdge', 'CircuitHub', 'OhmSource', 'PulseTech', 'Relay'],
  toys: ['PlayForge', 'Joyworks', 'Kiddo', 'Rompers', 'ToyLine'],
  food: ['FreshSource', 'GoodHarvest', 'Orchard', 'Provisions', 'Pantry'],
  supplement: ['PureCraft', 'Vital', 'Origin', 'Sourcewell', 'Nutrihub'],
};

const LOCATIONS = [
  'Columbus, OH',
  'Dallas, TX',
  'Charlotte, NC',
  'Phoenix, AZ',
  'Atlanta, GA',
  'Indianapolis, IN',
  'Minneapolis, MN',
  'Seattle, WA',
];

function categoryBucket(category: string): string[] {
  const lower = category.toLowerCase();
  if (/beauty|cosmetic|skin/.test(lower)) return CATEGORY_WORDS.beauty;
  if (/pet|dog|cat/.test(lower)) return CATEGORY_WORDS.pet;
  if (/home|kitchen|bath/.test(lower)) return CATEGORY_WORDS.home;
  if (/electronic|tech|gadget/.test(lower)) return CATEGORY_WORDS.electronics;
  if (/toy|game|kid/.test(lower)) return CATEGORY_WORDS.toys;
  if (/food|snack|bev/.test(lower)) return CATEGORY_WORDS.food;
  if (/supplement|vitamin|nutri/.test(lower)) return CATEGORY_WORDS.supplement;
  return CATEGORY_WORDS.default;
}

function generateCandidates(input: {
  brand: string;
  category: string;
  location: string;
}): GeneratedCandidate[] {
  const words = categoryBucket(input.category);
  const seed = (input.brand + input.category + input.location).length;

  const levels: Auth[] = ['STRONG', 'STRONG', 'MODERATE', 'MODERATE', 'MODERATE', 'WEAK', 'WEAK', 'NONE'];

  return Array.from({ length: 8 }, (_, i) => {
    const word = words[(seed + i * 3) % words.length];
    const suffix = DISTRIBUTOR_SUFFIXES[(seed + i) % DISTRIBUTOR_SUFFIXES.length];
    const companyName = `${word} ${suffix}`;
    const domain = `${word.toLowerCase().replace(/[^a-z0-9]/g, '')}-${suffix
      .toLowerCase()
      .split(/\s+/)[0]
      .replace(/[^a-z0-9]/g, '')}.com`;
    const level = levels[i];
    const loc = input.location || LOCATIONS[(seed + i) % LOCATIONS.length];

    const estimatedType =
      level === 'STRONG' ? 'Authorized Distributor' : level === 'MODERATE' ? 'Regional Wholesaler' : level === 'WEAK' ? 'Brand Partner' : 'Unknown';

    const categoryLabel = input.category || 'category';
    const brandLabel = input.brand || categoryLabel;

    const reasoning =
      level === 'STRONG'
        ? `Authorized ${brandLabel} distributor. Dedicated reseller portal, resale-certificate required during application. Strong signal: MAP policy explicitly referenced in their terms. Good fit for a vetted Amazon wholesale channel.`
        : level === 'MODERATE'
        ? `Listed in industry directories as a ${categoryLabel} wholesaler. Has B2B contact surface but no public authorization portal — direct outreach required to confirm Amazon-reseller eligibility.`
        : level === 'WEAK'
        ? `Mentioned in a brand press release as a distribution partner in 2024. No visible wholesale portal. Treat as a cold prospect requiring manual investigation.`
        : `Surfaced via loose keyword match during the broader angle sweep. No direct authorization signals found. Include only if nothing stronger exists in the vertical.`;

    const evidence =
      level === 'STRONG'
        ? ['wholesale_portal_present', 'resale_cert_required', 'map_policy_listed', 'physical_warehouse_address']
        : level === 'MODERATE'
        ? ['industry_directory_listing', 'b2b_contact_page', 'trade_show_exhibitor']
        : level === 'WEAK'
        ? ['press_release_mention_2024']
        : ['keyword_surface_match'];

    const sourceContext =
      level === 'STRONG'
        ? `Appeared in Google results for "${brandLabel} authorized distributor" and was further validated via their /wholesale endpoint.`
        : level === 'MODERATE'
        ? `Found via directory crawl of ThomasNet / Kompass under the ${categoryLabel} vertical.`
        : level === 'WEAK'
        ? `Surfaced in a press release crawl for "${brandLabel}" distribution announcements.`
        : `Found via broad keyword match; low signal density.`;

    return {
      companyName,
      website: `https://${domain}`,
      location: loc,
      estimatedType,
      authorizationLevel: level,
      evidence,
      reasoning,
      sourceContext,
      sourceAngles:
        level === 'STRONG'
          ? ['authorized_distributor', 'wholesale_application', 'reseller_portal']
          : level === 'MODERATE'
          ? ['directory_listing', 'b2b_surface']
          : ['press_mention'],
      relevanceScore:
        level === 'STRONG' ? 0.92 - (i % 2) * 0.05 : level === 'MODERATE' ? 0.72 - (i % 3) * 0.05 : level === 'WEAK' ? 0.5 : 0.32,
      confidenceScore:
        level === 'STRONG' ? 9 : level === 'MODERATE' ? 6 : level === 'WEAK' ? 4 : 2,
    };
  });
}
