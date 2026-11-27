import React, { useEffect, useRef, useState } from 'react';

const COLOR_NAVY = '#003B73';

/**
 * Hook liviano de conteo animado (count-up 60fps en rAF)
 */
export function useAnimatedCounter(target, duration = 500) {
    const [val, setVal] = useState(Number(target) || 0);
    const prevRef = useRef(Number(target) || 0);

    useEffect(() => {
        const to = Number(target) || 0;
        const from = prevRef.current;
        if (from === to) return;
        const start = performance.now();
        let rafId = null;
        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            setVal(from + (to - from) * eased);
            if (t < 1) rafId = requestAnimationFrame(tick);
            else prevRef.current = to;
        };
        rafId = requestAnimationFrame(tick);
        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            prevRef.current = to;
        };
    }, [target, duration]);

    return val;
}

function PulseNumeric({ value, decimals = 0, prefix = '', suffix = '' }) {
    const anim = useAnimatedCounter(value);
    const formatted = decimals > 0
        ? anim.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : Math.round(anim).toLocaleString('es-AR');
    return <>{prefix}{formatted}{suffix}</>;
}

/**
 * BARRA DE PULSO ANIMADA TRANSVERSAL (Estándar DxI · Calidad-QOAG)
 * 1 sola línea limpia en #FFFFFF con paleta institucional #003B73.
 * Cada item soporta:
 *  - label, value (number o string), decimals, prefix, suffix, sub, accentColor
 *  - ringPct (opcional: dibuja mini anillo SVG animado)
 *  - barPct, barLeftLabel, barRightLabel (opcional: barra proporcional animada)
 *  - actionLabel, actionActive, onAction (opcional: botón compacto de filtro/reset)
 */
