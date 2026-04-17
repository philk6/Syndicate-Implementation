'use client';

/**
 * Design-system primitives shared across all app pages.
 * Dark premium theme matching Mission Control / Prep Portal aesthetic.
 */

import { cn } from '@/lib/utils';

// ─── Colors ─────────────────────────────────────────────────────────────────

export const DS = {
  bg:         '#0a0a0a',
  cardBg:     'rgba(255,255,255,0.03)',
  cardBorder: 'rgba(255,255,255,0.08)',
  orange:     '#FF6B35',
  gold:       '#FFD700',
  teal:       '#4ECDC4',
  yellow:     '#FFD93D',
  red:        '#FF4444',
  blue:       '#3B82F6',
  muted:      '#888888',
  textDim:    '#a3a3a3',
  inputBg:    '#111118',
} as const;

// ─── Page shell ─────────────────────────────────────────────────────────────

export function PageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-h-screen w-full font-mono', className)} style={{ backgroundColor: DS.bg }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {children}
      </div>
    </div>
  );
}

// ─── Page header ────────────────────────────────────────────────────────────

interface PageHeaderProps {
  label?: string;
  title: string;
  subtitle?: string;
  accent?: string;
  right?: React.ReactNode;
}

export function PageHeader({ label, title, subtitle, accent = DS.orange, right }: PageHeaderProps) {
  return (
    <header
      className="relative rounded-2xl border overflow-hidden p-6"
      style={{ borderColor: `${accent}33`, backgroundColor: 'rgba(10,10,15,0.7)' }}
    >
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top left, ${accent}15, transparent 55%)` }} />
      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          {label && (
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-500 mb-1">
              {label}
            </p>
          )}
          <h1
            className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-none uppercase"
            style={{ textShadow: `0 0 18px ${accent}44` }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-neutral-400 mt-1.5 font-sans">{subtitle}</p>
          )}
        </div>
        {right && <div className="flex items-center gap-3 flex-wrap shrink-0">{right}</div>}
      </div>
    </header>
  );
}

// ─── Section label ──────────────────────────────────────────────────────────

export function SectionLabel({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <h2
      className="text-[10px] font-bold uppercase tracking-[0.35em] mb-2 flex items-center gap-2"
      style={{ color: accent ?? '#6b7280' }}
    >
      <span className="w-5 h-px" style={{ backgroundColor: accent ?? '#374151' }} />
      {children}
      <span className="flex-1 h-px bg-neutral-800" />
    </h2>
  );
}

// ─── Glass card ─────────────────────────────────────────────────────────────

export function DsCard({
  children, className, accent, glow, onClick,
}: { children: React.ReactNode; className?: string; accent?: string; glow?: boolean; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'rounded-2xl border transition-all overflow-hidden',
        onClick && 'cursor-pointer text-left w-full hover:bg-white/[0.03]',
        className,
      )}
      style={{
        borderColor: accent ? `${accent}44` : DS.cardBorder,
        backgroundColor: DS.cardBg,
        boxShadow: glow && accent ? `0 0 24px ${accent}33` : 'none',
      }}
    >
      {children}
    </Tag>
  );
}

// ─── Metric card ────────────────────────────────────────────────────────────

export function MetricCard({
  label, value, sub, accent = DS.orange, icon,
}: { label: string; value: string | number; sub?: string; accent?: string; icon?: React.ReactNode }) {
  return (
    <DsCard className="p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 bottom-0 w-1" style={{ backgroundColor: accent, boxShadow: `0 0 10px ${accent}` }} />
      <div className="pl-3 flex items-start gap-3">
        {icon && (
          <div
            className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${accent}1a`, borderColor: `${accent}55`, color: accent }}
          >
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
          <div
            className="text-2xl font-black tabular-nums tracking-tight"
            style={{ color: accent }}
          >
            {value}
          </div>
          {sub && <div className="text-[10px] text-neutral-500 mt-0.5">{sub}</div>}
        </div>
      </div>
    </DsCard>
  );
}

// ─── Status pill ────────────────────────────────────────────────────────────

export function DsStatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold font-mono uppercase tracking-wider border"
      style={{
        backgroundColor: `${color}22`,
        borderColor: `${color}55`,
        color,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      {label}
    </span>
  );
}

// ─── Dark table ─────────────────────────────────────────────────────────────

export function DsTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border overflow-hidden', className)} style={{ borderColor: DS.cardBorder, backgroundColor: DS.cardBg }}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">{children}</table>
      </div>
    </div>
  );
}

export function DsThead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="text-[10px] uppercase tracking-widest text-neutral-500 border-b border-white/[0.08]">
        {children}
      </tr>
    </thead>
  );
}

export function DsTh({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('font-bold py-3 px-4 text-left', className)}>{children}</th>;
}

export function DsTr({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-b border-white/[0.03] transition-colors',
        'even:bg-white/[0.015]',
        onClick && 'cursor-pointer hover:bg-white/[0.04]',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function DsTd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('py-2.5 px-4 text-neutral-200', className)}>{children}</td>;
}

// ─── Dark input ─────────────────────────────────────────────────────────────

export function DsInput({
  label, value, onChange, type = 'text', placeholder, className,
  ...rest
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'>) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">{label}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm text-white border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FF6B3566] placeholder-neutral-600"
        style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
        {...rest}
      />
    </label>
  );
}

// ─── Primary / Secondary buttons ────────────────────────────────────────────

export function DsButton({
  children, onClick, variant = 'primary', accent = DS.orange, disabled, className, type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  accent?: string;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const colors = {
    primary: { bg: accent, text: '#0a0a0a', border: accent, hoverShadow: `0 0 18px ${accent}55` },
    secondary: { bg: `${accent}1a`, text: accent, border: `${accent}55`, hoverShadow: `0 0 14px ${accent}33` },
    danger: { bg: `${DS.red}1a`, text: DS.red, border: `${DS.red}55`, hoverShadow: `0 0 14px ${DS.red}33` },
    ghost: { bg: 'transparent', text: DS.textDim, border: 'rgba(255,255,255,0.08)', hoverShadow: 'none' },
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border text-[11px] font-bold font-mono uppercase tracking-widest transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
      }}
      onMouseEnter={(e) => { (e.currentTarget.style.boxShadow = colors.hoverShadow); }}
      onMouseLeave={(e) => { (e.currentTarget.style.boxShadow = 'none'); }}
    >
      {children}
    </button>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

export function DsEmpty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4 text-neutral-500">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-1">{title}</h3>
      <p className="text-xs text-neutral-500 max-w-[320px] font-sans">{body}</p>
    </div>
  );
}

// ─── Count pill (for headers) ───────────────────────────────────────────────

export function DsCountPill({ count, accent = DS.orange }: { count: number; accent?: string }) {
  return (
    <span
      className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11px] font-black font-mono tabular-nums border"
      style={{ backgroundColor: `${accent}1a`, borderColor: `${accent}55`, color: accent }}
    >
      {count}
    </span>
  );
}
