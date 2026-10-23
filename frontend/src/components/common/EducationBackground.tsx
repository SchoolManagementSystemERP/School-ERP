import type { CSSProperties } from "react";
import {
  BookOpen, Calculator, Dna, DraftingCompass, FlaskConical, Globe, GraduationCap, Lightbulb,
  Microscope, Pencil, Ruler, Telescope, type LucideIcon,
} from "lucide-react";

/**
 * Floating education-themed background: books, atoms, lab and geometry icons and formulas.
 * Purely decorative (aria-hidden, no pointer events) and still when the user prefers reduced motion.
 */

type Floater =
  | { kind: "icon"; icon: LucideIcon; size: number }
  | { kind: "text"; text: string; size: number }
  | { kind: "atom"; size: number }
  | { kind: "shape"; shape: "triangle" | "hexagon" | "cube" | "circle"; size: number };

interface Placed {
  item: Floater;
  top: string;
  left: string;
  /** float cycle in seconds */
  dur: number;
  delay: number;
  /** spin while floating */
  spin?: boolean;
  opacity?: number;
}

// Kept to the edges so the centre (where the login card sits) stays clear.
const ITEMS: Placed[] = [
  { item: { kind: "atom", size: 120 }, top: "8%", left: "6%", dur: 14, delay: 0, opacity: 0.55 },
  { item: { kind: "icon", icon: BookOpen, size: 46 }, top: "30%", left: "4%", dur: 9, delay: 1.2 },
  { item: { kind: "text", text: "E = mc²", size: 26 }, top: "52%", left: "9%", dur: 11, delay: 0.4 },
  { item: { kind: "shape", shape: "triangle", size: 64 }, top: "70%", left: "4%", dur: 13, delay: 2, spin: true },
  { item: { kind: "icon", icon: FlaskConical, size: 40 }, top: "86%", left: "14%", dur: 10, delay: 0.8 },
  { item: { kind: "text", text: "π", size: 54 }, top: "18%", left: "20%", dur: 12, delay: 2.4 },
  { item: { kind: "icon", icon: Calculator, size: 34 }, top: "64%", left: "22%", dur: 9.5, delay: 3 },
  { item: { kind: "text", text: "a² + b² = c²", size: 22 }, top: "92%", left: "34%", dur: 12, delay: 1 },
  { item: { kind: "icon", icon: Pencil, size: 30 }, top: "4%", left: "34%", dur: 8.5, delay: 0.2, spin: true },
  { item: { kind: "text", text: "H₂O", size: 26 }, top: "6%", left: "60%", dur: 10.5, delay: 1.6 },
  { item: { kind: "icon", icon: GraduationCap, size: 44 }, top: "90%", left: "58%", dur: 11, delay: 2.2 },
  { item: { kind: "shape", shape: "hexagon", size: 58 }, top: "14%", left: "78%", dur: 15, delay: 0.6, spin: true },
  { item: { kind: "icon", icon: Microscope, size: 42 }, top: "34%", left: "90%", dur: 10, delay: 1.4 },
  { item: { kind: "atom", size: 96 }, top: "58%", left: "84%", dur: 16, delay: 3.2, opacity: 0.5 },
  { item: { kind: "text", text: "∫ f(x) dx", size: 24 }, top: "82%", left: "80%", dur: 12.5, delay: 0.9 },
  { item: { kind: "icon", icon: Dna, size: 40 }, top: "6%", left: "92%", dur: 9, delay: 2.8 },
  { item: { kind: "icon", icon: DraftingCompass, size: 38 }, top: "46%", left: "72%", dur: 11.5, delay: 4, spin: true },
  { item: { kind: "text", text: "∑", size: 44 }, top: "72%", left: "68%", dur: 10, delay: 1.8 },
  { item: { kind: "icon", icon: Globe, size: 40 }, top: "40%", left: "16%", dur: 13, delay: 3.6, spin: true },
  { item: { kind: "shape", shape: "cube", size: 54 }, top: "26%", left: "64%", dur: 14, delay: 2.6, spin: true },
  { item: { kind: "icon", icon: Ruler, size: 34 }, top: "78%", left: "44%", dur: 9, delay: 0.5, spin: true },
  { item: { kind: "text", text: "sin θ", size: 22 }, top: "12%", left: "48%", dur: 11, delay: 3.4 },
  { item: { kind: "icon", icon: Lightbulb, size: 34 }, top: "60%", left: "36%", dur: 10, delay: 4.4 },
  { item: { kind: "icon", icon: Telescope, size: 38 }, top: "88%", left: "92%", dur: 12, delay: 1.1 },
];

