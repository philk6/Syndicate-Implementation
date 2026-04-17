'use client';

import { useMemo } from 'react';

/**
 * Header backdrop: black + gold hexagon ops briefing.
 * Renders inside a relatively-positioned header with overflow hidden.
 * Parent MUST overlay a dark gradient near the text for readability
 * (included here at the bottom layer).
 */
export function HeaderAnimatedBg() {
  // Three palette shades layered at random
  const GOLDS = ['#FFD700', '#B8860B', '#FFA500'];

  const hexagons = useMemo(() => {
    return Array.from({ length: 22 }).map((_, i) => {
      const size = 40 + Math.floor(Math.random() * 120); // 40–160px
      const rotate = Math.random() * 360;
      const layer = i % 3; // 0 = back (smallest opacity), 2 = front
      return {
        left: Math.random() * 100,
        top: Math.random() * 100,
        size,
        rotate,
        color: GOLDS[i % GOLDS.length],
        driftX: (Math.random() * 40 - 20).toFixed(1),
        driftY: (Math.random() * 40 - 20).toFixed(1),
        rotateAmt: (Math.random() * 40 - 20).toFixed(1),
        driftDuration: 18 + Math.random() * 22,
        pulseDuration: 6 + Math.random() * 10,
        delay: -Math.random() * 20,
        opacity: layer === 0 ? 0.12 : layer === 1 ? 0.22 : 0.34,
        strokeWidth: layer === 2 ? 1.25 : 1,
        glow: layer === 2,
      };
    });
  }, []);

  const particles = useMemo(() => {
    return Array.from({ length: 28 }).map(() => ({
      left: Math.random() * 100,
      top: 40 + Math.random() * 80, // start lower; they drift up
      size: 1 + Math.random() * 1.8,
      delay: -Math.random() * 14,
      duration: 14 + Math.random() * 16,
      opacity: 0.35 + Math.random() * 0.55,
    }));
  }, []);

  return (
    <div className="mc-hdr-bg pointer-events-none absolute inset-0 overflow-hidden bg-[#0a0a0a]">
      {/* Warm radial wash to anchor the gold palette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 20% 30%, rgba(184,134,11,0.10), transparent 55%), radial-gradient(ellipse at 80% 70%, rgba(255,215,0,0.08), transparent 60%)',
        }}
      />

      {/* Hexagons */}
      {hexagons.map((h, i) => (
        <span
          key={i}
          className="mc-hex-wrap absolute"
          style={{
            left: `${h.left}%`,
            top: `${h.top}%`,
            width: `${h.size}px`,
            height: `${h.size}px`,
            ['--hx-dx' as string]: `${h.driftX}px`,
            ['--hx-dy' as string]: `${h.driftY}px`,
            ['--hx-dr' as string]: `${h.rotateAmt}deg`,
            ['--hx-r0' as string]: `${h.rotate}deg`,
            animationDuration: `${h.driftDuration}s`,
            animationDelay: `${h.delay}s`,
          }}
        >
          <span
            className="mc-hex-pulse absolute inset-0"
            style={{
              animationDuration: `${h.pulseDuration}s`,
              animationDelay: `${h.delay}s`,
              opacity: h.opacity,
            }}
          >
            <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
              <defs>
                {h.glow && (
                  <filter id={`hex-glow-${i}`} x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="1.2" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                )}
              </defs>
              <polygon
                points="50,3 97,27 97,73 50,97 3,73 3,27"
                stroke={h.color}
                strokeWidth={h.strokeWidth}
                filter={h.glow ? `url(#hex-glow-${i})` : undefined}
              />
            </svg>
          </span>
        </span>
      ))}

      {/* Gold dust particles drifting upward */}
      {particles.map((p, i) => (
        <span
          key={i}
          className="mc-hdr-dust absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            background: '#FFD700',
            boxShadow: '0 0 6px #FFD70099, 0 0 12px #B8860B55',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}

      {/* Bottom fade for legibility */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,10,10,0.15) 0%, rgba(10,10,10,0.35) 55%, rgba(10,10,10,0.78) 100%)',
        }}
      />

      <style jsx global>{`
        .mc-hex-wrap {
          will-change: transform;
          animation-name: mcHexDrift;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          animation-direction: alternate;
          transform: rotate(var(--hx-r0, 0deg));
        }
        @keyframes mcHexDrift {
          from { transform: translate(0, 0) rotate(var(--hx-r0, 0deg)); }
          to   { transform: translate(var(--hx-dx, 0px), var(--hx-dy, 0px))
                           rotate(calc(var(--hx-r0, 0deg) + var(--hx-dr, 0deg))); }
        }

        .mc-hex-pulse {
          will-change: opacity;
          animation-name: mcHexPulse;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        @keyframes mcHexPulse {
          0%,100% { opacity: var(--hx-pulse-lo, 0.12); }
          50%     { opacity: var(--hx-pulse-hi, 0.42); }
        }

        .mc-hdr-dust {
          will-change: transform, opacity;
          animation-name: mcHdrDustRise;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes mcHdrDustRise {
          0%   { transform: translate(0, 0) scale(1);   opacity: 0; }
          10%  { opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translate(8px, -160px) scale(0.8); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .mc-hex-wrap, .mc-hex-pulse, .mc-hdr-dust {
            animation: none !important;
          }
          .mc-hdr-dust { opacity: 0 !important; }
        }
      `}</style>
    </div>
  );
}
