import React, { useEffect, useRef, useState } from 'react';

function useDragOrbit(canvasRef, initY = 0.5, initX = 0.42, autoSpeed = 0.006, minX = -1.15, maxX = 1.15) {
    const stateRef = useRef({ rotY: initY, rotX: initX, dragging: false, lx: 0, ly: 0, vy: autoSpeed });

    useEffect(() => {
        const c = canvasRef.current;
        if (!c) return;
        const st = stateRef.current;

        const onDown = (e) => {
            st.dragging = true;
            st.lx = e.clientX;
            st.ly = e.clientY;
            try { c.setPointerCapture(e.pointerId); } catch (_) {}
        };
        const onMove = (e) => {
            if (!st.dragging) return;
            const dx = e.clientX - st.lx;
            const dy = e.clientY - st.ly;
            st.rotY += dx * 0.011;
            st.rotX = Math.max(minX, Math.min(maxX, st.rotX + dy * 0.011));
            st.vy = dx * 0.004;
            st.lx = e.clientX;
            st.ly = e.clientY;
        };
        const onUp = () => { st.dragging = false; };

        c.addEventListener('pointerdown', onDown);
        c.addEventListener('pointermove', onMove);
        c.addEventListener('pointerup', onUp);
        c.addEventListener('pointercancel', onUp);
        return () => {
            c.removeEventListener('pointerdown', onDown);
            c.removeEventListener('pointermove', onMove);
            c.removeEventListener('pointerup', onUp);
            c.removeEventListener('pointercancel', onUp);
        };
    }, [canvasRef, minX, maxX]);

    return stateRef;
}

function rotatePt(x, y, z, rotY, rotX) {
    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;
    const cx = Math.cos(rotX), sx = Math.sin(rotX);
    return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
}

function normalizeRgb(input) {
    if (Array.isArray(input) && input.length >= 3) {
        return [Number(input[0]) || 0, Number(input[1]) || 0, Number(input[2]) || 0];
    }
    if (typeof input === 'string' && input.trim()) {
        const clean = input.trim().replace('#', '');
        const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
        const num = parseInt(full, 16);
        if (!Number.isNaN(num)) {
            return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
        }
    }
    return [0, 59, 115];
}

