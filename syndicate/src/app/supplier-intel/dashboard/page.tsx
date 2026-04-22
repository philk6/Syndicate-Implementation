'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import {
  DS,
  PageShell,
  PageHeader,
  SectionLabel,
  MetricCard,
  DsButton,
  DsCard,
} from '@/components/ui/ds';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Package,
  Target,
  AlertTriangle,
  Clock,
  Plus,
  Compass,
  Inbox,
  Shield,
  Settings,
  ArrowRight,
  Folder,
} from 'lucide-react';

interface DashboardStats {
  totalSuppliers: number;
  strongCandidates: number;
  highRiskCount: number;
  needsActionQueue: number;
}

export default function SupplierIntelDashboardPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancel = false;
    (async () => {
      try {
        const res = await fetch('/api/supplier-intel/dashboard');
        const json = await res.json();
        if (!cancel && res.ok) setStats(json.data);
      } catch (err) {
        console.error('Dashboard fetch failed:', err);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [isAuthenticated]);

  if (authLoading || loading) return <PageLoadingSpinner />;
  if (!isAuthenticated) return null;

  const isAdmin = user?.role === 'admin';

  return (
    <PageShell>
      <PageHeader
        label="Supplier Intel"
        title="Dashboard"
        subtitle="Mission control for supplier discovery, vetting, and outreach."
        accent={DS.orange}
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/supplier-intel/discovery">
              <DsButton variant="secondary" accent={DS.teal}>
                <Compass className="w-3.5 h-3.5" /> Discover
              </DsButton>
            </Link>
            <Link href="/supplier-intel/lists">
              <DsButton variant="primary" accent={DS.orange}>
                <Plus className="w-3.5 h-3.5" /> Manage Lists
              </DsButton>
            </Link>
          </div>
        }
      />

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Suppliers"
          value={stats?.totalSuppliers ?? 0}
          accent={DS.orange}
          icon={<Package className="w-4 h-4" />}
        />
        <MetricCard
          label="Strong Candidates"
          value={stats?.strongCandidates ?? 0}
          accent={DS.teal}
          icon={<Target className="w-4 h-4" />}
        />
        <MetricCard
          label="High Risk"
          value={stats?.highRiskCount ?? 0}
          accent={DS.red}
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <MetricCard
          label="Needs Action"
          value={stats?.needsActionQueue ?? 0}
          accent={DS.yellow}
          icon={<Clock className="w-4 h-4" />}
        />
      </section>

      <section>
        <SectionLabel accent={DS.orange}>Navigate</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <NavTile
            href="/supplier-intel/lists"
            icon={<Folder className="w-5 h-5" />}
            accent={DS.orange}
            title="Supplier Lists"
            body="Organize suppliers into named collections. Add manually, via CSV, or from Discovery."
          />
          <NavTile
            href="/supplier-intel/discovery"
            icon={<Compass className="w-5 h-5" />}
            accent={DS.teal}
            title="Discovery"
            body="Hunt authorized distributors by brand, category, or region."
          />
          <NavTile
            href="/supplier-intel/follow-up"
            icon={<Inbox className="w-5 h-5" />}
            accent={DS.yellow}
            title="Follow-Up Queue"
            body="Suppliers awaiting your next touch. Tier, priority, and assignment visible."
          />
          <NavTile
            href="/supplier-intel/follow-up/templates"
            icon={<Target className="w-5 h-5" />}
            accent={DS.blue}
            title="Email Templates"
            body="Reusable outreach copy for the sequence — first-touch, follow-up, break-up."
          />
          {isAdmin && (
            <NavTile
              href="/supplier-intel/admin"
              icon={<Shield className="w-5 h-5" />}
              accent={DS.red}
              title="Admin Control"
              body="Rescore all analyses, view pipeline health, audit events."
            />
          )}
          <NavTile
            href="/supplier-intel/settings"
            icon={<Settings className="w-5 h-5" />}
            accent={DS.muted}
            title="Settings"
            body="Outreach persona, email signature, follow-up defaults."
          />
        </div>
      </section>
    </PageShell>
  );
}

function NavTile({
  href,
  icon,
  accent,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  accent: string;
  title: string;
  body: string;
}) {
  return (
    <Link href={href} className="block">
      <DsCard className="p-5 group h-full" accent={accent}>
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${accent}1a`, borderColor: `${accent}55`, color: accent }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-mono uppercase tracking-widest text-sm font-bold text-white">{title}</h3>
              <ArrowRight
                className="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors shrink-0"
              />
            </div>
            <p className="text-xs text-neutral-400 mt-1 font-sans leading-relaxed">{body}</p>
          </div>
        </div>
      </DsCard>
    </Link>
  );
}
