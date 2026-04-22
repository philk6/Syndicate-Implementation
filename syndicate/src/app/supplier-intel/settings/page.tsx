'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import {
  DS,
  PageShell,
  PageHeader,
  DsCard,
  DsButton,
  DsInput,
  SectionLabel,
} from '@/components/ui/ds';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { ArrowLeft, Save } from 'lucide-react';

interface SettingsState {
  companyProfile: string;
  emailSignature: string;
  defaultTier: 'TIER_1' | 'TIER_2' | 'TIER_3';
  autoFollowUpDays: number;
}

const DEFAULTS: SettingsState = {
  companyProfile: '',
  emailSignature: '',
  defaultTier: 'TIER_2',
  autoFollowUpDays: 7,
};

export default function SupplierIntelSettingsPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsState>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem('si_settings');
    if (raw) {
      try {
        setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
      } catch {
        // fall through
      }
    }
  }, []);

  const save = () => {
    window.localStorage.setItem('si_settings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  if (authLoading) return <PageLoadingSpinner />;
  if (!isAuthenticated) return null;

  return (
    <PageShell>
      <PageHeader
        label="Supplier Intel"
        title="Settings"
        subtitle="Preferences that shape AI outreach and follow-up defaults."
        accent={DS.muted}
        right={
          <Link href="/supplier-intel/dashboard">
            <DsButton variant="ghost">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </DsButton>
          </Link>
        }
      />

      <DsCard className="p-5">
        <SectionLabel accent={DS.orange}>Account</SectionLabel>
        <div className="grid grid-cols-2 gap-3 text-xs text-neutral-300">
          <div>
            <span className="block text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Email</span>
            <span className="font-mono">{user?.email ?? '—'}</span>
          </div>
          <div>
            <span className="block text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Role</span>
            <span className="font-mono uppercase">{user?.role ?? 'user'}</span>
          </div>
        </div>
      </DsCard>

      <DsCard className="p-5" accent={DS.teal}>
        <SectionLabel accent={DS.teal}>Outreach Persona</SectionLabel>
        <p className="text-xs text-neutral-400 font-sans mb-3">
          The AI chat widget uses this block when drafting outreach on your behalf.
        </p>
        <label className="block mb-3">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Company profile</span>
          <textarea
            value={settings.companyProfile}
            onChange={(e) => setSettings({ ...settings, companyProfile: e.target.value })}
            rows={4}
            placeholder="e.g. Established Amazon wholesale seller (4+ years), TOS-compliant, ~$3M ARR across 6 categories."
            className="w-full text-sm text-white border rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-[#4ECDC466] placeholder-neutral-600"
            style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Email signature</span>
          <textarea
            value={settings.emailSignature}
            onChange={(e) => setSettings({ ...settings, emailSignature: e.target.value })}
            rows={3}
            placeholder="— [Your Name]&#10;Syndicate Group · buying@example.com · (555) 555-5555"
            className="w-full text-sm text-white border rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-[#4ECDC466] placeholder-neutral-600"
            style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
          />
        </label>
      </DsCard>

      <DsCard className="p-5" accent={DS.yellow}>
        <SectionLabel accent={DS.yellow}>Follow-Up Defaults</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Default tier</span>
            <select
              value={settings.defaultTier}
              onChange={(e) =>
                setSettings({ ...settings, defaultTier: e.target.value as SettingsState['defaultTier'] })
              }
              className="w-full text-sm text-white border rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-[#FFD93D66]"
              style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
            >
              <option value="TIER_1">TIER 1 — hot prospect</option>
              <option value="TIER_2">TIER 2 — warm prospect</option>
              <option value="TIER_3">TIER 3 — cold prospect</option>
            </select>
          </label>
          <DsInput
            label="Auto follow-up after (days)"
            type="number"
            value={String(settings.autoFollowUpDays)}
            onChange={(v) => setSettings({ ...settings, autoFollowUpDays: Number.parseInt(v, 10) || 0 })}
          />
        </div>
      </DsCard>

      <div className="flex items-center gap-3">
        <DsButton onClick={save} accent={DS.teal}>
          <Save className="w-3.5 h-3.5" /> Save Preferences
        </DsButton>
        {saved && <span className="text-xs text-teal-400 font-mono uppercase tracking-widest">Saved locally</span>}
      </div>

      <p className="text-[10px] text-neutral-600 uppercase tracking-widest">
        Preferences are saved per-browser for now. Server-side persistence ships with the outreach automation milestone.
      </p>
    </PageShell>
  );
}
