import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { EducationBackground } from "@/components/common/EducationBackground";
import { ApiError, errorMessage } from "@/api/client";
import { LOGIN_LEVEL_LABEL, LOGIN_PATH, ROLE_ACCOUNTS, changePassword, lastOrganization, signIn, signOut, type LoginLevel, type Role } from "@/store/session";

/** Demo accounts in the database (backend: npm run import:frontend + npm run seed:group), all with the password Demo@1234. */
const DEMO_PASSWORD = "Demo@1234";

/** What each sign-in page is for, its colours and its demo accounts (school "greenwood"). */
const LEVELS: Record<LoginLevel, { title: string; sub: string; colors: [string, string]; demoLabel: string; demo: { label: string; username: string }[] }> = {
  school: {
    title: "School Login", sub: "Principal, teachers, office staff, students and parents", colors: ["#6366f1", "#8b5cf6"],
    demoLabel: 'Demo school "greenwood" (Gomti Nagar) — click to autofill',
    demo: [
      ["principal", "principal"], ["viceprincipal", "viceprincipal"], ["teacher", "T001"], ["student", "ADM-2025-1001"], ["parent", "9876511111"],
      ["accountant", "accountant"], ["reception", "reception"], ["exams", "exams"], ["transport", "transport"], ["warden", "warden"], ["hr", "hr"],
      ["librarian", "librarian"], ["inventory", "inventory"],
    ].map(([label, username]) => ({ label, username })),
  },
  region: {
    title: "Region Office Login", sub: "The regional office — only the schools of your region", colors: ["#0d9488", "#0284c7"],
    demoLabel: 'Demo "greenwood": Lucknow region office (cluster.head: Kanpur)',
    demo: [
      "regional.manager", "lko.asst.director", "lko.academic", "lko.subject", "lko.exams", "lko.inspector", "lko.training", "lko.counselling", "lko.accounts",
      "lko.auditor", "lko.hr", "lko.admissions", "lko.purchase", "lko.transport", "lko.infra", "lko.it", "lko.sports", "lko.pr", "lko.office", "cluster.head",
    ].map((u) => ({ label: u, username: u })),
  },
  head: {
    title: "Head Office Login", sub: "Trust and management — every school of the group", colors: ["#b45309", "#d97706"],
    demoLabel: 'Demo "greenwood" trust — all 3 schools',
    demo: [
      "chairman", "director", "secretary", "treasurer", "trustee", "admin", "it.head", "academic.head", "finance.head", "hr.head", "admissions.head",
      "purchase.head", "compliance", "auditor", "inspection", "transport.head", "marketing", "training",
    ].map((u) => ({ label: u, username: u })),
  },
};
const LEVEL_ORDER: LoginLevel[] = ["school", "region", "head"];

/* ── Floating orb data ── */
const ORBS = [
  { size: 520, x: -10, y: -10, color: "#6366f1", delay: 0,   dur: 18 },
  { size: 400, x: 60,  y: 50,  color: "#8b5cf6", delay: 3,   dur: 22 },
  { size: 350, x: 10,  y: 60,  color: "#3b82f6", delay: 6,   dur: 16 },
  { size: 280, x: 75,  y: 10,  color: "#a78bfa", delay: 1,   dur: 20 },
  { size: 200, x: 40,  y: 80,  color: "#60a5fa", delay: 8,   dur: 14 },
];

/* ── Particle component ── */
interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  color: string;
}

const PARTICLE_COLORS = ["#a5b4fc", "#c4b5fd", "#93c5fd", "#e0e7ff", "#ddd6fe"];

