import React, { useEffect, useRef, useState, useMemo } from 'react';

/**
 * DxiSuperficieTopografica3D.jsx
 * Visualización 3D WebGL nativa (sin dependencias externas) de Superficie Topográfica Esculpida
 * para la Progresión Temporal de Diagnóstico por Imágenes (DxI).
 *
 * Estética Calidad-QOAG:
 *  - Malla paramétrica de alta densidad (160×64 = ~20.480 triángulos GPU) con shaders Blinn-Phong + Fresnel
 *  - Leyenda de planos Z en tarjeta flotante limpia (cero solapamiento al girar 360°)
 *  - Etiquetas de eje X con anti-colisión dinámica (mín. 54px entre fechas) y margen seguro inferior
 *  - Eje Y con cápsulas numéricas limpias y callout único de pico máximo con línea conectora
 *  - Tooltip clínico flotante al pasar el cursor sobre cualquier fecha/período
 */

function hexToRgb01(hex) {
    const clean = String(hex || '#003B73').replace('#', '');
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    const num = parseInt(full, 16) || 0x003B73;
    return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

function niceCeil(val) {
    if (!val || val <= 0) return 4;
    if (val <= 4) return 4;
    if (val <= 8) return 8;
    if (val <= 16) return 16;
    const mag = Math.pow(10, Math.floor(Math.log10(val)));
    const norm = val / mag;
    if (norm <= 1.2) return Math.ceil(1.2 * mag);
    if (norm <= 1.6) return Math.ceil(1.6 * mag);
    if (norm <= 2) return 2 * mag;
    if (norm <= 2.5) return 2.5 * mag;
    if (norm <= 4) return 4 * mag;
    if (norm <= 5) return 5 * mag;
    if (norm <= 8) return 8 * mag;
    return 10 * mag;
}

function evalSmooth(values, u) {
    const n = values.length;
    if (n === 0) return 0;
    if (n === 1) return Math.max(0, Number(values[0]) || 0);
    const f = Math.max(0, Math.min(n - 1, u * (n - 1)));
    const i = Math.min(n - 2, Math.floor(f));
    const t = f - i;
    const p0 = Number(values[Math.max(0, i - 1)]) || 0;
    const p1 = Number(values[i]) || 0;
    const p2 = Number(values[i + 1]) || 0;
    const p3 = Number(values[Math.min(n - 1, i + 2)]) || 0;
    const t2 = t * t;
    const t3 = t2 * t;
    const v = 0.5 * (
        (2 * p1) +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
    const localMax = Math.max(p1, p2) * 1.05;
    return Math.max(0, Math.min(localMax, v));
}

function mat4Perspective(fovRad, aspect, near, far) {
    const f = 1 / Math.tan(fovRad / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
    ]);
}

function mat4LookAt(eye, center, up) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let len = Math.hypot(zx, zy, zz) || 1; zx /= len; zy /= len; zz /= len;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1; xx /= len; xy /= len; xz /= len;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
        xx, yx, zx, 0,
        xy, yy, zy, 0,
        xz, yz, zz, 0,
        -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
        -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
        -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
        1
    ]);
}

function mat4Mul(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            out[c * 4 + r] =
                a[0 * 4 + r] * b[c * 4 + 0] +
                a[1 * 4 + r] * b[c * 4 + 1] +
                a[2 * 4 + r] * b[c * 4 + 2] +
                a[3 * 4 + r] * b[c * 4 + 3];
        }
    }
    return out;
}

function projectPoint(mvp, x, y, z, w, h) {
    const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
    const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
    const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
    if (cw <= 0.001) return null;
    return { sx: (cx / cw * 0.5 + 0.5) * w, sy: (0.5 - cy / cw * 0.5) * h };
}

const VS_SRC = `
  attribute vec3 aPos;
  attribute vec3 aNorm;
  attribute vec4 aCol;
  uniform mat4 uMVP;
  uniform float uScaleY;
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec4 vCol;
  void main() {
    vec3 p = vec3(aPos.x, aPos.y * uScaleY, aPos.z);
    vec3 n = normalize(vec3(aNorm.x, aNorm.y / max(0.06, uScaleY), aNorm.z));
    vPos = p;
    vNorm = n;
    vCol = aCol;
    gl_Position = uMVP * vec4(p, 1.0);
  }
`;

