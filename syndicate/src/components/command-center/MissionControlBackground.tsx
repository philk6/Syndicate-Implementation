'use client';

import { useMemo } from 'react';

/**
 * Deep-space mission control background. All CSS — no canvas.
 * Rendered fixed behind content; parent should overlay readable UI.
 */
export function MissionControlBackground() {
  const particles = useMemo(() => {
    return Array.from({ length: 20 }).map((_, i) => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 1 + Math.random() * 2,
      delay: Math.random() * 12,
      duration: 18 + Math.random() * 22,
      opacity: 0.25 + Math.random() * 0.5,
    }));
  }, []);

  return (
    <div className="mc-bg pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#0a0a0f]">
      {/* Radial depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,107,53,0.07),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(78,205,196,0.05),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(199,125,255,0.04),transparent_55%)]" />

      {/* Pulsing grid */}
      <div className="mc-grid absolute inset-0 opacity-[0.12]" />

      {/* Drifting orbs */}
      <div className="mc-orb mc-orb-1" />
      <div className="mc-orb mc-orb-2" />
      <div className="mc-orb mc-orb-3" />

      {/* Floating particles */}
      {particles.map((p, i) => (
        <span
          key={i}
          className="mc-particle absolute rounded-full bg-white"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            boxShadow: '0 0 6px rgba(255,255,255,0.7)',
          }}
        />
      ))}

      {/* Scanlines */}
      <div className="mc-scanlines absolute inset-0" />

      {/* Subtle vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.5)_100%)]" />

      <style jsx global>{`
        .mc-grid {
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
          background-size: 48px 48px;
          animation: mcGridPulse 8s ease-in-out infinite;
        }
        @keyframes mcGridPulse {
          0%, 100% { opacity: 0.08; }
          50%      { opacity: 0.16; }
        }

        .mc-orb {
          position: absolute;
          border-radius: 9999px;
          filter: blur(80px);
          mix-blend-mode: screen;
          will-change: transform, opacity;
        }
        .mc-orb-1 {
          width: 520px; height: 520px;
          background: radial-gradient(circle, rgba(255,107,53,0.45), transparent 65%);
          top: -120px; left: -120px;
          animation: mcOrb1 32s ease-in-out infinite;
        }
        .mc-orb-2 {
          width: 420px; height: 420px;
          background: radial-gradient(circle, rgba(78,205,196,0.35), transparent 65%);
          bottom: -100px; right: -80px;
          animation: mcOrb2 38s ease-in-out infinite;
        }
        .mc-orb-3 {
          width: 360px; height: 360px;
          background: radial-gradient(circle, rgba(199,125,255,0.30), transparent 65%);
          top: 35%; right: 20%;
          animation: mcOrb3 28s ease-in-out infinite;
        }
        @keyframes mcOrb1 {
          0%, 100% { transform: translate(0, 0); opacity: 0.55; }
          50%      { transform: translate(80px, 60px); opacity: 0.85; }
        }
        @keyframes mcOrb2 {
          0%, 100% { transform: translate(0, 0); opacity: 0.45; }
          50%      { transform: translate(-60px, -80px); opacity: 0.75; }
        }
        @keyframes mcOrb3 {
          0%, 100% { transform: translate(0, 0); opacity: 0.35; }
          50%      { transform: translate(-40px, 50px); opacity: 0.65; }
        }

        .mc-particle {
          animation-name: mcParticleDrift;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform, opacity;
        }
        @keyframes mcParticleDrift {
          0%   { transform: translate(0, 0);            opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translate(24px, -180px);     opacity: 0; }
        }

        .mc-scanlines {
          background-image: repeating-linear-gradient(
            0deg,
            rgba(255, 255, 255, 0.02) 0px,
            rgba(255, 255, 255, 0.02) 1px,
            transparent 1px,
            transparent 3px
          );
          animation: mcScanShift 6s linear infinite;
          pointer-events: none;
        }
        @keyframes mcScanShift {
          from { background-position: 0 0; }
          to   { background-position: 0 3px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .mc-grid, .mc-orb, .mc-particle, .mc-scanlines {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
