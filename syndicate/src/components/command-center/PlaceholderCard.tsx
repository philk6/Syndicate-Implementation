'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { Trophy, ShoppingCart } from 'lucide-react';

export function PlaceholderCard({
  title,
  icon,
}: {
  title: string;
  icon: 'trophy' | 'orders';
}) {
  const Icon = icon === 'trophy' ? Trophy : ShoppingCart;

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
          <Icon className="w-4 h-4 text-neutral-500" />
        </div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>

      {/* Skeleton lines */}
      <div className="space-y-2.5">
        <div className="h-3 w-full rounded-lg bg-white/[0.04] animate-pulse" />
        <div className="h-3 w-4/5 rounded-lg bg-white/[0.03] animate-pulse" />
        <div className="h-3 w-3/5 rounded-lg bg-white/[0.02] animate-pulse" />
      </div>

      <p className="text-[11px] text-neutral-600 font-medium mt-4 text-center uppercase tracking-wider">
        Coming Soon
      </p>
    </GlassCard>
  );
}