const FS_SRC = `
  precision mediump float;
  uniform vec3 uCamPos;
  uniform float uWire;
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec4 vCol;
  void main() {
    if (uWire > 0.5) {
      gl_FragColor = vec4(vCol.rgb * 0.72, 0.85);
      return;
    }
    vec3 N = normalize(vNorm);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(uCamPos - vPos);
    vec3 L1 = normalize(vec3(11.0, 22.0, 14.0));
    vec3 L2 = normalize(vec3(-14.0, 10.0, -12.0));

    float hemi = 0.5 + 0.5 * N.y;
    vec3 amb = mix(vec3(0.46, 0.52, 0.60), vec3(0.80, 0.84, 0.90), hemi) * 0.60;

    float d1 = max(dot(N, L1), 0.0);
    vec3 H1 = normalize(L1 + V);
    float spec1 = pow(max(dot(N, H1), 0.0), 52.0) * 0.48;

    float d2 = max(dot(N, L2), 0.0) * 0.30;
    vec3 rimCol = vec3(0.35, 0.72, 0.98) * d2;

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2) * 0.22;

    vec3 col = vCol.rgb * (amb + d1 * 0.82) + rimCol * vCol.rgb + vec3(spec1 + fresnel);
    col += vCol.rgb * clamp(vPos.y * 0.025, 0.0, 0.14);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), vCol.a);
  }
`;

