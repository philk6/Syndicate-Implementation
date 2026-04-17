'use client';

import { useAuth } from '@lib/auth';
import { CompanyProfile } from '@/components/CompanyProfile';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageShell, PageHeader, DsButton, DS } from '@/components/ui/ds';

export default function CompanyPage() {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [loading, isAuthenticated, router]);

  if (loading || !isAuthenticated) {
    return <PageLoadingSpinner />;
  }

  if (!user?.company_id) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-32">
          <h1 className="text-3xl font-black text-white mb-2 uppercase tracking-tight font-mono">No Company Linked</h1>
          <p className="text-neutral-500 text-sm font-sans">Your account is not currently linked to a company.</p>
          <div className="mt-6">
            <DsButton onClick={() => router.push('/dashboard')} accent={DS.orange}>
              Return to Dashboard
            </DsButton>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <CompanyProfile
        companyId={user.company_id}
        isAdmin={user.role === 'admin'}
      />
    </PageShell>
  );
}