/** A sign-in page for one level: the school's people, a region office, or the head office. */
export function Login({ level = "school" }: { level?: LoginLevel }) {
  const navigate  = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const page = LEVELS[level];
  /** Signed in on the wrong page: the page this account belongs to. */
  const [wrongLevel, setWrongLevel] = useState<LoginLevel | null>(null);

  const [organization, setOrganization] = useState(lastOrganization);
  const [newPassword, setNewPassword] = useState("");
  const [mustChange,  setMustChange]  = useState<Role | null>(null);
  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [mounted,     setMounted]     = useState(false);
  const [fieldError,  setFieldError]  = useState<{
    field: "username" | "password" | null;
    message: string;
  }>({ field: null, message: "" });

  /* mount animation */
  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

  /* canvas particles */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: Particle[] = [];

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 80; i++) {
      particles.push({
        id:     i,
        x:      Math.random() * window.innerWidth,
        y:      Math.random() * window.innerHeight,
        size:   Math.random() * 2.5 + 0.5,
        speedX: (Math.random() - 0.5) * 0.4,
        speedY: (Math.random() - 0.5) * 0.4,
        opacity: Math.random() * 0.6 + 0.2,
        color:  PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      /* connection lines */
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx   = particles[i].x - particles[j].x;
          const dy   = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = "#a5b4fc";
            ctx.globalAlpha = (1 - dist / 100) * 0.15;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  function clearError() { setFieldError({ field: null, message: "" }); setWrongLevel(null); }

  function go(role: Role | null, name: string) {
    if (!role) { setFieldError({ field: "username", message: "This account has no portal yet. Ask the administrator to give it a role." }); return; }
    toast.success(`Welcome, ${name}!`);
    navigate(ROLE_ACCOUNTS[role].path);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    if (mustChange) {
      if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/d/.test(newPassword)) { setFieldError({ field: "password", message: "Use at least 8 characters with a letter and a number." }); return; }
      setSubmitting(true);
      try {
        await changePassword(password, newPassword);
        toast.success("Password changed");
        go(mustChange, username);
      } catch (err) {
        setFieldError({ field: "password", message: errorMessage(err) });
      } finally { setSubmitting(false); }
      return;
    }
    if (!organization.trim()) { setFieldError({ field: "username", message: "Enter your school code." }); return; }
    if (!username.trim()) { setFieldError({ field: "username", message: "Enter your username." }); return; }
    if (!password) { setFieldError({ field: "password", message: "Enter your password." }); return; }
    setSubmitting(true);
    try {
      const res = await signIn(organization, username, password);
      if (res.level !== level) {
        // the account is right, the door is not: sign out again and point to the right page
        await signOut();
        setWrongLevel(res.level);
        setFieldError({ field: "username", message: `This is a ${LOGIN_LEVEL_LABEL[res.level]} account. Please use the ${LOGIN_LEVEL_LABEL[res.level]} login.` });
        return;
      }
      if (res.mustChangePassword) { setMustChange(res.role); toast.message("Please choose a new password to continue."); return; }
      go(res.role, res.name);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      if (code === "INVALID_LOGIN") setFieldError({ field: "password", message: "Wrong school code, username or password." });
      else if (code === "ACCOUNT_DISABLED" || code === "ORG_INACTIVE") setFieldError({ field: "username", message: errorMessage(err) });
      else if (code === "TOO_MANY_ATTEMPTS") setFieldError({ field: "password", message: errorMessage(err) });
      else setFieldError({ field: "username", message: errorMessage(err) });
    } finally { setSubmitting(false); }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Space+Grotesk:wght@300;400;500&display=swap');

        .back-home { position: absolute; top: 20px; left: 24px; z-index: 10; color: rgba(255,255,255,0.85); font-size: 14px; font-weight: 600; text-decoration: none; padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,0.12); backdrop-filter: blur(6px); }
        .back-home:hover { background: rgba(255,255,255,0.22); color: #fff; }
        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          background: #050816;
          font-family: 'Outfit', sans-serif;
        }

        /* ── animated gradient blobs ── */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.18;
          animation: orbFloat linear infinite;
          pointer-events: none;
        }
        @keyframes orbFloat {
          0%   { transform: translate(0,0)    scale(1);    }
          25%  { transform: translate(3%,5%)  scale(1.05); }
          50%  { transform: translate(6%,2%)  scale(0.97); }
          75%  { transform: translate(2%,7%)  scale(1.03); }
          100% { transform: translate(0,0)    scale(1);    }
        }

        /* ── grid overlay ── */
        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
        }

        /* ── glassmorphism card ── */
        .glass-card {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 420px;
          margin: 1rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 24px;
          padding: 2.5rem 2rem;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.05) inset,
            0 32px 80px rgba(0,0,0,0.5),
            0 0 60px rgba(99,102,241,0.08);
          transition: transform 0.8s cubic-bezier(.22,1,.36,1), opacity 0.8s ease;
          opacity: 0;
          transform: translateY(32px);
        }
        .glass-card.mounted {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── glowing ring on card ── */
        .glass-card::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: 25px;
          background: linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.1), rgba(59,130,246,0.3));
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          -webkit-mask-composite: xor;
          padding: 1px;
          pointer-events: none;
        }

        /* ── icon ring ── */
        .icon-ring {
          width: 64px;
          height: 64px;
          margin: 0 auto 1.5rem;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--a1), var(--a2));
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 0 8px color-mix(in srgb, var(--a1) 12%, transparent), 0 0 30px color-mix(in srgb, var(--a1) 35%, transparent);
          animation: pulse-ring 3s ease-in-out infinite;
        }
        @keyframes pulse-ring {
          0%, 100% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--a1) 12%, transparent), 0 0 30px color-mix(in srgb, var(--a1) 35%, transparent); }
          50%       { box-shadow: 0 0 0 14px color-mix(in srgb, var(--a1) 6%, transparent), 0 0 50px color-mix(in srgb, var(--a1) 50%, transparent); }
        }

        .icon-ring svg { width: 28px; height: 28px; color: #fff; }

        /* ── heading ── */
        .card-title {
          font-size: 1.65rem;
          font-weight: 700;
          color: #fff;
          text-align: center;
          letter-spacing: -0.02em;
          margin-bottom: 0.35rem;
        }
        .card-sub {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.4);
          text-align: center;
          margin-bottom: 2rem;
          font-weight: 300;
        }

        /* ── inputs ── */
        .field { margin-bottom: 1.1rem; }
        .field label {
          display: block;
          font-size: 0.78rem;
          font-weight: 500;
          color: rgba(255,255,255,0.55);
          margin-bottom: 0.45rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .input-wrap { position: relative; }
        .input-wrap .field-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          color: rgba(255,255,255,0.3);
          pointer-events: none;
        }
        .styled-input {
          width: 100%;
          padding: 0.75rem 1rem 0.75rem 2.5rem;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #fff;
          font-family: 'Outfit', sans-serif;
          font-size: 0.95rem;
          font-weight: 400;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }
        .styled-input::placeholder { color: rgba(255,255,255,0.2); }
        .styled-input:focus {
          border-color: rgba(99,102,241,0.6);
          background: rgba(99,102,241,0.08);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
        }
        .styled-input.err { border-color: rgba(248,113,113,0.6); }
        .styled-input.err:focus { box-shadow: 0 0 0 3px rgba(248,113,113,0.12); }
        .err-msg {
          font-size: 0.75rem;
          color: #f87171;
          margin-top: 0.35rem;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        /* eye toggle */
        .eye-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          color: rgba(255,255,255,0.3);
          transition: color 0.2s;
          display: flex;
          align-items: center;
        }
        .eye-btn:hover { color: rgba(255,255,255,0.7); }

        /* ── show password row ── */
        .toggle-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 1.5rem;
        }
        .toggle-row input[type=checkbox] {
          width: 15px; height: 15px;
          accent-color: #6366f1;
          cursor: pointer;
        }
        .toggle-row label {
          font-size: 0.82rem;
          color: rgba(255,255,255,0.4);
          cursor: pointer;
          user-select: none;
        }

        /* ── demo chips ── */
        .demo-box {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          padding: 0.85rem 1rem;
          margin-bottom: 1.5rem;
        }
        .demo-label {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.3);
          text-transform: uppercase;
          letter-spacing: 0.07em;
          margin-bottom: 0.6rem;
        }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip {
          padding: 3px 12px;
          border-radius: 20px;
          background: color-mix(in srgb, var(--a1) 14%, transparent);
          border: 1px solid color-mix(in srgb, var(--a1) 35%, transparent);
          color: color-mix(in srgb, var(--a2) 40%, #fff);
          font-size: 0.78rem;
          font-family: 'Outfit', sans-serif;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s;
        }
        .chip:hover {
          background: color-mix(in srgb, var(--a1) 30%, transparent);
          transform: translateY(-1px);
        }
        .chip:active { transform: scale(0.96); }

        /* ── level tabs ── */
        .level-tabs { display: flex; gap: 4px; padding: 4px; margin-bottom: 1.5rem; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); }
        .level-tab { flex: 1; text-align: center; padding: 7px 4px; border-radius: 9px; font-size: 0.78rem; font-weight: 600; color: rgba(255,255,255,0.55); text-decoration: none; transition: background 0.2s, color 0.2s; }
        .level-tab:hover { color: #fff; background: rgba(255,255,255,0.06); }
        .level-tab.active { color: #fff; background: linear-gradient(135deg, var(--a1), var(--a2)); box-shadow: 0 4px 14px color-mix(in srgb, var(--a1) 35%, transparent); }
        .wrong-level { display: inline-block; margin-top: 6px; font-size: 0.8rem; font-weight: 600; color: #fff; padding: 5px 12px; border-radius: 999px; background: linear-gradient(135deg, var(--a1), var(--a2)); text-decoration: none; }

        /* ── submit button ── */
        .submit-btn {
          width: 100%;
          padding: 0.85rem;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--a1), var(--a2));
          color: #fff;
          font-family: 'Outfit', sans-serif;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          letter-spacing: 0.01em;
          position: relative;
          overflow: hidden;
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
          box-shadow: 0 4px 24px rgba(99,102,241,0.35);
        }
        .submit-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .submit-btn:hover:not(:disabled)::before { opacity: 1; }
        .submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 32px rgba(99,102,241,0.5);
        }
        .submit-btn:active:not(:disabled) { transform: scale(0.98); }
        .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        /* ── spinner ── */
        .spinner {
          display: inline-block;
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          vertical-align: middle;
          margin-right: 6px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── floating shapes decoration ── */
        .deco-shape {
          position: absolute;
          pointer-events: none;
          animation: shapeDrift ease-in-out infinite;
          opacity: 0;
        }
        @keyframes shapeDrift {
          0%   { transform: translateY(0)   rotate(0deg);   opacity: 0.6; }
          50%  { transform: translateY(-20px) rotate(180deg); opacity: 0.9; }
          100% { transform: translateY(0)   rotate(360deg); opacity: 0.6; }
        }
      `}</style>

      <div className="login-root">
        {/* canvas particles */}
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, zIndex: 1 }} />

        {/* grid */}
        <div className="grid-overlay" style={{ zIndex: 2 }} />

        {/* books, atoms, geometry and formulas drifting in the background */}
        <EducationBackground style={{ zIndex: 4 }} />

        {/* blobs */}
        {ORBS.map((o, i) => (
          <div
            key={i}
            className="orb"
            style={{
              width:  o.size,
              height: o.size,
              left:   `${o.x}%`,
              top:    `${o.y}%`,
              background: o.color,
              animationDuration: `${o.dur}s`,
              animationDelay:    `${o.delay}s`,
              zIndex: 3,
            }}
          />
        ))}

        {/* floating geometric shapes */}
        {[
          { size: 14, top: "15%", left: "8%",  color: "#6366f1", dur: 7,  delay: 0 },
          { size: 10, top: "72%", left: "12%", color: "#8b5cf6", dur: 9,  delay: 2 },
          { size: 18, top: "25%", right: "9%", color: "#60a5fa", dur: 11, delay: 1 },
          { size: 8,  top: "60%", right: "6%", color: "#a78bfa", dur: 8,  delay: 3 },
          { size: 12, top: "85%", left: "30%", color: "#818cf8", dur: 10, delay: 1.5 },
          { size: 6,  top: "10%", left: "45%", color: "#c4b5fd", dur: 6,  delay: 0.5 },
        ].map((s, i) => (
          <div
            key={i}
            className="deco-shape"
            style={{
              width:  s.size,
              height: s.size,
              top:    s.top,
              left:   (s as any).left,
              right:  (s as any).right,
              background: s.color,
              borderRadius: i % 2 === 0 ? "3px" : "50%",
              animationDuration: `${s.dur}s`,
              animationDelay:    `${s.delay}s`,
              zIndex: 4,
            }}
          />
        ))}

        <Link to="/" className="back-home">← SchoolERP home</Link>

        {/* card */}
        <div className={`glass-card${mounted ? " mounted" : ""}`} style={{ "--a1": page.colors[0], "--a2": page.colors[1] } as React.CSSProperties}>

          {/* which door: school, region office, head office */}
          <nav className="level-tabs" aria-label="Sign-in pages">
            {LEVEL_ORDER.map((l) => (
              <Link key={l} to={LOGIN_PATH[l]} className={`level-tab${l === level ? " active" : ""}`} aria-current={l === level ? "page" : undefined}>
                {LOGIN_LEVEL_LABEL[l]}
              </Link>
            ))}
          </nav>

          {/* icon */}
          <div className="icon-ring" aria-hidden>
            {level === "school" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
            ) : level === "region" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="m12 2 8 5H4z"/></svg>
            )}
          </div>

          <h1 className="card-title">{page.title}</h1>
          <p className="card-sub">{page.sub}</p>

          <form onSubmit={onSubmit}>
            {/* school code */}
            <div className="field">
              <label htmlFor="organization">School code</label>
              <div className="input-wrap">
                <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg>
                <input id="organization" className="styled-input" value={organization} onChange={e => { setOrganization(e.target.value); clearError(); }} placeholder="e.g. greenwood" autoComplete="organization" disabled={!!mustChange} />
              </div>
            </div>

            {/* username */}
            <div className="field">
              <label htmlFor="username">Username</label>
              <div className="input-wrap">
                <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <input
                  id="username"
                  className={`styled-input${fieldError.field === "username" ? " err" : ""}`}
                  value={username}
                  onChange={e => { setUsername(e.target.value); clearError(); }}
                  placeholder="Employee code, admission no. or phone"
                  autoComplete="username"
                  autoFocus
                  disabled={!!mustChange}
                />
              </div>
              {fieldError.field === "username" && (
                <p className="err-msg">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {fieldError.message}
                </p>
              )}
              {wrongLevel && <Link to={LOGIN_PATH[wrongLevel]} className="wrong-level">Go to the {LOGIN_LEVEL_LABEL[wrongLevel]} login →</Link>}
            </div>

            {/* password */}
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="input-wrap">
                <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input
                  id="password"
                  type={showPass ? "text" : "password"}
                  className={`styled-input${fieldError.field === "password" ? " err" : ""}`}
                  value={password}
                  onChange={e => { setPassword(e.target.value); clearError(); }}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  style={{ paddingRight: "2.5rem" }}
                />
                <button type="button" className="eye-btn" onClick={() => setShowPass(v => !v)} aria-label="Toggle password">
                  {showPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
              {fieldError.field === "password" && (
                <p className="err-msg">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {fieldError.message}
                </p>
              )}
            </div>

            {mustChange && (
              <div className="field">
                <label htmlFor="newPassword">New password</label>
                <div className="input-wrap">
                  <input id="newPassword" type={showPass ? "text" : "password"} className="styled-input" value={newPassword} onChange={e => { setNewPassword(e.target.value); clearError(); }} placeholder="At least 8 characters, a letter and a number" autoComplete="new-password" />
                </div>
              </div>
            )}

            {/* show password */}
            <div className="toggle-row">
              <input type="checkbox" id="showPass" checked={showPass} onChange={e => setShowPass(e.target.checked)} />
              <label htmlFor="showPass">Show password</label>
            </div>

            {/* demo credentials */}
            <div className="demo-box">
              <p className="demo-label">{page.demoLabel}</p>
              <div className="chips">
                {page.demo.map(({ label, username: user }) => (
                  <button
                    key={label}
                    type="button"
                    className="chip"
                    onClick={() => { setOrganization("greenwood"); setUsername(user); setPassword(DEMO_PASSWORD); setMustChange(null); clearError(); }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? <><span className="spinner" />{mustChange ? "Saving…" : "Signing in…"}</> : mustChange ? "Save new password →" : "Sign in →"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}