export default function DxiSuperficieTopografica3D({
    data = [],
    series = [],
    granularity = 'dia',
    height = 420
}) {
    const wrapRef = useRef(null);
    const glCanvasRef = useRef(null);
    const hudCanvasRef = useRef(null);

    const [showWire, setShowWire] = useState(false);
    const [autoRotate, setAutoRotate] = useState(false);
    const [activePreset, setActivePreset] = useState('iso');
    const [hoverState, setHoverState] = useState(null); // { idx, x, y }
    const [webglError, setWebglError] = useState(false);
    const [triCount, setTriCount] = useState(0);

    const camRef = useRef({
        yaw: -0.46, pitch: 0.44, radius: 22.8,
        tYaw: -0.46, tPitch: 0.44, tRadius: 22.8,
        vYaw: 0, vPitch: 0,
        dragging: false, lx: 0, ly: 0,
        mx: -999, my: -999, hoveredIdx: -1
    });

    const showWireRef = useRef(showWire);
    const autoRotateRef = useRef(autoRotate);
    useEffect(() => { showWireRef.current = showWire; }, [showWire]);
    useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);

    // Preparar series activas con slots Z centrados y totales
    const preparedSeries = useMemo(() => {
        const list = (series || []).filter(s => s && s.key);
        const count = list.length;
        return list.map((s, idx) => {
            const values = data.map(d => Number(d?.[s.key]) || 0);
            const sum = values.reduce((a, b) => a + b, 0);
            const zSlot = count === 1 ? 0 : (idx - (count - 1) / 2);
            return {
                ...s,
                rgb: hexToRgb01(s.color),
                values,
                sum,
                zSlot
            };
        });
    }, [data, series]);

    const maxScaleVal = useMemo(() => {
        let maxV = 0;
        preparedSeries.forEach(s => {
            s.values.forEach(v => { if (v > maxV) maxV = v; });
        });
        return niceCeil(maxV);
    }, [preparedSeries]);

    // Pico principal de la primera serie (normalmente Total)
    const peakData = useMemo(() => {
        if (!preparedSeries.length || !data.length) return null;
        const primary = preparedSeries[0];
        let bestIdx = -1, bestVal = 0;
        primary.values.forEach((v, i) => {
            if (v > bestVal) { bestVal = v; bestIdx = i; }
        });
        if (bestIdx < 0 || bestVal <= 0) return null;
        return {
            idx: bestIdx,
            val: bestVal,
            label: data[bestIdx]?.label || '',
            color: primary.color,
            zSlot: primary.zSlot
        };
    }, [preparedSeries, data]);

    const applyPreset = (preset) => {
        setAutoRotate(false);
        setActivePreset(preset);
        const c = camRef.current;
        if (preset === 'iso') { c.tYaw = -0.46; c.tPitch = 0.44; c.tRadius = 22.8; }
        if (preset === 'front') { c.tYaw = 0.0; c.tPitch = 0.16; c.tRadius = 23.2; }
        if (preset === 'side') { c.tYaw = -1.16; c.tPitch = 0.36; c.tRadius = 21.8; }
        if (preset === 'top') { c.tYaw = -0.08; c.tPitch = 1.24; c.tRadius = 24.8; }
    };

    useEffect(() => {
        const wrap = wrapRef.current;
        const glCanvas = glCanvasRef.current;
        const hudCanvas = hudCanvasRef.current;
        if (!wrap || !glCanvas || !hudCanvas || !data.length || !preparedSeries.length) return;

        const gl = glCanvas.getContext('webgl', { antialias: true, alpha: true, preserveDrawingBuffer: false });
        if (!gl) {
            setWebglError(true);
            return;
        }
        setWebglError(false);

        const hud = hudCanvas.getContext('2d');

        // Compilar shaders
        const compile = (type, src) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            return sh;
        };
        const vs = compile(gl.VERTEX_SHADER, VS_SRC);
        const fs = compile(gl.FRAGMENT_SHADER, FS_SRC);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.useProgram(prog);

        const locPos = gl.getAttribLocation(prog, 'aPos');
        const locNorm = gl.getAttribLocation(prog, 'aNorm');
        const locCol = gl.getAttribLocation(prog, 'aCol');
        const uMVP = gl.getUniformLocation(prog, 'uMVP');
        const uCamPos = gl.getUniformLocation(prog, 'uCamPos');
        const uScaleY = gl.getUniformLocation(prog, 'uScaleY');
        const uWire = gl.getUniformLocation(prog, 'uWire');

        const WORLD_W = 18.4;
        const WORLD_H = 5.2;
        const Z_STEP = preparedSeries.length > 5 ? 1.25 : 1.6;
        const maxZSlot = Math.max(1.2, (preparedSeries.length - 1) / 2 + 0.55);
        const zMin = -maxZSlot * Z_STEP;
        const zMax = maxZSlot * Z_STEP;

        const dayToX = (i) => data.length === 1 ? 0 : (-WORLD_W * 0.5 + (i / (data.length - 1)) * WORLD_W);
        const valToY = (v) => (v / maxScaleVal) * WORLD_H;

        // Construir geometría topográfica de alta densidad (160×64 = 20.480 triángulos + balizas)
        const pos = [], norm = [], col = [];
        const wirePos = [], wireCol = [];
        let tris = 0;

        const pushTri = (p1, p2, p3, n1, n2, n3, c1, c2, c3) => {
            pos.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
            norm.push(n1[0], n1[1], n1[2], n2[0], n2[1], n2[2], n3[0], n3[1], n3[2]);
            col.push(c1[0], c1[1], c1[2], c1[3], c2[0], c2[1], c2[2], c2[3], c3[0], c3[1], c3[2], c3[3]);
            tris++;
        };

        const addQuadSmooth = (p1, p2, p3, p4, n1, n2, n3, n4, c1, c2, c3, c4) => {
            pushTri(p1, p2, p3, n1, n2, n3, c1, c2, c3);
            pushTri(p1, p3, p4, n1, n3, n4, c1, c3, c4);
        };

        const addSphere = (cx, cy, cz, r, segU, segV, rgba) => {
            for (let iv = 0; iv < segV; iv++) {
                const v1 = (iv / segV) * Math.PI, v2 = ((iv + 1) / segV) * Math.PI;
                for (let iu = 0; iu < segU; iu++) {
                    const u1 = (iu / segU) * Math.PI * 2, u2 = ((iu + 1) / segU) * Math.PI * 2;
                    const pt = (u, v) => {
                        const nx = Math.sin(v) * Math.cos(u), ny = Math.cos(v), nz = Math.sin(v) * Math.sin(u);
                        return { p: [cx + nx * r, cy + ny * r, cz + nz * r], n: [nx, ny, nz] };
                    };
                    const a = pt(u1, v1), b = pt(u2, v1), c = pt(u2, v2), d = pt(u1, v2);
                    addQuadSmooth(a.p, b.p, c.p, d.p, a.n, b.n, c.n, d.n, rgba, rgba, rgba, rgba);
                }
            }
        };

        const NX = 156;
        const NZ = 64;
        const gridP = [], gridC = [], gridN = [];
        const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        const cLow = [0.06, 0.52, 0.82];
        const cMid = [0.06, 0.72, 0.50];
        const cHi = [0.46, 0.25, 0.90];
        const cPeak = [0.88, 0.12, 0.30];
        const sigma = Z_STEP * 0.36;
        const twoSigmaSq = 2 * sigma * sigma;

        for (let iz = 0; iz <= NZ; iz++) {
            const z = zMin + (iz / NZ) * (zMax - zMin);
            const rowP = [], rowC = [], rowN = [];
            for (let ix = 0; ix <= NX; ix++) {
                const u = ix / NX;
                const x = -WORLD_W * 0.5 + u * WORLD_W;
                let num = 0, den = 0, sr = 0, sg = 0, sb = 0;
                for (let sIdx = 0; sIdx < preparedSeries.length; sIdx++) {
                    const s = preparedSeries[sIdx];
                    const dz = z - s.zSlot * Z_STEP;
                    const w = Math.exp(-(dz * dz) / twoSigmaSq);
                    const h = evalSmooth(s.values, u);
                    num += h * w;
                    den += w;
                    sr += s.rgb[0] * w;
                    sg += s.rgb[1] * w;
                    sb += s.rgb[2] * w;
                }
                const rawH = den > 0.001 ? num / Math.max(1, den) : 0;
                const normH = Math.min(1, rawH / maxScaleVal);
                let colH = normH < 0.35
                    ? lerp3(cLow, cMid, normH / 0.35)
                    : normH < 0.70
                        ? lerp3(cMid, cHi, (normH - 0.35) / 0.35)
                        : lerp3(cHi, cPeak, (normH - 0.70) / 0.30);
                const sCol = [sr / Math.max(0.01, den), sg / Math.max(0.01, den), sb / Math.max(0.01, den)];
                const fin = lerp3(colH, sCol, 0.46);
                rowP.push([x, valToY(rawH), z]);
                rowC.push([fin[0], fin[1], fin[2], 0.96]);
                rowN.push([0, 1, 0]);
            }
            gridP.push(rowP);
            gridC.push(rowC);
            gridN.push(rowN);
        }

        // Normales suavizadas
        for (let iz = 0; iz <= NZ; iz++) {
            for (let ix = 0; ix <= NX; ix++) {
                const pL = gridP[iz][Math.max(0, ix - 1)], pR = gridP[iz][Math.min(NX, ix + 1)];
                const pD = gridP[Math.max(0, iz - 1)][ix], pU = gridP[Math.min(NZ, iz + 1)][ix];
                const dx = pR[0] - pL[0], dyx = pR[1] - pL[1];
                const dz = pU[2] - pD[2], dyz = pU[1] - pD[1];
                const nx = -dyx / (dx || 1), ny = 1, nz = -dyz / (dz || 1);
                const l = Math.hypot(nx, ny, nz) || 1;
                gridN[iz][ix] = [nx / l, ny / l, nz / l];
            }
        }

        for (let iz = 0; iz < NZ; iz++) {
            for (let ix = 0; ix < NX; ix++) {
                addQuadSmooth(
                    gridP[iz][ix], gridP[iz + 1][ix], gridP[iz + 1][ix + 1], gridP[iz][ix + 1],
                    gridN[iz][ix], gridN[iz + 1][ix], gridN[iz + 1][ix + 1], gridN[iz][ix + 1],
                    gridC[iz][ix], gridC[iz + 1][ix], gridC[iz + 1][ix + 1], gridC[iz][ix + 1]
                );
            }
        }

        // Esfera blanca limpia en la cima del pico principal
        if (peakData) {
            addSphere(dayToX(peakData.idx), valToY(peakData.val) + 0.14, peakData.zSlot * Z_STEP, 0.16, 18, 12, [1, 1, 1, 1]);
        }

        // Wireframe para el botón "Ver Vectores"
        for (let t = 0; t < tris; t += 2) {
            const i = t * 9, ci = t * 12;
            const r = col[ci], g = col[ci + 1], b = col[ci + 2];
            wirePos.push(
                pos[i], pos[i + 1], pos[i + 2], pos[i + 3], pos[i + 4], pos[i + 5],
                pos[i + 3], pos[i + 4], pos[i + 5], pos[i + 6], pos[i + 7], pos[i + 8],
                pos[i + 6], pos[i + 7], pos[i + 8], pos[i], pos[i + 1], pos[i + 2]
            );
            for (let k = 0; k < 6; k++) wireCol.push(r, g, b, 1);
        }

        setTriCount(tris);

        // Plataforma base clínica
        const fPos = [], fNorm = [], fCol = [];
        const addFloorQuad = (p1, p2, p3, p4, n, rgba) => {
            fPos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
            for (let k = 0; k < 6; k++) { fNorm.push(...n); fCol.push(...rgba); }
        };
        const fw = WORLD_W * 0.5 + 0.75;
        const fd = zMax + 0.45;
        addFloorQuad([-fw, -0.02, -fd], [-fw, -0.02, fd], [fw, -0.02, fd], [fw, -0.02, -fd], [0, 1, 0], [0.97, 0.985, 1.0, 0.96]);
        addFloorQuad([-fw, -0.20, fd], [fw, -0.20, fd], [fw, -0.02, fd], [-fw, -0.02, fd], [0, 0, 1], [0.85, 0.90, 0.96, 1.0]);
        addFloorQuad([fw, -0.20, -fd], [-fw, -0.20, -fd], [-fw, -0.02, -fd], [fw, -0.02, -fd], [0, 0, -1], [0.82, 0.87, 0.94, 1.0]);
        addFloorQuad([-fw, -0.20, -fd], [-fw, -0.20, fd], [-fw, -0.02, fd], [-fw, -0.02, -fd], [-1, 0, 0], [0.83, 0.88, 0.95, 1.0]);
        addFloorQuad([fw, -0.20, fd], [fw, -0.20, -fd], [fw, -0.02, -fd], [fw, -0.02, fd], [1, 0, 0], [0.87, 0.91, 0.97, 1.0]);

        const mkBuf = (arr) => {
            const b = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
            return b;
        };
        const bufPos = mkBuf(pos), bufNorm = mkBuf(norm), bufCol = mkBuf(col);
        const bufWirePos = mkBuf(wirePos), bufWireCol = mkBuf(wireCol);
        const fPosBuf = mkBuf(fPos), fNormBuf = mkBuf(fNorm), fColBuf = mkBuf(fCol);
        const meshVerts = pos.length / 3;
        const wireVerts = wirePos.length / 3;
        const floorVerts = fPos.length / 3;

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = wrap.clientWidth || 800;
            const h = wrap.clientHeight || height;
            glCanvas.width = w * dpr;
            glCanvas.height = h * dpr;
            hudCanvas.width = w * dpr;
            hudCanvas.height = h * dpr;
            hud.setTransform(dpr, 0, 0, dpr, 0, 0);
            gl.viewport(0, 0, glCanvas.width, glCanvas.height);
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(wrap);

        const bindAndDraw = (pB, nB, cB, count, mode) => {
            gl.bindBuffer(gl.ARRAY_BUFFER, pB);
            gl.enableVertexAttribArray(locPos);
            gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 0, 0);

            if (nB) {
                gl.bindBuffer(gl.ARRAY_BUFFER, nB);
                gl.enableVertexAttribArray(locNorm);
                gl.vertexAttribPointer(locNorm, 3, gl.FLOAT, false, 0, 0);
            } else {
                gl.disableVertexAttribArray(locNorm);
                gl.vertexAttrib3f(locNorm, 0, 1, 0);
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, cB);
            gl.enableVertexAttribArray(locCol);
            gl.vertexAttribPointer(locCol, 4, gl.FLOAT, false, 0, 0);
            gl.drawArrays(mode, 0, count);
        };

        let animY = 0.08;
        let rafId = 0;
        let lastHoverIdx = -1;

        const render = () => {
            rafId = requestAnimationFrame(render);
            const w = wrap.clientWidth || 800;
            const h = wrap.clientHeight || height;
            const c = camRef.current;

            if (animY < 1) animY = Math.min(1, animY + 0.055);
            const easedY = 1 - Math.pow(1 - animY, 3);

            if (!c.dragging) {
                if (autoRotateRef.current) {
                    c.yaw += 0.0042;
                    c.tYaw = c.yaw;
                } else {
                    c.yaw += (c.tYaw - c.yaw) * 0.1 + c.vYaw;
                    c.pitch = Math.max(0.10, Math.min(1.38, c.pitch + (c.tPitch - c.pitch) * 0.1 + c.vPitch));
                    c.vYaw *= 0.88;
                    c.vPitch *= 0.88;
                }
            }
            c.radius += (c.tRadius - c.radius) * 0.12;

            // Desplazar ligeramente el target hacia abajo para dar aire al pico arriba y a las fechas abajo
            const target = [0, 1.55, 0];
            const eye = [
                target[0] + c.radius * Math.cos(c.pitch) * Math.sin(c.yaw),
                target[1] + c.radius * Math.sin(c.pitch),
                target[2] + c.radius * Math.cos(c.pitch) * Math.cos(c.yaw)
            ];

            const proj = mat4Perspective(35 * Math.PI / 180, w / Math.max(1, h), 0.2, 120);
            const view = mat4LookAt(eye, target, [0, 1, 0]);
            const mvp = mat4Mul(proj, view);

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.uniformMatrix4fv(uMVP, false, mvp);
            gl.uniform3f(uCamPos, eye[0], eye[1], eye[2]);

            // 1. Plataforma base
            gl.uniform1f(uScaleY, 1.0);
            gl.uniform1f(uWire, 0.0);
            bindAndDraw(fPosBuf, fNormBuf, fColBuf, floorVerts, gl.TRIANGLES);

            // 2. Superficie Topográfica
            gl.uniform1f(uScaleY, easedY);
            if (!showWireRef.current) {
                gl.uniform1f(uWire, 0.0);
                bindAndDraw(bufPos, bufNorm, bufCol, meshVerts, gl.TRIANGLES);
            } else {
                gl.uniform1f(uWire, 1.0);
                bindAndDraw(bufWirePos, null, bufWireCol, wireVerts, gl.LINES);
            }

            // 3. HUD 2D limpio y anti-solapamiento
            hud.clearRect(0, 0, w, h);

            const backZ = Math.cos(c.yaw) >= 0 ? -fd + 0.1 : fd - 0.1;
            const frontZ = -backZ;

            // Eje Y: 5 marcas limpias (0%, 25%, 50%, 75%, 100%)
            const yTicks = [0, maxScaleVal * 0.25, maxScaleVal * 0.5, maxScaleVal * 0.75, maxScaleVal];
            const leftX = -WORLD_W * 0.5 - 0.45;
            const rightX = WORLD_W * 0.5 + 0.45;
            const yLabelSideX = Math.sin(c.yaw) > 0.65 ? rightX + 0.7 : leftX - 0.7;

            yTicks.forEach((tk, idx) => {
                const y = valToY(tk);
                const a = projectPoint(mvp, leftX, y, backZ, w, h);
                const b = projectPoint(mvp, rightX, y, backZ, w, h);
                if (a && b) {
                    hud.beginPath();
                    hud.moveTo(a.sx, a.sy);
                    hud.lineTo(b.sx, b.sy);
                    hud.strokeStyle = idx === 0 ? 'rgba(148, 163, 184, 0.55)' : 'rgba(148, 163, 184, 0.28)';
                    hud.lineWidth = idx === 0 ? 1.2 : 1;
                    hud.setLineDash(idx === 0 ? [] : [4, 4]);
                    hud.stroke();
                    hud.setLineDash([]);
                }
                const lp = projectPoint(mvp, yLabelSideX, y, backZ, w, h);
                if (lp && lp.sy > 18 && lp.sy < h - 22) {
                    const txt = Math.round(tk).toLocaleString('es-AR');
                    hud.font = '700 10.5px Inter, -apple-system, sans-serif';
                    const tw = hud.measureText(txt).width + 12;
                    const bx = lp.sx - tw / 2;
                    const by = lp.sy - 9;
                    hud.fillStyle = 'rgba(255, 255, 255, 0.88)';
                    hud.strokeStyle = '#E2E8F0';
                    hud.lineWidth = 1;
                    hud.beginPath();
                    hud.roundRect(bx, by, tw, 18, 6);
                    hud.fill();
                    hud.stroke();
                    hud.fillStyle = '#475569';
                    hud.textAlign = 'center';
                    hud.fillText(txt, lp.sx, lp.sy + 3.5);
                }
            });

            // Líneas del piso + detección de hover por fecha
            let bestIdx = -1;
            let bestDist = 26;
            const dateLabelCandidates = [];

            for (let i = 0; i < data.length; i++) {
                const x = dayToX(i);
                const p1 = projectPoint(mvp, x, 0.01, -fd + 0.1, w, h);
                const p2 = projectPoint(mvp, x, 0.01, fd - 0.1, w, h);
                if (p1 && p2) {
                    const midX = (p1.sx + p2.sx) * 0.5;
                    if (!c.dragging && c.mx > 0 && c.my > 32 && c.my < h - 20) {
                        const dist = Math.abs(c.mx - midX);
                        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
                    }
                    const isHov = i === c.hoveredIdx;
                    hud.beginPath();
                    hud.moveTo(p1.sx, p1.sy);
                    hud.lineTo(p2.sx, p2.sy);
                    hud.strokeStyle = isHov ? 'rgba(0, 59, 115, 0.65)' : 'rgba(203, 213, 225, 0.35)';
                    hud.lineWidth = isHov ? 2.2 : 0.75;
                    hud.stroke();
                }

                const lp = projectPoint(mvp, x, -0.04, frontZ + (frontZ > 0 ? 0.52 : -0.52), w, h);
                if (lp && lp.sx > 34 && lp.sx < w - 34 && lp.sy > 24 && lp.sy < h - 14) {
                    dateLabelCandidates.push({ i, sx: lp.sx, sy: lp.sy, label: data[i]?.label || '' });
                }
            }
            c.hoveredIdx = bestIdx;
            if (bestIdx !== lastHoverIdx) {
                lastHoverIdx = bestIdx;
                if (bestIdx >= 0) setHoverState({ idx: bestIdx, x: c.mx, y: c.my });
                else setHoverState(null);
            } else if (bestIdx >= 0 && !c.dragging) {
                setHoverState({ idx: bestIdx, x: c.mx, y: c.my });
            }

            // Dibujar fechas del eje X con ANTI-COLISIÓN (mínimo 56px entre etiquetas)
            dateLabelCandidates.sort((a, b) => a.sx - b.sx);
            let lastDrawnX = -999;
            dateLabelCandidates.forEach((item, k) => {
                const isFirstOrLast = item.i === 0 || item.i === data.length - 1;
                const isHov = item.i === c.hoveredIdx;
                const minGap = isHov ? 36 : 56;
                if (!isHov && item.sx - lastDrawnX < minGap) {
                    // Si es la última fecha y está muy cerca, evitar pisarla
                    if (!isFirstOrLast) return;
                    if (item.sx - lastDrawnX < 40) return;
                }
                lastDrawnX = item.sx;
                hud.font = isHov ? '800 10.5px Inter, -apple-system, sans-serif' : '600 10px Inter, -apple-system, sans-serif';
                const tw = hud.measureText(item.label).width + 10;
                const safeY = Math.min(h - 14, item.sy);
                if (isHov) {
                    hud.fillStyle = '#003B73';
                    hud.beginPath();
                    hud.roundRect(item.sx - tw / 2, safeY - 10, tw, 18, 6);
                    hud.fill();
                    hud.fillStyle = '#FFFFFF';
                } else {
                    hud.fillStyle = 'rgba(255, 255, 255, 0.80)';
                    hud.beginPath();
                    hud.roundRect(item.sx - tw / 2, safeY - 9, tw, 16, 5);
                    hud.fill();
                    hud.fillStyle = '#475569';
                }
                hud.textAlign = 'center';
                hud.fillText(item.label, item.sx, safeY + 3);
            });

            // Callout único del Pico Máximo con línea conectora sutil
            if (peakData) {
                const xPk = dayToX(peakData.idx);
                const yPk = valToY(peakData.val) * easedY + 0.16;
                const zPk = peakData.zSlot * Z_STEP;
                const pTop = projectPoint(mvp, xPk, yPk, zPk, w, h);
                const pBadge = projectPoint(mvp, xPk, yPk + 0.78, zPk, w, h);
                if (pTop && pBadge) {
                    const by = Math.max(20, pBadge.sy);
                    hud.beginPath();
                    hud.moveTo(pTop.sx, pTop.sy - 4);
                    hud.lineTo(pBadge.sx, by + 11);
                    hud.strokeStyle = 'rgba(225, 29, 72, 0.65)';
                    hud.lineWidth = 1.4;
                    hud.setLineDash([3, 3]);
                    hud.stroke();
                    hud.setLineDash([]);

                    const txt = `Pico: ${peakData.val.toLocaleString('es-AR')} (${peakData.label})`;
                    hud.font = '800 10.5px Inter, -apple-system, sans-serif';
                    const tw = hud.measureText(txt).width + 16;
                    const bx = Math.max(12, Math.min(w - tw - 12, pBadge.sx - tw / 2));
                    hud.fillStyle = '#0F172A';
                    hud.beginPath();
                    hud.roundRect(bx, by - 11, tw, 22, 999);
                    hud.fill();
                    hud.fillStyle = '#FFFFFF';
                    hud.textAlign = 'center';
                    hud.fillText(txt, bx + tw / 2, by + 3.5);
                }
            }
        };

        render();

        return () => {
            cancelAnimationFrame(rafId);
            ro.disconnect();
            [bufPos, bufNorm, bufCol, bufWirePos, bufWireCol, fPosBuf, fNormBuf, fColBuf].forEach(b => gl.deleteBuffer(b));
            gl.deleteProgram(prog);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
        };
    }, [data, preparedSeries, maxScaleVal, peakData, height]);

    const handlePointerDown = (e) => {
        setAutoRotate(false);
        setActivePreset('');
        const c = camRef.current;
        c.dragging = true;
        c.lx = e.clientX;
        c.ly = e.clientY;
        c.vYaw = 0;
        c.vPitch = 0;
        setHoverState(null);
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };

    const handlePointerMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const c = camRef.current;
        c.mx = e.clientX - rect.left;
        c.my = e.clientY - rect.top;
        if (c.dragging) {
            const dx = e.clientX - c.lx;
            const dy = e.clientY - c.ly;
            c.lx = e.clientX;
            c.ly = e.clientY;
            c.vYaw = dx * 0.007;
            c.vPitch = dy * 0.0055;
            c.yaw += c.vYaw;
            c.pitch = Math.max(0.10, Math.min(1.38, c.pitch + c.vPitch));
            c.tYaw = c.yaw;
            c.tPitch = c.pitch;
        }
    };

    const handlePointerUp = () => {
        camRef.current.dragging = false;
    };

    const handlePointerLeave = () => {
        const c = camRef.current;
        c.dragging = false;
        c.mx = -999;
        c.my = -999;
        c.hoveredIdx = -1;
        setHoverState(null);
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const c = camRef.current;
        c.tRadius = Math.max(12, Math.min(36, c.tRadius + e.deltaY * 0.014));
    };

    if (webglError) {
        return (
            <div style={{
                height: `${height}px`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.84rem'
            }}>
                WebGL no está disponible en este navegador. Cambiá a la vista 2D Líneas en el selector superior.
            </div>
        );
    }

    const hoveredRow = hoverState && data[hoverState.idx] ? data[hoverState.idx] : null;
    const wrapW = wrapRef.current?.clientWidth || 900;

    return (
        <div
            ref={wrapRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onWheel={handleWheel}
            style={{
                position: 'relative',
                width: '100%',
                height: `${height}px`,
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                background: 'radial-gradient(ellipse at 50% 24%, #FFFFFF 0%, #F1F6FC 68%, #E4EEF9 100%)',
                overflow: 'hidden',
                cursor: 'grab',
                userSelect: 'none',
                touchAction: 'none'
            }}
        >
            <canvas ref={glCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
            <canvas ref={hudCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />

            {/* ── LEYENDA FLOTANTE LIMPIA (Planos de Profundidad Z: atrás → adelante, CERO solapamiento) ── */}
            <div
                onPointerDown={e => e.stopPropagation()}
                style={{
                    position: 'absolute',
                    top: '12px',
                    left: '14px',
                    background: 'rgba(255, 255, 255, 0.90)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '9px 12px',
                    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)',
                    maxWidth: '240px',
                    pointerEvents: 'auto'
                }}
            >
                <div style={{
                    fontSize: '0.64rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#64748B',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px'
                }}>
                    <span>Planos 3D (fondo → frente)</span>
                    <span style={{ color: '#003B73', fontWeight: 700 }}>{triCount > 0 ? `${(triCount / 1000).toFixed(1)}k △` : ''}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {preparedSeries.map((s, idx) => (
                        <div key={s.key} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            fontSize: '0.72rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                <span style={{
                                    width: '9px',
                                    height: '9px',
                                    borderRadius: '50%',
                                    background: s.color,
                                    flexShrink: 0,
                                    boxShadow: `0 0 0 2px ${s.color}25`
                                }} />
                                <span style={{
                                    color: '#1E293B',
                                    fontWeight: idx === 0 ? 800 : 600,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    {s.shortLabel || s.label}
                                </span>
                            </div>
                            <span style={{
                                color: '#475569',
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums',
                                flexShrink: 0
                            }}>
                                {s.sum.toLocaleString('es-AR')}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── CONTROLES DE CÁMARA DISCRETOS (esquina superior derecha) ── */}
            <div
                onPointerDown={e => e.stopPropagation()}
                style={{
                    position: 'absolute',
                    top: '12px',
                    right: '14px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(255, 255, 255, 0.90)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '4px',
                    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)'
                }}
            >
                {[
                    { id: 'iso', label: 'Isométrica' },
                    { id: 'front', label: 'Frontal' },
                    { id: 'side', label: 'Lateral' },
                    { id: 'top', label: 'Cenital' }
                ].map(p => (
                    <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p.id)}
                        style={{
                            border: 'none',
                            borderRadius: '7px',
                            padding: '4px 8px',
                            fontSize: '0.70rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: activePreset === p.id ? '#003B73' : 'transparent',
                            color: activePreset === p.id ? '#FFFFFF' : '#475569',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        {p.label}
                    </button>
                ))}
                <div style={{ width: '1px', height: '16px', background: '#E2E8F0', margin: '0 2px' }} />
                <button
                    type="button"
                    onClick={() => setShowWire(v => !v)}
                    title="Mostrar malla poligonal de vectores"
                    style={{
                        border: 'none',
                        borderRadius: '7px',
                        padding: '4px 8px',
                        fontSize: '0.70rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: showWire ? '#003B73' : 'transparent',
                        color: showWire ? '#FFFFFF' : '#475569'
                    }}
                >
                    ⬡ Vectores
                </button>
                <button
                    type="button"
                    onClick={() => setAutoRotate(v => !v)}
                    title="Activar/pausar rotación automática"
                    style={{
                        border: 'none',
                        borderRadius: '7px',
                        padding: '4px 8px',
                        fontSize: '0.70rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: autoRotate ? '#003B73' : 'transparent',
                        color: autoRotate ? '#FFFFFF' : '#475569'
                    }}
                >
                    ↻ Giro
                </button>
            </div>

            {/* ── TOOLTIP CLÍNICO FLOTANTE EN HOVER ── */}
            {hoveredRow && hoverState && (
                <div style={{
                    position: 'absolute',
                    left: `${Math.min(wrapW - 235, Math.max(14, hoverState.x + 16))}px`,
                    top: `${Math.min(height - 175, Math.max(14, hoverState.y - 24))}px`,
                    background: 'rgba(15, 23, 42, 0.94)',
                    backdropFilter: 'blur(8px)',
                    color: '#FFFFFF',
                    borderRadius: '10px',
                    padding: '10px 13px',
                    minWidth: '215px',
                    fontSize: '0.74rem',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    boxShadow: '0 10px 26px rgba(15, 23, 42, 0.28)',
                    pointerEvents: 'none',
                    zIndex: 25
                }}>
                    <div style={{
                        fontWeight: 800,
                        color: '#7DD3FC',
                        borderBottom: '1px solid rgba(255,255,255,0.14)',
                        paddingBottom: '5px',
                        marginBottom: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '8px'
                    }}>
                        <span>{granularity === 'dia' ? `Fecha: ${hoveredRow.fullDate || hoveredRow.label}` : `Período: ${hoveredRow.label}`}</span>
                    </div>
                    {preparedSeries.map(s => (
                        <div key={s.key} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px',
                            margin: '3px 0'
                        }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#E2E8F0' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
                                {s.shortLabel || s.label}
                            </span>
                            <strong style={{ color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                                {(Number(hoveredRow[s.key]) || 0).toLocaleString('es-AR')}
                            </strong>
                        </div>
                    ))}
                </div>
            )}

            {/* ── INDICADOR SUTIL DE INTERACCIÓN ── */}
            <div style={{
                position: 'absolute',
                bottom: '10px',
                right: '14px',
                background: 'rgba(255, 255, 255, 0.85)',
                border: '1px solid #E2E8F0',
                borderRadius: '999px',
                padding: '3px 10px',
                fontSize: '0.67rem',
                fontWeight: 600,
                color: '#64748B',
                pointerEvents: 'none'
            }}>
                Arrastrá para girar 360° · Rueda para zoom
            </div>
        </div>
    );
}