export function GobernanzaBarraPulso({ items = [], loading = false }) {
    if (!items.length) return null;
    const r = 15;
    const circ = 2 * Math.PI * r;

    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 20px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(${items.length <= 4 ? 190 : 165}px, 1fr))`,
            gap: '16px',
            alignItems: 'center',
        }}>
            {items.map((it, idx) => {
                const isLast = idx === items.length - 1;
                const isNum = typeof it.value === 'number' && !Number.isNaN(it.value);
                const ringPct = typeof it.ringPct === 'number' ? Math.min(100, Math.max(0, it.ringPct)) : null;
                const barPct = typeof it.barPct === 'number' ? Math.min(100, Math.max(0, it.barPct)) : null;
                const accent = it.accentColor || COLOR_NAVY;

                return (
                    <div
                        key={it.key || idx}
                        style={{
                            display: 'flex',
                            alignItems: ringPct !== null ? 'center' : 'stretch',
                            flexDirection: ringPct !== null ? 'row' : 'column',
                            gap: ringPct !== null ? '12px' : '4px',
                            borderRight: isLast ? 'none' : '1px solid #F1F5F9',
                            paddingRight: isLast ? 0 : '14px',
                        }}
                    >
                        {ringPct !== null && (
                            <svg width="38" height="38" viewBox="0 0 38 38" style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
                                <circle cx="19" cy="19" r={r} fill="none" stroke="#E2E8F0" strokeWidth="4" />
                                <circle
                                    cx="19" cy="19" r={r} fill="none"
                                    stroke={accent} strokeWidth="4" strokeLinecap="round"
                                    strokeDasharray={circ}
                                    strokeDashoffset={circ * (1 - ringPct / 100)}
                                    style={{ transition: 'stroke-dashoffset 0.55s cubic-bezier(0.22, 1, 0.36, 1)' }}
                                />
                            </svg>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                <span style={{
                                    fontSize: '0.68rem', fontWeight: 700, color: '#64748B',
                                    textTransform: 'uppercase', letterSpacing: '0.04em',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                }}>
                                    {it.label}
                                </span>
                                {it.actionLabel && it.onAction && (
                                    <button
                                        type="button"
                                        onClick={it.onAction}
                                        style={{
                                            border: it.actionActive ? `1px solid ${COLOR_NAVY}` : '1px solid #CBD5E1',
                                            background: it.actionActive ? COLOR_NAVY : '#F8FAFC',
                                            color: it.actionActive ? '#FFFFFF' : '#475569',
                                            borderRadius: '6px', padding: '1px 7px',
                                            fontSize: '0.64rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0
                                        }}
                                    >
                                        {it.actionLabel}
                                    </button>
                                )}
                            </div>

                            {barPct !== null ? (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                        <span style={{ fontSize: '1.45rem', fontWeight: 900, color: accent, lineHeight: 1.1 }}>
                                            {loading ? '…' : isNum
                                                ? <PulseNumeric value={it.value} decimals={it.decimals || 0} prefix={it.prefix || ''} suffix={it.suffix || ''} />
                                                : it.value}
                                        </span>
                                        {it.sub && <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600 }}>{it.sub}</span>}
                                    </div>
                                    <div style={{ width: '100%', height: '6px', borderRadius: '999px', background: '#E2E8F0', overflow: 'hidden', marginTop: '2px' }}>
                                        <div style={{
                                            width: `${barPct}%`, height: '100%', background: accent,
                                            transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)'
                                        }} />
                                    </div>
                                    {(it.barLeftLabel || it.barRightLabel) && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>
                                            <span>{it.barLeftLabel}</span>
                                            <span>{it.barRightLabel}</span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '7px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '1.55rem', fontWeight: 900, color: accent, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                                        {loading ? '…' : isNum
                                            ? <PulseNumeric value={it.value} decimals={it.decimals || 0} prefix={it.prefix || ''} suffix={it.suffix || ''} />
                                            : it.value}
                                    </span>
                                    {it.sub && (
                                        <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                                            {it.sub}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * FLUJO ANIMADO SVG TRANSVERSAL (Curvas Bézier interactivas en paleta institucional)
 */
export function GobernanzaFlujoAnimado({
    title = 'Flujo Operativo',
    originLabel = 'TOTAL',
    originValue = 0,
    branches = [],
    activeKey = null,
    onSelect = null,
}) {
    const [hoveredKey, setHoveredKey] = useState(null);
    const total = Math.max(1, Number(originValue) || 0);
    const visibleBranches = (branches || []).filter(b => (Number(b.count) || 0) > 0 || activeKey === b.key);
    if (!visibleBranches.length) return null;

    const svgH = Math.max(112, visibleBranches.length * 32 + 16);
    const startX = 172;
    const endX = 468;
    const startY = svgH / 2;

    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '12px 18px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '10px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: COLOR_NAVY, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {title}
                </span>
                {activeKey && activeKey !== 'TODOS' && onSelect && (
                    <button
                        type="button"
                        onClick={() => onSelect('TODOS')}
                        style={{
                            border: '1px solid #BFDBFE', background: '#EFF6FF', color: COLOR_NAVY,
                            borderRadius: '6px', padding: '2px 9px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer'
                        }}
                    >
                        Filtro: {activeKey} ✕
                    </button>
                )}
            </div>

            <svg viewBox={`0 0 760 ${svgH}`} style={{ width: '100%', height: `${svgH}px`, display: 'block', overflow: 'visible' }}>
                <defs>
                    <style>{`
                        @keyframes gobFlowDash {
                            from { stroke-dashoffset: 36; }
                            to { stroke-dashoffset: 0; }
                        }
                    `}</style>
                </defs>

                <g onClick={onSelect ? () => onSelect('TODOS') : undefined} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
                    <rect x="0" y={startY - 26} width="168" height="52" rx="10" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="1.2" />
                    <text x="14" y={startY - 5} fill="#64748B" fontSize="9.5" fontWeight="700" fontFamily="Inter, Segoe UI, sans-serif">
                        {originLabel}
                    </text>
                    <text x="14" y={startY + 15} fill={COLOR_NAVY} fontSize="18" fontWeight="900" fontFamily="Inter, Segoe UI, sans-serif">
                        {Number(originValue || 0).toLocaleString('es-AR')}
                    </text>
                </g>

                {visibleBranches.map((b, idx) => {
                    const step = (svgH - 28) / Math.max(1, visibleBranches.length - 1);
                    const targetY = visibleBranches.length === 1 ? startY : 14 + idx * step;
                    const isSelected = activeKey === b.key;
                    const isHovered = hoveredKey === b.key;
                    const isDimmed = (activeKey && activeKey !== 'TODOS' && !isSelected) || (hoveredKey && !isHovered && !isSelected);
                    const strokeW = Math.max(2.5, Math.min(18, ((Number(b.count) || 0) / total) * 26));
                    const color = b.color || COLOR_NAVY;
                    const d = `M ${startX} ${startY} C ${startX + 112} ${startY}, ${endX - 112} ${targetY}, ${endX} ${targetY}`;
                    const pctTxt = b.pct !== undefined ? `${Number(b.pct).toFixed(1)}%` : `${(((Number(b.count) || 0) * 100) / total).toFixed(1)}%`;

                    return (
                        <g
                            key={b.key || idx}
                            onClick={onSelect ? () => onSelect(isSelected ? 'TODOS' : b.key) : undefined}
                            onMouseEnter={() => setHoveredKey(b.key)}
                            onMouseLeave={() => setHoveredKey(null)}
                            style={{ cursor: onSelect ? 'pointer' : 'default', transition: 'opacity 0.2s ease', opacity: isDimmed ? 0.35 : 1 }}
                        >
                            <path d={d} fill="none" stroke={color} strokeWidth={strokeW} strokeOpacity={isSelected || isHovered ? 0.32 : 0.18} strokeLinecap="round" />
                            <path d={d} fill="none" stroke={color} strokeWidth={Math.max(1.5, Math.min(3.5, strokeW * 0.25))} strokeDasharray="6 12" strokeLinecap="round" style={{ animation: 'gobFlowDash 1.6s linear infinite' }} />
                            <circle cx={endX} cy={targetY} r={isSelected || isHovered ? 5.5 : 4} fill={color} />
                            <rect x={endX + 10} y={targetY - 12} width="278" height="24" rx="7" fill={isSelected ? '#EFF6FF' : (isHovered ? '#F8FAFC' : 'transparent')} stroke={isSelected ? '#BFDBFE' : 'transparent'} strokeWidth="1" />
                            <text x={endX + 18} y={targetY + 4} fill="#0F172A" fontSize="11.5" fontWeight={isSelected ? '800' : '700'} fontFamily="Inter, Segoe UI, sans-serif">
                                {b.label}
                            </text>
                            <text x={748} y={targetY + 4} textAnchor="end" fill={color} fontSize="12" fontWeight="800" fontFamily="Inter, Segoe UI, sans-serif">
                                {Number(b.count || 0).toLocaleString('es-AR')} ({pctTxt})
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