function Atom({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle r="5" fill="currentColor" stroke="none" />
      {[0, 60, 120].map((angle, i) => (
        <g key={angle} transform={`rotate(${angle})`}>
          <ellipse rx="42" ry="15" />
          {/* electron travelling round its orbit */}
          <g className="edu-orbit" style={{ animationDuration: `${3 + i}s`, animationDirection: i % 2 ? "reverse" : "normal" }}>
            <circle cx="42" cy="0" r="3.5" fill="currentColor" stroke="none" />
          </g>
        </g>
      ))}
    </svg>
  );
}

function Shape({ shape, size }: { shape: "triangle" | "hexagon" | "cube" | "circle"; size: number }) {
  const common = { width: size, height: size, viewBox: "0 0 100 100", fill: "none", stroke: "currentColor", strokeWidth: 2.5 } as const;
  if (shape === "triangle") return <svg {...common}><polygon points="50,8 94,88 6,88" /><line x1="50" y1="8" x2="50" y2="88" strokeDasharray="5 5" /></svg>;
  if (shape === "hexagon") return <svg {...common}><polygon points="50,4 92,27 92,73 50,96 8,73 8,27" /><circle cx="50" cy="50" r="6" /></svg>;
  if (shape === "cube") {
    return (
      <svg {...common}>
        <rect x="12" y="30" width="52" height="52" />
        <rect x="36" y="12" width="52" height="52" strokeDasharray="4 4" />
        <path d="M12 30 L36 12 M64 30 L88 12 M64 82 L88 64 M12 82 L36 64" />
      </svg>
    );
  }
  return <svg {...common}><circle cx="50" cy="50" r="42" /><line x1="50" y1="50" x2="92" y2="50" /><circle cx="50" cy="50" r="3" fill="currentColor" /></svg>;
}

export function EducationBackground({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden className={`edu-bg pointer-events-none absolute inset-0 overflow-hidden ${className}`} style={style}>
      <style>{`
        .edu-bg .edu-item {
          position: absolute;
          color: rgb(165 180 252);
          animation: edu-float ease-in-out infinite;
          will-change: transform;
        }
        .edu-bg .edu-item > .edu-inner { display: inline-flex; }
        .edu-bg .edu-spin > .edu-inner { animation: edu-spin 40s linear infinite; }
        .edu-bg .edu-text {
          font-family: "Outfit", ui-serif, Georgia, serif;
          font-weight: 600;
          letter-spacing: 0.02em;
          white-space: nowrap;
          color: rgb(196 181 253);
        }
        .edu-bg .edu-orbit { animation: edu-spin linear infinite; transform-origin: 0 0; }
        @keyframes edu-float {
          0%, 100% { transform: translate3d(0, 0, 0); }
          25%      { transform: translate3d(6px, -16px, 0); }
          50%      { transform: translate3d(-4px, -26px, 0); }
          75%      { transform: translate3d(-8px, -10px, 0); }
        }
        @keyframes edu-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .edu-bg .edu-item, .edu-bg .edu-spin > .edu-inner, .edu-bg .edu-orbit { animation: none; }
        }
        @media (max-width: 640px) {
          .edu-bg .edu-hide-sm { display: none; }
        }
      `}</style>

      {ITEMS.map(({ item, top, left, dur, delay, spin, opacity }, i) => (
        <div
          key={i}
          className={`edu-item ${spin ? "edu-spin" : ""} ${i % 2 ? "edu-hide-sm" : ""}`}
          style={{ top, left, opacity: opacity ?? 0.32, animationDuration: `${dur}s`, animationDelay: `-${delay}s` }}
        >
          <div className="edu-inner">
            {item.kind === "icon" && <item.icon size={item.size} strokeWidth={1.4} />}
            {item.kind === "text" && <span className="edu-text" style={{ fontSize: item.size }}>{item.text}</span>}
            {item.kind === "atom" && <Atom size={item.size} />}
            {item.kind === "shape" && <Shape shape={item.shape} size={item.size} />}
          </div>
        </div>
      ))}
    </div>
  );
}
