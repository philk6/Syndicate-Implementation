/**
 * Deterministic stub that fabricates a plausible AnalysisResult.
 *
 * Used by /api/supplier-intel/analyze/[supplierId] in this pre-launch
 * demo build. Replace with the real Claude-backed analyzer in Session 2
 * once probe decisions are made.
 *
 * Determinism: the hash of the company name drives all "random" choices,
 * so re-analyzing the same supplier produces the same result (which looks
 * honest on video) but different suppliers get varied outputs.
 */

import type {
  AnalysisResult,
  Recommendation,
  Classification,
  Confidence,
  PriorityLevel,
  FlagEntry,
  ScoreBreakdown,
  ExtractedSignal,
  ScrapeDiagnostics,
} from './types';

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length];
}

const GREEN_FLAGS: string[] = [
  'Dedicated wholesale / reseller application portal',
  'Explicit MAP policy referenced in terms',
  'Asks for resale certificate / tax ID during onboarding',
  'Named point-of-contact for wholesale inquiries',
  'EIN / DUNS collection in application',
  'Mentions minimum order quantity structure',
  'Physical US warehouse address listed',
  'Established domain (> 5 years per WHOIS heuristic)',
  'No MSRP undercutting visible on product pages',
  'Credential-verified login portal (not a public storefront)',
];

const RED_FLAGS: string[] = [
  'Retail pricing equal to or below typical wholesale tier',
  'No wholesale application found — retail-only site structure',
  'Dropshipping or "fulfilled-by-us" language on homepage',
  'Terms prohibit resale on Amazon marketplace',
  'International-only fulfillment (China direct-ship)',
  'Domain registered < 18 months ago',
  'Contact page lists generic Gmail / Yahoo address',
  'Products heavily discounted below typical distributor pricing',
  'No physical address listed',
  'Clear consumer-facing retail store — no B2B surface',
];

const CLASSIFICATIONS: Classification[] = [
  'BRAND',
  'DISTRIBUTOR',
  'WHOLESALER',
  'RETAILER',
  'MARKETPLACE_SELLER',
  'LIQUIDATOR',
];

function buildBreakdown(base: number, seed: number): ScoreBreakdown {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const legit = clamp(base + ((seed % 11) - 5));
  const ws = clamp(base + ((seed % 13) - 6));
  const doc = clamp(base - 5 + ((seed % 9) - 4));
  const fit = clamp(base + ((seed % 7) - 3));
  const redPenalty = base < 55 ? 18 + (seed % 12) : base < 70 ? 6 + (seed % 6) : 0;

  const composite = clamp(
    legit * 0.25 + ws * 0.3 + doc * 0.2 + fit * 0.25 - redPenalty,
  );

  return {
    legitimacy: {
      score: legit,
      weight: 0.25,
      maxPossible: 100,
      signals: ['domain_age_over_5yr', 'ssl_valid', 'physical_address_present'],
    },
    wholesaleStructure: {
      score: ws,
      weight: 0.3,
      maxPossible: 100,
      signals: ['wholesale_portal_found', 'reseller_application_referenced'],
    },
    supplyChainDoc: {
      score: doc,
      weight: 0.2,
      maxPossible: 100,
      signals: ['resale_cert_required', 'ein_collected'],
    },
    amazonWholesaleFit: {
      score: fit,
      weight: 0.25,
      maxPossible: 100,
      signals: ['no_map_violation', 'no_amazon_prohibition_clause'],
    },
    redFlagPenalty: {
      penalty: redPenalty,
      signals: redPenalty > 0 ? ['dropshipping_language_detected'] : [],
    },
    composite,
  };
}

function buildSignals(seed: number): ExtractedSignal[] {
  return [
    {
      name: 'wholesale_portal_found',
      value: true,
      category: 'wholesale_structure',
      sourcePage: 'wholesale',
      snippet: 'Apply for Wholesale Access — resale certificate required.',
      weight: 20,
    },
    {
      name: 'resale_cert_required',
      value: true,
      category: 'supply_chain_doc',
      sourcePage: 'wholesale',
      snippet: 'Please upload your state-issued resale certificate.',
      weight: 15,
    },
    {
      name: 'physical_address_present',
      value: '2847 Industrial Pkwy, Columbus OH 43204',
      category: 'legitimacy',
      sourcePage: 'contact',
      weight: 10,
    },
    {
      name: 'amazon_prohibition_clause',
      value: seed % 4 === 0,
      category: 'red_flag',
      sourcePage: 'terms',
      snippet:
        seed % 4 === 0
          ? 'Resellers may not list our products on Amazon.com or third-party marketplaces.'
          : undefined,
      weight: -15,
    },
  ];
}