function phongShade(rgbIn, nx, ny, nz, alpha = 1) {
    const rgb = normalizeRgb(rgbIn);
    const dot = Math.max(0, nx * -0.45 + ny * -0.65 + nz * 0.72);
    const spec = Math.pow(dot, 14) * 102;
    const k = 0.36 + dot * 0.72;
    const r = Math.min(255, Math.round(rgb[0] * k + spec));
    const g = Math.min(255, Math.round(rgb[1] * k + spec));
    const b = Math.min(255, Math.round(rgb[2] * k + spec));
    return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

function rgbCss(rgbIn) {
    const rgb = normalizeRgb(rgbIn);
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function CardShell3D({ title, subtitle, badgeRightLabel, badgeRightValue, badgeRightSub, children, legendItems, height = 270, selectedIdx = null, onSelectLegendItem = null }) {
    return (
        <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '16px 18px',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
        }}>
            {(title || subtitle || badgeRightValue) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                    {(title || subtitle) && (
                        <div>
                            {title && <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{title}</h3>}
                            {subtitle && <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>{subtitle}</p>}
                        </div>
                    )}
                    {badgeRightValue && (
                        <div style={{ textAlign: 'right' }}>
                            {badgeRightLabel && (
                                <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.03em' }}>
                                    {badgeRightLabel}
                                </div>
                            )}
                            <div style={{ fontSize: '20px', fontWeight: 900, color: '#003B73', lineHeight: 1.1 }}>{badgeRightValue}</div>
                            {badgeRightSub && <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>{badgeRightSub}</div>}
                        </div>
                    )}
                </div>
            )}

            <div style={{
                position: 'relative',
                height: `${height}px`,
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: 'linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 55%, #EFF6FF 100%)',
                overflow: 'hidden',
                userSelect: 'none',
            }}>
                {children}
            </div>

            {Array.isArray(legendItems) && legendItems.length > 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(auto-fit, minmax(135px, 1fr))`,
                    gap: '8px',
                    marginTop: '10px',
                }}>
                    {legendItems.map((it, idx) => {
                        const isInteractive = Boolean(onSelectLegendItem);
                        const isSelected = selectedIdx === idx;
                        const isDimmed = selectedIdx !== null && !isSelected;
                        return (
                            <div
                                key={idx}
                                role={isInteractive ? 'button' : undefined}
                                tabIndex={isInteractive ? 0 : undefined}
                                onClick={isInteractive ? () => onSelectLegendItem(idx) : undefined}
                                onKeyDown={isInteractive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectLegendItem(idx); } } : undefined}
                                style={{
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    background: isSelected ? '#EFF6FF' : '#F8FAFC',
                                    border: isSelected ? '1.5px solid #003B73' : '1px solid #E2E8F0',
                                    borderLeft: `${isSelected ? 4 : 3}px solid ${rgbCss(it.rgb)}`,
                                    cursor: isInteractive ? 'pointer' : 'default',
                                    opacity: isDimmed ? 0.65 : 1,
                                    transform: isSelected ? 'translateY(-2px)' : 'translateY(0)',
                                    boxShadow: isSelected ? '0 4px 12px rgba(0, 59, 115, 0.12)' : 'none',
                                    transition: 'all 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: isSelected ? '#003B73' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {it.label}
                                    </div>
                                    {isInteractive && (
                                        <span style={{ fontSize: '10px', color: isSelected ? '#003B73' : '#94A3B8', fontWeight: 800 }}>
                                            {isSelected ? '●' : '↗'}
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '15px', fontWeight: 900, color: rgbCss(it.rgb), marginTop: '2px' }}>
                                    {it.valueLabel}
                                </div>
                                {it.detail && <div style={{ fontSize: '10px', color: '#64748B' }}>{it.detail}</div>}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/**
 * 1. CILINDROS DE CRISTAL 3D (Internación — % Ocupación por Servicio)
 */
export function CilindrosOcupacion3D({ title, subtitle, badgeRightLabel, badgeRightValue, badgeRightSub, items = [], height = 270 }) {
    const canvasRef = useRef(null);
    const orbitRef = useDragOrbit(canvasRef, -0.32, 0.28, 0.0045, -0.85, 0.95);
    const keySig = JSON.stringify(items.map(i => [i.label, i.pct]));

    useEffect(() => {
        const c = canvasRef.current;
        if (!c || !items.length) return;
        const ctx = c.getContext('2d');
        let rafId = null;

        const n = items.length;
        const spacing = n <= 4 ? 95 : 80;
        const startX = -((n - 1) * spacing) / 2;

        const loop = () => {
            const w = c.clientWidth || 720;
            const h = c.clientHeight || height;
            if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
            ctx.clearRect(0, 0, w, h);

            const st = orbitRef.current;
            if (!st.dragging) {
                st.rotY += st.vy;
                st.vy = st.vy * 0.96 + 0.004 * 0.04;
            }

            const quads = [];
            const H = 148, R = 21, S = 18;
            items.forEach((b, idx) => {
                const bx = startX + idx * spacing;
                const pct = Math.max(0.02, Math.min(1, Number(b.pct) || 0));
                const yBot = H / 2;
                const yFill = yBot - H * pct;
                const yTop = -H / 2;
                for (let i = 0; i < S; i++) {
                    const a0 = (i / S) * Math.PI * 2;
                    const a1 = ((i + 1) / S) * Math.PI * 2;
                    const am = (a0 + a1) / 2;
                    const norm = rotatePt(Math.cos(am), 0, Math.sin(am), st.rotY, st.rotX);

                    const pFill = [
                        rotatePt(bx + R * Math.cos(a0), yBot, R * Math.sin(a0), st.rotY, st.rotX),
                        rotatePt(bx + R * Math.cos(a1), yBot, R * Math.sin(a1), st.rotY, st.rotX),
                        rotatePt(bx + R * Math.cos(a1), yFill, R * Math.sin(a1), st.rotY, st.rotX),
                        rotatePt(bx + R * Math.cos(a0), yFill, R * Math.sin(a0), st.rotY, st.rotX),
                    ];
                    quads.push({
                        pts: pFill,
                        z: (pFill[0][2] + pFill[1][2] + pFill[2][2] + pFill[3][2]) / 4,
                        fill: phongShade(b.rgb, norm[0], norm[1], norm[2], 0.96)
                    });

                    if (pct < 0.98) {
                        const pGlass = [
                            rotatePt(bx + R * Math.cos(a0), yFill, R * Math.sin(a0), st.rotY, st.rotX),
                            rotatePt(bx + R * Math.cos(a1), yFill, R * Math.sin(a1), st.rotY, st.rotX),
                            rotatePt(bx + R * Math.cos(a1), yTop, R * Math.sin(a1), st.rotY, st.rotX),
                            rotatePt(bx + R * Math.cos(a0), yTop, R * Math.sin(a0), st.rotY, st.rotX),
                        ];
                        quads.push({
                            pts: pGlass,
                            z: (pGlass[0][2] + pGlass[1][2] + pGlass[2][2] + pGlass[3][2]) / 4 - 0.1,
                            fill: phongShade([203, 213, 225], norm[0], norm[1], norm[2], 0.26)
                        });
                    }
                }
            });

            quads.sort((a, b) => a.z - b.z);
            const fov = 520, cx = w * 0.5, cy = h * 0.48;
            for (const q of quads) {
                ctx.beginPath();
                for (let k = 0; k < 4; k++) {
                    const [x, y, z] = q.pts[k];
                    const s = fov / (fov - z);
                    if (k === 0) ctx.moveTo(cx + x * s, cy + y * s);
                    else ctx.lineTo(cx + x * s, cy + y * s);
                }
                ctx.closePath();
                ctx.fillStyle = q.fill;
                ctx.fill();
            }

            ctx.font = 'bold 11px Segoe UI, sans-serif';
            ctx.textAlign = 'center';
            items.forEach((b, idx) => {
                const bx = startX + idx * spacing;
                const [x, y, z] = rotatePt(bx, H / 2 + 22, 0, st.rotY, st.rotX);
                const s = fov / (fov - z);
                ctx.fillStyle = '#0F172A';
                ctx.fillText(`${b.shortLabel || b.label} (${Math.round((Number(b.pct) || 0) * 100)}%)`, cx + x * s, cy + y * s);
            });

            rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
        return () => { if (rafId) cancelAnimationFrame(rafId); };
    }, [keySig, height]);

    const legendItems = items.map(i => ({
        label: i.label,
        valueLabel: `${((Number(i.pct) || 0) * 100).toFixed(1)}%`,
        rgb: i.rgb,
        detail: i.detail,
    }));

    return (
        <CardShell3D title={title} subtitle={subtitle} badgeRightLabel={badgeRightLabel} badgeRightValue={badgeRightValue} badgeRightSub={badgeRightSub} legendItems={legendItems} height={height}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }} />
        </CardShell3D>
    );
}

/**
 * 2. ANILLO TOROIDAL 3D (Quirófano / DxI) — con foco interactivo, separación 3D y narrativa ejecutiva
 */
export function AnilloToroidal3D({ title, subtitle, badgeRightLabel, badgeRightValue, badgeRightSub, segments = [], height = 270 }) {
    const canvasRef = useRef(null);
    const orbitRef = useDragOrbit(canvasRef, 0.55, 0.56, 0.007);
    const [selectedIdx, setSelectedIdx] = useState(null);
    const selectedIdxRef = useRef(null);
    const animRef = useRef({ shiftT: 0, bgDimT: 0, segExplode: [] });
    const [streamedWords, setStreamedWords] = useState(0);

    const total = Math.max(0.0001, segments.reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0));
    const keySig = JSON.stringify(segments.map(s => [s.label, s.value]));

    useEffect(() => {
        selectedIdxRef.current = selectedIdx;
    }, [selectedIdx]);

    // Si cambian los segmentos y el índice queda fuera de rango, limpiar selección
    useEffect(() => {
        if (selectedIdx !== null && selectedIdx >= segments.length) {
            setSelectedIdx(null);
        }
    }, [segments.length, selectedIdx]);

    const activeSegment = selectedIdx !== null ? segments[selectedIdx] : null;
    const narrativeText = activeSegment
        ? (activeSegment.narrative || `${activeSegment.label} representa el ${activeSegment.valueLabel || `${((Math.max(0, Number(activeSegment.value) || 0) * 100) / total).toFixed(1)}%`} del volumen total analizado (${activeSegment.detail || `${Number(activeSegment.value || 0).toLocaleString('es-AR')} registros`}).`)
        : '';
    const narrativeWords = narrativeText ? narrativeText.split(' ') : [];

    // Efecto stream palabra por palabra (~26ms/palabra, fluido y sin cursor molesto)
    useEffect(() => {
        if (selectedIdx === null || !narrativeWords.length) {
            setStreamedWords(0);
            return;
        }
        setStreamedWords(0);
        let count = 0;
        const timer = setInterval(() => {
            count += 1;
            setStreamedWords(count);
            if (count >= narrativeWords.length) {
                clearInterval(timer);
            }
        }, 26);
        return () => clearInterval(timer);
    }, [selectedIdx, narrativeText]);

    useEffect(() => {
        const c = canvasRef.current;
        if (!c || !segments.length) return;
        const ctx = c.getContext('2d');
        let rafId = null;

        // Pre-compute cumulative thresholds + midAngle de cada segmento
        let acc = 0;
        const stops = segments.map((s, idx) => {
            const start = acc;
            acc += Math.max(0, Number(s.value) || 0) / total;
            const end = acc;
            return {
                idx,
                start,
                end,
                midAngle: ((start + end) / 2) * Math.PI * 2,
                rgb: normalizeRgb(s.rgb || s.color),
            };
        });

        const getStop = (u) => {
            if (!stops.length) return { idx: 0, midAngle: 0, rgb: [0, 59, 115] };
            for (const st of stops) {
                if (u <= st.end) return st;
            }
            return stops[stops.length - 1];
        };

        const loop = () => {
            const w = c.clientWidth || 720;
            const h = c.clientHeight || height;
            if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
            ctx.clearRect(0, 0, w, h);

            const st = orbitRef.current;
            const sel = selectedIdxRef.current;
            const anim = animRef.current;

            // Interpolar desplazamiento lateral y atenuación de segundo plano
            const targetShift = sel !== null ? 1 : 0;
            anim.shiftT += (targetShift - anim.shiftT) * 0.095;
            anim.bgDimT += (targetShift - anim.bgDimT) * 0.095;

            if (anim.segExplode.length !== stops.length) {
                anim.segExplode = stops.map((_, i) => (i === sel ? 1 : 0));
            }
            for (let i = 0; i < stops.length; i++) {
                const targetEx = i === sel ? 1 : 0;
                anim.segExplode[i] += (targetEx - anim.segExplode[i]) * 0.11;
            }

            // Rotación orbital: gira libre en reposo, o enfoca suavemente el segmento seleccionado hacia el frente-derecha
            if (!st.dragging) {
                if (sel !== null && stops[sel]) {
                    const desiredRotY = Math.PI * 0.35 - stops[sel].midAngle;
                    // Normalizar diferencia angular al camino más corto [-PI, PI]
                    let diff = ((desiredRotY - st.rotY + Math.PI) % (Math.PI * 2)) - Math.PI;
                    if (diff < -Math.PI) diff += Math.PI * 2;
                    st.rotY += diff * 0.085;
                    st.rotX += (0.48 - st.rotX) * 0.085;
                    st.vy *= 0.85;
                } else {
                    st.rotY += st.vy;
                    st.vy = st.vy * 0.96 + 0.007 * 0.04;
                }
            }

            // Centro horizontal desplazado suavemente hacia la izquierda cuando hay foco
            const shiftFactor = w < 640 ? 0 : 0.27;
            const cx = w * (0.5 - shiftFactor * anim.shiftT);
            const cy = h * 0.47;

            // Sombra en el piso siguiendo suavemente el desplazamiento del anillo
            const sh = ctx.createRadialGradient(cx, h * 0.84, 10, cx, h * 0.84, 108);
            sh.addColorStop(0, 'rgba(15,23,42,0.16)');
            sh.addColorStop(1, 'rgba(15,23,42,0)');
            ctx.fillStyle = sh;
            ctx.beginPath();
            ctx.ellipse(cx, h * 0.84, 108, 19, 0, 0, Math.PI * 2);
            ctx.fill();

            const U = 72, V = 20, R = 74, rTBase = 23;
            const quads = [];
            for (let i = 0; i < U; i++) {
                const u0 = i / U, u1 = (i + 1) / U;
                const um = (u0 + u1) / 2;
                const a0 = u0 * Math.PI * 2, a1 = u1 * Math.PI * 2;
                const stop = getStop(um);
                const ex = anim.segExplode[stop.idx] || 0;
                const bgWeight = anim.bgDimT * (1 - ex);

                // Separación radial + avance hacia adelante para el segmento seleccionado; retroceso para el resto
                const radPop = 22 * ex;
                const dxOff = Math.cos(stop.midAngle) * radPop;
                const dzOff = Math.sin(stop.midAngle) * radPop;
                const rT = rTBase * (1 + 0.13 * ex - 0.05 * bgWeight);
                const zDepthShift = 28 * ex - 38 * bgWeight;

                // Color atenuado hacia gris pizarra para el resto del círculo en segundo plano
                const col = bgWeight > 0.01
                    ? [
                        Math.round(stop.rgb[0] * (1 - 0.52 * bgWeight) + 148 * 0.52 * bgWeight),
                        Math.round(stop.rgb[1] * (1 - 0.52 * bgWeight) + 163 * 0.52 * bgWeight),
                        Math.round(stop.rgb[2] * (1 - 0.52 * bgWeight) + 184 * 0.52 * bgWeight),
                    ]
                    : stop.rgb;
                const alpha = Math.max(0.28, 1 - 0.65 * bgWeight);

                for (let j = 0; j < V; j++) {
                    const b0 = (j / V) * Math.PI * 2, b1 = ((j + 1) / V) * Math.PI * 2;
                    const pts = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => {
                        const rr = R + rT * Math.cos(b);
                        const [rx, ry, rz] = rotatePt(
                            rr * Math.cos(a) + dxOff,
                            rT * Math.sin(b),
                            rr * Math.sin(a) + dzOff,
                            st.rotY,
                            st.rotX
                        );
                        return [rx, ry, rz + zDepthShift];
                    });
                    const bm = (b0 + b1) / 2, am = (a0 + a1) / 2;
                    const norm = rotatePt(Math.cos(bm) * Math.cos(am), Math.sin(bm), Math.cos(bm) * Math.sin(am), st.rotY, st.rotX);
                    quads.push({
                        pts,
                        z: (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4,
                        fill: phongShade(col, norm[0], norm[1], norm[2], alpha)
                    });
                }
            }

            quads.sort((a, b) => a.z - b.z);
            const fov = 420;
            for (const q of quads) {
                ctx.beginPath();
                for (let k = 0; k < 4; k++) {
                    const [x, y, z] = q.pts[k];
                    const s = fov / (fov - z);
                    if (k === 0) ctx.moveTo(cx + x * s, cy + y * s);
                    else ctx.lineTo(cx + x * s, cy + y * s);
                }
                ctx.closePath();
                ctx.fillStyle = q.fill;
                ctx.fill();
            }

            rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
        return () => { if (rafId) cancelAnimationFrame(rafId); };
    }, [keySig, total, height]);

    const legendItems = segments.map(s => ({
        label: s.label,
        valueLabel: s.valueLabel || `${((Math.max(0, Number(s.value) || 0) * 100) / total).toFixed(1)}%`,
        rgb: normalizeRgb(s.rgb || s.color),
        detail: s.detail,
    }));

    const handleSelectLegend = (idx) => {
        setSelectedIdx(prev => (prev === idx ? null : idx));
    };

    const activeColorCss = activeSegment ? rgbCss(activeSegment.rgb || activeSegment.color) : '#003B73';

    return (
        <CardShell3D
            title={title}
            subtitle={subtitle}
            badgeRightLabel={badgeRightLabel}
            badgeRightValue={badgeRightValue}
            badgeRightSub={badgeRightSub}
            legendItems={legendItems}
            height={height}
            selectedIdx={selectedIdx}
            onSelectLegendItem={handleSelectLegend}
        >
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }} />

            {/* Panel Narrativo Ejecutivo (Opción 2) — aparece suavemente a la derecha al tocar una KPI card */}
            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '44%',
                    right: '24px',
                    transform: activeSegment ? 'translateY(-50%) translateX(0)' : 'translateY(-50%) translateX(26px)',
                    opacity: activeSegment ? 1 : 0,
                    pointerEvents: activeSegment ? 'auto' : 'none',
                    transition: 'opacity 0.36s cubic-bezier(0.22, 1, 0.36, 1), transform 0.44s cubic-bezier(0.22, 1, 0.36, 1)',
                    background: 'rgba(255, 255, 255, 0.94)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid #E2E8F0',
                    borderLeft: `4px solid ${activeColorCss}`,
                    borderRadius: '12px',
                    padding: '16px 20px',
                    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    userSelect: 'text',
                }}
            >
                {activeSegment && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{
                                    display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%',
                                    background: activeColorCss, flexShrink: 0
                                }} />
                                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                                    {activeSegment.label}
                                </span>
                                <span style={{ fontSize: '1.15rem', fontWeight: 900, color: activeColorCss }}>
                                    {activeSegment.valueLabel || `${((Math.max(0, Number(activeSegment.value) || 0) * 100) / total).toFixed(1)}%`}
                                </span>
                                {activeSegment.detail && (
                                    <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>
                                        · {activeSegment.detail}
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedIdx(null)}
                                title="Volver a vista centrada"
                                style={{
                                    width: '26px', height: '26px', borderRadius: '6px',
                                    border: '1px solid #E2E8F0', background: '#F8FAFC',
                                    color: '#64748B', fontSize: '0.85rem', fontWeight: 700,
                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0
                                }}
                            >
                                ×
                            </button>
                        </div>

                        {/* Frase narrativa con efecto stream palabra por palabra */}
                        <p style={{
                            margin: 0,
                            fontSize: '0.84rem',
                            lineHeight: 1.55,
                            color: '#1E293B',
                            fontWeight: 500,
                            minHeight: '42px',
                        }}>
                            {narrativeWords.slice(0, streamedWords).join(' ')}
                        </p>

                        {/* Chips de métricas rápidas */}
                        {Array.isArray(activeSegment.chips) && activeSegment.chips.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {activeSegment.chips.map((chip, cIdx) => (
                                    <span key={cIdx} style={{
                                        fontSize: '0.72rem', fontWeight: 600, color: '#334155',
                                        background: '#F8FAFC', border: '1px solid #E2E8F0',
                                        borderRadius: '6px', padding: '3px 8px'
                                    }}>
                                        <strong style={{ color: '#003B73' }}>{chip.label}:</strong> {chip.value}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* 2 píldoras de acción rápida */}
                        {(activeSegment.onViewCases || activeSegment.onFilterBoard) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '4px', borderTop: '1px solid #F1F5F9' }}>
                                {activeSegment.onViewCases && (
                                    <button
                                        type="button"
                                        onClick={activeSegment.onViewCases}
                                        style={{
                                            padding: '6px 12px', borderRadius: '8px', border: 'none',
                                            background: '#003B73', color: '#FFFFFF',
                                            fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                                            display: 'inline-flex', alignItems: 'center', gap: '5px'
                                        }}
                                    >
                                        Ver casos nominales de {activeSegment.label} →
                                    </button>
                                )}
                                {activeSegment.onFilterBoard && (
                                    <button
                                        type="button"
                                        onClick={activeSegment.onFilterBoard}
                                        style={{
                                            padding: '6px 12px', borderRadius: '8px',
                                            border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#003B73',
                                            fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                                            display: 'inline-flex', alignItems: 'center', gap: '5px'
                                        }}
                                    >
                                        Filtrar tablero a {activeSegment.label}
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </CardShell3D>
    );
}

/**
 * 3. EMBUDO DE CONVERSIÓN 3D ESCALONADO (Guardia Clínica)
 */
export function EmbudoConversion3D({ title, subtitle, badgeRightLabel, badgeRightValue, badgeRightSub, stages = [], height = 270 }) {
    const canvasRef = useRef(null);
    const orbitRef = useDragOrbit(canvasRef, 0.5, 0.30, 0.007);
    const keySig = JSON.stringify(stages.map(s => [s.label, s.pct]));

    useEffect(() => {
        const c = canvasRef.current;
        if (!c || !stages.length) return;
        const ctx = c.getContext('2d');
        let rafId = null;

        const loop = () => {
            const w = c.clientWidth || 720;
            const h = c.clientHeight || height;
            if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
            ctx.clearRect(0, 0, w, h);

            const st = orbitRef.current;
            if (!st.dragging) {
                st.rotY += st.vy;
                st.vy = st.vy * 0.96 + 0.007 * 0.04;
            }

            const sh = ctx.createRadialGradient(w * 0.5, h * 0.85, 8, w * 0.5, h * 0.85, 92);
            sh.addColorStop(0, 'rgba(15,23,42,0.16)');
            sh.addColorStop(1, 'rgba(15,23,42,0)');
            ctx.fillStyle = sh;
            ctx.beginPath();
            ctx.ellipse(w * 0.5, h * 0.85, 92, 17, 0, 0, Math.PI * 2);
            ctx.fill();

            const N = stages.length;
            const totalH = 166;
            const gap = 5;
            const bandH = (totalH - gap * (N - 1)) / N;
            const V = 28;
            const quads = [];

            stages.forEach((sg, idx) => {
                const y0 = -totalH / 2 + idx * (bandH + gap);
                const y1 = y0 + bandH;
                const rTop = Math.max(18, 92 * (1 - idx * 0.22));
                const rBot = Math.max(12, rTop * 0.76);
                for (let j = 0; j < V; j++) {
                    const a0 = (j / V) * Math.PI * 2, a1 = ((j + 1) / V) * Math.PI * 2;
                    const pts = [
                        rotatePt(rTop * Math.cos(a0), y0, rTop * Math.sin(a0), st.rotY, st.rotX),
                        rotatePt(rBot * Math.cos(a0), y1, rBot * Math.sin(a0), st.rotY, st.rotX),
                        rotatePt(rBot * Math.cos(a1), y1, rBot * Math.sin(a1), st.rotY, st.rotX),
                        rotatePt(rTop * Math.cos(a1), y0, rTop * Math.sin(a1), st.rotY, st.rotX),
                    ];
                    const am = (a0 + a1) / 2;
                    const norm = rotatePt(Math.cos(am), 0.35, Math.sin(am), st.rotY, st.rotX);
                    quads.push({
                        pts,
                        z: (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4,
                        fill: phongShade(sg.rgb || sg.color, norm[0], norm[1], norm[2])
                    });
                }
            });

            quads.sort((a, b) => a.z - b.z);
            const fov = 440, cx = w * 0.5, cy = h * 0.47;
            for (const q of quads) {
                ctx.beginPath();
                for (let k = 0; k < 4; k++) {
                    const [x, y, z] = q.pts[k];
                    const s = fov / (fov - z);
                    if (k === 0) ctx.moveTo(cx + x * s, cy + y * s);
                    else ctx.lineTo(cx + x * s, cy + y * s);
                }
                ctx.closePath();
                ctx.fillStyle = q.fill;
                ctx.fill();
            }

            rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
        return () => { if (rafId) cancelAnimationFrame(rafId); };
    }, [keySig, height]);

    const legendItems = stages.map(s => ({
        label: s.label,
        valueLabel: s.valueLabel || `${(Number(s.pct) || 0).toFixed(1)}%`,
        rgb: normalizeRgb(s.rgb || s.color),
        detail: s.detail,
    }));

    return (
        <CardShell3D title={title} subtitle={subtitle} badgeRightLabel={badgeRightLabel} badgeRightValue={badgeRightValue} badgeRightSub={badgeRightSub} legendItems={legendItems} height={height}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }} />
        </CardShell3D>
    );
}

/**
 * 4. CÁPSULA 3D HORIZONTAL DE BALANCE (Compras, Consumo y Stock)
 */
export function CapsulaBalance3D({ title, subtitle, badgeRightLabel, badgeRightValue, badgeRightSub, segments = [], height = 250 }) {
    const canvasRef = useRef(null);
    const orbitRef = useDragOrbit(canvasRef, 0.45, 0.34, 0.007);
    const total = Math.max(0.0001, segments.reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0));
    const keySig = JSON.stringify(segments.map(s => [s.label, s.value]));

    useEffect(() => {
        const c = canvasRef.current;
        if (!c || !segments.length) return;
        const ctx = c.getContext('2d');
        let rafId = null;

        let acc = 0;
        const stops = segments.map(s => {
            acc += Math.max(0, Number(s.value) || 0) / total;
            return { end: acc, rgb: normalizeRgb(s.rgb || s.color) };
        });
        const getCol = (u) => {
            if (!stops.length) return [0, 59, 115];
            for (const st of stops) if (u <= st.end) return st.rgb;
            return stops[stops.length - 1].rgb;
        };

        const loop = () => {
            const w = c.clientWidth || 720;
            const h = c.clientHeight || height;
            if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
            ctx.clearRect(0, 0, w, h);

            const st = orbitRef.current;
            if (!st.dragging) {
                st.rotY += st.vy;
                st.vy = st.vy * 0.96 + 0.007 * 0.04;
            }

            const sh = ctx.createRadialGradient(w * 0.5, h * 0.80, 10, w * 0.5, h * 0.80, 130);
            sh.addColorStop(0, 'rgba(15,23,42,0.15)');
            sh.addColorStop(1, 'rgba(15,23,42,0)');
            ctx.fillStyle = sh;
            ctx.beginPath();
            ctx.ellipse(w * 0.5, h * 0.80, 130, 18, 0, 0, Math.PI * 2);
            ctx.fill();

            const U = 50, V = 22, L = 250, rad = 38;
            const quads = [];
            for (let i = 0; i < U; i++) {
                const u0 = i / U, u1 = (i + 1) / U;
                const x0 = (u0 - 0.5) * L, x1 = (u1 - 0.5) * L;
                const r0 = rad * Math.sqrt(Math.max(0.12, 1 - Math.pow((u0 - 0.5) * 1.94, 6)));
                const r1 = rad * Math.sqrt(Math.max(0.12, 1 - Math.pow((u1 - 0.5) * 1.94, 6)));
                const col = getCol(u0);
                for (let j = 0; j < V; j++) {
                    const a0 = (j / V) * Math.PI * 2, a1 = ((j + 1) / V) * Math.PI * 2;
                    const pts = [
                        rotatePt(x0, r0 * Math.cos(a0), r0 * Math.sin(a0), st.rotY, st.rotX),
                        rotatePt(x1, r1 * Math.cos(a0), r1 * Math.sin(a0), st.rotY, st.rotX),
                        rotatePt(x1, r1 * Math.cos(a1), r1 * Math.sin(a1), st.rotY, st.rotX),
                        rotatePt(x0, r0 * Math.cos(a1), r0 * Math.sin(a1), st.rotY, st.rotX),
                    ];
                    const am = (a0 + a1) / 2;
                    const norm = rotatePt(0, Math.cos(am), Math.sin(am), st.rotY, st.rotX);
                    quads.push({
                        pts,
                        z: (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4,
                        fill: phongShade(col, norm[0], norm[1], norm[2])
                    });
                }
            }

            quads.sort((a, b) => a.z - b.z);
            const fov = 460, cx = w * 0.5, cy = h * 0.47;
            for (const q of quads) {
                ctx.beginPath();
                for (let k = 0; k < 4; k++) {
                    const [x, y, z] = q.pts[k];
                    const s = fov / (fov - z);
                    if (k === 0) ctx.moveTo(cx + x * s, cy + y * s);
                    else ctx.lineTo(cx + x * s, cy + y * s);
                }
                ctx.closePath();
                ctx.fillStyle = q.fill;
                ctx.fill();
            }

            rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
        return () => { if (rafId) cancelAnimationFrame(rafId); };
    }, [keySig, total, height]);

    const legendItems = segments.map(s => ({
        label: s.label,
        valueLabel: s.valueLabel || `${((Math.max(0, Number(s.value) || 0) * 100) / total).toFixed(1)}%`,
        rgb: normalizeRgb(s.rgb || s.color),
        detail: s.detail,
    }));

    return (
        <CardShell3D title={title} subtitle={subtitle} badgeRightLabel={badgeRightLabel} badgeRightValue={badgeRightValue} badgeRightSub={badgeRightSub} legendItems={legendItems} height={height}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }} />
        </CardShell3D>
    );
}
