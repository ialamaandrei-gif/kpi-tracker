import React, { useMemo, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Calendar, Layers } from "lucide-react";
import { Users } from "lucide-react";
import * as XLSX from "xlsx";
import welcomeImage from './welcome_image.png';

// ---------------- Periods ----------------
const PERIODS = ["Q3 '25", "Q2 '25", "Q1 '25", "Q4 '24", "Q3 '24", "Q2 '24"]; // current + 4 previous
const CURRENT_PERIOD = PERIODS[0];

// ---------------- Utilities ----------------
function euro(n) { 
  try { 
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0); 
  } catch { 
    return `€${Math.round(n || 0)}`; 
  } 
}

function estimateBonus(baseSalary, targetPct, achievement) { 
  const cap = 1.5; 
  return (Number(baseSalary) || 0) * (Number(targetPct) || 0) * Math.min(Number(achievement) || 0, cap); 
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '')
    .replace(/\u00A0/g, ' ')    
    .replace(/[^\d.,\-]/g, ''); 

  if (!s) return 0;

  const hasComma = s.includes(',');
  const hasDot   = s.includes('.');

  if (hasComma && hasDot) {
    s = s.replace(/,/g, '');
  } else if (hasComma && !hasDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function performanceTag(score) { 
  const s = Number(score) || 0; 
  if (s >= 0.9) return { label: "Great", tone: "green" }; 
  if (s >= 0.7) return { label: "Average", tone: "amber" }; 
  return { label: "Needs attention", tone: "red" }; 
}

function sumWeights(kpis) { 
  return (kpis || []).reduce((s, k) => s + (Number(k.weight) || 0), 0); 
}

// ---------- Table helpers (used by Direct Reports → Table View) ----------
function prevPeriod(p) {
  const i = PERIODS.indexOf(p);
  return (i < 0 || i + 1 >= PERIODS.length) ? null : PERIODS[i + 1];
}

const Th = (props) => (
  <th
    {...props}
    style={{
      textAlign: 'left',
      fontSize: 12,
      opacity: 0.7,
      padding: '10px 12px',
      ...(props.style || {})
    }}
  />
);

const Td = (props) => (
  <td
    {...props}
    style={{
      padding: '10px 12px',
      borderTop: '1px solid rgba(255,255,255,.06)',
      ...(props.style || {})
    }}
  />
);

const Badge = ({ tone = 'amber', children }) => {
  const bg =
    tone === 'green'
      ? 'rgba(0,200,0,.15)'
      : tone === 'red'
      ? 'rgba(255,0,0,.15)'
      : 'rgba(255,200,0,.15)';
  const bd =
    tone === 'green'
      ? 'rgba(0,200,0,.35)'
      : tone === 'red'
      ? 'rgba(255,0,0,.35)'
      : 'rgba(255,200,0,.35)';
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        background: bg,
        border: `1px solid ${bd}`
      }}
    >
      {children}
    </span>
  );
};

// ---------------- Style helpers ----------------
function btnStyle() { 
  return { 
    padding: '8px 12px', 
    borderRadius: 16, 
    border: '1px solid rgba(255,255,255,0.15)', 
    background: 'rgba(255,255,255,0.1)', 
    color: '#fff', 
    fontSize: 14, 
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  }; 
}

function inputStyle() { 
  return { 
    padding: '8px 10px', 
    borderRadius: 16, 
    border: '1px solid rgba(255,255,255,0.15)', 
    background: 'rgba(255,255,255,0.1)', 
    color: '#fff', 
    fontSize: 14, 
    outline: 'none',
    transition: 'all 0.2s ease'
  }; 
}

function cardMiniStyle() { 
  return { 
    padding: 12, 
    borderRadius: 16, 
    border: '1px solid rgba(255,255,255,0.1)', 
    background: 'rgba(255,255,255,0.05)', 
    backdropFilter: 'blur(12px)' 
  }; 
}

// ---------------- Self-tests ----------------
if (import.meta?.env?.DEV) {
  try {
    (function () {
      console.assert(Math.round(estimateBonus(100000, 0.1, 1.2)) === 12000, "estimateBonus 120%");
      console.assert(Math.round(estimateBonus(100000, 0.1, 0.8)) === 8000, "estimateBonus 80%");
      console.assert(Math.round(estimateBonus(100000, 0.1, 2.0)) === 15000, "estimateBonus capped");
      console.assert(performanceTag(1.15).label === 'Great');
      console.assert(performanceTag(0.95).label === 'Average');
      console.assert(performanceTag(0.85).label === 'Needs attention');
      const csvTest = [["a", "b"], ["1", "2"]].map(r => r.join(",")).join("\n");
      console.assert(csvTest.includes("\n"), "CSV should contain newline");
    })();
  } catch (e) {
    console.warn('Self-tests failed:', e);
  }
}

