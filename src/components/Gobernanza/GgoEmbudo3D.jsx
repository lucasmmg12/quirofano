import React, { useEffect, useRef } from 'react';

function fmtMinShort(val) {
    if (val === null || val === undefined || Number.isNaN(Number(val))) return '0m';
    const n = Math.round(Number(val));
    if (n >= 120) {
        const h = Math.floor(n / 60);
        const m = n % 60;
        return `${h}h ${String(m).padStart(2, '0')}m`;
    }
    return `${n}m`;
}

/**
 * Embudo 3D Giratorio Interactivo (360° con drag + inercia + iluminación especular)
 * Representa dinámicamente la proporción de los 4 tramos del Cuello de Botella GGO → Quirófano.
 */
export default function GgoEmbudo3D({
    t1 = 0,
    t2 = 0,
    t3 = 0,
    t4 = 0,
    pctGgo = 0,
    pctPostGgo = 0,
}) {
    const canvasRef = useRef(null);

    const v1 = Math.max(0, Number(t1) || 0);
    const v2 = Math.max(0, Number(t2) || 0);
    const v3 = Math.max(0, Number(t3) || 0);
    const v4 = Math.max(0, Number(t4) || 0);
    const sum = Math.max(1, v1 + v2 + v3 + v4);

    const p1 = (v1 * 100) / sum;
    const p2 = (v2 * 100) / sum;
    const p3 = (v3 * 100) / sum;
    const p4 = (v4 * 100) / sum;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let rotY = 0.52;
        let rotX = 0.28;
        let dragging = false;
        let lastX = 0;
        let lastY = 0;
        let velY = 0.008;
        let velX = 0;
        let rafId = null;

        const onPointerDown = (e) => {
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        };
        const onPointerMove = (e) => {
            if (!dragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            rotY += dx * 0.011;
            rotX = Math.max(-1.15, Math.min(1.15, rotX + dy * 0.011));
            velY = dx * 0.004;
            velX = dy * 0.003;
            lastX = e.clientX;
            lastY = e.clientY;
        };
        const onPointerUp = () => { dragging = false; };

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);

        // Proporciones dinámicas de las cámaras según los datos reales del período
        const ggoShare = Math.max(0.12, Math.min(0.75, (v1 + v2) / sum));
        const topRadiusBoost = 10 + ggoShare * 34;
        const botRadiusBoost = 16 + (1 - ggoShare) * 40;
        const t1Cut = Math.max(0.03, Math.min(0.10, (v1 / sum) * 0.6 + 0.03));
        const ggoCut = Math.max(t1Cut + 0.14, Math.min(0.45, 0.14 + ggoShare * 0.35));
        const neckCut = ggoCut + 0.11;

        function rotatePt(x, y, z) {
            const cy = Math.cos(rotY), sy = Math.sin(rotY);
            const x1 = x * cy - z * sy;
            const z1 = x * sy + z * cy;
            const cx = Math.cos(rotX), sx = Math.sin(rotX);
            const y2 = y * cx - z1 * sx;
            const z2 = y * sx + z1 * cx;
            return [x1, y2, z2];
        }

        function shade(rgb, nx, ny, nz) {
            const lx = -0.45, ly = -0.65, lz = 0.72;
            const lLen = Math.hypot(lx, ly, lz);
            const dot = Math.max(0, (nx * lx + ny * ly + nz * lz) / lLen);
            const spec = Math.pow(Math.max(0, dot), 14) * 105;
            const k = 0.36 + dot * 0.72;
            const r = Math.min(255, Math.round(rgb[0] * k + spec));
            const g = Math.min(255, Math.round(rgb[1] * k + spec));
            const b = Math.min(255, Math.round(rgb[2] * k + spec));
            return `rgb(${r},${g},${b})`;
        }

        function funnelR(u) {
            if (u < ggoCut) {
                const t = u / ggoCut;
                return 16 + Math.sin(t * Math.PI) * topRadiusBoost;
            }
            if (u < neckCut) {
                return 11;
            }
            const t = (u - neckCut) / (1 - neckCut);
            return 12 + Math.sin(t * Math.PI * 0.92) * botRadiusBoost;
        }

        const render = () => {
            const w = canvas.clientWidth || 640;
            const h = canvas.clientHeight || 220;
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
            ctx.clearRect(0, 0, w, h);

            if (!dragging) {
                rotY += velY;
                velY = velY * 0.96 + 0.007 * 0.04;
                rotX += velX;
                velX *= 0.92;
            }

            // Sombra suave en el piso
            ctx.save();
            const shGrad = ctx.createRadialGradient(w * 0.48, h * 0.84, 8, w * 0.48, h * 0.84, 92);
            shGrad.addColorStop(0, 'rgba(15, 23, 42, 0.16)');
            shGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
            ctx.fillStyle = shGrad;
            ctx.beginPath();
            ctx.ellipse(w * 0.48, h * 0.84, 92, 18, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            const U = 36, V = 22, H = 148;
            const quads = [];
            for (let i = 0; i < U; i++) {
                const u0 = i / U, u1 = (i + 1) / U;
                const y0 = (u0 - 0.5) * H, y1 = (u1 - 0.5) * H;
                const r0 = funnelR(u0), r1 = funnelR(u1);
                const col = u0 < t1Cut
                    ? [59, 130, 246]
                    : (u0 < ggoCut
                        ? [219, 39, 119]
                        : (u0 < neckCut ? [245, 158, 11] : [220, 38, 38]));

                for (let j = 0; j < V; j++) {
                    const a0 = (j / V) * Math.PI * 2;
                    const a1 = ((j + 1) / V) * Math.PI * 2;
                    const pts = [
                        rotatePt(r0 * Math.cos(a0), y0, r0 * Math.sin(a0)),
                        rotatePt(r1 * Math.cos(a0), y1, r1 * Math.sin(a0)),
                        rotatePt(r1 * Math.cos(a1), y1, r1 * Math.sin(a1)),
                        rotatePt(r0 * Math.cos(a1), y0, r0 * Math.sin(a1)),
                    ];
                    const am = (a0 + a1) / 2;
                    const n = rotatePt(Math.cos(am), (r0 - r1) * 0.08, Math.sin(am));
                    const zAvg = (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4;
                    quads.push({ pts, z: zAvg, fill: shade(col, n[0], n[1], n[2]) });
                }
            }

            quads.sort((a, b) => a.z - b.z);
            const fov = 360;
            const cx = w * 0.48;
            const cy = h * 0.46;

            for (const q of quads) {
                ctx.beginPath();
                for (let k = 0; k < 4; k++) {
                    const [x, y, z] = q.pts[k];
                    const s = fov / (fov - z);
                    const px = cx + x * s;
                    const py = cy + y * s;
                    if (k === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fillStyle = q.fill;
                ctx.fill();
            }

            rafId = requestAnimationFrame(render);
        };

        rafId = requestAnimationFrame(render);

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerUp);
        };
    }, [v1, v2, v3, v4, sum]);

    const dominanteEsPost = pctPostGgo >= pctGgo;

    return (
        <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>
                        Embudo 3D de Cuello de Botella
                    </span>
                    <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                        background: '#EFF6FF', color: '#003B73', border: '1px solid #BFDBFE'
                    }}>
                        ↻ Arrastrá con el mouse para girar 360°
                    </span>
                </div>
                <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>
                    GGO: <b style={{ color: '#BE185D' }}>{pctGgo.toFixed(1)}% ({fmtMinShort(v1 + v2)})</b> · Post-GGO: <b style={{ color: '#DC2626' }}>{pctPostGgo.toFixed(1)}% ({fmtMinShort(v3 + v4)})</b>
                </div>
            </div>

            <div style={{
                position: 'relative',
                height: '220px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: 'linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 55%, #EFF6FF 100%)',
                overflow: 'hidden',
                userSelect: 'none'
            }}>
                <canvas
                    ref={canvasRef}
                    style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
                />

                <div style={{
                    position: 'absolute', right: '14px', top: '12px', textAlign: 'right', pointerEvents: 'none'
                }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.04em', color: dominanteEsPost ? '#DC2626' : '#BE185D', textTransform: 'uppercase' }}>
                        Cuello Dominante
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', lineHeight: 1.15 }}>
                        {(dominanteEsPost ? pctPostGgo : pctGgo).toFixed(1)}%{' '}
                        <span style={{ fontSize: '12px', fontWeight: 800, color: dominanteEsPost ? '#DC2626' : '#BE185D' }}>
                            {dominanteEsPost ? 'Post-GGO' : 'GGO'}
                        </span>
                    </div>
                </div>

                <div style={{
                    position: 'absolute', left: '12px', bottom: '10px', pointerEvents: 'none',
                    display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '11px', fontWeight: 700,
                    background: 'rgba(255,255,255,0.88)', padding: '6px 10px', borderRadius: '8px',
                    border: '1px solid #E2E8F0', color: '#334155'
                }}>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: '#3B82F6', marginRight: 4 }} />T1: {fmtMinShort(v1)} ({Math.round(p1)}%)</span>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: '#DB2777', marginRight: 4 }} />T2 GGO: {fmtMinShort(v2)} ({Math.round(p2)}%)</span>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: '#F59E0B', marginRight: 4 }} />T3 Adm: {fmtMinShort(v3)} ({Math.round(p3)}%)</span>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: '#DC2626', marginRight: 4 }} />T4 Qx: {fmtMinShort(v4)} ({Math.round(p4)}%)</span>
                </div>
            </div>
        </div>
    );
}
