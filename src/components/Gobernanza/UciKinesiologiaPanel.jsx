import React, { useState, useEffect, useMemo } from 'react';
import { 
    Activity, Wind, Move, CheckCircle2, AlertTriangle, ShieldAlert,
    TrendingUp, Calendar, Clock, Stethoscope, ChevronRight, User, 
    FileText, Layers, Award, Gauge, HeartPulse, RefreshCw
} from 'lucide-react';
import { 
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, 
    Legend, CartesianGrid, ReferenceLine, AreaChart, Area 
} from 'recharts';
import { supabase } from '../../lib/supabase';

// ── Definición Canónica de la Escala IMS (ICU Mobility Scale 0-10) ──
const IMS_LEVELS = {
    0: { label: 'Nada (En reposo pasivo)', color: '#94A3B8', bg: '#F1F5F9' },
    1: { label: 'Ejercicios pasivos en cama', color: '#64748B', bg: '#F8FAFC' },
    2: { label: 'Giros / Movimientos activos en cama', color: '#0284C7', bg: '#E0F2FE' },
    3: { label: 'Sedestación al borde de cama', color: '#0D9488', bg: '#CCFBF1' },
    4: { label: 'Bipedestación asistida', color: '#059669', bg: '#D1FAE5' },
    5: { label: 'Transferencia cama-sillón', color: '#16A34A', bg: '#DCFCE7' },
    6: { label: 'Marcha estática en el lugar', color: '#65A30D', bg: '#ECFCCB' },
    7: { label: 'Marcha asistida (≥ 5 metros)', color: '#D97706', bg: '#FEF3C7' },
    8: { label: 'Marcha independiente con andador', color: '#EA580C', bg: '#FFEDD5' },
    9: { label: 'Marcha independiente sin asistencia', color: '#2563EB', bg: '#EFF6FF' },
    10: { label: 'Independencia funcional total', color: '#4F46E5', bg: '#EEF2FF' }
};

