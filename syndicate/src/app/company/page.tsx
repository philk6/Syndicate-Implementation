'use client';

import { useAuth } from '@lib/auth';
import { CompanyProfile } from '@/components/CompanyProfile';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

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
      <div className="min-h-screen p-6 w-full flex flex-col items-center justify-center">
        <h1 className="text-3xl font-bold text-white mb-2">No Company Linked</h1>
        <p className="text-neutral-400">Your account is not currently linked to a company.</p>
        <button 
          onClick={() => router.push('/dashboard')}
          className="mt-6 px-4 py-2 bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 rounded-xl hover:bg-amber-500/20"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 w-full">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Company Profile</h1>
          <p className="text-neutral-400 mt-1">Manage your company details, goals, purchase orders, and notes.</p>
        </div>
        
        <CompanyProfile 
          companyId={user.company_id} 
          isAdmin={user.role === 'admin'} 
        />
      </div>
    </div>
  );
}
