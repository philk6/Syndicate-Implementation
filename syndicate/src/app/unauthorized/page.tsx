import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-transparent relative">
      <div className="w-full max-w-[420px] z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-t from-rose-700/20 to-rose-500/10 rounded-2xl flex items-center justify-center mb-6 border border-rose-500/20 shadow-xl shadow-rose-900/10 text-rose-500">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight text-center">Access Restricted</h1>
          <p className="text-neutral-500 mt-2 text-center text-sm font-medium leading-relaxed max-w-[280px]">
            You do not have the clearance required to view this industrial sector
          </p>
        </div>

        <GlassCard className="p-8 text-center border-rose-500/10">
          <p className="text-neutral-400 mb-8 text-sm leading-relaxed">
            If you believe this is an error, please contact your company administrator or verify your role settings.
          </p>
          <Link href="/dashboard" passHref>
            <Button
              className="w-full h-12 bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 rounded-xl transition-all duration-300 group"
            >
              <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" /> Return to Dashboard
            </Button>
          </Link>
        </GlassCard>
      </div>
    </div>
  );
}