export default function UciKinesiologiaPanel({ nhc = null, patient = null, records = null }) {
    const [loading, setLoading] = useState(false);
    const [rawKineData, setRawKineData] = useState(records || []);
    const [activeSubView, setActiveSubView] = useState('arm'); // 'arm' | 'movilizacion' | 'weaning' | 'bitacora'

    // Cargar datos de Supabase si no vienen inyectados
    useEffect(() => {
        if (records && records.length > 0) {
            setRawKineData(records);
            return;
        }

        const patientNhc = nhc || patient?.nhc || patient?.NHC || patient?.idPaciente;
        if (!patientNhc) return;

        let isMounted = true;
        setLoading(true);

        const fetchKineData = async () => {
            try {
                const nhcStr = String(patientNhc).trim();
                let q = supabase
                    .from('calidad_uci_kinesiologia')
                    .select('*')
                    .eq('nhc', nhcStr)
                    .order('fecha_hora', { ascending: true });

                const { data, error } = await q;
                if (error) throw error;

                if (isMounted) {
                    setRawKineData(data || []);
                }
            } catch (err) {
                console.error('Error al cargar kinesiología UCI:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchKineData();
        return () => { isMounted = false; };
    }, [nhc, patient, records]);

    // ─────────────────────────────────────────────────────────────
    // 1. PROCESAMIENTO Y PIVOTEO DE DATOS PARA SERIES TEMPORALES
    // ─────────────────────────────────────────────────────────────
    const { 
        timelineARM, 
        timelineIMS, 
        timelineWeaning, 
        notesList, 
        kpis 
    } = useMemo(() => {
        if (!rawKineData || rawKineData.length === 0) {
            return {
                timelineARM: [],
                timelineIMS: [],
                timelineWeaning: [],
                notesList: [],
                kpis: { maxIms: 0, lastIms: 0, minPaFi: null, lastMode: 'No informado', countRegistros: 0 }
            };
        }

        // Agrupar por punto temporal (fecha y hora redondeada o id_visita)
        const armPointsMap = new Map();
        const imsPointsMap = new Map();
        const weaningRecords = [];
        const notes = [];

        let maxIms = 0;
        let lastIms = 0;
        let minPaFi = null;
        let lastMode = 'No informado';

        rawKineData.forEach(r => {
            if (!r.fecha_hora) return;
            const d = new Date(r.fecha_hora);
            const dateKey = d.toISOString().substring(0, 16); // 'YYYY-MM-DDTHH:mm'
            const displayLabel = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            const param = (r.parametro || '').toLowerCase().trim();

            // ── A. Monitoreo ARM (Protocolo 584) ──
            if (r.protocolo_id === 584 || param.includes('fio2') || param.includes('peep') || param.includes('modo')) {
                if (!armPointsMap.has(dateKey)) {
                    armPointsMap.set(dateKey, {
                        timestamp: d.getTime(),
                        fechaLabel: displayLabel,
                        rawDate: d,
                        fio2: null,
                        peep: null,
                        pafio2: null,
                        vt: null,
                        pPico: null,
                        pSoporte: null,
                        balon: null,
                        volMin: null,
                        modo: null,
                        profesional: r.profesional
                    });
                }
                const pt = armPointsMap.get(dateKey);
                if (r.profesional) pt.profesional = r.profesional;

                if (param.includes('modo')) {
                    pt.modo = r.valor_combo || r.valor_texto || (r.valor_numerico ? `Modo ${r.valor_numerico}` : null);
                    if (pt.modo) lastMode = pt.modo;
                } else if (param === 'fio2' || param.includes('fio2')) {
                    // Si viene como 0.5 pasar a 50
                    let val = r.valor_numerico;
                    if (val !== null && val <= 1 && val > 0) val = Math.round(val * 100);
                    pt.fio2 = val;
                } else if (param === 'peep') {
                    pt.peep = r.valor_numerico;
                } else if (param.includes('pafio2') || param.includes('kirby')) {
                    pt.pafio2 = r.valor_numerico;
                    if (r.valor_numerico && (minPaFi === null || r.valor_numerico < minPaFi)) {
                        minPaFi = r.valor_numerico;
                    }
                } else if (param === 'vt' || param.includes('volumen tidal') || param.includes('corriente')) {
                    pt.vt = r.valor_numerico;
                } else if (param.includes('pico') || param === 'pres. pico') {
                    pt.pPico = r.valor_numerico;
                } else if (param.includes('soporte') || param === 'psoporte') {
                    pt.pSoporte = r.valor_numerico;
                } else if (param.includes('balón') || param.includes('balon') || param.includes('neumotaponamiento')) {
                    pt.balon = r.valor_numerico;
                } else if (param.includes('volumen minuto') || param === 'volumen minuto') {
                    pt.volMin = r.valor_numerico;
                }
            }

            // ── B. Movilización Temprana MT (Protocolo 583) ──
            if (r.protocolo_id === 583 || param.includes('ims') || param.includes('mrc') || param.includes('padis')) {
                if (!imsPointsMap.has(dateKey)) {
                    imsPointsMap.set(dateKey, {
                        timestamp: d.getTime(),
                        fechaLabel: displayLabel,
                        rawDate: d,
                        ims: null,
                        mrc: null,
                        padis: null,
                        detuvo: null,
                        motivoDetencion: null,
                        debilidadDauci: null,
                        profesional: r.profesional
                    });
                }
                const pt = imsPointsMap.get(dateKey);
                if (r.profesional) pt.profesional = r.profesional;

                if (param.includes('ims') || param.includes('máximo alcanzado')) {
                    const score = r.valor_numerico !== null ? r.valor_numerico : null;
                    pt.ims = score;
                    if (score !== null) {
                        if (score > maxIms) maxIms = score;
                        lastIms = score;
                    }
                } else if (param.includes('mrc') || param.includes('fuerza')) {
                    pt.mrc = r.valor_numerico;
                } else if (param.includes('padis')) {
                    pt.padis = r.valor_combo || r.valor_texto;
                } else if (param.includes('detuvo')) {
                    pt.detuvo = r.valor_combo || r.valor_texto;
                } else if (param.includes('motivo')) {
                    pt.motivoDetencion = r.valor_texto;
                } else if (param.includes('debilidad')) {
                    pt.debilidadDauci = r.valor_combo || r.valor_texto;
                }
            }

            // ── C. Weaning y Extubación (Protocolos 581 y 582) ──
            if (r.protocolo_id === 581 || r.protocolo_id === 582 || param.includes('wean') || param.includes('extub') || param.includes('pre')) {
                weaningRecords.push({
                    fecha: d,
                    fechaLabel: displayLabel,
                    protocolo: r.protocolo_nombre,
                    parametro: r.parametro,
                    valor: r.valor_combo || r.valor_texto || (r.valor_numerico !== null ? String(r.valor_numerico) : ''),
                    profesional: r.profesional
                });
            }

            // ── D. Bitácora de Observaciones y Notas Clínicas ──
            if (r.valor_texto && r.valor_texto.trim().length > 10) {
                notes.push({
                    id: r.id_registro_salus || r.id,
                    fecha: d,
                    fechaLabel: displayLabel,
                    protocolo: r.protocolo_nombre,
                    parametro: r.parametro,
                    nota: r.valor_texto.trim(),
                    profesional: r.profesional || 'Kinesiología UCI'
                });
            }
        });

        // Ordenar series cronológicamente
        const sortedARM = Array.from(armPointsMap.values()).sort((a, b) => a.timestamp - b.timestamp);
        const sortedIMS = Array.from(imsPointsMap.values()).sort((a, b) => a.timestamp - b.timestamp);
        const sortedNotes = notes.sort((a, b) => b.fecha - a.fecha); // Más recientes primero

        return {
            timelineARM: sortedARM,
            timelineIMS: sortedIMS,
            timelineWeaning: weaningRecords,
            notesList: sortedNotes,
            kpis: {
                maxIms,
                lastIms,
                minPaFi,
                lastMode,
                countRegistros: rawKineData.length
            }
        };
    }, [rawKineData]);

    if (loading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                <RefreshCw className="animate-spin" size={32} style={{ margin: '0 auto 12px auto', color: '#2563EB' }} />
                <p style={{ fontWeight: 600 }}>Cargando protocolos y monitoreo ventilatorio...</p>
            </div>
        );
    }

    if (!rawKineData || rawKineData.length === 0) {
        return (
            <div style={{ padding: '48px 24px', textAlign: 'center', background: '#F8FAFC', borderRadius: '12px', border: '1px dashed #CBD5E1' }}>
                <Wind size={40} style={{ margin: '0 auto 12px auto', color: '#94A3B8' }} />
                <h4 style={{ margin: 0, color: '#1E293B', fontSize: '1rem', fontWeight: 700 }}>Sin registros de Kinesiología en SALUS</h4>
                <p style={{ margin: '6px 0 0 0', color: '#64748B', fontSize: '0.82rem' }}>
                    No se encontraron cargas de los protocolos 580 a 585 para este paciente en el período seleccionado.
                </p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* ─── 1. HEADER DE CONTROL Y KPIS CLÍNICOS ─── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px'
            }}>
                {/* KPI 1: Modo Ventilatorio */}
                <div style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748B', fontSize: '0.74rem', fontWeight: 600 }}>
                        <span>MODO VENTILATORIO</span>
                        <Wind size={16} style={{ color: '#2563EB' }} />
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '1.05rem', fontWeight: 800, color: '#1E293B' }}>
                        {kpis.lastMode || 'Espontáneo'}
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '0.7rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} /> Último registro en ARM
                    </div>
                </div>

                {/* KPI 2: IMS Máximo */}
                <div style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748B', fontSize: '0.74rem', fontWeight: 600 }}>
                        <span>ESCALA IMS MÁXIMA</span>
                        <Move size={16} style={{ color: '#0D9488' }} />
                    </div>
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F766E' }}>{kpis.maxIms}</span>
                        <span style={{ fontSize: '0.78rem', color: '#64748B' }}>/ 10</span>
                        <span style={{ 
                            fontSize: '0.7rem', 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            background: IMS_LEVELS[kpis.maxIms]?.bg || '#F1F5F9',
                            color: IMS_LEVELS[kpis.maxIms]?.color || '#475569',
                            fontWeight: 700 
                        }}>
                            {IMS_LEVELS[kpis.maxIms]?.label.split('(')[0]}
                        </span>
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '0.7rem', color: '#64748B' }}>
                        Nivel actual/egreso: <strong>{kpis.lastIms} / 10</strong>
                    </div>
                </div>

                {/* KPI 3: PaFiO2 Crítico */}
                <div style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748B', fontSize: '0.74rem', fontWeight: 600 }}>
                        <span>ÍNDICE PaFiO2 (KIRBY)</span>
                        <Gauge size={16} style={{ color: kpis.minPaFi && kpis.minPaFi < 100 ? '#DC2626' : '#D97706' }} />
                    </div>
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ 
                            fontSize: '1.3rem', 
                            fontWeight: 800, 
                            color: kpis.minPaFi && kpis.minPaFi < 100 ? '#DC2626' : (kpis.minPaFi && kpis.minPaFi < 200 ? '#D97706' : '#059669') 
                        }}>
                            {kpis.minPaFi || '-'}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#64748B' }}>mínimo reg.</span>
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '0.7rem', color: kpis.minPaFi && kpis.minPaFi < 100 ? '#DC2626' : '#64748B', fontWeight: 600 }}>
                        {kpis.minPaFi && kpis.minPaFi < 100 ? '⚠️ Distrés Respiratorio Severo' : (kpis.minPaFi && kpis.minPaFi < 200 ? 'Distrés Moderado' : 'Ventilación Estable')}
                    </div>
                </div>

                {/* KPI 4: Total Registros y Actividad */}
                <div style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748B', fontSize: '0.74rem', fontWeight: 600 }}>
                        <span>EVALUACIONES KINE</span>
                        <Activity size={16} style={{ color: '#4F46E5' }} />
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '1.3rem', fontWeight: 800, color: '#1E293B' }}>
                        {kpis.countRegistros}
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '0.7rem', color: '#64748B' }}>
                        {notesList.length} notas evolutivas registradas
                    </div>
                </div>
            </div>

            {/* ─── 2. SELECTOR DE SUB-MÓDULO (LOS 3 EJES DE FRANCISCO) ─── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderBottom: '1px solid #E2E8F0',
                paddingBottom: '8px'
            }}>
                {[
                    { id: 'arm', label: '1. Monitoreo Ventilatorio (ARM)', icon: Wind, badge: timelineARM.length },
                    { id: 'movilizacion', label: '2. Movilización Temprana (IMS 0-10)', icon: Move, badge: timelineIMS.length },
                    { id: 'weaning', label: '3. Weaning & Extubación', icon: CheckCircle2, badge: timelineWeaning.length },
                    { id: 'bitacora', label: '4. Bitácora de Observaciones', icon: FileText, badge: notesList.length }
                ].map(tab => {
                    const isSelected = activeSubView === tab.id;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSubView(tab.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 14px',
                                borderRadius: '8px',
                                border: 'none',
                                background: isSelected ? '#1E40AF' : '#F1F5F9',
                                color: isSelected ? '#FFFFFF' : '#475569',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Icon size={14} />
                            <span>{tab.label}</span>
                            {tab.badge > 0 && (
                                <span style={{
                                    background: isSelected ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
                                    color: isSelected ? '#FFFFFF' : '#334155',
                                    borderRadius: '10px',
                                    padding: '1px 6px',
                                    fontSize: '0.68rem',
                                    fontWeight: 800
                                }}>
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ─── 3. VISTAS ESPECÍFICAS ─── */}

            {/* ───────────────────────────────────────────────────────── */}
            {/* SUB-VISTA 1: MONITOREO VENTILATORIO (ARM)                */}
            {/* ───────────────────────────────────────────────────────── */}
            {activeSubView === 'arm' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Gráfico 1: FiO2 vs PEEP vs PaFiO2 */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        padding: '18px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Wind size={16} style={{ color: '#2563EB' }} />
                                    Evolución de Oxigenación y Presión Espiratoria (FiO2% vs. PEEP)
                                </h4>
                                <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                    Trazabilidad del aporte de oxígeno e invasividad del soporte ventilatorio
                                </span>
                            </div>
                        </div>

                        <div style={{ width: '100%', height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={timelineARM} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                    <XAxis dataKey="fechaLabel" tick={{ fontSize: 11, fill: '#64748B' }} />
                                    <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 11, fill: '#2563EB' }} label={{ value: 'FiO2 (%)', angle: -90, position: 'insideLeft', fill: '#2563EB', fontSize: 10 }} />
                                    <YAxis yAxisId="right" orientation="right" domain={[0, 20]} tick={{ fontSize: 11, fill: '#D97706' }} label={{ value: 'PEEP (cmH2O)', angle: 90, position: 'insideRight', fill: '#D97706', fontSize: 10 }} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#1E293B', borderRadius: '8px', border: 'none', color: '#FFFFFF', fontSize: '0.75rem' }}
                                        formatter={(val, name) => [val, name === 'fio2' ? 'FiO2 (%)' : (name === 'peep' ? 'PEEP (cmH2O)' : name)]}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '0.74rem' }} />
                                    <Line yAxisId="left" type="monotone" dataKey="fio2" name="FiO2 (%)" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 4, fill: '#2563EB' }} activeDot={{ r: 6 }} />
                                    <Line yAxisId="right" type="stepAfter" dataKey="peep" name="PEEP (cmH2O)" stroke="#D97706" strokeWidth={2} dot={{ r: 3, fill: '#D97706' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Gráfico 2: Presiones y Volúmenes (Vt, Presión Pico, Presión de Balón) */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        padding: '18px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Gauge size={16} style={{ color: '#0D9488' }} />
                                    Mecánica Ventilatoria (Presión Pico, Volumen Tidal Vt y Balón)
                                </h4>
                                <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                    Control barométrico de seguridad y prevención de barotrauma / VILI
                                </span>
                            </div>
                        </div>

                        <div style={{ width: '100%', height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={timelineARM} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                    <XAxis dataKey="fechaLabel" tick={{ fontSize: 11, fill: '#64748B' }} />
                                    <YAxis yAxisId="left" domain={[0, 600]} tick={{ fontSize: 11, fill: '#0D9488' }} label={{ value: 'Volumen Tidal (ml)', angle: -90, position: 'insideLeft', fill: '#0D9488', fontSize: 10 }} />
                                    <YAxis yAxisId="right" orientation="right" domain={[0, 50]} tick={{ fontSize: 11, fill: '#DC2626' }} label={{ value: 'Presión (cmH2O)', angle: 90, position: 'insideRight', fill: '#DC2626', fontSize: 10 }} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#1E293B', borderRadius: '8px', border: 'none', color: '#FFFFFF', fontSize: '0.75rem' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '0.74rem' }} />
                                    {/* Línea de seguridad en 35 cmH2O de Presión Pico */}
                                    <ReferenceLine yAxisId="right" y={35} stroke="#DC2626" strokeDasharray="4 4" label={{ value: 'Límite Pico Seguro (35 cmH2O)', fill: '#DC2626', fontSize: 9 }} />
                                    <Line yAxisId="left" type="monotone" dataKey="vt" name="Volumen Corriente (Vt ml)" stroke="#0D9488" strokeWidth={2.5} dot={{ r: 4, fill: '#0D9488' }} />
                                    <Line yAxisId="right" type="monotone" dataKey="pPico" name="Presión Pico (cmH2O)" stroke="#DC2626" strokeWidth={2} dot={{ r: 3, fill: '#DC2626' }} />
                                    <Line yAxisId="right" type="monotone" dataKey="balon" name="Balón Neumotaponamiento (cmH2O)" stroke="#8B5CF6" strokeWidth={1.8} dot={{ r: 3, fill: '#8B5CF6' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────── */}
            {/* SUB-VISTA 2: MOVILIZACIÓN TEMPRANA (IMS 0 AL 10)         */}
            {/* ───────────────────────────────────────────────────────── */}
            {activeSubView === 'movilizacion' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Gráfico de la Escala IMS */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        padding: '18px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Move size={16} style={{ color: '#0D9488' }} />
                                    Curva Evolutiva de Movilización Temprana (Escala IMS 0 al 10)
                                </h4>
                                <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                    Seguimiento de la ganancia motora e independencia funcional en UCI
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <span style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '4px', background: '#CCFBF1', color: '#0F766E', fontWeight: 700 }}>
                                    Máximo Alcanzado: {kpis.maxIms} / 10
                                </span>
                            </div>
                        </div>

                        <div style={{ width: '100%', height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={timelineIMS} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorIms" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#0D9488" stopOpacity={0.4}/>
                                            <stop offset="95%" stopColor="#0D9488" stopOpacity={0.0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                    <XAxis dataKey="fechaLabel" tick={{ fontSize: 11, fill: '#64748B' }} />
                                    <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 11, fill: '#0D9488' }} label={{ value: 'Nivel IMS (0 a 10)', angle: -90, position: 'insideLeft', fill: '#0D9488', fontSize: 10 }} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#1E293B', borderRadius: '8px', border: 'none', color: '#FFFFFF', fontSize: '0.75rem' }}
                                        formatter={(val) => [`Nivel ${val}: ${IMS_LEVELS[val]?.label || ''}`, 'Escala IMS']}
                                    />
                                    <Area type="monotone" dataKey="ims" stroke="#0D9488" strokeWidth={3} fillOpacity={1} fill="url(#colorIms)" dot={{ r: 5, fill: '#0D9488' }} activeDot={{ r: 7 }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Guía Visual de la Escala IMS para Auditoría Rápida */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        padding: '16px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                    }}>
                        <h5 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', fontWeight: 800, color: '#334155' }}>
                            REFERENCIA DE HITOS FUNCIONALES (ICU MOBILITY SCALE)
                        </h5>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px' }}>
                            {Object.entries(IMS_LEVELS).map(([lvl, info]) => {
                                const isCurrent = Number(lvl) === kpis.maxIms;
                                return (
                                    <div 
                                        key={lvl}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '6px 10px',
                                            borderRadius: '6px',
                                            background: isCurrent ? info.bg : '#F8FAFC',
                                            border: isCurrent ? `1.5px solid ${info.color}` : '1px solid #E2E8F0',
                                            fontSize: '0.72rem'
                                        }}
                                    >
                                        <span style={{ 
                                            background: info.color, 
                                            color: '#FFFFFF', 
                                            fontWeight: 800, 
                                            borderRadius: '4px', 
                                            width: '20px', 
                                            height: '20px', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            fontSize: '0.7rem'
                                        }}>
                                            {lvl}
                                        </span>
                                        <span style={{ color: isCurrent ? info.color : '#475569', fontWeight: isCurrent ? 700 : 500 }}>
                                            {info.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────── */}
            {/* SUB-VISTA 3: PROTOCOLO DE WEANING & EXTUBACIÓN            */}
            {/* ───────────────────────────────────────────────────────── */}
            {activeSubView === 'weaning' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        padding: '18px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                    }}>
                        <h4 style={{ margin: '0 0 14px 0', fontSize: '0.92rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CheckCircle2 size={16} style={{ color: '#059669' }} />
                            Protocolo de 3 Pasos para Desvinculación de ARM (Weaning)
                        </h4>

                        {/* Fases */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                            {/* Paso 1: Criterios Clínicos */}
                            <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px', border: '1px solid #E2E8F0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ background: '#2563EB', color: '#FFFFFF', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800 }}>1</span>
                                    <strong style={{ fontSize: '0.8rem', color: '#1E293B' }}>Criterios de Aptitud (PRE)</strong>
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.74rem', color: '#475569', lineHeight: 1.6 }}>
                                    <li>Causa de falla respiratoria resuelta o en mejoría.</li>
                                    <li>PaFiO2 &gt; 150 con PEEP ≤ 8 cmH2O.</li>
                                    <li>Estado neurológico: RASS entre -2 y +1 (Vigil).</li>
                                    <li>Estabilidad hemodinámica sin vasopresores a dosis altas.</li>
                                </ul>
                            </div>

                            {/* Paso 2: Prueba Espontánea */}
                            <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px', border: '1px solid #E2E8F0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ background: '#D97706', color: '#FFFFFF', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800 }}>2</span>
                                    <strong style={{ fontSize: '0.8rem', color: '#1E293B' }}>Prueba Espontánea (30-120 min)</strong>
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.74rem', color: '#475569', lineHeight: 1.6 }}>
                                    <li>Tubo en T o Presión Soporte ≤ 7 cmH2O.</li>
                                    <li>Índice de Tobin (FR / Vt) &lt; 105.</li>
                                    <li>Monitoreo de FC, TA y SatO2 sin signos de fatiga.</li>
                                    <li>Tolerancia sin diaforesis ni uso de accesorios.</li>
                                </ul>
                            </div>

                            {/* Paso 3: Criterios de Extubación */}
                            <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px', border: '1px solid #E2E8F0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ background: '#059669', color: '#FFFFFF', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800 }}>3</span>
                                    <strong style={{ fontSize: '0.8rem', color: '#1E293B' }}>Extubación y Vía Aérea</strong>
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.74rem', color: '#475569', lineHeight: 1.6 }}>
                                    <li>Fuerza de tos efectiva: <strong>PeMax &gt; 40 cmH2O</strong>.</li>
                                    <li>Cantidad y manejo de secreciones bronquiales.</li>
                                    <li>Uso protocolizado de VNI / CNAF preventivo post-extubación.</li>
                                    <li>Trazabilidad de no reintubación en 48 hs.</li>
                                </ul>
                            </div>
                        </div>

                        {/* Registros de Weaning del Paciente */}
                        {timelineWeaning.length > 0 && (
                            <div style={{ marginTop: '18px' }}>
                                <h5 style={{ margin: '0 0 10px 0', fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                                    REGISTROS DE PROTOCOLOS DE DESVINCULACIÓN CARGADOS
                                </h5>
                                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                                        <thead>
                                            <tr style={{ background: '#F1F5F9', color: '#475569', textAlign: 'left' }}>
                                                <th style={{ padding: '8px 12px' }}>Fecha/Hora</th>
                                                <th style={{ padding: '8px 12px' }}>Protocolo</th>
                                                <th style={{ padding: '8px 12px' }}>Criterio / Parámetro</th>
                                                <th style={{ padding: '8px 12px' }}>Valor Registrado</th>
                                                <th style={{ padding: '8px 12px' }}>Profesional</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {timelineWeaning.map((w, idx) => (
                                                <tr key={idx} style={{ borderTop: '1px solid #F1F5F9' }}>
                                                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{w.fechaLabel}</td>
                                                    <td style={{ padding: '8px 12px', color: '#2563EB' }}>{w.protocolo}</td>
                                                    <td style={{ padding: '8px 12px' }}>{w.parametro}</td>
                                                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1E293B' }}>{w.valor}</td>
                                                    <td style={{ padding: '8px 12px', color: '#64748B' }}>{w.profesional || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────── */}
            {/* SUB-VISTA 4: BITÁCORA CRONOLÓGICA DE KINESIOLOGÍA        */}
            {/* ───────────────────────────────────────────────────────── */}
            {activeSubView === 'bitacora' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
                            {notesList.length} notas evolutivas registradas en Terapia Intensiva
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {notesList.map((n, idx) => (
                            <div 
                                key={n.id || idx}
                                style={{
                                    background: '#FFFFFF',
                                    borderRadius: '10px',
                                    border: '1px solid #E2E8F0',
                                    padding: '14px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ 
                                            background: '#EFF6FF', 
                                            color: '#1D4ED8', 
                                            padding: '2px 8px', 
                                            borderRadius: '4px', 
                                            fontSize: '0.72rem', 
                                            fontWeight: 700 
                                        }}>
                                            {n.protocolo}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1E293B' }}>
                                            {n.parametro}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#64748B' }}>
                                        <Clock size={13} />
                                        <span>{n.fechaLabel}</span>
                                    </div>
                                </div>

                                <p style={{ 
                                    margin: 0, 
                                    fontSize: '0.8rem', 
                                    color: '#334155', 
                                    lineHeight: 1.5,
                                    whiteSpace: 'pre-wrap',
                                    background: '#F8FAFC',
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #F1F5F9'
                                }}>
                                    {n.nota}
                                </p>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.7rem', color: '#94A3B8' }}>
                                    <span>Registrado por: <strong>{n.profesional}</strong></span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