function StartScreen({ onImportClick, fileInputRef, onFile, isImporting }) {
  // --- Small logo mark used next to the heading ---
  function LogoMark({ className = '', size = 36 }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        {/* three chevrons / stacked bars mark */}
        <path d="M8 18l24 12 24-12" stroke="#C9D6FF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 30l24 12 24-12" stroke="#AEBBFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/>
        <path d="M8 42l24 12 24-12" stroke="#8FA0FF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".75"/>
      </svg>
    );
  }

  // --- Animated hero (growing bars + subtle arrow) ---
  function HeroBars({ className = '' }) {
    return (
      <svg
        viewBox="0 0 300 220"
        className={className}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="hbGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(169,181,255,0.85)"/>
            <stop offset="100%" stopColor="rgba(169,181,255,0.15)"/>
          </linearGradient>
          <style>{`
            @keyframes rise1 { from { height: 10px; y: 180px; } to { height: 80px; y: 110px; } }
            @keyframes rise2 { from { height: 10px; y: 180px; } to { height: 120px; y: 70px; } }
            @keyframes rise3 { from { height: 10px; y: 180px; } to { height: 160px; y: 30px; } }
            @keyframes floatArrow { 0% { transform: translateY(0) } 50% { transform: translateY(-6px) } 100% { transform: translateY(0) } }
            .bar { fill: url(#hbGrad); rx: 8px; }
          `}</style>
        </defs>

        {/* bars */}
        <rect className="bar" x="30"  y="110" width="48" height="80" style={{ animation: 'rise1 1.6s ease-out forwards' }} />
        <rect className="bar" x="110" y="70"  width="48" height="120" style={{ animation: 'rise2 1.8s ease-out forwards' }} />
        <rect className="bar" x="190" y="30"  width="48" height="160" style={{ animation: 'rise3 2.0s ease-out forwards' }} />

        {/* subtle up arrow */}
        <g style={{ transformOrigin: '240px 40px', animation: 'floatArrow 3s ease-in-out infinite' }}>
          <path d="M240 20 L260 40 L240 60" stroke="rgba(169,181,255,.9)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="240" y1="40" x2="200" y2="40" stroke="rgba(169,181,255,.9)" strokeWidth="6" strokeLinecap="round"/>
        </g>
      </svg>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #0b1440 60%, #0f172a 100%)',
        color: '#fff',
        display: 'grid',
        alignItems: 'flex-start',
        justifyItems: 'center',
        padding: 'clamp(16px, 4vw, 24px)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background decorative elements */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.1) 0%, transparent 50%)',
        pointerEvents: 'none'
      }} />
      
      {/* Floating particles */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `
          radial-gradient(2px 2px at 40px 60px, rgba(255,255,255,0.15), transparent),
          radial-gradient(2px 2px at 20px 50px, rgba(255,255,255,0.1), transparent),
          radial-gradient(2px 2px at 30px 100px, rgba(255,255,255,0.1), transparent),
          radial-gradient(2px 2px at 40px 60px, rgba(255,255,255,0.1), transparent),
          radial-gradient(2px 2px at 110px 90px, rgba(255,255,255,0.15), transparent),
          radial-gradient(2px 2px at 90px 40px, rgba(255,255,255,0.1), transparent)
        `,
        backgroundRepeat: 'repeat',
        backgroundSize: '200px 200px',
        animation: 'float 20s linear infinite',
        pointerEvents: 'none'
      }} />

      <div
        className="responsive-grid"
        style={{
          width: 'min(1200px, 95vw)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'clamp(24px, 4vw, 48px)',
          alignItems: 'flex-start',
          position: 'relative',
          zIndex: 1
        }}
      >
        {/* Left: Hero content with enhanced visual elements */}
        <div style={{ 
          position: 'relative', 
          minHeight: 350,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          paddingTop: 0 // Removed top padding to lift to the very top
        }}>
          {/* Main heading with enhanced typography */}
          <div style={{ marginBottom: 'clamp(20px, 5vw, 28px)' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 'clamp(12px, 3vw, 16px)', 
              marginBottom: 'clamp(10px, 2.5vw, 14px)',
              flexWrap: 'wrap'
            }}>
              <LogoMark size={48} />
              <h1 style={{ 
                fontSize: 'clamp(2rem, 8vw, 3.5rem)', 
                fontWeight: 800, 
                background: 'linear-gradient(135deg, #fff 0%, #a6b7ff 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                color: 'transparent',
                margin: 0,
                lineHeight: 1.1
              }}>
                KPI Tracker
              </h1>
            </div>
            <p style={{ 
              fontSize: 'clamp(1rem, 4vw, 1.3rem)', 
              opacity: 0.9, 
              lineHeight: 1.6,
              margin: 0,
              maxWidth: '90%'
            }}>
              Transform your team's performance data into actionable insights. 
              Track KPIs, manage bonuses, and drive success with our intuitive dashboard.
            </p>
          </div>

          {/* Hero illustration — positioned to the right inside this card */}
          <div style={{
            position: 'relative',
            marginTop: 'clamp(16px, 3vw, 20px)',
            display: 'flex',
            justifyContent: 'center'
          }}>
            <img
              src={welcomeImage}
              alt="Analytics illustration"
              style={{
                display: 'block',
                maxWidth: '72%',
                height: 'auto',
                borderRadius: 16,
                boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
            />
            {/* Glow effect behind image */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '100%',
              height: '100%',
              background: 'radial-gradient(circle, rgba(166, 183, 255, 0.1) 0%, transparent 70%)',
              filter: 'blur(40px)',
              zIndex: -1
            }} />
          </div>
        </div>

        {/* Right: Enhanced upload section */}
        <div style={{ 
          display: 'grid', 
          gap: 'clamp(20px, 4vw, 24px)',
          maxWidth: 500
        }}>
          {/* Feature highlights - moved to the right */}
          <div style={{ 
            display: 'grid', 
            gap: 'clamp(12px, 3vw, 16px)', 
            marginBottom: 'clamp(20px, 4vw, 24px)',
            padding: 'clamp(16px, 4vw, 20px)',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)',
            borderRadius: 'clamp(16px, 4vw, 20px)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(20px)'
          }}>
            <div style={{ 
              fontSize: 'clamp(14px, 3.5vw, 16px)', 
              fontWeight: 600, 
              marginBottom: 'clamp(12px, 3vw, 16px)',
              color: '#a6b7ff',
              textAlign: 'center'
            }}>
              ✨ Key Features
            </div>
            <div style={{ 
              display: 'grid', 
              gap: 'clamp(12px, 3vw, 16px)'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 'clamp(8px, 2vw, 12px)',
                padding: 'clamp(10px, 2.5vw, 12px) clamp(12px, 3vw, 16px)',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 'clamp(8px, 2vw, 12px)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                <div style={{ 
                  width: 'clamp(6px, 1.5vw, 8px)', 
                  height: 'clamp(6px, 1.5vw, 8px)', 
                  borderRadius: '50%', 
                  background: '#10b981',
                  flexShrink: 0
                }} />
                <span style={{ fontSize: 'clamp(12px, 3vw, 14px)', opacity: 0.9 }}>Real-time performance tracking</span>
              </div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 'clamp(8px, 2vw, 12px)',
                padding: 'clamp(10px, 2.5vw, 12px) clamp(12px, 3vw, 16px)',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 'clamp(8px, 2vw, 12px)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                <div style={{ 
                  width: 'clamp(6px, 1.5vw, 8px)', 
                  height: 'clamp(6px, 1.5vw, 8px)', 
                  borderRadius: '50%', 
                  background: '#3b82f6',
                  flexShrink: 0
                }} />
                <span style={{ fontSize: 'clamp(12px, 3vw, 14px)', opacity: 0.9 }}>Automated bonus calculations</span>
              </div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 'clamp(8px, 2vw, 12px)',
                padding: 'clamp(10px, 2.5vw, 12px) clamp(12px, 3vw, 16px)',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 'clamp(8px, 2vw, 12px)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                <div style={{ 
                  width: 'clamp(6px, 1.5vw, 8px)', 
                  height: 'clamp(6px, 1.5vw, 8px)', 
                  borderRadius: '50%', 
                  background: '#8b5cf6',
                  flexShrink: 0
                }} />
                <span style={{ fontSize: 'clamp(12px, 3vw, 14px)', opacity: 0.9 }}>Comprehensive reporting</span>
              </div>
            </div>
          </div>

          {/* Enhanced drop zone */}
          <div
            onClick={isImporting ? undefined : onImportClick}
            style={{
              cursor: isImporting ? 'not-allowed' : 'pointer',
              borderRadius: 'clamp(20px, 5vw, 28px)',
              border: '2px dashed rgba(166, 183, 255, 0.4)',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
              minHeight: 'clamp(192px, 40vw, 224px)', // Reduced by 20% from 240px-280px
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              padding: 'clamp(16px, 4vw, 26px)', // Reduced by 20% from 20px-32px
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              opacity: isImporting ? 0.6 : 1,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              backdropFilter: 'blur(20px)'
            }}
            onMouseEnter={(e) => {
              if (!isImporting) {
                e.target.style.borderColor = 'rgba(166, 183, 255, 0.7)';
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 12px 40px rgba(0,0,0,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isImporting) {
                e.target.style.borderColor = 'rgba(166, 183, 255, 0.4)';
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)';
              }
            }}
          >
            {/* Background pattern */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: `
                radial-gradient(circle at 20% 80%, rgba(166, 183, 255, 0.05) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.05) 0%, transparent 50%)
              `,
              pointerEvents: 'none'
            }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              {isImporting ? (
                <>
                  <div style={{ 
                    width: 'clamp(48px, 12vw, 64px)', 
                    height: 'clamp(48px, 12vw, 64px)', 
                    border: '3px solid rgba(166, 183, 255, 0.3)', 
                    borderTop: '3px solid #a6b7ff', 
                    borderRadius: '50%', 
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto clamp(16px, 4vw, 20px)'
                  }} />
                  <div style={{ 
                    fontSize: 'clamp(16px, 4vw, 20px)', 
                    fontWeight: 700, 
                    marginBottom: 'clamp(6px, 1.5vw, 8px)', 
                    color: '#a6b7ff' 
                  }}>
                    Importing...
                  </div>
                  <div style={{ 
                    opacity: 0.8, 
                    fontSize: 'clamp(14px, 3.5vw, 16px)' 
                  }}>
                    Please wait while we process your data
                  </div>
                </>
              ) : (
                <>
                  <div style={{ 
                    width: 'clamp(64px, 16vw, 80px)', 
                    height: 'clamp(64px, 16vw, 80px)', 
                    background: 'linear-gradient(135deg, rgba(166, 183, 255, 0.2) 0%, rgba(166, 183, 255, 0.1) 100%)',
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    margin: '0 auto clamp(20px, 5vw, 24px)',
                    border: '2px solid rgba(166, 183, 255, 0.3)'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14,2 14,8 20,8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10,9 9,9 8,9" />
                    </svg>
                  </div>
                  <div style={{ 
                    fontSize: 'clamp(18px, 4.5vw, 22px)', 
                    fontWeight: 700, 
                    marginBottom: 'clamp(10px, 2.5vw, 12px)', 
                    color: '#fff' 
                  }}>
                    Drop your Excel file here
                  </div>
                  <div style={{ 
                    opacity: 0.8, 
                    fontSize: 'clamp(14px, 3.5vw, 16px)', 
                    marginBottom: 'clamp(12px, 3vw, 16px)' 
                  }}>
                    or click to browse files
                  </div>
                  <div style={{ 
                    fontSize: 'clamp(12px, 3vw, 14px)', 
                    opacity: 0.6,
                    padding: 'clamp(6px, 1.5vw, 8px) clamp(12px, 3vw, 16px)',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 'clamp(16px, 4vw, 20px)',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    Supports .xlsx and .xls files
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Enhanced tips section */}
          <div
            style={{
              borderRadius: 'clamp(20px, 5vw, 24px)',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)',
              padding: 'clamp(20px, 5vw, 24px)',
              display: 'grid',
              gap: 'clamp(16px, 4vw, 20px)',
              fontSize: 'clamp(12px, 3vw, 14px)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 'clamp(6px, 1.5vw, 8px)' }}>
              <div style={{ 
                fontSize: 'clamp(14px, 3.5vw, 16px)', 
                fontWeight: 600, 
                marginBottom: 'clamp(6px, 1.5vw, 8px)',
                color: '#a6b7ff'
              }}>
                📊 What to include in your file
              </div>
            </div>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: 'clamp(16px, 4vw, 20px)' 
            }}>
              <div>
                <div style={{ 
                  opacity: 0.8, 
                  marginBottom: 'clamp(8px, 2vw, 12px)', 
                  fontSize: 'clamp(11px, 2.5vw, 13px)',
                  fontWeight: 500,
                  color: '#a6b7ff'
                }}>
                  Required Sheets:
                </div>
                <div style={{ 
                  display: 'grid', 
                  gap: 'clamp(6px, 1.5vw, 8px)' 
                }}>
                  {['Teams', 'KPIs', 'Employees'].map((item, i) => (
                    <div key={i} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 'clamp(6px, 1.5vw, 8px)',
                      fontSize: 'clamp(11px, 2.5vw, 13px)'
                    }}>
                      <div style={{ 
                        width: 'clamp(4px, 1vw, 6px)', 
                        height: 'clamp(4px, 1vw, 6px)', 
                        borderRadius: '50%', 
                        background: '#10b981',
                        flexShrink: 0
                      }} />
                      <span style={{ opacity: 0.9 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <div style={{ 
                  opacity: 0.8, 
                  marginBottom: 'clamp(8px, 2vw, 12px)', 
                  fontSize: 'clamp(11px, 2.5vw, 13px)',
                  fontWeight: 500,
                  color: '#a6b7ff'
                }}>
                  Optional Data:
                </div>
                <div style={{ 
                  display: 'grid', 
                  gap: 'clamp(6px, 1.5vw, 8px)' 
                }}>
                  {['KPI History', 'Bonus Records'].map((item, i) => (
                    <div key={i} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 'clamp(6px, 1.5vw, 8px)',
                      fontSize: 'clamp(11px, 2.5vw, 13px)'
                    }}>
                      <div style={{ 
                        width: 'clamp(4px, 1vw, 6px)', 
                        height: 'clamp(4px, 1vw, 6px)', 
                        borderRadius: '50%', 
                        background: '#3b82f6',
                        flexShrink: 0
                      }} />
                      <span style={{ opacity: 0.7 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced template link */}
          <div style={{ 
            textAlign: 'center', 
            padding: 'clamp(4px, 1vw, 8px)', 
            background: 'rgba(166, 183, 255, 0.05)',
            borderRadius: 'clamp(4px, 1vw, 8px)',
            border: '1px solid rgba(166, 183, 255, 0.1)',
            maxWidth: '60%', 
            margin: '0 auto'
          }}>
            <a
              href="https://docs.google.com/spreadsheets/d/1r1bCHKxGu1F4M7w0iwekRr6HgJ6jSL-7tcm8BcP27tc/edit?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'clamp(4px, 1vw, 6px)',
                fontSize: 'clamp(12px, 3vw, 14px)',
                fontWeight: 500,
                color: '#a6b7ff',
                textDecoration: 'none',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.color = '#fff';
                e.target.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.color = '#a6b7ff';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14,2 14,8 20,8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10,9 9,9 8,9" />
              </svg>
              Download Excel Template
            </a>
          </div>
        </div>
      </div>

      {/* Add CSS animations */}
      <style>{`
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        /* Responsive design improvements */
        @media (max-width: 768px) {
          .responsive-grid {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
          
          .mobile-stack {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          
          .mobile-text-center {
            text-align: center !important;
          }
        }
        
        @media (max-width: 480px) {
          .mobile-padding {
            padding: 16px !important;
          }
          
          .mobile-font {
            font-size: clamp(14px, 4vw, 16px) !important;
          }
        }
      `}</style>
    </div>
  );
}

// ---------------- App ----------------
export default function App() {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [period, setPeriod] = useState(CURRENT_PERIOD);
  const [showKpiDetails, setShowKpiDetails] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [teamKpis, setTeamKpis] = useState({});
  const [teamSettings, setTeamSettings] = useState({});
  const [managers, setManagers] = useState({});
  const [employees, setEmployees] = useState([]);
  const fileInputRef = useRef(null);
  const [page, setPage] = useState('manager');

async function handleImport(e) {
  try {
    setIsImporting(true);
    const file = e.target?.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      throw new Error('Please select a valid Excel file (.xlsx or .xls)');
    }
    
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });
    const get = (name) =>
      wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }) : [];

    // ---- Read sheets ----
    const teamsRows      = get('Teams');        // Team, BonusPoolEUR?
    const kpisRows       = get('KPIs');         // Team, KPI_ID, Name, Description, Weight, Target, Unit, Source, Direction
    const employeesRows  = get('Employees');    // EmployeeID, Name, Title, Team, BaseSalary, BonusTargetPct
    const histRows       = get('KPIHistory');   // EmployeeID, Period, Score
    const kpiDataRows    = get('KPIData');      // EmployeeID, Period, KPI_ID, AchievementPercent (NEW)

    // Validate required sheets exist
    if (!teamsRows.length && !kpisRows.length && !employeesRows.length) {
      throw new Error('No valid data found. Please ensure your Excel file contains at least one of: Teams, KPIs, or Employees sheets.');
    }

    // ---- Build teams list ----
    const teamSet = new Set();
    teamsRows.forEach(r => r.Team && teamSet.add(String(r.Team).trim()));
    kpisRows.forEach(r => r.Team && teamSet.add(String(r.Team).trim()));
    employeesRows.forEach(r => r.Team && teamSet.add(String(r.Team).trim()));

    const teamsArray = Array.from(teamSet).filter(Boolean);
    
    if (teamsArray.length === 0) {
      throw new Error('No valid teams found in the data.');
    }
    
    setTeams(teamsArray);

    // Ensure current selection is valid
    setSelectedTeam(prev => teamsArray.includes(prev) ? prev : (teamsArray[0] || null));

 // ---- Team settings (bonus pool) + Managers (from Teams sheet) ----


// Parse money cells like "€ 43,810.04" or "43.810,04"
const parseEUR = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;

  let s = String(v).trim();

  // remove currency symbols and spaces, keep digits, dot, comma, minus
  s = s.replace(/[^\d.,-]/g, '');

  // if both '.' and ',' exist, assume ',' is thousands separator -> remove commas
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/,/g, '');
  } else {
    // otherwise treat comma as decimal
    s = s.replace(',', '.');
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const newSettings = {};
const newManagers = {};

teamsRows.forEach((r) => {
  const team = String(r.Team || '').trim();
  if (!team) return;

  newSettings[team] = {
    bonusPoolEUR: parseEUR(r.BonusPoolEUR),
  };

  newManagers[team] = {
    name: String(r.ManagerName || '').trim(),
    title: String(r.ManagerTitle || '').trim(),
  };
});

// Backfill any teams that had no rows
teamsArray.forEach((t) => {
  if (!newSettings[t]) newSettings[t] = { bonusPoolEUR: 0 };
  if (!newManagers[t]) newManagers[t] = { name: '', title: '' };
});

setTeamSettings(newSettings);
setManagers(newManagers);


    // ---- KPI catalog per team ----
    const newTeamKpis = {};
    kpisRows.forEach(r => {
      if (!r.Team) return;
      if (!newTeamKpis[r.Team]) newTeamKpis[r.Team] = [];
      newTeamKpis[r.Team].push({
        id: String(r.KPI_ID || `${r.Team}_${r.Name}`),
        name: r.Name || '',
        description: r.Description || '',
        weight: Number(r.Weight) || 0,
        target: Number(r.Target) || 0,
        unit: r.Unit || '',
        source: r.Source || 'Manual',
        direction: (String(r.Direction || 'higher').toLowerCase() === 'lower') ? 'lower' : 'higher'
      });
    });
    setTeamKpis(newTeamKpis);

    // ---- Employees + history ----
const histByEmp = {};
const kpiDataByEmp = {};

// Parse KPI-specific data first
kpiDataRows.forEach(r => {
  const id = String(r.EmployeeID || '').trim();
  const periodVal = String(r.Period || '').trim();
  const kpiId = String(r.KPI_ID || '').trim();
  const achievementVal = Number(r.AchievementPercent) || 0;
  
  if (!id || !periodVal || !kpiId) return;
  
  if (!kpiDataByEmp[id]) kpiDataByEmp[id] = {};
  if (!kpiDataByEmp[id][periodVal]) kpiDataByEmp[id][periodVal] = {};
  
  kpiDataByEmp[id][periodVal][kpiId] = achievementVal / 100; // Convert percentage to decimal
});

// Parse overall history (now only for periods, bonus will be calculated automatically)
histRows.forEach(r => {
  const id = String(r.EmployeeID || '').trim();
  if (!id) return;

  const periodVal = String(r.Period || '').trim();
  
  // We'll calculate score and bonus automatically, so we don't need these from Excel
  // const scoreVal = Number(r.AchievementPercent) || Number(r.Score) || 0;
  // const bonusPaidVal = Number(r.BonusPaid) || 0;

  if (!histByEmp[id]) histByEmp[id] = [];
  
  // Check if we already have an entry for this period
  const existingEntry = histByEmp[id].find(h => h.period === periodVal);
  if (!existingEntry) {
    histByEmp[id].push({
      period: periodVal,
      // score and bonusPaid will be calculated automatically below
    });
  }
});

// Now calculate overall achievements and bonuses automatically
Object.keys(histByEmp).forEach(empId => {
  histByEmp[empId].forEach(histEntry => {
    const period = histEntry.period;
    
    // Get KPI data for this employee and period
    if (kpiDataByEmp[empId] && kpiDataByEmp[empId][period]) {
      const kpiData = kpiDataByEmp[empId][period];
      histEntry.kpis = kpiData;
      
      // Calculate overall achievement as weighted average of KPI achievements
      const kpiIds = Object.keys(kpiData);
      if (kpiIds.length > 0) {
        // Find the team for this employee to get KPI weights
        const employee = employeesRows.find(e => String(e.EmployeeID || '').trim() === empId);
        if (employee) {
          const team = String(employee.Team || '').trim();
          const teamKpis = kpisRows.filter(k => String(k.Team || '').trim() === team);
          
          let totalWeightedScore = 0;
          let totalWeight = 0;
          
          kpiIds.forEach(kpiId => {
            const achievement = kpiData[kpiId];
            const kpiConfig = teamKpis.find(k => String(k.KPI_ID || '').trim() === kpiId);
            const weight = Number(kpiConfig?.Weight || 0);
            
            totalWeightedScore += achievement * weight;
            totalWeight += weight;
          });
          
          // Calculate overall achievement
          const overallAchievement = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
          histEntry.score = overallAchievement;
          
          // Calculate bonus automatically
          const baseSalary = Number(employee.BaseSalary || 0);
          const bonusTargetPct = Number(employee.BonusTargetPct || 0);
          const calculatedBonus = Math.round(estimateBonus(baseSalary, bonusTargetPct, overallAchievement));
          histEntry.bonusPaid = calculatedBonus;
          
        }
      }
    }
  });
});


    const newEmployees = employeesRows.map(r => ({
      id: String(r.EmployeeID || ''),
      name: r.Name || '',
      title: r.Title || '',
      team: r.Team || '',
      baseSalary: Number(r.BaseSalary) || 0,
      bonusTargetPct: Number(r.BonusTargetPct) || 0,
      history: histByEmp[String(r.EmployeeID || '')] || []
    })).filter(e => e.id && e.team);

    setEmployees(newEmployees);

    // Optionally: keep selectedTeam valid AFTER employees are loaded
    setSelectedTeam(prev => {
      if (prev && teamsArray.includes(prev)) return prev;
      return (teamsArray[0] || null);
    });

  } catch (err) {
    console.error('Import failed:', err);
    
    // Provide more user-friendly error messages
    let errorMessage = 'Import failed: ';
    if (err.message.includes('valid Excel file')) {
      errorMessage += 'Please select a valid Excel file (.xlsx or .xls)';
    } else if (err.message.includes('No valid data found')) {
      errorMessage += 'No valid data found. Please check your Excel file format.';
    } else if (err.message.includes('No valid teams found')) {
      errorMessage += 'No valid teams found in the data.';
    } else {
      errorMessage += err?.message || 'Unknown error occurred';
    }
    
    alert(errorMessage);
  } finally {
    setIsImporting(false);
    // reset file input value so the same file can be selected again
    if (e.target) {
      e.target.value = '';
    }
  }
}


  return (
    <>
      {/* Hidden file input for import functionality */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xls,.xlsx"
        onChange={handleImport}
        style={{ display: 'none' }}
      />
      
      {/* Render StartScreen when no team is selected */}
      {(!selectedTeam || teams.length === 0) ? (
        <StartScreen
          onImportClick={() => fileInputRef.current?.click()}
          fileInputRef={fileInputRef}
          onFile={handleImport}
          isImporting={isImporting}
        />
      ) : (
        <>
          {(() => {
            const managerForPage = managers?.[selectedTeam] || { name: '', title: '' };
            return (
              <div style={{ minHeight: '100vh', color: '#fff', background: 'linear-gradient(135deg, #0f172a 0%, #0b1440 60%, #0f172a 100%)' }}>
                {/* Top bar */}
                <div style={{ position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ maxWidth: 1120, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Layers style={{ width: 24, height: 24 }} />
                    <div style={{ fontWeight: 600, letterSpacing: 0.3 }}>KPI & Bonus</div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        style={{
                          ...btnStyle(),
                          opacity: isImporting ? 0.6 : 1,
                          cursor: isImporting ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isImporting ? 'Importing...' : 'Import data'}
                      </button>
                      <PeriodSelector period={period} onChange={setPeriod} />
                      <TeamSelector value={selectedTeam} teams={teams} onChange={setSelectedTeam} />
                    </div>
                  </div>
                </div>

                <main style={{ maxWidth: 1120, margin: '0 auto', padding: 16 }}>
                  {page === 'manager' ? (
                    <ManagerDashboard
                      manager={managerForPage}
                      team={selectedTeam}
                      period={period}
                      showKpiDetails={showKpiDetails}
                      setShowKpiDetails={setShowKpiDetails}
                      teamKpis={teamKpis}
                      teamBonusPoolProp={teamSettings[selectedTeam]?.bonusPoolEUR ?? 0}
                      employees={employees}
                      managers={managers}
                      onEditKpis={() => setPage('editor')}
                    />
                  ) : (
                    <KpiEditor
                      team={selectedTeam}
                      teamKpis={teamKpis}
                      bonusPool={teamSettings[selectedTeam]?.bonusPoolEUR ?? 0}
                      onCancel={() => setPage('manager')}
                      onSave={(kpis, bonusPoolEUR) => {
                        setTeamKpis(prev => ({ ...prev, [selectedTeam]: kpis }));
                        setTeamSettings(prev => ({ 
                          ...prev, 
                          [selectedTeam]: { 
                            ...prev[selectedTeam], 
                            bonusPoolEUR 
                          } 
                        }));
                        setPage('manager');
                      }}
                    />
                  )}
                </main>
              </div>
            );
          })()}
        </>
      )}
    </>
  );
}

// ---------------- Manager Dashboard ----------------
function ManagerDashboard({ manager, team, period, showKpiDetails, setShowKpiDetails, teamKpis, teamBonusPoolProp, employees, onEditKpis, managers }) {
  const [viewMode, setViewMode] = useState('cards');
  const [openEmp, setOpenEmp] = useState(null);
  const [showEmployeeDetails, setShowEmployeeDetails] = useState(false);
  const reports = employees.filter(e => e.team === team);
  const [statusFilter, setStatusFilter] = useState('All');
  const [tableView, setTableView] = useState(false);
  const teamSummary = useMemo(() => {
    const headcount = reports.length;
    if (headcount === 0) {
      return { headcount: 0, avgScore: 0, avgBonus: 0, totalBonus: 0 };
    }
    
    const scores = reports.map(e => e.history.find(h => h.period === period)?.score ?? 0);
    const avgScore = scores.reduce((s, v) => s + v, 0) / headcount;
    
    const estBonuses = reports.map(e => { 
      const h = e.history.find(h => h.period === period);
      if (h && (h.bonusPaid || h.bonusPaid === 0)) {
        return Math.round(h.bonusPaid);
      }
      const ach = h?.score ?? 0;
      return Math.round(estimateBonus(e.baseSalary, e.bonusTargetPct, ach)); 
    });
    
    const avgBonus = estBonuses.reduce((s, v) => s + v, 0) / headcount;
    const totalBonus = Math.round(estBonuses.reduce((s, v) => s + v, 0));
    
    return { headcount, avgScore, avgBonus, totalBonus };
  }, [reports, period, teamBonusPoolProp]);
  const bonusPool = Number(teamBonusPoolProp) || 0;

  const filteredReports = useMemo(() => {
    return reports
      .filter(e => {
        if (statusFilter === 'All') return true;
        const ach = e.history.find(h => h.period === period)?.score ?? 0;
        return performanceTag(ach).label === statusFilter;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [reports, statusFilter, period]);

  function exportCSV() {
    try {
      if (!filteredReports.length) {
        alert('No data to export');
        return;
      }
      
      const rows = [
        ["Name", "Title", "Team", "Achievement %", "Est. Bonus EUR", "Status"], 
        ...filteredReports.map(e => {
          const ach = e.history.find(h => h.period === period)?.score ?? 0;
          const h = e.history.find(h => h.period === period);
          const est = (h && (h.bonusPaid || h.bonusPaid === 0))
            ? Math.round(h.bonusPaid)
            : Math.round(estimateBonus(e.baseSalary, e.bonusTargetPct, ach));
          const tag = performanceTag(ach);
          return [
            e.name || '', 
            e.title || '', 
            e.team || '', 
            Math.round(ach * 100), 
            est, 
            tag.label
          ];
        })
      ];
      
      const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join("\n");
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; 
      a.download = `${team}_${period}_team_report.csv`; 
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + (error?.message || 'Unknown error'));
    }
  }
const mgr = managers[team] || {};
const kpis = teamKpis[team] || [];
const teamBonusPool = teamBonusPoolProp || 0;

  // Handle opening employee details
  const handleOpenEmployee = (employee, period) => {
    setOpenEmp({ employee, period });
    setShowEmployeeDetails(true);
  };

  // Handle closing employee details
  const handleCloseEmployee = () => {
    setShowEmployeeDetails(false);
    setOpenEmp(null);
  };

  // If showing employee details, render that instead of the dashboard
  if (showEmployeeDetails && openEmp) {
    return (
      <EmployeeDetails
        employee={openEmp.employee}
        period={openEmp.period}
        kpis={kpis}
        onClose={handleCloseEmployee}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'clamp(12px, 3vw, 16px)' }}>
      <HeaderCard
  title={`${mgr.name || '—'}${mgr.title ? ' · ' + mgr.title : ''}`}
  subtitle={`Team · ${team || '—'} — Period: ${period}`}
  right={
    <div style={{ 
      display: 'flex', 
      gap: 'clamp(6px, 1.5vw, 8px)', 
      flexWrap: 'wrap',
      justifyContent: 'flex-end'
    }}>
      <button onClick={() => setShowKpiDetails(!showKpiDetails)} style={btnStyle()}>
        View KPI system for this team
      </button>
      <button onClick={exportCSV} style={btnStyle()}>
        Export CSV
      </button>
    </div>
  }/>

      {showKpiDetails && (
        <GlassCard>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            marginBottom: 'clamp(8px, 2vw, 12px)',
            flexWrap: 'wrap',
            gap: 'clamp(8px, 2vw, 12px)'
          }}>
            <div style={{ 
              color: 'rgba(255,255,255,0.7)', 
              fontSize: 'clamp(12px, 3vw, 14px)' 
            }}>
              Current KPI System — {team}
            </div>
            <button onClick={onEditKpis} style={btnStyle()}>Edit KPI system</button>
          </div>
          {!kpis.length && (  <div style={{ opacity: .7, fontSize: 'clamp(10px, 2.5vw, 12px)', marginBottom: 'clamp(8px, 2vw, 12px)' }}> No KPIs configured for this team. </div>)}

          <div style={{ 
            display: 'grid', 
            gap: 'clamp(8px, 2vw, 12px)', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' 
          }}>
            {kpis.map(k => (
                   <div key={k.id} style={cardMiniStyle()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ 
            fontSize: 'clamp(10px, 2.5vw, 12px)', 
            color: 'rgba(255,255,255,0.6)' 
          }}>
            Weight {Math.round((k.weight || 0) * 100)}%
          </div>
        </div>
                <div style={{ 
                  fontSize: 'clamp(10px, 2.5vw, 12px)', 
                  color: 'rgba(255,255,255,0.6)', 
                  marginTop: 4 
                }}>
                  {k.description}
                </div>
                <div style={{ 
                  fontSize: 'clamp(10px, 2.5vw, 12px)', 
                  color: 'rgba(255,255,255,0.6)', 
                  marginTop: 4 
                }}>
                  Target: {k.target}{k.unit ? ` ${k.unit}` : ''} · Direction: {k.direction === 'higher' ? '↑ higher better' : '↓ lower better'}
                </div>
                <div style={{ 
                  fontSize: 'clamp(9px, 2vw, 11px)', 
                  color: 'rgba(255,255,255,0.5)', 
                  marginTop: 4 
                }}>
                  Source: {k.source}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Metrics (responsive grid) */}
      <div style={{ 
        display: 'grid', 
        gap: 'clamp(12px, 3vw, 16px)', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' 
      }}>
        <GlassMetric title="Headcount" value={String(teamSummary.headcount)} />
        <GlassMetric title="Avg Achievement" value={`${Math.round(teamSummary.avgScore * 100)}%`} />
        <GlassMetric title="Avg Bonus" value={euro(Math.round(teamSummary.avgBonus))} />
        <GlassMetric title="Total Bonus" value={euro(Math.round(teamSummary.totalBonus))} />
      </div>

      <GlassCard>
       <div style={{ 
         display: 'flex', 
         alignItems: 'center', 
         justifyContent: 'space-between', 
         marginBottom: 'clamp(8px, 2vw, 12px)',
         flexWrap: 'wrap',
         gap: 'clamp(8px, 2vw, 12px)'
       }}>
  <div style={{ 
    display: 'flex', 
    alignItems: 'center', 
    gap: 'clamp(6px, 1.5vw, 8px)', 
    color: 'rgba(255,255,255,0.7)', 
    fontSize: 'clamp(12px, 3vw, 14px)',
    flexWrap: 'wrap'
  }}>
    Direct Reports — {period}
    <button 
      onClick={() => setTableView(prev => !prev)} 
      style={{ 
        ...btnStyle(), 
        padding: 'clamp(2px, 0.5vw, 4px) clamp(6px, 1.5vw, 8px)', 
        fontSize: 'clamp(10px, 2.5vw, 12px)' 
      }}
    >
      {tableView ? 'Card View' : 'Table View'}
    </button>
  </div>
  <select 
    value={statusFilter} 
    onChange={(e) => setStatusFilter(e.target.value)} 
    style={inputStyle()}
  >
    <option>All</option><option>Great</option><option>Average</option><option>Needs attention</option>
  </select>
</div>
       {!tableView ? (
  <div style={{ 
    display:'grid', 
    gap: 'clamp(12px, 3vw, 16px)', 
    gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))' 
  }}>
    {filteredReports.map(e => (
      <ReportCard
        key={e.id}
        e={e}
        period={period}
        onOpen={() => handleOpenEmployee(e, period)}
      />
    ))}
  </div>
) : (
  <div style={{ 
    overflow:'auto', 
    borderRadius:'clamp(12px, 3vw, 16px)', 
    border:'1px solid rgba(255,255,255,.12)' 
  }}>
    <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0 }}>
      <thead style={{ position:'sticky', top:0, backdropFilter:'blur(8px)' }}>
        <tr>
          <Th>Name</Th><Th>Title</Th><Th>Team</Th>
          <Th>Achv. %</Th><Th>Δ vs prev</Th><Th>Est. Bonus</Th><Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {filteredReports.map(e => {
          const ach = (e.history || []).find(h => h.period === period)?.score ?? 0;
          const prevP = prevPeriod(period);
          const prev = prevP ? (e.history || []).find(h => h.period === prevP)?.score ?? null : null;
          const delta = prev == null ? null : (ach - prev) * 100;
          const tag = performanceTag(ach);
          const est = Math.round(estimateBonus(e.baseSalary, e.bonusTargetPct, ach));
          return (
            <tr key={e.id}
                onClick={() => handleOpenEmployee(e, period)}
                style={{ cursor:'pointer' }}>
              <Td style={{ fontWeight:600 }}>{e.name}</Td>
              <Td>{e.title}</Td>
              <Td>{e.team}</Td>
              <Td>{Math.round(ach*100)}%</Td>
              <Td style={{ color: delta==null ? 'inherit' : (delta >= 0 ? '#39d353' : '#ff6b6b') }}>
                {delta==null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp`}
              </Td>
              <Td>{euro(est)}</Td>
              <Td><Badge tone={tag.tone}>{tag.label}</Badge></Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
)}
      </GlassCard>
    </div>
  );
}

// ---------------- KPI Editor ----------------
function KpiEditor({ team, teamKpis, bonusPool, onCancel, onSave }) {
  const [rows, setRows] = useState((teamKpis[team] || []).map(k => ({ ...k })));
  const [pool, setPool] = useState(bonusPool);
  const totalWeight = sumWeights(rows);
  
  function updateRow(i, patch) { setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r)); }
  function addRow() { setRows(prev => [...prev, { id: `${team}_kpi_${Date.now()}`, name: "New KPI", description: "", weight: 0.1, target: 0, unit: "", source: "Manual", direction: "higher" }]); }
  function removeRow(i) { setRows(prev => prev.filter((_, idx) => idx !== i)); }

  return (
    <div style={{ display: 'grid', gap: 'clamp(12px, 3vw, 16px)' }}>
      <HeaderCard 
        title={`Edit KPI System — ${team}`} 
        subtitle={`Adjust KPIs and bonus pool`} 
        right={
          <button onClick={onCancel} style={btnStyle()}>
            <span style={{ opacity: 0.8 }}>←</span> Back
          </button>
        } 
      />

      <GlassCard>
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          alignItems: 'center', 
          gap: 'clamp(8px, 2vw, 12px)' 
        }}>
          <input 
            type="number" 
            value={pool} 
            onChange={e => setPool(Number(e.target.value) || 0)} 
            style={inputStyle()} 
          />
          <div style={{ 
            fontSize: 'clamp(10px, 2.5vw, 12px)', 
            padding: 'clamp(2px, 0.5vw, 4px) clamp(6px, 1.5vw, 8px)', 
            borderRadius: 'clamp(8px, 2vw, 12px)', 
            border: '1px solid rgba(255,255,255,0.2)', 
            background: Math.abs(totalWeight - 1) < 0.001 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)', 
            color: Math.abs(totalWeight - 1) < 0.001 ? 'rgb(209,250,229)' : 'rgb(254,243,199)' 
          }}>
            Total weight: {(totalWeight * 100).toFixed(0)}% {Math.abs(totalWeight - 1) < 0.001 ? '✓' : '(should be 100%)'}
          </div>
          <button 
            onClick={addRow} 
            style={{ 
              ...btnStyle(), 
              marginLeft: 'auto' 
            }}
          >
            Add KPI
          </button>
        </div>
      </GlassCard>

      <div style={{ display: 'grid', gap: 'clamp(8px, 2vw, 12px)' }}>
        {rows.map((k, i) => (
          <GlassCard key={k.id}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
              gap: 'clamp(8px, 2vw, 12px)', 
              alignItems: 'center' 
            }}>
              <input 
                value={k.name} 
                onChange={e => updateRow(i, { name: e.target.value })} 
                style={{ ...inputStyle() }} 
                placeholder="Name" 
              />
              <input 
                value={k.description} 
                onChange={e => updateRow(i, { description: e.target.value })} 
                style={{ ...inputStyle() }} 
                placeholder="Description" 
              />
              <input 
                type="number" 
                value={k.target} 
                onChange={e => updateRow(i, { target: Number(e.target.value) })} 
                style={{ ...inputStyle() }} 
                placeholder="Target" 
              />
              <input 
                value={k.unit || ""} 
                onChange={e => updateRow(i, { unit: e.target.value })} 
                style={{ ...inputStyle() }} 
                placeholder="Unit" 
              />
              <input 
                type="number" 
                step="0.01" 
                value={k.weight} 
                onChange={e => updateRow(i, { weight: Number(e.target.value) })} 
                style={{ ...inputStyle() }} 
                placeholder="Weight (0..1)" 
              />
              <select 
                value={k.direction} 
                onChange={e => updateRow(i, { direction: e.target.value })} 
                style={{ ...inputStyle() }}
              >
                <option value="higher">Higher better</option>
                <option value="lower">Lower better</option>
              </select>
              <input 
                value={k.source} 
                onChange={e => updateRow(i, { source: e.target.value })} 
                style={{ ...inputStyle() }} 
                placeholder="Source" 
              />
              <button 
                onClick={() => removeRow(i)} 
                style={{ ...btnStyle() }}
              >
                Remove
              </button>
            </div>
          </GlassCard>
        ))}
      </div>

      <div style={{ 
        display: 'flex', 
        gap: 'clamp(6px, 1.5vw, 8px)',
        flexWrap: 'wrap'
      }}>
        <button onClick={onCancel} style={btnStyle()}>Cancel</button>
        <button onClick={() => onSave({ kpis: rows, bonusPoolEUR: Math.round(pool) })} style={btnStyle()}>Save changes</button>
      </div>
    </div>
  );
}

// ---------------- Report Card ----------------
function EmployeeDetails({ employee, period, kpis, onClose }) {
  const [selectedPeriod, setSelectedPeriod] = useState(period);
  const [notes, setNotes] = useState({});
  
  // Load existing notes from localStorage
  useEffect(() => {
    const savedNotes = localStorage.getItem(`notes_${employee.id}_${selectedPeriod}`);
    
    if (savedNotes) {
      setNotes(JSON.parse(savedNotes));
    } else {
      setNotes({}); // Initialize empty notes for this period
    }
  }, [employee.id, selectedPeriod]);

  // Save notes to localStorage
  const saveNotes = (newNotes) => {
    localStorage.setItem(`notes_${employee.id}_${selectedPeriod}`, JSON.stringify(newNotes));
  };

  const handleNoteChange = (kpiId, note) => {
    const newNotes = { ...notes, [kpiId]: note };
    setNotes(newNotes);
    saveNotes(newNotes);
  };

  const hist = (employee.history || []).find(h => h.period === selectedPeriod);
  const overall = hist?.score ?? 0;

  // Get KPI achievements from employee data (from Excel import)
  const getKpiAchievement = (kpiId) => {
    // Look for KPI data in employee history or specific KPI fields
    if (hist && hist.kpis && hist.kpis[kpiId] !== undefined) {
      return hist.kpis[kpiId];
    }
    
    // Try to find KPI data in the overall employee data structure
    if (employee.kpis && employee.kpis[selectedPeriod] && employee.kpis[selectedPeriod][kpiId] !== undefined) {
      return employee.kpis[selectedPeriod][kpiId];
    }
    
    // Fallback to overall score if no specific KPI data
    return overall;
  };

  // Calculate overall achievement based on KPI achievements and weights
  const calculateOverallAchievement = () => {
    if (!kpis || kpis.length === 0) return overall;
    
    let totalWeightedScore = 0;
    let totalWeight = 0;
    
    kpis.forEach(kpi => {
      const achievement = getKpiAchievement(kpi.id);
      const weight = kpi.weight || 0;
      totalWeightedScore += achievement * weight;
      totalWeight += weight;
    });
    
    return totalWeight > 0 ? totalWeightedScore / totalWeight : overall;
  };

  const overallAchievement = calculateOverallAchievement();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #0b1440 60%, #0f172a 100%)',
      color: '#fff',
      padding: 'clamp(16px, 4vw, 24px)'
    }}>
      {/* Header */}
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        marginBottom: 'clamp(24px, 6vw, 32px)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'clamp(12px, 3vw, 16px)',
          marginBottom: 'clamp(16px, 4vw, 20px)'
        }}>
          <div>
            <h1 style={{
              fontSize: 'clamp(2rem, 6vw, 2.5rem)',
              fontWeight: 700,
              margin: 0,
              marginBottom: 'clamp(4px, 1vw, 8px)'
            }}>
              {employee.name}
            </h1>
            <div style={{
              fontSize: 'clamp(14px, 3.5vw, 16px)',
              opacity: 0.8
            }}>
              {employee.title} · {employee.team} — {selectedPeriod}
            </div>
          </div>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(8px, 2vw, 12px)',
            flexWrap: 'wrap'
          }}>
            {/* Period Selector */}
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              style={{
                ...inputStyle(),
                fontSize: 'clamp(12px, 3vw, 14px)',
                padding: 'clamp(6px, 1.5vw, 8px) clamp(10px, 2.5vw, 12px)'
              }}
            >
              {PERIODS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            
            <button onClick={onClose} style={btnStyle()}>
              ← Back to Team
            </button>
          </div>
        </div>

        {/* Overall Achievement Card */}
        <GlassCard>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'clamp(16px, 4vw, 24px)',
            alignItems: 'center'
          }}>
            <div>
              <div style={{
                fontSize: 'clamp(14px, 3.5vw, 16px)',
                opacity: 0.8,
                marginBottom: 'clamp(8px, 2vw, 12px)'
              }}>
                Overall Achievement
              </div>
              <div style={{
                fontSize: 'clamp(2.5rem, 8vw, 3.5rem)',
                fontWeight: 700,
                color: '#a6b7ff'
              }}>
                {Math.round(overallAchievement * 100)}%
              </div>
            </div>
            
            <div>
              <div style={{
                fontSize: 'clamp(14px, 3.5vw, 16px)',
                opacity: 0.8,
                marginBottom: 'clamp(8px, 2vw, 12px)'
              }}>
                Base Salary & Max Bonus Percentage
              </div>
              <div style={{
                fontSize: 'clamp(1.2rem, 4vw, 1.5rem)',
                fontWeight: 600
              }}>
                {euro(employee.baseSalary)} · {Math.round(employee.bonusTargetPct * 100)}% max
              </div>
            </div>
            <div>
              <div style={{
                fontSize: 'clamp(14px, 3.5vw, 16px)',
                opacity: 0.8,
                marginBottom: 'clamp(8px, 2vw, 12px)'
              }}>
                Estimated Bonus
              </div>
              <div style={{
                fontSize: 'clamp(1.2rem, 4vw, 1.5rem)',
                fontWeight: 600,
                color: '#10b981'
              }}>
                {euro(Math.round(estimateBonus(employee.baseSalary, employee.bonusTargetPct, overallAchievement)))}
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* KPI Details */}
      <div style={{
        maxWidth: 1200,
        margin: '0 auto'
      }}>
        <div style={{
          display: 'grid',
          gap: 'clamp(16px, 4vw, 24px)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))'
        }}>
          {(kpis || []).map(kpi => (
            <GlassCard key={kpi.id}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 'clamp(12px, 3vw, 16px)',
                flexWrap: 'wrap',
                gap: 'clamp(8px, 2vw, 12px)'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 'clamp(16px, 4vw, 18px)',
                    fontWeight: 600,
                    marginBottom: 'clamp(4px, 1vw, 8px)'
                  }}>
                    {kpi.name}
                  </div>
                  <div style={{
                    fontSize: 'clamp(12px, 3vw, 14px)',
                    opacity: 0.8,
                    lineHeight: 1.5
                  }}>
                    {kpi.description}
                  </div>
                </div>
                
                <div style={{
                  fontSize: 'clamp(12px, 3vw, 14px)',
                  padding: 'clamp(4px, 1vw, 6px) clamp(8px, 2vw, 10px)',
                  background: 'rgba(166, 183, 255, 0.1)',
                  borderRadius: 'clamp(8px, 2vw, 12px)',
                  border: '1px solid rgba(166, 183, 255, 0.2)',
                  color: '#a6b7ff',
                  fontWeight: 500,
                  flexShrink: 0
                }}>
                  Weight {Math.round((kpi.weight || 0) * 100)}%
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 'clamp(12px, 3vw, 16px)',
                marginBottom: 'clamp(16px, 4vw, 20px)'
              }}>
                <div>
                  <div style={{
                    fontSize: 'clamp(12px, 3vw, 14px)',
                    opacity: 0.7,
                    marginBottom: 'clamp(4px, 1vw, 6px)'
                  }}>
                    Target
                  </div>
                  <div style={{
                    fontSize: 'clamp(14px, 3.5vw, 16px)',
                    fontWeight: 500
                  }}>
                    {kpi.target}{kpi.unit ? ` ${kpi.unit}` : ''}
                  </div>
                </div>
                
                <div>
                  <div style={{
                    fontSize: 'clamp(12px, 3vw, 14px)',
                    opacity: 0.7,
                    marginBottom: 'clamp(4px, 1vw, 6px)'
                  }}>
                    Direction
                  </div>
                  <div style={{
                    fontSize: 'clamp(14px, 3.5vw, 16px)',
                    fontWeight: 500,
                    color: kpi.direction === 'higher' ? '#10b981' : '#f59e0b'
                  }}>
                    {kpi.direction === 'higher' ? '↑ Higher better' : '↓ Lower better'}
                  </div>
                </div>
              </div>

              {/* KPI Achievement Display (Read-only from Excel data) */}
              <div style={{
                marginBottom: 'clamp(16px, 4vw, 20px)',
                width: '100%'
              }}>
                <div style={{
                  fontSize: 'clamp(12px, 3vw, 14px)',
                  opacity: 0.7,
                  marginBottom: 'clamp(6px, 1.5vw, 8px)'
                }}>
                  KPI Achievement (%)
                </div>
                <div style={{
                  width: '100%',
                  fontSize: 'clamp(14px, 3.5vw, 16px)',
                  padding: 'clamp(8px, 2vw, 12px)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 'clamp(8px, 2vw, 12px)',
                  color: '#a6b7ff',
                  fontWeight: 500,
                  cursor: 'default',
                  boxSizing: 'border-box'
                }}>
                  {Math.round(getKpiAchievement(kpi.id) * 100)}%
                </div>
              </div>

              {/* Notes Section */}
              <div style={{ width: '100%' }}>
                <div style={{
                  fontSize: 'clamp(12px, 3vw, 14px)',
                  opacity: 0.7,
                  marginBottom: 'clamp(6px, 1.5vw, 8px)'
                }}>
                  Notes for {selectedPeriod}
                </div>
                <textarea
                  value={notes[kpi.id] || ''}
                  onChange={(e) => handleNoteChange(kpi.id, e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: 'clamp(80px, 20vw, 100px)',
                    fontSize: 'clamp(12px, 3vw, 14px)',
                    padding: 'clamp(8px, 2vw, 12px)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 'clamp(8px, 2vw, 12px)',
                    color: '#fff',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                  placeholder={`Add notes about this KPI achievement for ${selectedPeriod}...`}
                />
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportCard({ e, period, onOpen }) {
  const hist = e.history.find(h => h.period === period);
  const ach  = hist?.score ?? 0;
  const est  = Math.round(estimateBonus(e.baseSalary, e.bonusTargetPct, ach));
  const tag  = performanceTag(ach);         
  const currentIndex = PERIODS.indexOf(period);
  const prevPeriod   = PERIODS[currentIndex + 1];
  const prevScore    = e.history.find(h => h.period === prevPeriod)?.score;
  const deltaPct     = prevScore != null ? ((ach - prevScore) * 100) : null;
  const deltaColor   = deltaPct == null ? 'rgba(255,255,255,0.6)' : (deltaPct >= 0 ? 'rgb(34,197,94)' : 'rgb(239,68,68)');

  return (
    <GlassCard>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 'clamp(8px, 2vw, 12px)'
      }}>
        <div>
          <button onClick={onOpen} style={{ 
            all: 'unset', 
            cursor: 'pointer', 
            fontSize: 'clamp(16px, 4vw, 20px)', 
            fontWeight: 700 
          }}>
            {e.name}
          </button>
          <div style={{ 
            fontSize: 'clamp(10px, 2.5vw, 12px)', 
            color: 'rgba(255,255,255,0.6)' 
          }}>
            {e.title} · {e.team}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ 
            fontSize: 'clamp(10px, 2.5vw, 12px)', 
            color: 'rgba(255,255,255,0.6)' 
          }}>
            Achievement
          </div>
          <div style={{ 
            fontSize: 'clamp(14px, 3.5vw, 18px)', 
            fontWeight: 600 
          }}>
            {Math.round(ach * 100)}%
          </div>
        </div>
      </div>
      <div style={{ 
        marginTop: 'clamp(6px, 1.5vw, 8px)', 
        display: 'flex', 
        alignItems: 'center', 
        gap: 'clamp(6px, 1.5vw, 8px)',
        flexWrap: 'wrap'
      }}>
       <Badge tone={tag.tone}>{tag.label}</Badge>

        {deltaPct != null && (
          <span style={{ 
            fontSize: 'clamp(10px, 2.5vw, 12px)', 
            color: deltaColor 
          }}>
            {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}% vs prev
          </span>
        )}
      </div>
      <div style={{ 
        marginTop: 'clamp(10px, 2.5vw, 12px)', 
        fontSize: 'clamp(12px, 3vw, 14px)' 
      }}>
        Est. Bonus: <span style={{ fontWeight: 600 }}>{euro(est)}</span>
      </div>
      <div style={{ 
        marginTop: 'clamp(6px, 1.5vw, 8px)', 
        height: 'clamp(6px, 1.5vw, 8px)', 
        borderRadius: 999, 
        background: 'rgba(255,255,255,0.1)', 
        overflow: 'hidden' 
      }}>
        <div style={{ 
          height: '100%', 
          background: 'rgba(255,255,255,0.7)', 
          width: `${Math.min(100, Math.round(ach * 100))}%` 
        }} />
      </div>
      <div style={{ 
        marginTop: 'clamp(10px, 2.5vw, 12px)', 
        height: 'clamp(72px, 18vw, 96px)' 
      }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={e.history.filter(h => PERIODS.includes(h.period))}>
            <XAxis dataKey="period" hide /><YAxis hide />
            <Tooltip contentStyle={{ 
              background: "rgba(10,10,30,0.9)", 
              borderRadius: 'clamp(8px, 2vw, 12px)', 
              border: "1px solid rgba(255,255,255,0.1)", 
              color: "white" 
            }} />
            <Area type="monotone" dataKey="score" stroke="currentColor" fill="currentColor" fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{ 
        marginTop: 'clamp(6px, 1.5vw, 8px)', 
        fontSize: 'clamp(10px, 2.5vw, 12px)', 
        color: 'rgba(255,255,255,0.6)' 
      }}>
        Bonus Target: {Math.round(e.bonusTargetPct * 100)}% · Base {euro(e.baseSalary)}
      </div>
    </GlassCard>
  );
}

// ---------------- Small components ----------------

function TeamSelector({ value, teams, onChange }) { return (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <Users style={{ width: 16, height: 16, opacity: 0.8 }} />
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle()}>{teams.map(t => (<option key={t} value={t}>{t}</option>))}</select>
  </div>
); }

function PeriodSelector({ period, onChange }) { return (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <Calendar style={{ width: 16, height: 16, opacity: 0.8 }} />
    <select value={period} onChange={(e) => onChange(e.target.value)} style={inputStyle()}>{PERIODS.map(p => (<option key={p} value={p}>{p}</option>))}</select>
  </div>
); }

function GlassMetric({ title, value }) { 
  return (
    <GlassCard>
      <div style={{ 
        fontSize: 'clamp(12px, 3vw, 14px)', 
        color: 'rgba(255,255,255,0.7)' 
      }}>
        {title}
      </div>
      <div style={{ 
        fontSize: 'clamp(20px, 5vw, 28px)', 
        fontWeight: 600, 
        marginTop: 'clamp(6px, 1.5vw, 8px)' 
      }}>
        {value}
      </div>
    </GlassCard>
  ); 
}

function HeaderCard({ title, subtitle, right }) { 
  return (
    <GlassCard>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'clamp(8px, 2vw, 12px)'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ 
            fontSize: 'clamp(14px, 3.5vw, 18px)', 
            fontWeight: 600 
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ 
              marginTop: 'clamp(2px, 0.5vw, 4px)', 
              fontSize: 'clamp(11px, 2.5vw, 14px)', 
              color: 'rgba(255,255,255,0.6)' 
            }}>
              {subtitle}
            </div>
          )}
        </div>
        <div>{right}</div>
      </div>
    </GlassCard>
  ); 
}

function GlassCard({ children }) {
  const baseStyle = {
    borderRadius: 24,
    padding: 16,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={baseStyle}
    >
      {children}
    </motion.div>
  );
}

