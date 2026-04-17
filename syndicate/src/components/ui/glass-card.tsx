import { ReactNode } from 'react';

export const GlassCard = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
    <div className={`relative overflow-hidden rounded-2xl bg-[#0d0d12] border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] ${className}`}>
        {/* Subtle inner highlight */}
        <div className="absolute inset-0 rounded-2xl border border-white/[0.02] pointer-events-none" />
        {children}
    </div>
);
