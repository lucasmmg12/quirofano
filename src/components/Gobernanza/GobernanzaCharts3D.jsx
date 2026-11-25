import React, { useEffect, useRef } from 'react';

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

function phongShade(rgb, nx, ny, nz, alpha = 1) {
    const dot = Math.max(0, nx * -0.45 + ny * -0.65 + nz * 0.72);
    const spec = Math.pow(dot, 14) * 102;
    const k = 0.36 + dot * 0.72;
    const r = Math.min(255, Math.round(rgb[0] * k + spec));
    const g = Math.min(255, Math.round(rgb[1] * k + spec));
    const b = Math.min(255, Math.round(rgb[2] * k + spec));
    return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

function rgbCss(rgb) {
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function CardShell3D({ title, subtitle, badgeRightLabel, badgeRightValue, badgeRightSub, children, legendItems, height = 270 }) {
    return (
        <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '16px 18px',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
        }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{title}</h3>
                        <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                            background: '#EFF6FF', color: '#003B73', border: '1px solid #BFDBFE'
                        }}>
                            ↻ Arrastrá para girar 360°
                        </span>
                    </div>
                    {subtitle && <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>{subtitle}</p>}
                </div>
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
                    {legendItems.map((it, idx) => (
                        <div key={idx} style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderLeft: `3px solid ${rgbCss(it.rgb)}`,
                        }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {it.label}
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: 900, color: rgbCss(it.rgb), marginTop: '2px' }}>
                                {it.valueLabel}
                            </div>
                            {it.detail && <div style={{ fontSize: '10px', color: '#64748B' }}>{it.detail}</div>}
                        </div>
                    ))}
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
 * 2. ANILLO TOROIDAL 3D (Quirófano / DxI)
 */
export function AnilloToroidal3D({ title, subtitle, badgeRightLabel, badgeRightValue, badgeRightSub, segments = [], height = 270 }) {
    const canvasRef = useRef(null);
    const orbitRef = useDragOrbit(canvasRef, 0.55, 0.56, 0.007);
    const total = Math.max(0.0001, segments.reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0));
    const keySig = JSON.stringify(segments.map(s => [s.label, s.value]));

    useEffect(() => {
        const c = canvasRef.current;
        if (!c || !segments.length) return;
        const ctx = c.getContext('2d');
        let rafId = null;

        // Pre-compute cumulative thresholds
        let acc = 0;
        const stops = segments.map(s => {
            acc += Math.max(0, Number(s.value) || 0) / total;
            return { end: acc, rgb: s.rgb };
        });

        const getCol = (u) => {
            for (const st of stops) {
                if (u <= st.end) return st.rgb;
            }
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

            const sh = ctx.createRadialGradient(w * 0.5, h * 0.84, 10, w * 0.5, h * 0.84, 110);
            sh.addColorStop(0, 'rgba(15,23,42,0.16)');
            sh.addColorStop(1, 'rgba(15,23,42,0)');
            ctx.fillStyle = sh;
            ctx.beginPath();
            ctx.ellipse(w * 0.5, h * 0.84, 110, 20, 0, 0, Math.PI * 2);
            ctx.fill();

            const U = 64, V = 20, R = 76, rT = 24;
            const quads = [];
            for (let i = 0; i < U; i++) {
                const u0 = i / U, u1 = (i + 1) / U;
                const a0 = u0 * Math.PI * 2, a1 = u1 * Math.PI * 2;
                const col = getCol(u0);
                for (let j = 0; j < V; j++) {
                    const b0 = (j / V) * Math.PI * 2, b1 = ((j + 1) / V) * Math.PI * 2;
                    const pts = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => {
                        const rr = R + rT * Math.cos(b);
                        return rotatePt(rr * Math.cos(a), rT * Math.sin(b), rr * Math.sin(a), st.rotY, st.rotX);
                    });
                    const bm = (b0 + b1) / 2, am = (a0 + a1) / 2;
                    const norm = rotatePt(Math.cos(bm) * Math.cos(am), Math.sin(bm), Math.cos(bm) * Math.sin(am), st.rotY, st.rotX);
                    quads.push({
                        pts,
                        z: (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4,
                        fill: phongShade(col, norm[0], norm[1], norm[2])
                    });
                }
            }

            quads.sort((a, b) => a.z - b.z);
            const fov = 420, cx = w * 0.5, cy = h * 0.47;
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
        rgb: s.rgb,
        detail: s.detail,
    }));

    return (
        <CardShell3D title={title} subtitle={subtitle} badgeRightLabel={badgeRightLabel} badgeRightValue={badgeRightValue} badgeRightSub={badgeRightSub} legendItems={legendItems} height={height}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }} />
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
                        fill: phongShade(sg.rgb, norm[0], norm[1], norm[2])
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
        rgb: s.rgb,
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
            return { end: acc, rgb: s.rgb };
        });
        const getCol = (u) => {
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
        rgb: s.rgb,
        detail: s.detail,
    }));

    return (
        <CardShell3D title={title} subtitle={subtitle} badgeRightLabel={badgeRightLabel} badgeRightValue={badgeRightValue} badgeRightSub={badgeRightSub} legendItems={legendItems} height={height}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }} />
        </CardShell3D>
    );
}
