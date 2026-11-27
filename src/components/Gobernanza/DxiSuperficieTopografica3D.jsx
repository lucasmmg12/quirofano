import React, { useEffect, useRef, useState, useMemo } from 'react';

/**
 * DxiSuperficieTopografica3D.jsx — v3.0 Full-Width & High-Contrast Multi-Lane 3D Engine
 *
 * Soluciona los 2 problemas clave:
 *  1. OCUPA TODO EL ESPACIO (Full-Width 92%+ del contenedor):
 *     - Geometría panorámica ancha (WORLD_W = 28.0) con proyección adaptativa al aspect-ratio
 *       para que el gráfico llene de borde a borde el contenedor sin dejar grandes espacios vacíos.
 *     - La leyenda lateral pesada se reemplaza por una barra superior compacta e interactiva
 *       que permite resaltar o aislar cada serie al pasar el mouse o hacer clic.
 *  2. DIFERENCIACIÓN TOTAL DE COLORES (Cero mezcla borrosa):
 *     - Cada serie (Total General, Obra Social, Ecografía, Radiología, Mamografía, Tomografía,
 *       Densitometría, Ecocardiograma, Particulares) se dibuja en su propio CARRIL 3D INDEPENDIENTE
 *       con su color institucional puro de alto contraste, cresta luminosa superior, paredes
 *       volumétricas biseladas y etiqueta directa en el extremo del carril.
 *     - Incluye 3 modos 3D intercambiables al instante:
 *       • "Crestas 3D" (Cintas volumétricas extrusionadas por serie — por defecto)
 *       • "Columnas 3D" (Prismas 3D apilados/agrupados por día y modalidad)
 *       • "Superficie 3D" (Terreno 3D segmentado por franjas de color puro sin mezcla grisácea)
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
    if (val <= 10) return 10;
    const mag = Math.pow(10, Math.floor(Math.log10(val)));
    const norm = val / mag;
    if (norm <= 1.2) return Math.ceil(1.2 * mag);
    if (norm <= 1.5) return Math.ceil(1.5 * mag);
    if (norm <= 2) return 2 * mag;
    if (norm <= 2.5) return 2.5 * mag;
    if (norm <= 3) return 3 * mag;
    if (norm <= 4) return 4 * mag;
    if (norm <= 5) return 5 * mag;
    if (norm <= 6) return 6 * mag;
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
    const localMax = Math.max(p1, p2) * 1.04;
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
    return { sx: (cx / cw * 0.5 + 0.5) * w, sy: (0.5 - cy / cw * 0.5) * h, depth: cw };
}

const VS_SRC = `
  attribute vec3 aPos;
  attribute vec3 aNorm;
  attribute vec4 aCol;
  uniform mat4 uMVP;
  uniform float uScaleY;
  uniform float uFlowX;
  uniform float uFlowWidth;
  uniform float uFlowActive;
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec4 vCol;
  varying float vWaveGlow;
  void main() {
    float reveal = 1.0;
    float glow = 0.0;
    if (uFlowActive > 0.5) {
      float edge = smoothstep(uFlowX - uFlowWidth, uFlowX, aPos.x);
      reveal = 1.0 - edge;
      // Suave pulso ascendente en el frente de onda donde fluyen y cargan los datos
      float band = exp(-pow((aPos.x - (uFlowX - uFlowWidth * 0.45)) / max(0.6, uFlowWidth * 0.32), 2.0));
      glow = band * step(0.02, aPos.y);
      reveal = clamp(reveal + band * 0.10, 0.0, 1.08);
    }
    float effY = uScaleY * reveal;
    vec3 p = vec3(aPos.x, aPos.y * effY, aPos.z);
    vec3 n = normalize(vec3(aNorm.x, aNorm.y / max(0.08, effY), aNorm.z));
    vPos = p;
    vNorm = n;
    vCol = aCol;
    vWaveGlow = glow;
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
  varying float vWaveGlow;
  void main() {
    if (uWire > 0.5) {
      gl_FragColor = vec4(vCol.rgb * 0.85 + vec3(vWaveGlow * 0.35), 0.92);
      return;
    }
    vec3 N = normalize(vNorm);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(uCamPos - vPos);
    vec3 L1 = normalize(vec3(10.0, 24.0, 16.0));
    vec3 L2 = normalize(vec3(-14.0, 12.0, -10.0));

    float hemi = 0.52 + 0.48 * N.y;
    float d1 = max(dot(N, L1), 0.0);
    float d2 = max(dot(N, L2), 0.0) * 0.25;

    vec3 H1 = normalize(L1 + V);
    float spec = pow(max(dot(N, H1), 0.0), 42.0) * 0.34;
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.16;

    // Conserva la pureza cromática de cada serie con destello en el frente de onda de carga
    float lightFactor = 0.52 * hemi + 0.54 * d1 + d2;
    vec3 col = vCol.rgb * lightFactor + vec3(spec + fresnel * 0.5) + mix(vCol.rgb, vec3(1.0), 0.65) * (vWaveGlow * 0.48);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), vCol.a);
  }
`;

// Paleta de alta distinción cromática por clave para evitar colores parecidos
const HIGH_CONTRAST_COLORS = {
    total: '#1D4ED8',         // Azul Rey Intenso
    obraSocial: '#0D9488',    // Teal Esmeralda
    particular: '#EA580C',    // Naranja Vivo
    ECOGRAFIA: '#0284C7',     // Cyan Cobalto
    RADIOLOGIA: '#7C3AED',    // Violeta Profundo
    MAMOGRAFIA: '#DB2777',    // Magenta Clínico
    TOMOGRAFIA: '#D97706',    // Ámbar Dorado
    DENSITOMETRIA: '#16A34A', // Verde Clínico Puro
    ECOCARDIO: '#E11D48',     // Rojo Carmesí
    ambulatorio: '#16A34A',
    hospitalizacion: '#7C3AED'
};

const CROSS_MODALITIES = [
    { key: 'ECOGRAFIA', label: 'Ecografía', color: '#003B73' },
    { key: 'RADIOLOGIA', label: 'Radiología', color: '#0284C7' },
    { key: 'MAMOGRAFIA', label: 'Mamografía', color: '#DB2777' },
    { key: 'TOMOGRAFIA', label: 'Tomografía', color: '#7C3AED' },
    { key: 'DENSITOMETRIA', label: 'Densitometría', color: '#059669' },
    { key: 'ECOCARDIO', label: 'Ecocardio', color: '#E11D48' },
];

const CROSS_COVERAGES = [
    { key: 'all', label: 'Todos', color: '#003B73' },
    { key: 'os', label: 'Obra Social', color: '#0D9488' },
    { key: 'part', label: 'Particulares', color: '#EA580C' },
];

export default function DxiSuperficieTopografica3D({
    data = [],
    series = [],
    granularity = 'dia',
    height = 460,
    enableCrossStudio = false,
}) {
    const wrapRef = useRef(null);
    const glCanvasRef = useRef(null);
    const hudCanvasRef = useRef(null);

    const [visualMode] = useState('ribbons');
    const [scaleMode] = useState('global');
    const [selectedKeys, setSelectedKeys] = useState([]);
    // Selector combinable 2D: Cobertura (Todos / Obra Social / Particulares) × Estudios (multi-selección)
    const [selectedCoverages, setSelectedCoverages] = useState(['all']);
    const [selectedModalities, setSelectedModalities] = useState([]);
    const [flowTrigger, setFlowTrigger] = useState(0);
    const [showWire] = useState(false);
    const [autoRotate] = useState(false);
    const [hoverState, setHoverState] = useState(null);
    const [webglError, setWebglError] = useState(false);

    // Limpiar claves que ya no existan si el usuario cambió filtros externos
    useEffect(() => {
        const validKeys = new Set((series || []).map(s => s?.key).filter(Boolean));
        setSelectedKeys(prev => {
            const next = prev.filter(k => validKeys.has(k));
            return next.length === prev.length ? prev : next;
        });
    }, [series]);

    const handleToggleCoverage = (covKey) => {
        setSelectedCoverages(prev => {
            if (prev.includes(covKey)) {
                if (prev.length === 1) return prev; // mantener al menos 1 activa
                return prev.filter(k => k !== covKey);
            }
            return [...prev, covKey];
        });
        setFlowTrigger(t => t + 1);
    };

    const handleToggleModality = (modKey) => {
        setSelectedModalities(prev => (
            prev.includes(modKey) ? prev.filter(k => k !== modKey) : [...prev, modKey]
        ));
        setFlowTrigger(t => t + 1);
    };

    const handleResetCross = () => {
        setSelectedCoverages(['all']);
        setSelectedModalities([]);
        setSelectedKeys([]);
        const c = camRef.current;
        c.tYaw = 0.0;
        c.tPitch = 0.22;
        c.tRadius = 22.0;
        setFlowTrigger(t => t + 1);
    };

    // Cámara inicial siempre en vista Frontal ocupando todo el ancho del lienzo
    const camRef = useRef({
        yaw: 0.0, pitch: 0.22, radius: 22.0,
        tYaw: 0.0, tPitch: 0.22, tRadius: 22.0,
        shiftX: 0,
        vYaw: 0, vPitch: 0,
        dragging: false, lx: 0, ly: 0,
        mx: -999, my: -999, hoveredIdx: -1
    });

    const showWireRef = useRef(showWire);
    const autoRotateRef = useRef(autoRotate);
    useEffect(() => { showWireRef.current = showWire; }, [showWire]);
    useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);

    const isCrossFocused = enableCrossStudio && (
        selectedModalities.length > 0 ||
        selectedCoverages.length > 1 ||
        (selectedCoverages.length === 1 && selectedCoverages[0] !== 'all')
    );

    const isCrossFocusedRef = useRef(isCrossFocused);
    useEffect(() => {
        isCrossFocusedRef.current = isCrossFocused;
        const c = camRef.current;
        c.tRadius = isCrossFocused ? 31.5 : 22.0;
    }, [isCrossFocused]);

    // Totales por modalidad + top 3 días/períodos de mayor demanda (para el panel de insights izquierdo)
    const modalityBreakdown = useMemo(() => {
        const res = {};
        CROSS_MODALITIES.forEach(m => {
            let total = 0, os = 0, part = 0, peakVal = 0, peakLabel = '';
            const dayList = [];
            data.forEach(d => {
                const vAll = Number(d?.[m.key]) || 0;
                const vOs = Number(d?.[`${m.key}_OS`]) || 0;
                const vPart = Number(d?.[`${m.key}_PART`]) || 0;
                total += vAll;
                os += vOs;
                part += vPart;
                if (vAll > 0) dayList.push({ label: d?.label || '', val: vAll, os: vOs, part: vPart });
                if (vAll > peakVal) {
                    peakVal = vAll;
                    peakLabel = d?.label || '';
                }
            });
            const avg = data.length > 0 ? (total / data.length) : 0;
            const activeAvg = dayList.length > 0 ? (total / dayList.length) : 0;
            const topDays = [...dayList].sort((a, b) => b.val - a.val).slice(0, 3);
            const minDay = dayList.length > 0 ? [...dayList].sort((a, b) => a.val - b.val)[0] : null;
            res[m.key] = {
                ...m,
                total,
                os,
                part,
                osPct: total > 0 ? ((os * 100) / total).toFixed(1) : '0.0',
                partPct: total > 0 ? ((part * 100) / total).toFixed(1) : '0.0',
                peakVal,
                peakLabel,
                avg: avg.toFixed(1),
                activeAvg: activeAvg.toFixed(1),
                activeDays: dayList.length,
                topDays,
                minDay,
            };
        });
        return res;
    }, [data]);

    // Totales generales de cobertura (para cuando no hay estudio específico seleccionado)
    const generalBreakdown = useMemo(() => {
        let total = 0, os = 0, part = 0, peakVal = 0, peakLabel = '';
        data.forEach(d => {
            const vAll = Number(d?.total) || 0;
            total += vAll;
            os += Number(d?.obraSocial) || 0;
            part += Number(d?.particular) || 0;
            if (vAll > peakVal) { peakVal = vAll; peakLabel = d?.label || ''; }
        });
        return {
            total,
            os,
            part,
            osPct: total > 0 ? ((os * 100) / total).toFixed(1) : '0.0',
            partPct: total > 0 ? ((part * 100) / total).toFixed(1) : '0.0',
            peakVal,
            peakLabel,
            avg: data.length > 0 ? (total / data.length).toFixed(1) : '0.0',
        };
    }, [data]);

    // Series cruzadas en tiempo real (Estudios × Coberturas)
    const effectiveSeriesInput = useMemo(() => {
        if (!enableCrossStudio) return series || [];
        const out = [];
        if (selectedModalities.length > 0) {
            selectedModalities.forEach(modKey => {
                const modMeta = CROSS_MODALITIES.find(m => m.key === modKey);
                if (!modMeta) return;
                selectedCoverages.forEach(covKey => {
                    if (covKey === 'all') {
                        out.push({
                            key: modKey,
                            label: `${modMeta.label} · Todos`,
                            shortLabel: selectedCoverages.length > 1 ? `${modMeta.label} (Todos)` : modMeta.label,
                            color: modMeta.color,
                        });
                    } else if (covKey === 'os') {
                        out.push({
                            key: `${modKey}_OS`,
                            label: `${modMeta.label} · Obra Social`,
                            shortLabel: `${modMeta.label} (OS)`,
                            color: selectedModalities.length === 1 ? '#0D9488' : modMeta.color,
                        });
                    } else if (covKey === 'part') {
                        out.push({
                            key: `${modKey}_PART`,
                            label: `${modMeta.label} · Particulares`,
                            shortLabel: `${modMeta.label} (Part.)`,
                            color: selectedModalities.length === 1 ? '#EA580C' : '#EA580C',
                        });
                    }
                });
            });
            return out;
        }
        // Sin modalidad elegida: si eligió coberturas específicas (OS / Particulares), mostrar esas curvas
        if (selectedCoverages.length > 1 || selectedCoverages[0] !== 'all') {
            selectedCoverages.forEach(covKey => {
                if (covKey === 'all') out.push({ key: 'total', label: 'Total General', shortLabel: 'Todos', color: '#003B73' });
                if (covKey === 'os') out.push({ key: 'obraSocial', label: 'Obra Social', shortLabel: 'Obra Social', color: '#0D9488' });
                if (covKey === 'part') out.push({ key: 'particular', label: 'Particulares', shortLabel: 'Particulares', color: '#EA580C' });
            });
            return out;
        }
        // Vista general por defecto: mostrar las 6 modalidades + Total
        return (series || []).filter(s => s && s.key);
    }, [enableCrossStudio, series, selectedModalities, selectedCoverages]);

    // Todas las series preparadas
    const allPreparedSeries = useMemo(() => {
        const list = (effectiveSeriesInput || []).filter(s => s && s.key);
        return list.map((s) => {
            const distinctColor = s.color || HIGH_CONTRAST_COLORS[s.key] || '#003B73';
            const values = data.map(d => Number(d?.[s.key]) || 0);
            const sum = values.reduce((a, b) => a + b, 0);
            const maxVal = Math.max(1, ...values);
            let peakIdx = 0;
            values.forEach((v, i) => { if (v > values[peakIdx]) peakIdx = i; });
            return {
                ...s,
                color: distinctColor,
                rgb: hexToRgb01(distinctColor),
                values,
                sum,
                maxVal,
                peakIdx,
                peakVal: values[peakIdx] || 0
            };
        });
    }, [data, effectiveSeriesInput]);

    // Series activas que se renderizan en la escena 3D (centradas dinámicamente en Z)
    const preparedSeries = useMemo(() => {
        const filtered = !enableCrossStudio && selectedKeys.length > 0
            ? allPreparedSeries.filter(s => selectedKeys.includes(s.key))
            : allPreparedSeries;
        const list = filtered.length > 0 ? filtered : allPreparedSeries;
        const count = list.length;
        return list.map((s, idx) => ({
            ...s,
            zSlot: count === 1 ? 0 : (idx - (count - 1) / 2)
        }));
    }, [allPreparedSeries, selectedKeys, enableCrossStudio]);

    const maxScaleVal = useMemo(() => {
        let maxV = 0;
        preparedSeries.forEach(s => {
            s.values.forEach(v => { if (v > maxV) maxV = v; });
        });
        return niceCeil(maxV);
    }, [preparedSeries]);

    const applyPreset = (preset) => {
        setAutoRotate(false);
        setActivePreset(preset);
        const c = camRef.current;
        if (preset === 'iso') { c.tYaw = -0.34; c.tPitch = 0.42; c.tRadius = 23.5; }
        if (preset === 'front') { c.tYaw = 0.0; c.tPitch = 0.22; c.tRadius = 22.0; }
        if (preset === 'side') { c.tYaw = -1.08; c.tPitch = 0.36; c.tRadius = 23.0; }
        if (preset === 'top') { c.tYaw = 0.0; c.tPitch = 1.26; c.tRadius = 25.0; }
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
        const uFlowX = gl.getUniformLocation(prog, 'uFlowX');
        const uFlowWidth = gl.getUniformLocation(prog, 'uFlowWidth');
        const uFlowActive = gl.getUniformLocation(prog, 'uFlowActive');

        // DIMENSIONES PANORÁMICAS AMPLIAS PARA OCUPAR TODO EL ANCHO DEL CONTENEDOR
        const WORLD_W = 29.0;
        const WORLD_H = 7.4;
        const sCount = preparedSeries.length;
        const Z_STEP = sCount > 6 ? 1.32 : sCount > 3 ? 1.65 : 2.1;
        const maxZSlot = Math.max(1.0, (sCount - 1) / 2 + 0.55);
        const zMin = -maxZSlot * Z_STEP;
        const zMax = maxZSlot * Z_STEP;

        const dayToX = (i) => data.length === 1 ? 0 : (-WORLD_W * 0.5 + (i / (data.length - 1)) * WORLD_W);
        const getValY = (val, s) => {
            if (scaleMode === 'normalized') {
                return (val / Math.max(1, s.maxVal)) * WORLD_H;
            }
            return (val / maxScaleVal) * WORLD_H;
        };

        const pos = [], norm = [], col = [];
        const wirePos = [], wireCol = [];

        const pushTri = (p1, p2, p3, n1, n2, n3, c1, c2, c3) => {
            pos.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
            norm.push(n1[0], n1[1], n1[2], n2[0], n2[1], n2[2], n3[0], n3[1], n3[2]);
            col.push(c1[0], c1[1], c1[2], c1[3], c2[0], c2[1], c2[2], c2[3], c3[0], c3[1], c3[2], c3[3]);
        };

        const addQuad = (p1, p2, p3, p4, n, c1, c2, c3, c4) => {
            pushTri(p1, p2, p3, n, n, n, c1, c2, c3);
            pushTri(p1, p3, p4, n, n, n, c1, c3, c4);
        };

        const addQuadSmooth = (p1, p2, p3, p4, n1, n2, n3, n4, c1, c2, c3, c4) => {
            pushTri(p1, p2, p3, n1, n2, n3, c1, c2, c3);
            pushTri(p1, p3, p4, n1, n3, n4, c1, c3, c4);
        };

        const addBox = (x0, y0, z0, x1, y1, z1, topCol, sideCol, baseCol) => {
            // Top
            addQuad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], topCol, topCol, topCol, topCol);
            // Front (+Z)
            addQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], baseCol, baseCol, sideCol, sideCol);
            // Back (-Z)
            addQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], baseCol, baseCol, sideCol, sideCol);
            // Left (-X)
            addQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], baseCol, baseCol, sideCol, sideCol);
            // Right (+X)
            addQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], baseCol, baseCol, sideCol, sideCol);
        };

        // ── CONSTRUCCIÓN DE GEOMETRÍA SEGÚN EL MODO 3D ELEGIDO ──
        if (visualMode === 'ribbons') {
            // MODO 1 (POR DEFECTO): CRESTAS / CINTAS 3D INDEPENDIENTES POR SERIE (100% diferenciación de color)
            const NX = Math.max(120, Math.min(220, data.length * 6));
            const halfThick = Z_STEP * 0.28;

            preparedSeries.forEach((s) => {
                const alpha = 0.96;
                const [r, g, b] = s.rgb;

                // Colores puros de la serie: cima brillante, cuerpo saturado, base profunda
                const crestCol = [Math.min(1, r * 1.18 + 0.12), Math.min(1, g * 1.18 + 0.12), Math.min(1, b * 1.18 + 0.12), alpha];
                const topCol = [Math.min(1, r * 1.05 + 0.04), Math.min(1, g * 1.05 + 0.04), Math.min(1, b * 1.05 + 0.04), alpha];
                const baseCol = [r * 0.58, g * 0.58, b * 0.58, 0.88];

                const zCenter = s.zSlot * Z_STEP;
                const zB = zCenter - halfThick;
                const zF = zCenter + halfThick;

                const samples = [];
                for (let ix = 0; ix <= NX; ix++) {
                    const u = ix / NX;
                    const x = -WORLD_W * 0.5 + u * WORLD_W;
                    const rawV = evalSmooth(s.values, u);
                    const y = Math.max(0.05, getValY(rawV, s));
                    samples.push({ x, y });
                }

                for (let ix = 0; ix < NX; ix++) {
                    const pL = samples[ix];
                    const pR = samples[ix + 1];
                    const dx = pR.x - pL.x;
                    const dy = pR.y - pL.y;
                    const len = Math.hypot(dx, dy) || 1;
                    const topN = [-dy / len, dx / len, 0];

                    // Techo de la cinta 3D (cresta brillante)
                    addQuadSmooth(
                        [pL.x, pL.y, zB], [pL.x, pL.y, zF], [pR.x, pR.y, zF], [pR.x, pR.y, zB],
                        topN, topN, topN, topN,
                        crestCol, crestCol, crestCol, crestCol
                    );

                    // Pared frontal (+Z)
                    addQuad(
                        [pL.x, 0, zF], [pR.x, 0, zF], [pR.x, pR.y, zF], [pL.x, pL.y, zF],
                        [0, 0, 1],
                        baseCol, baseCol, topCol, topCol
                    );

                    // Pared trasera (-Z)
                    addQuad(
                        [pR.x, 0, zB], [pL.x, 0, zB], [pL.x, pL.y, zB], [pR.x, pR.y, zB],
                        [0, 0, -1],
                        baseCol, baseCol, topCol, topCol
                    );

                    // Líneas de cresta para el modo Vectores
                    wirePos.push(
                        pL.x, pL.y + 0.02, zF, pR.x, pR.y + 0.02, zF,
                        pL.x, pL.y + 0.02, zB, pR.x, pR.y + 0.02, zB
                    );
                    for (let k = 0; k < 4; k++) wireCol.push(r, g, b, 1);
                }

                // Tapas laterales izquierda y derecha de la cinta
                const first = samples[0], last = samples[NX];
                addQuad([first.x, 0, zB], [first.x, 0, zF], [first.x, first.y, zF], [first.x, first.y, zB], [-1, 0, 0], baseCol, baseCol, topCol, topCol);
                addQuad([last.x, 0, zF], [last.x, 0, zB], [last.x, last.y, zB], [last.x, last.y, zF], [1, 0, 0], baseCol, baseCol, topCol, topCol);
            });
        } else if (visualMode === 'bars') {
            // MODO 2: COLUMNAS / PRISMAS 3D POR FECHA Y SERIE
            const stepX = data.length > 1 ? WORLD_W / (data.length - 1) : 2.0;
            const halfW = Math.min(0.42, stepX * 0.34);
            const halfD = Z_STEP * 0.28;

            preparedSeries.forEach((s) => {
                const alpha = 0.96;
                const [r, g, b] = s.rgb;
                const topCol = [Math.min(1, r * 1.18 + 0.10), Math.min(1, g * 1.18 + 0.10), Math.min(1, b * 1.18 + 0.10), alpha];
                const sideCol = [r, g, b, alpha];
                const baseCol = [r * 0.55, g * 0.55, b * 0.55, 0.90];
                const zC = s.zSlot * Z_STEP;

                for (let i = 0; i < data.length; i++) {
                    const v = s.values[i] || 0;
                    const y = Math.max(0.06, getValY(v, s));
                    const xC = dayToX(i);
                    addBox(xC - halfW, 0, zC - halfD, xC + halfW, y, zC + halfD, topCol, sideCol, baseCol);
                }
            });
        } else {
            // MODO 3: SUPERFICIE 3D SEGMENTADA POR FRANJAS DE COLOR PURO (Sin mezcla borrosa)
            const NX = 156;
            const NZ = Math.max(48, preparedSeries.length * 10);
            const gridP = [], gridC = [], gridN = [];
            const sigma = Z_STEP * 0.34;
            const twoSigmaSq = 2 * sigma * sigma;

            for (let iz = 0; iz <= NZ; iz++) {
                const z = zMin + (iz / NZ) * (zMax - zMin);
                const rowP = [], rowC = [], rowN = [];

                // Encontrar la serie dominante más cercana en Z para mantener su color 100% PURO
                let nearestSeries = preparedSeries[0];
                let minDz = Infinity;
                for (let sIdx = 0; sIdx < preparedSeries.length; sIdx++) {
                    const s = preparedSeries[sIdx];
                    const dz = Math.abs(z - s.zSlot * Z_STEP);
                    if (dz < minDz) { minDz = dz; nearestSeries = s; }
                }

                for (let ix = 0; ix <= NX; ix++) {
                    const u = ix / NX;
                    const x = -WORLD_W * 0.5 + u * WORLD_W;
                    let num = 0, den = 0;
                    for (let sIdx = 0; sIdx < preparedSeries.length; sIdx++) {
                        const s = preparedSeries[sIdx];
                        const dz = z - s.zSlot * Z_STEP;
                        const w = Math.exp(-(dz * dz) / twoSigmaSq);
                        const h = getValY(evalSmooth(s.values, u), s);
                        num += h * w;
                        den += w;
                    }
                    const y = den > 0.001 ? num / Math.max(1, den) : 0;
                    const [r, g, b] = nearestSeries.rgb;
                    const ridgeBoost = Math.exp(-(minDz * minDz) / (twoSigmaSq * 0.8));
                    const cr = Math.min(1, r * (0.75 + 0.32 * ridgeBoost));
                    const cg = Math.min(1, g * (0.75 + 0.32 * ridgeBoost));
                    const cb = Math.min(1, b * (0.75 + 0.32 * ridgeBoost));

                    rowP.push([x, y, z]);
                    rowC.push([cr, cg, cb, 0.96]);
                    rowN.push([0, 1, 0]);
                }
                gridP.push(rowP);
                gridC.push(rowC);
                gridN.push(rowN);
            }

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
        }

        // Si no se llenó wirePos (en barras o superficie), construirlo desde triángulos
        if (wirePos.length === 0) {
            const totalTris = pos.length / 9;
            for (let t = 0; t < totalTris; t += 2) {
                const i = t * 9, ci = t * 12;
                const r = col[ci], g = col[ci + 1], b = col[ci + 2];
                wirePos.push(
                    pos[i], pos[i + 1], pos[i + 2], pos[i + 3], pos[i + 4], pos[i + 5],
                    pos[i + 3], pos[i + 4], pos[i + 5], pos[i + 6], pos[i + 7], pos[i + 8]
                );
                for (let k = 0; k < 4; k++) wireCol.push(r, g, b, 1);
            }
        }

        // Plataforma base clínica más ancha con carriles guía por serie
        const fPos = [], fNorm = [], fCol = [];
        const addFloorQuad = (p1, p2, p3, p4, n, rgba) => {
            fPos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
            for (let k = 0; k < 6; k++) { fNorm.push(...n); fCol.push(...rgba); }
        };
        const fw = WORLD_W * 0.5 + 0.9;
        const fd = zMax + 0.65;
        addFloorQuad([-fw, -0.03, -fd], [-fw, -0.03, fd], [fw, -0.03, fd], [fw, -0.03, -fd], [0, 1, 0], [0.965, 0.98, 1.0, 0.95]);
        addFloorQuad([-fw, -0.22, fd], [fw, -0.22, fd], [fw, -0.03, fd], [-fw, -0.03, fd], [0, 0, 1], [0.84, 0.89, 0.95, 1.0]);
        addFloorQuad([fw, -0.22, -fd], [-fw, -0.22, -fd], [-fw, -0.03, -fd], [fw, -0.03, -fd], [0, 0, -1], [0.82, 0.87, 0.94, 1.0]);
        addFloorQuad([-fw, -0.22, -fd], [-fw, -0.22, fd], [-fw, -0.03, fd], [-fw, -0.03, -fd], [-1, 0, 0], [0.83, 0.88, 0.95, 1.0]);
        addFloorQuad([fw, -0.22, fd], [fw, -0.22, -fd], [fw, -0.03, -fd], [fw, -0.03, fd], [1, 0, 0], [0.86, 0.91, 0.97, 1.0]);

        // Alfombra de color sutil en la base de cada carril para identificar el carril aún con valores bajos
        preparedSeries.forEach((s) => {
            const zC = s.zSlot * Z_STEP;
            const laneHalf = Z_STEP * 0.36;
            const [r, g, b] = s.rgb;
            addFloorQuad(
                [-WORLD_W * 0.5, -0.01, zC - laneHalf],
                [-WORLD_W * 0.5, -0.01, zC + laneHalf],
                [WORLD_W * 0.5, -0.01, zC + laneHalf],
                [WORLD_W * 0.5, -0.01, zC - laneHalf],
                [0, 1, 0],
                [r, g, b, 0.15]
            );
        });

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
            const w = wrap.clientWidth || 960;
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

        let flowStart = performance.now();
        const FLOW_DURATION_MS = preparedSeries.length === 1 ? 1150 : 950;
        const FLOW_WIDTH = 5.2;
        let rafId = 0;
        let lastHoverIdx = -1;

        const render = () => {
            rafId = requestAnimationFrame(render);
            const w = wrap.clientWidth || 960;
            const h = wrap.clientHeight || height;
            const c = camRef.current;

            const elapsed = performance.now() - flowStart;
            const rawFlow = Math.min(1, elapsed / FLOW_DURATION_MS);
            // Curva suave easeOutCubic para el frente de onda que carga los datos de izquierda a derecha
            const flowT = 1 - Math.pow(1 - rawFlow, 3);
            const isFlowing = rawFlow < 1;
            const flowX = (-WORLD_W * 0.5) + flowT * (WORLD_W + FLOW_WIDTH);
            const easedY = Math.min(1, 0.25 + flowT * 0.75);

            if (!c.dragging) {
                if (autoRotateRef.current) {
                    c.yaw += 0.004;
                    c.tYaw = c.yaw;
                } else {
                    c.yaw += (c.tYaw - c.yaw) * 0.12 + c.vYaw;
                    c.pitch = Math.max(0.10, Math.min(1.38, c.pitch + (c.tPitch - c.pitch) * 0.12 + c.vPitch));
                    c.vYaw *= 0.86;
                    c.vPitch *= 0.86;
                }
            }
            c.radius += (c.tRadius - c.radius) * 0.14;

            // AJUSTE DINÁMICO DE FOV Y DISTANCIA + DESPLAZAMIENTO EXACTO AL CENTRO DEL 66% DERECHO (0% solapamiento)
            const aspect = w / Math.max(1, h);
            const effectiveRadius = c.radius * (aspect < 1.6 ? (1.6 / Math.max(0.9, aspect)) * 0.92 : 0.88);
            const visW = 2 * effectiveRadius * Math.tan(16 * Math.PI / 180) * aspect;
            const targetShiftX = isCrossFocusedRef.current ? -visW * 0.175 : 0;
            c.shiftX = (c.shiftX || 0) + (targetShiftX - (c.shiftX || 0)) * 0.12;
            const target = [c.shiftX, WORLD_H * 0.36, 0];
            const eye = [
                target[0] + effectiveRadius * Math.cos(c.pitch) * Math.sin(c.yaw),
                target[1] + effectiveRadius * Math.sin(c.pitch),
                target[2] + effectiveRadius * Math.cos(c.pitch) * Math.cos(c.yaw)
            ];

            const proj = mat4Perspective(32 * Math.PI / 180, aspect, 0.2, 160);
            const view = mat4LookAt(eye, target, [0, 1, 0]);
            const mvp = mat4Mul(proj, view);

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.uniformMatrix4fv(uMVP, false, mvp);
            gl.uniform3f(uCamPos, eye[0], eye[1], eye[2]);

            // 1. Plataforma base (sin deformación de flujo)
            gl.uniform1f(uScaleY, 1.0);
            gl.uniform1f(uWire, 0.0);
            gl.uniform1f(uFlowActive, 0.0);
            bindAndDraw(fPosBuf, fNormBuf, fColBuf, floorVerts, gl.TRIANGLES);

            // 2. Geometría 3D principal con animación progresiva de flujo de datos
            gl.uniform1f(uScaleY, easedY);
            gl.uniform1f(uFlowActive, isFlowing ? 1.0 : 0.0);
            gl.uniform1f(uFlowX, flowX);
            gl.uniform1f(uFlowWidth, FLOW_WIDTH);
            if (!showWireRef.current) {
                gl.uniform1f(uWire, 0.0);
                bindAndDraw(bufPos, bufNorm, bufCol, meshVerts, gl.TRIANGLES);
            } else {
                gl.uniform1f(uWire, 1.0);
                bindAndDraw(bufWirePos, null, bufWireCol, wireVerts, gl.LINES);
            }

            // 3. HUD 2D de alta precisión: Crestas vectoriales nítidas, etiquetas por carril, ejes y picos
            hud.clearRect(0, 0, w, h);

            const backZ = Math.cos(c.yaw) >= 0 ? -fd + 0.1 : fd - 0.1;
            const frontZ = -backZ;

            // Eje Y: Marcas horizontales de referencia
            const yTicks = [0, 0.25, 0.5, 0.75, 1.0];
            const leftX = -WORLD_W * 0.5 - 0.55;
            const rightX = WORLD_W * 0.5 + 0.55;
            const yLabelSideX = Math.sin(c.yaw) > 0.55 ? rightX + 0.65 : leftX - 0.65;

            yTicks.forEach((frac, idx) => {
                const y = frac * WORLD_H;
                const a = projectPoint(mvp, leftX, y, backZ, w, h);
                const b = projectPoint(mvp, rightX, y, backZ, w, h);
                if (a && b) {
                    hud.beginPath();
                    hud.moveTo(a.sx, a.sy);
                    hud.lineTo(b.sx, b.sy);
                    hud.strokeStyle = idx === 0 ? 'rgba(148, 163, 184, 0.6)' : 'rgba(148, 163, 184, 0.26)';
                    hud.lineWidth = idx === 0 ? 1.3 : 1;
                    hud.setLineDash(idx === 0 ? [] : [4, 4]);
                    hud.stroke();
                    hud.setLineDash([]);
                }
                const lp = projectPoint(mvp, yLabelSideX, y, backZ, w, h);
                if (lp && lp.sy > 46 && lp.sy < h - 22) {
                    const txt = scaleMode === 'normalized'
                        ? `${Math.round(frac * 100)}%`
                        : Math.round(frac * maxScaleVal).toLocaleString('es-AR');
                    hud.font = '700 10.5px Inter, -apple-system, sans-serif';
                    const tw = hud.measureText(txt).width + 12;
                    hud.fillStyle = 'rgba(255, 255, 255, 0.92)';
                    hud.strokeStyle = '#CBD5E1';
                    hud.lineWidth = 1;
                    hud.beginPath();
                    hud.roundRect(lp.sx - tw / 2, lp.sy - 9, tw, 18, 6);
                    hud.fill();
                    hud.stroke();
                    hud.fillStyle = '#334155';
                    hud.textAlign = 'center';
                    hud.fillText(txt, lp.sx, lp.sy + 3.5);
                }
            });

            // Trazo vectorial luminoso en la cresta superior de cada carril + pulso cometa de flujo + etiqueta directa
            const laneLabels = [];
            const maxVisibleU = isFlowing ? Math.max(0.01, Math.min(1, (flowX + WORLD_W * 0.5) / WORLD_W)) : 1;

            preparedSeries.forEach((s) => {
                const zC = s.zSlot * Z_STEP;

                // Cresta superior nítida en Canvas 2D desplegándose progresivamente con el flujo
                if (visualMode !== 'bars') {
                    hud.beginPath();
                    let started = false;
                    let tipPt = null;
                    const steps = Math.max(70, data.length * 3);
                    const maxK = Math.max(1, Math.floor(steps * maxVisibleU));
                    for (let k = 0; k <= maxK; k++) {
                        const u = k / steps;
                        const x = -WORLD_W * 0.5 + u * WORLD_W;
                        const y = Math.max(0.05, getValY(evalSmooth(s.values, u), s)) * easedY;
                        const pt = projectPoint(mvp, x, y + 0.03, zC, w, h);
                        if (pt) {
                            if (!started) { hud.moveTo(pt.sx, pt.sy); started = true; }
                            else hud.lineTo(pt.sx, pt.sy);
                            tipPt = pt;
                        }
                    }
                    hud.strokeStyle = s.color;
                    hud.globalAlpha = 0.96;
                    hud.lineWidth = preparedSeries.length === 1 ? 3.2 : 2.2;
                    hud.stroke();
                    hud.globalAlpha = 1;

                    // Pulso luminoso (cometa) en el punto de avance mientras se cargan los datos
                    if (isFlowing && tipPt) {
                        hud.beginPath();
                        hud.arc(tipPt.sx, tipPt.sy, 8.5, 0, Math.PI * 2);
                        hud.fillStyle = `${s.color}38`;
                        hud.fill();

                        hud.beginPath();
                        hud.arc(tipPt.sx, tipPt.sy, 4.2, 0, Math.PI * 2);
                        hud.fillStyle = '#FFFFFF';
                        hud.strokeStyle = s.color;
                        hud.lineWidth = 2.4;
                        hud.fill();
                        hud.stroke();
                    }
                }

                // Etiqueta de carril en el borde derecho/izquierdo según ángulo de cámara
                const labelOnRight = Math.sin(c.yaw) <= 0.25;
                const endIdx = labelOnRight ? data.length - 1 : 0;
                const endX = labelOnRight ? WORLD_W * 0.5 + 0.55 : -WORLD_W * 0.5 - 0.55;
                const endY = Math.max(0.15, getValY(s.values[endIdx] || 0, s) * easedY * 0.55);
                const lPt = projectPoint(mvp, endX, endY, zC, w, h);
                if (lPt && lPt.sx > 18 && lPt.sx < w - 18 && lPt.sy > 48 && lPt.sy < h - 24) {
                    laneLabels.push({
                        s,
                        sx: lPt.sx,
                        sy: lPt.sy,
                        isDimmed: false
                    });
                }
            });

            // Anti-colisión vertical entre etiquetas de carril 3D
            laneLabels.sort((a, b) => a.sy - b.sy);
            for (let i = 1; i < laneLabels.length; i++) {
                if (laneLabels[i].sy - laneLabels[i - 1].sy < 19) {
                    laneLabels[i].sy = laneLabels[i - 1].sy + 19;
                }
            }
            laneLabels.forEach(({ s, sx, sy, isDimmed }) => {
                if (sy > h - 22) return;
                const txt = `${s.shortLabel || s.label}`;
                hud.font = '700 10px Inter, -apple-system, sans-serif';
                const tw = hud.measureText(txt).width + 18;
                const bx = Math.max(8, Math.min(w - tw - 8, sx - tw / 2));
                hud.globalAlpha = isDimmed ? 0.30 : 0.96;
                hud.fillStyle = '#FFFFFF';
                hud.strokeStyle = s.color;
                hud.lineWidth = 1.5;
                hud.beginPath();
                hud.roundRect(bx, sy - 9, tw, 18, 999);
                hud.fill();
                hud.stroke();

                // Punto de color puro
                hud.fillStyle = s.color;
                hud.beginPath();
                hud.arc(bx + 7, sy, 3.5, 0, Math.PI * 2);
                hud.fill();

                hud.fillStyle = '#0F172A';
                hud.textAlign = 'left';
                hud.fillText(txt, bx + 13, sy + 3.5);
                hud.globalAlpha = 1;
            });

            // Líneas de fecha en el piso + detección de hover por columna temporal
            let bestIdx = -1;
            let bestDist = 28;
            const dateLabelCandidates = [];

            for (let i = 0; i < data.length; i++) {
                const x = dayToX(i);
                const p1 = projectPoint(mvp, x, 0.01, -fd + 0.1, w, h);
                const p2 = projectPoint(mvp, x, 0.01, fd - 0.1, w, h);
                if (p1 && p2) {
                    const midX = (p1.sx + p2.sx) * 0.5;
                    if (!c.dragging && c.mx > 0 && c.my > 42 && c.my < h - 16) {
                        const dist = Math.abs(c.mx - midX);
                        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
                    }
                    const isHov = i === c.hoveredIdx;
                    hud.beginPath();
                    hud.moveTo(p1.sx, p1.sy);
                    hud.lineTo(p2.sx, p2.sy);
                    hud.strokeStyle = isHov ? 'rgba(29, 78, 216, 0.75)' : 'rgba(203, 213, 225, 0.38)';
                    hud.lineWidth = isHov ? 2.4 : 0.8;
                    hud.stroke();

                    // Si está en hover, dibujar puntos luminosos sobre cada serie en esa fecha
                    if (isHov) {
                        preparedSeries.forEach(s => {
                            const val = s.values[i] || 0;
                            const py = Math.max(0.06, getValY(val, s)) * easedY;
                            const pz = s.zSlot * Z_STEP;
                            const pt = projectPoint(mvp, x, py, pz, w, h);
                            if (pt) {
                                hud.fillStyle = '#FFFFFF';
                                hud.strokeStyle = s.color;
                                hud.lineWidth = 2.5;
                                hud.beginPath();
                                hud.arc(pt.sx, pt.sy, 4.5, 0, Math.PI * 2);
                                hud.fill();
                                hud.stroke();
                            }
                        });
                    }
                }

                const lp = projectPoint(mvp, x, -0.05, frontZ + (frontZ > 0 ? 0.55 : -0.55), w, h);
                if (lp && lp.sx > 28 && lp.sx < w - 28 && lp.sy > 46 && lp.sy < h - 10) {
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

            // Etiquetas de fechas en eje X con anti-colisión
            dateLabelCandidates.sort((a, b) => a.sx - b.sx);
            let lastDrawnX = -999;
            dateLabelCandidates.forEach((item) => {
                const isFirstOrLast = item.i === 0 || item.i === data.length - 1;
                const isHov = item.i === c.hoveredIdx;
                const minGap = isHov ? 34 : 52;
                if (!isHov && item.sx - lastDrawnX < minGap) {
                    if (!isFirstOrLast || item.sx - lastDrawnX < 38) return;
                }
                lastDrawnX = item.sx;
                hud.font = isHov ? '800 10.5px Inter, -apple-system, sans-serif' : '600 10px Inter, -apple-system, sans-serif';
                const tw = hud.measureText(item.label).width + 10;
                const safeY = Math.min(h - 12, item.sy);
                if (isHov) {
                    hud.fillStyle = '#003B73';
                    hud.beginPath();
                    hud.roundRect(item.sx - tw / 2, safeY - 10, tw, 18, 6);
                    hud.fill();
                    hud.fillStyle = '#FFFFFF';
                } else {
                    hud.fillStyle = 'rgba(255, 255, 255, 0.88)';
                    hud.beginPath();
                    hud.roundRect(item.sx - tw / 2, safeY - 9, tw, 16, 5);
                    hud.fill();
                    hud.fillStyle = '#475569';
                }
                hud.textAlign = 'center';
                hud.fillText(item.label, item.sx, safeY + 3);
            });

            // Callout del Pico Máximo de la serie principal activa (aparece en cuanto el flujo llega al pico)
            const targetPeakSeries = preparedSeries[0];
            const peakReached = !isFlowing || (dayToX(targetPeakSeries?.peakIdx || 0) <= flowX - FLOW_WIDTH * 0.25);

            if (targetPeakSeries && targetPeakSeries.peakVal > 0 && peakReached) {
                const xPk = dayToX(targetPeakSeries.peakIdx);
                const yPk = getValY(targetPeakSeries.peakVal, targetPeakSeries) * easedY;
                const zPk = targetPeakSeries.zSlot * Z_STEP;
                const pTop = projectPoint(mvp, xPk, yPk, zPk, w, h);
                const pBadge = projectPoint(mvp, xPk, yPk + 0.95, zPk, w, h);
                if (pTop && pBadge) {
                    const by = Math.max(54, pBadge.sy);
                    hud.beginPath();
                    hud.moveTo(pTop.sx, pTop.sy - 3);
                    hud.lineTo(pBadge.sx, by + 11);
                    hud.strokeStyle = targetPeakSeries.color;
                    hud.lineWidth = 1.6;
                    hud.setLineDash([3, 3]);
                    hud.stroke();
                    hud.setLineDash([]);

                    const pkLabel = data[targetPeakSeries.peakIdx]?.label || '';
                    const txt = `Pico ${targetPeakSeries.shortLabel || targetPeakSeries.label}: ${targetPeakSeries.peakVal.toLocaleString('es-AR')} (${pkLabel})`;
                    hud.font = '800 10.5px Inter, -apple-system, sans-serif';
                    const tw = hud.measureText(txt).width + 16;
                    const bx = Math.max(12, Math.min(w - tw - 12, pBadge.sx - tw / 2));
                    hud.fillStyle = targetPeakSeries.color;
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
    }, [data, preparedSeries, maxScaleVal, height, visualMode, scaleMode, flowTrigger]);

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
            c.vYaw = dx * 0.0068;
            c.vPitch = dy * 0.0052;
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

    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const onWheelNative = (e) => {
            e.preventDefault();
            const c = camRef.current;
            c.tRadius = Math.max(12, Math.min(36, c.tRadius + e.deltaY * 0.014));
        };
        el.addEventListener('wheel', onWheelNative, { passive: false });
        return () => el.removeEventListener('wheel', onWheelNative);
    }, []);

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
    const wrapW = wrapRef.current?.clientWidth || 960;

    return (
        <div style={{
            width: '100%',
            borderRadius: '12px',
            border: '1px solid #CBD5E1',
            background: '#FFFFFF',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* ── BARRA SUPERIOR DE 2 DIMENSIONES COMBINABLES (Cobertura × Estudios) — SIN BOTONES TÉCNICOS ── */}
            <div style={{
                padding: '10px 14px',
                background: '#F8FAFC',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
            }}>
                {/* Grupo 1: Cobertura (Todos / Obra Social / Particulares) — Multi-selección combinable */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.67rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Cobertura:
                    </span>
                    <div style={{ display: 'inline-flex', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '2px', gap: '2px' }}>
                        {CROSS_COVERAGES.map(cov => {
                            const active = selectedCoverages.includes(cov.key);
                            return (
                                <button
                                    key={cov.key}
                                    type="button"
                                    onClick={() => handleToggleCoverage(cov.key)}
                                    style={{
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '4px 10px',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        background: active ? '#003B73' : 'transparent',
                                        color: active ? '#FFFFFF' : '#475569',
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    {cov.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Grupo 2: Estudios / Modalidades — Multi-selección combinable */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '5px', flex: '1 1 380px', justifyContent: 'flex-end' }}>
                    {CROSS_MODALITIES.filter(m => (modalityBreakdown[m.key]?.total || 0) > 0).map((m) => {
                        const isSelected = selectedModalities.includes(m.key);
                        const isDimmed = selectedModalities.length > 0 && !isSelected;
                        const cnt = modalityBreakdown[m.key]?.total || 0;
                        return (
                            <button
                                key={m.key}
                                type="button"
                                onClick={() => handleToggleModality(m.key)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '4px 10px',
                                    borderRadius: '8px',
                                    border: `1px solid ${isSelected ? '#003B73' : '#CBD5E1'}`,
                                    background: isSelected ? '#003B73' : '#FFFFFF',
                                    color: isSelected ? '#FFFFFF' : '#1E293B',
                                    opacity: isDimmed ? 0.55 : 1,
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.18s ease',
                                }}
                            >
                                <span style={{
                                    width: '7px',
                                    height: '7px',
                                    borderRadius: '50%',
                                    background: isSelected ? '#FFFFFF' : m.color,
                                    flexShrink: 0
                                }} />
                                <span>{m.label}</span>
                                <strong style={{
                                    color: isSelected ? '#BFDBFE' : '#003B73',
                                    fontVariantNumeric: 'tabular-nums',
                                }}>
                                    {cnt.toLocaleString('es-AR')}
                                </strong>
                            </button>
                        );
                    })}
                    {isCrossFocused && (
                        <button
                            type="button"
                            onClick={handleResetCross}
                            style={{
                                border: '1px solid #BFDBFE',
                                background: '#EFF6FF',
                                color: '#003B73',
                                borderRadius: '8px',
                                padding: '4px 9px',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                cursor: 'pointer'
                            }}
                        >
                            ↺ Ver todo
                        </button>
                    )}
                </div>
            </div>

            {/* ── ESCENARIO ESPEJO: INSIGHTS PRECISOS A LA IZQUIERDA + GRÁFICO 3D DESPLAZADO A LA DERECHA ── */}
            <div style={{
                position: 'relative',
                width: '100%',
                height: `${Math.max(340, height - 48)}px`,
                background: 'linear-gradient(180deg, #F8FAFC 0%, #EFF6FF 55%, #E2E8F0 100%)',
                overflow: 'hidden',
            }}>
                {/* Panel de Insights Precisos a la IZQUIERDA (34% compacto, sin tapar el gráfico) */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: '34%',
                    padding: '14px 16px',
                    background: 'rgba(255, 255, 255, 0.96)',
                    borderRight: '1px solid #E2E8F0',
                    boxShadow: isCrossFocused ? '6px 0 24px rgba(15, 23, 42, 0.06)' : 'none',
                    transform: isCrossFocused ? 'translateX(0)' : 'translateX(-100%)',
                    opacity: isCrossFocused ? 1 : 0,
                    pointerEvents: isCrossFocused ? 'auto' : 'none',
                    transition: 'transform 0.44s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.34s cubic-bezier(0.22, 1, 0.36, 1)',
                    zIndex: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    overflowY: 'auto',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                        <div>
                            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Insights de Selección
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#003B73' }}>
                                {selectedModalities.length > 0
                                    ? selectedModalities.map(k => modalityBreakdown[k]?.label || k).join(' + ')
                                    : 'Panorama General'}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleResetCross}
                            title="Volver a vista completa"
                            style={{
                                width: '26px', height: '26px', borderRadius: '6px',
                                border: '1px solid #E2E8F0', background: '#F8FAFC',
                                color: '#64748B', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer'
                            }}
                        >
                            ×
                        </button>
                    </div>

                    {/* Desglose preciso por estudio seleccionado: Total, Obra Social y Particulares */}
                    {selectedModalities.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {selectedModalities.map(modKey => {
                                const info = modalityBreakdown[modKey];
                                if (!info) return null;
                                return (
                                    <div key={modKey} style={{
                                        background: '#F8FAFC',
                                        border: '1px solid #E2E8F0',
                                        borderLeft: `3.5px solid ${info.color}`,
                                        borderRadius: '9px',
                                        padding: '10px 12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '7px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>{info.label}</span>
                                            <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>
                                                Prom. {info.avg}/{granularity === 'dia' ? 'día' : 'mes'}
                                            </span>
                                        </div>

                                        {/* Grilla 3 columnas: Total | Obra Social | Particulares */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '7px', padding: '6px 8px' }}>
                                                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Todos</div>
                                                <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#003B73' }}>{info.total.toLocaleString('es-AR')}</div>
                                                <div style={{ fontSize: '0.62rem', color: '#475569', fontWeight: 600 }}>100%</div>
                                            </div>
                                            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '7px', padding: '6px 8px' }}>
                                                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Obra Social</div>
                                                <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#0F172A' }}>{info.os.toLocaleString('es-AR')}</div>
                                                <div style={{ fontSize: '0.62rem', color: '#0D9488', fontWeight: 700 }}>{info.osPct}%</div>
                                            </div>
                                            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '7px', padding: '6px 8px' }}>
                                                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Particulares</div>
                                                <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#0F172A' }}>{info.part.toLocaleString('es-AR')}</div>
                                                <div style={{ fontSize: '0.62rem', color: '#EA580C', fontWeight: 700 }}>{info.partPct}%</div>
                                            </div>
                                        </div>

                                        {info.peakVal > 0 && (
                                            <div style={{ fontSize: '0.71rem', color: '#475569' }}>
                                                Pico máximo: <strong style={{ color: '#003B73' }}>{info.peakVal.toLocaleString('es-AR')}</strong> estudios ({info.peakLabel})
                                            </div>
                                        )}

                                        {/* Cuando hay 1 solo estudio seleccionado, ocupar el espacio inferior con desglose visual rico */}
                                        {selectedModalities.length === 1 && (
                                            <>
                                                {/* Barra proporcional OS vs Particulares */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '6px', borderTop: '1px solid #E2E8F0' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.67rem', fontWeight: 700, color: '#475569' }}>
                                                        <span>Composición por Cobertura</span>
                                                        <span style={{ color: '#003B73' }}>{info.osPct}% OS · {info.partPct}% Part.</span>
                                                    </div>
                                                    <div style={{ width: '100%', height: '7px', borderRadius: '999px', background: '#E2E8F0', overflow: 'hidden', display: 'flex' }}>
                                                        <div style={{ width: `${info.osPct}%`, background: '#003B73', transition: 'width 0.4s ease' }} />
                                                        <div style={{ width: `${info.partPct}%`, background: '#EA580C', transition: 'width 0.4s ease' }} />
                                                    </div>
                                                </div>

                                                {/* Top 3 Días / Períodos de Mayor Demanda */}
                                                {info.topDays && info.topDays.length > 0 && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingTop: '6px', borderTop: '1px solid #E2E8F0' }}>
                                                        <div style={{ fontSize: '0.67rem', fontWeight: 800, color: '#003B73', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                            Top {info.topDays.length} {granularity === 'dia' ? 'Días' : 'Meses'} de Mayor Demanda
                                                        </div>
                                                        {info.topDays.map((td, tIdx) => {
                                                            const pctBar = info.peakVal > 0 ? Math.max(12, Math.round((td.val * 100) / info.peakVal)) : 0;
                                                            return (
                                                                <div key={tIdx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.71rem', color: '#1E293B' }}>
                                                                        <span style={{ fontWeight: 700 }}>{tIdx + 1}. {td.label}</span>
                                                                        <span style={{ fontWeight: 800, color: '#003B73' }}>
                                                                            {td.val.toLocaleString('es-AR')} <span style={{ fontWeight: 500, color: '#64748B' }}>({td.os} OS · {td.part} Part.)</span>
                                                                        </span>
                                                                    </div>
                                                                    <div style={{ width: '100%', height: '5px', borderRadius: '999px', background: '#E2E8F0', overflow: 'hidden' }}>
                                                                        <div style={{ width: `${pctBar}%`, height: '100%', background: tIdx === 0 ? '#003B73' : '#3B82F6', borderRadius: '999px', transition: 'width 0.4s ease' }} />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* Síntesis ejecutiva */}
                                                <div style={{
                                                    background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px',
                                                    padding: '8px 10px', fontSize: '0.72rem', color: '#1E293B', lineHeight: 1.45, marginTop: '2px'
                                                }}>
                                                    <strong style={{ color: '#003B73' }}>Lectura rápida:</strong> {info.activeDays} {granularity === 'dia' ? 'días con actividad' : 'meses activos'} (prom. efectivo <strong>{info.activeAvg}</strong>/{granularity === 'dia' ? 'día' : 'mes'}).
                                                    {info.minDay ? ` Mínimo activo: ${info.minDay.val} (${info.minDay.label}).` : ''}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Insight comparativo cuando hay 2 o más estudios seleccionados */}
                            {selectedModalities.length >= 2 && (() => {
                                const sorted = [...selectedModalities]
                                    .map(k => modalityBreakdown[k])
                                    .filter(Boolean)
                                    .sort((a, b) => b.total - a.total);
                                if (sorted.length < 2) return null;
                                const top = sorted[0], second = sorted[1];
                                const diff = top.total - second.total;
                                const sumPart = sorted.reduce((s, x) => s + x.part, 0);
                                return (
                                    <div style={{
                                        background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px',
                                        padding: '9px 11px', fontSize: '0.74rem', color: '#1E293B', lineHeight: 1.45
                                    }}>
                                        <strong style={{ color: '#003B73' }}>Comparativa:</strong> {top.label} supera a {second.label} por <strong>{diff.toLocaleString('es-AR')}</strong> estudios. En conjunto suman <strong>{sumPart.toLocaleString('es-AR')}</strong> particulares en el período.
                                    </div>
                                );
                            })()}
                        </div>
                    ) : (
                        /* Vista filtrada solo por cobertura (sin estudio específico) */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '7px', padding: '8px' }}>
                                    <div style={{ fontSize: '0.63rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Todos</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 900, color: '#003B73' }}>{generalBreakdown.total.toLocaleString('es-AR')}</div>
                                </div>
                                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '7px', padding: '8px' }}>
                                    <div style={{ fontSize: '0.63rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Obra Social</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0F172A' }}>{generalBreakdown.os.toLocaleString('es-AR')}</div>
                                    <div style={{ fontSize: '0.64rem', color: '#0D9488', fontWeight: 700 }}>{generalBreakdown.osPct}%</div>
                                </div>
                                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '7px', padding: '8px' }}>
                                    <div style={{ fontSize: '0.63rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Particulares</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0F172A' }}>{generalBreakdown.part.toLocaleString('es-AR')}</div>
                                    <div style={{ fontSize: '0.64rem', color: '#EA580C', fontWeight: 700 }}>{generalBreakdown.partPct}%</div>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#475569', lineHeight: 1.45 }}>
                                Seleccioná uno o más estudios arriba (por ejemplo <strong>Ecografía</strong>) para cruzar y comparar su curva por cobertura.
                            </div>
                        </div>
                    )}
                </div>

                {/* ── LIENZO WEBGL 3D SIEMPRE 100% WIDTH (el desplazamiento a la derecha ocurre en cámara 3D a 60fps sin cuelgues) ── */}
                <div
                    ref={wrapRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerLeave}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        overflow: 'hidden',
                        cursor: 'grab',
                        userSelect: 'none',
                        touchAction: 'none'
                    }}
                >
                    <canvas ref={glCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
                    <canvas ref={hudCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />

                {/* ── TOOLTIP CLÍNICO FLOTANTE EN HOVER ── */}
                {hoveredRow && hoverState && (
                    <div style={{
                        position: 'absolute',
                        left: `${Math.min(wrapW - 245, Math.max(12, hoverState.x + 16))}px`,
                        top: `${Math.min(height - 190, Math.max(52, hoverState.y - 20))}px`,
                        background: 'rgba(15, 23, 42, 0.95)',
                        backdropFilter: 'blur(8px)',
                        color: '#FFFFFF',
                        borderRadius: '10px',
                        padding: '10px 13px',
                        minWidth: '225px',
                        fontSize: '0.74rem',
                        border: '1px solid rgba(255, 255, 255, 0.16)',
                        boxShadow: '0 10px 26px rgba(15, 23, 42, 0.32)',
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
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#F1F5F9', fontWeight: 600 }}>
                                    <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
                                    {s.shortLabel || s.label}
                                </span>
                                <strong style={{ color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                                    {(Number(hoveredRow[s.key]) || 0).toLocaleString('es-AR')}
                                </strong>
                            </div>
                        ))}
                    </div>
                )}
                </div>
            </div>
        </div>
    );
}