function buildScrapeDiagnostics(seed: number, domain: string): ScrapeDiagnostics {
  const now = new Date().toISOString();
  return {
    overallSuccess: true,
    baseUrl: `https://${domain}`,
    totalPagesAttempted: 5,
    totalPagesSucceeded: 5 - (seed % 2),
    pages: [
      {
        page: 'homepage',
        url: `https://${domain}/`,
        attempted: true,
        success: true,
        httpStatus: 200,
        contentLength: 48192 + seed,
        scrapedAt: now,
      },
      {
        page: 'about',
        url: `https://${domain}/about`,
        attempted: true,
        success: true,
        httpStatus: 200,
        contentLength: 12041,
        scrapedAt: now,
      },
      {
        page: 'contact',
        url: `https://${domain}/contact`,
        attempted: true,
        success: true,
        httpStatus: 200,
        contentLength: 8744,
        scrapedAt: now,
      },
      {
        page: 'wholesale',
        url: `https://${domain}/wholesale`,
        attempted: true,
        success: seed % 2 === 0,
        httpStatus: seed % 2 === 0 ? 200 : 404,
        failureReason: seed % 2 === 0 ? undefined : 'Page returned 404 — no wholesale surface',
        contentLength: seed % 2 === 0 ? 21337 : 0,
        scrapedAt: now,
      },
      {
        page: 'terms',
        url: `https://${domain}/terms`,
        attempted: true,
        success: true,
        httpStatus: 200,
        contentLength: 18003,
        scrapedAt: now,
      },
    ],
    notes:
      seed % 3 === 0
        ? ['Homepage redirected from www → apex domain', 'Terms page contained explicit Amazon prohibition language']
        : ['All primary pages scraped without redirect'],
    fetchDurationMs: 2100 + (seed % 1800),
  };
}

export function generateStubAnalysis(
  companyName: string,
  website: string | null,
): AnalysisResult {
  const seed = hashStr(companyName);
  const domain = (website ?? `${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`)
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  // Base score in [35..85] so we get a mix of recommendations
  const base = 35 + (seed % 51);
  const breakdown = buildBreakdown(base, seed);
  const composite = breakdown.composite;

  const recommendation: Recommendation =
    composite >= 72 ? 'STRONG_CANDIDATE' : composite >= 50 ? 'NEEDS_REVIEW' : 'HIGH_RISK';

  const classification = pick(CLASSIFICATIONS, seed);

  const confidence: Confidence = composite >= 65 ? 'HIGH' : composite >= 45 ? 'MEDIUM' : 'LOW';

  const priority: PriorityLevel = composite >= 70 ? 'HIGH' : composite >= 50 ? 'MEDIUM' : 'LOW';

  const greenFlags: FlagEntry[] = (recommendation === 'HIGH_RISK' ? 2 : 4).toString() === '2'
    ? [pick(GREEN_FLAGS, seed), pick(GREEN_FLAGS, seed + 3)].map((f) => ({
        flag: f,
        evidence: 'Extracted from /wholesale application page',
        sourcePage: 'wholesale',
        severity: 'SOFT_GREEN',
      }))
    : [
        pick(GREEN_FLAGS, seed),
        pick(GREEN_FLAGS, seed + 3),
        pick(GREEN_FLAGS, seed + 7),
        pick(GREEN_FLAGS, seed + 11),
      ].map((f, i) => ({
        flag: f,
        evidence: 'Detected in scraped page content',
        sourcePage: i === 0 ? 'wholesale' : i === 1 ? 'terms' : 'about',
        severity: i < 2 ? 'HARD_GREEN' : 'SOFT_GREEN',
      }));

  const redFlagCount = recommendation === 'HIGH_RISK' ? 4 : recommendation === 'NEEDS_REVIEW' ? 2 : 1;
  const redFlags: FlagEntry[] = Array.from({ length: redFlagCount }, (_, i) => ({
    flag: pick(RED_FLAGS, seed + i * 5),
    evidence: 'Pattern matched in page body',
    sourcePage: i === 0 ? 'terms' : 'homepage',
    severity: i < 2 ? 'HARD_RED' : 'SOFT_RED',
  }));

  const reasoningSummary =
    recommendation === 'STRONG_CANDIDATE'
      ? `${companyName} shows strong wholesale fundamentals: dedicated reseller portal, explicit resale-cert requirement, and no Amazon-prohibition language in their terms. Credential-verified application flow suggests a real B2B operation. Score of ${composite} supported by ${greenFlags.length} positive signals and only ${redFlagCount} minor concern. Classification as ${classification} matches evidence. Recommend advancing to outreach.`
      : recommendation === 'NEEDS_REVIEW'
      ? `${companyName} presents mixed signals. While some B2B infrastructure is present, we detected ${redFlagCount} meaningful concerns including potential MAP visibility and ambiguous resale policy. Score of ${composite} reflects the split. Recommend a manual review of their wholesale terms before pursuing outreach.`
      : `${companyName} fails multiple wholesale-authorization criteria. No dedicated reseller portal, pricing visible at retail tier only, and terms contain prohibitions incompatible with Amazon resale. Score of ${composite} and ${redFlagCount} hard red flags. Do not pursue without direct contact clarifying authorization path.`;

  return {
    score: composite,
    supplierQualityScore: Math.round((breakdown.legitimacy.score + breakdown.wholesaleStructure.score) / 2),
    amazonFitScore: breakdown.amazonWholesaleFit.score,
    priorityLevel: priority,
    recommendation,
    classification,
    confidenceLevel: confidence,
    evidenceCoverage: composite >= 65 ? 'HIGH' : composite >= 45 ? 'MEDIUM' : 'LOW',
    scoreBreakdown: breakdown,
    greenFlags,
    redFlags,
    reasoningSummary,
    extractedSignals: buildSignals(seed),
    scrapeDiagnostics: buildScrapeDiagnostics(seed, domain),
    rawLlmResponse: { stub: true, model: 'claude-opus-4-stub', tokens: 3412 + (seed % 500) },
  };
}
