import React, { useEffect, useRef, useState } from 'react';

const COLOR_NAVY = '#003B73';
const COLOR_BLUE = '#1E40AF';

/**
 * Hook liviano de conteo animado (count-up 60fps en GPU/rAF)
 */
function useAnimatedNumber(target, duration = 520) {
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
            // easeOutExpo suave
            const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            const curr = from + (to - from) * eased;
            setVal(curr);
            if (t < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                prevRef.current = to;
            }
        };
        rafId = requestAnimationFrame(tick);
        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            prevRef.current = to;
        };
    }, [target, duration]);

    return val;
}

/**
 * 1. BARRA DE PULSO ANIMADA (1 sola línea minimalista, paleta institucional #003B73)
 * Reemplaza las 8 KPI cards superiores por 4 números animados con micro-visualizaciones.
 */
export function DxiBarraPulsoAnimada({
    totals,
    loading,
    selectedModalidad,
    onResetModalidad,
    filterFinanciador,
    onSelectFinanciador,
    filterAsistencia,
    onToggleAusente,
}) {
    const animRealizados = useAnimatedNumber(totals?.realizados || 0);
    const animTotal = useAnimatedNumber(totals?.total || 0);
    const animOsPct = useAnimatedNumber(parseFloat(totals?.pctObraSocial) || 0);
    const animInfPct = useAnimatedNumber(parseFloat(totals?.pctInformados) || 0);
    const animAusPct = useAnimatedNumber(parseFloat(totals?.pctAusente) || 0);

    const hasAnyFilter = selectedModalidad !== 'TODAS' || filterFinanciador !== 'TODOS' || filterAsistencia !== 'TODOS';

    // Mini arco SVG para tasa de informes firmados
    const r = 15;
    const circ = 2 * Math.PI * r;
    const infOffset = circ * (1 - Math.min(100, Math.max(0, animInfPct)) / 100);

    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 20px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
            gap: '16px',
            alignItems: 'center',
        }}>
            {/* 1. Total General de Turnos + Estudios Efectivos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', borderRight: '1px solid #F1F5F9', paddingRight: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Total Turnos · Efectivos
                    </span>
                    {hasAnyFilter && (
                        <button
                            type="button"
                            onClick={() => {
                                onResetModalidad?.();
                                onSelectFinanciador?.('TODOS');
                                if (filterAsistencia !== 'TODOS') onToggleAusente?.('TODOS');
                            }}
                            style={{
                                border: '1px solid #BFDBFE', background: '#EFF6FF', color: COLOR_NAVY,
                                borderRadius: '999px', padding: '1px 8px', fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer'
                            }}
                        >
                            Ver todo ✕
                        </button>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.75rem', fontWeight: 900, color: COLOR_NAVY, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                        {loading ? '…' : Math.round(animRealizados).toLocaleString('es-AR')}
                    </span>
                    <span style={{ fontSize: '0.76rem', color: '#334155', fontWeight: 700 }}>
                        / {Math.round(animTotal).toLocaleString('es-AR')} totales ({totals?.pctRealizados || 0}%)
                    </span>
                </div>
                {selectedModalidad !== 'TODAS' && (
                    <span style={{ fontSize: '0.68rem', color: COLOR_NAVY, fontWeight: 700 }}>
                        Filtrado en: {selectedModalidad}
                    </span>
                )}
            </div>

            {/* 2. Cobertura Obra Social vs Particular (selector explícito Todos / OS / Part.) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', borderRight: '1px solid #F1F5F9', paddingRight: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Cobertura
                    </span>
                    <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '2px', borderRadius: '6px', gap: '2px' }}>
                        {[
                            { id: 'TODOS', label: 'Todos' },
                            { id: 'Obra Social', label: 'OS' },
                            { id: 'Particular', label: 'Part.' },
                        ].map(opt => {
                            const active = filterFinanciador === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => onSelectFinanciador?.(opt.id)}
                                    style={{
                                        border: 'none', borderRadius: '4px', padding: '1px 6px',
                                        fontSize: '0.64rem', fontWeight: 700, cursor: 'pointer',
                                        background: active ? COLOR_NAVY : 'transparent',
                                        color: active ? '#FFFFFF' : '#64748B',
                                    }}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div style={{ width: '100%', height: '7px', borderRadius: '999px', background: '#E2E8F0', overflow: 'hidden', display: 'flex' }}>
                    <div style={{
                        width: `${Math.min(100, Math.max(0, animOsPct))}%`,
                        background: COLOR_NAVY,
                        transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)'
                    }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.69rem', color: '#475569', fontWeight: 600 }}>
                    <span>OS: <strong>{(totals?.obraSocial || 0).toLocaleString('es-AR')}</strong> ({animOsPct.toFixed(1)}%)</span>
                    <span>Part: <strong>{(totals?.particular || 0).toLocaleString('es-AR')}</strong> ({totals?.pctParticular || 0}%)</span>
                </div>
            </div>

            {/* 3. Informes Firmados (solo lectura con mini anillo SVG animado) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderRight: '1px solid #F1F5F9', paddingRight: '14px' }}>
                <svg width="38" height="38" viewBox="0 0 38 38" style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
                    <circle cx="19" cy="19" r={r} fill="none" stroke="#E2E8F0" strokeWidth="4" />
                    <circle
                        cx="19" cy="19" r={r} fill="none"
                        stroke={COLOR_NAVY} strokeWidth="4" strokeLinecap="round"
                        strokeDasharray={circ}
                        strokeDashoffset={infOffset}
                        style={{ transition: 'stroke-dashoffset 0.55s cubic-bezier(0.22, 1, 0.36, 1)' }}
                    />
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Informes Firmados
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0F172A' }}>
                            {(totals?.informados || 0).toLocaleString('es-AR')}
                        </span>
                        <span style={{ fontSize: '0.73rem', color: COLOR_NAVY, fontWeight: 800 }}>
                            {animInfPct.toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* 4. Ausentismo / No-Show (con estado visual explícito) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Ausentismo
                    </span>
                    <button
                        type="button"
                        onClick={() => onToggleAusente?.(filterAsistencia === 'Ausente' ? 'TODOS' : 'Ausente')}
                        style={{
                            border: filterAsistencia === 'Ausente' ? '1px solid #003B73' : '1px solid #CBD5E1',
                            background: filterAsistencia === 'Ausente' ? '#003B73' : '#F8FAFC',
                            color: filterAsistencia === 'Ausente' ? '#FFFFFF' : '#475569',
                            borderRadius: '6px', padding: '1px 7px', fontSize: '0.64rem', fontWeight: 700, cursor: 'pointer'
                        }}
                    >
                        {filterAsistencia === 'Ausente' ? 'Filtrado ✕' : 'Filtrar'}
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '1.45rem', fontWeight: 900, color: animAusPct >= 10 ? '#B91C1C' : COLOR_BLUE }}>
                        {(totals?.ausente || 0).toLocaleString('es-AR')}
                    </span>
                    <span style={{ fontSize: '0.73rem', color: '#64748B', fontWeight: 700 }}>
                        {animAusPct.toFixed(1)}% · {totals?.cantAgendas || 0} agendas
                    </span>
                </div>
            </div>
        </div>
    );
}

/**
 * 2. FLUJO ANIMADO DE ASISTENCIA (Sankey horizontal SVG)
 * Reemplaza las 6 tarjetas repetidas de Estados de Asistencia por curvas Bézier animadas e interactivas.
 */
export function DxiFlujoAsistenciaAnimado({ totals, filterAsistencia, onSelectAsistencia }) {
    const [hoveredKey, setHoveredKey] = useState(null);
    const total = Math.max(1, Number(totals?.total || 0));

    const branches = [
        { key: 'Presente', label: 'Presente (Ambulatorio)', count: Number(totals?.presente || 0), pct: parseFloat(totals?.pctPresente) || 0, color: '#003B73' },
        { key: 'Internado', label: 'Internado / Hosp.', count: Number(totals?.internado || 0), pct: parseFloat(totals?.pctInternado) || 0, color: '#1D4ED8' },
        { key: 'Urgencia', label: 'Urgencia / Guardia', count: Number(totals?.urgencia || 0), pct: parseFloat(totals?.pctUrgencia) || 0, color: '#0284C7' },
        { key: 'Sobreturno', label: 'Sobreturno', count: Number(totals?.sobreturno || 0), pct: parseFloat(totals?.pctSobreturno) || 0, color: '#0369A1' },
        { key: 'Ausente', label: 'Ausente (No-Show)', count: Number(totals?.ausente || 0), pct: parseFloat(totals?.pctAusente) || 0, color: '#64748B' },
        { key: 'Sin Registrar', label: 'Sin Registrar', count: Number(totals?.sinRegistrar || 0), pct: parseFloat(totals?.pctSinRegistrar) || 0, color: '#94A3B8' },
    ].filter(b => b.count > 0 || filterAsistencia === b.key);

    if (!branches.length) return null;

    const svgH = Math.max(116, branches.length * 32 + 16);
    const startX = 168;
    const endX = 470;
    const startY = svgH / 2;

    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '12px 18px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: COLOR_NAVY, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Flujo de Asistencia
                </span>
                {filterAsistencia !== 'TODOS' && (
                    <button
                        type="button"
                        onClick={() => onSelectAsistencia('TODOS')}
                        style={{
                            border: '1px solid #BFDBFE', background: '#EFF6FF', color: COLOR_NAVY,
                            borderRadius: '6px', padding: '2px 9px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer'
                        }}
                    >
                        Filtro: {filterAsistencia} ✕
                    </button>
                )}
            </div>

            <svg viewBox={`0 0 760 ${svgH}`} style={{ width: '100%', height: `${svgH}px`, display: 'block', overflow: 'visible' }}>
                <defs>
                    <style>{`
                        @keyframes dxiFlowDash {
                            from { stroke-dashoffset: 36; }
                            to { stroke-dashoffset: 0; }
                        }
                    `}</style>
                </defs>

                {/* Nodo Origen (Izquierda): Agendados */}
                <g
                    onClick={() => onSelectAsistencia('TODOS')}
                    style={{ cursor: 'pointer' }}
                >
                    <rect x="0" y={startY - 26} width="164" height="52" rx="10" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="1.2" />
                    <text x="14" y={startY - 5} fill="#64748B" fontSize="10" fontWeight="700" fontFamily="Inter, Segoe UI, sans-serif">
                        TURNOS AGENDADOS
                    </text>
                    <text x="14" y={startY + 15} fill={COLOR_NAVY} fontSize="18" fontWeight="900" fontFamily="Inter, Segoe UI, sans-serif">
                        {total.toLocaleString('es-AR')}
                    </text>
                </g>

                {/* Curvas Bézier y Nodos Destino */}
                {branches.map((b, idx) => {
                    const step = (svgH - 28) / Math.max(1, branches.length - 1);
                    const targetY = branches.length === 1 ? startY : 14 + idx * step;
                    const isSelected = filterAsistencia === b.key;
                    const isHovered = hoveredKey === b.key;
                    const isDimmed = (filterAsistencia !== 'TODOS' && !isSelected) || (hoveredKey && !isHovered && !isSelected);
                    const strokeW = Math.max(2.5, Math.min(18, (b.count / total) * 26));
                    const d = `M ${startX} ${startY} C ${startX + 115} ${startY}, ${endX - 115} ${targetY}, ${endX} ${targetY}`;

                    return (
                        <g
                            key={b.key}
                            onClick={() => onSelectAsistencia(isSelected ? 'TODOS' : b.key)}
                            onMouseEnter={() => setHoveredKey(b.key)}
                            onMouseLeave={() => setHoveredKey(null)}
                            style={{ cursor: 'pointer', transition: 'opacity 0.2s ease', opacity: isDimmed ? 0.35 : 1 }}
                        >
                            {/* Base curva */}
                            <path
                                d={d}
                                fill="none"
                                stroke={b.color}
                                strokeWidth={strokeW}
                                strokeOpacity={isSelected || isHovered ? 0.32 : 0.18}
                                strokeLinecap="round"
                                style={{ transition: 'stroke-opacity 0.2s ease, stroke-width 0.3s ease' }}
                            />
                            {/* Flujo animado sutil */}
                            <path
                                d={d}
                                fill="none"
                                stroke={b.color}
                                strokeWidth={Math.max(1.5, Math.min(3.5, strokeW * 0.25))}
                                strokeDasharray="6 12"
                                strokeLinecap="round"
                                style={{ animation: 'dxiFlowDash 1.6s linear infinite' }}
                            />
                            {/* Punto destino */}
                            <circle cx={endX} cy={targetY} r={isSelected || isHovered ? 5.5 : 4} fill={b.color} />

                            {/* Etiqueta + Valor destino */}
                            <rect
                                x={endX + 10}
                                y={targetY - 12}
                                width="276"
                                height="24"
                                rx="7"
                                fill={isSelected ? '#EFF6FF' : (isHovered ? '#F8FAFC' : 'transparent')}
                                stroke={isSelected ? '#BFDBFE' : 'transparent'}
                                strokeWidth="1"
                            />
                            <text x={endX + 18} y={targetY + 4} fill="#0F172A" fontSize="11.5" fontWeight={isSelected ? '800' : '700'} fontFamily="Inter, Segoe UI, sans-serif">
                                {b.label}
                            </text>
                            <text x={748} y={targetY + 4} textAnchor="end" fill={b.color} fontSize="12" fontWeight="800" fontFamily="Inter, Segoe UI, sans-serif">
                                {b.count.toLocaleString('es-AR')} ({b.pct.toFixed(1)}%)
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
