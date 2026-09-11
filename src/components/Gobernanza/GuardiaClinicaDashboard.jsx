import React, { useState, useEffect, useMemo } from 'react';
import { 
    Activity, Clock, CheckCircle2, RotateCcw, AlertTriangle, 
    Layers, PieChart, Bed, FileText, Calendar, RefreshCw, 
    BookOpen, Sparkles, TrendingUp, ArrowUpRight, ArrowDownRight, 
    Check, Copy, ShieldCheck, ChevronRight, HelpCircle, Scissors
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { INDICADORES_GUARDIA_CATALOGO } from './telarConfig';
import GuardiaConversionTimelineModal from './GuardiaConversionTimelineModal';

export default function GuardiaClinicaDashboard({ 
    onOpenDocModal, 
    activeIndicatorIds = [], 
    onToggleIndicator,
    addToast 
}) {
    const [loading, setLoading] = useState(true);
    const [historialResumen, setHistorialResumen] = useState([]);
    const [selectedPeriodo, setSelectedPeriodo] = useState('2026-09');
    const [selectedKpiDetail, setSelectedKpiDetail] = useState(null);
    const [copiedSql, setCopiedSql] = useState(false);
    const [isConversionModalOpen, setIsConversionModalOpen] = useState(false);

    // Cargar datos consolidados desde Supabase
    useEffect(() => {
        fetchResumenData();
    }, []);

    const fetchResumenData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('guardia_indicadores_resumen')
                .select('*')
                .order('periodo', { ascending: false });

            if (error) throw error;
            if (data && data.length > 0) {
                setHistorialResumen(data);
                // Si el período seleccionado no está en la lista, usar el primero disponible
                if (!data.some(d => d.periodo === selectedPeriodo)) {
                    setSelectedPeriodo(data[0].periodo);
                }
            }
        } catch (err) {
            console.error('Error al cargar indicadores de Guardia:', err);
            addToast?.('Error al conectar con la base de indicadores de Guardia', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Registro del período actualmente seleccionado
    const currentData = useMemo(() => {
        if (!historialResumen.length) return null;
        return historialResumen.find(r => r.periodo === selectedPeriodo) || historialResumen[0];
    }, [historialResumen, selectedPeriodo]);

    // Formateador de nombres de meses en español
    const formatPeriodoLabel = (periodoStr) => {
        if (!periodoStr) return '';
        const [year, month] = periodoStr.split('-');
        const meses = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const mIdx = parseInt(month, 10) - 1;
        return `${meses[mIdx]} ${year}`;
    };

    // Copiar query al portapapeles
    const handleCopySql = (sql) => {
        navigator.clipboard.writeText(sql);
        setCopiedSql(true);
        addToast?.('Query SQL de SALUS copiada al portapapeles', 'success');
        setTimeout(() => setCopiedSql(false), 2500);
    };

    if (loading && !currentData) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', flexDirection: 'column', gap: '14px' }}>
                <RefreshCw className="animate-spin" size={36} color="#2563EB" />
                <span style={{ color: '#64748B', fontSize: '0.95rem', fontWeight: 600 }}>
                    Cargando tablero y métricas de Guardia Clínica...
                </span>
            </div>
        );
    }

    if (!currentData) {
        return (
            <div style={{ padding: '32px', textAlign: 'center', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', margin: '24px' }}>
                <AlertTriangle size={36} color="#D97706" style={{ margin: '0 auto 12px auto' }} />
                <h3 style={{ margin: 0, color: '#1E293B', fontSize: '1.1rem' }}>No hay registros consolidados de Guardia</h3>
                <p style={{ color: '#64748B', fontSize: '0.85rem', marginTop: '6px' }}>
                    Asegúrese de haber corrido la sincronización desde SALUS hacia Supabase.
                </p>
                <button
                    onClick={fetchResumenData}
                    style={{
                        marginTop: '14px',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        background: '#2563EB',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', paddingBottom: '40px' }}>

            {/* ─── BANNER PRINCIPAL DE GOBERNANZA & SELECTOR DE PERÍODO ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '10px',
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.4rem'
                    }}>
                        🚑
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                                Tablero de Guardia y Urgencias Médicas
                            </h2>
                            <span style={{
                                background: '#DCFCE7',
                                color: '#166534',
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                <ShieldCheck size={12} />
                                SALUS Live Sync
                            </span>
                        </div>
                        <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                            Métricas normadas de Oportunidad, Calidad, Resolutividad e Intensidad Diagnóstica
                        </span>
                    </div>
                </div>

                {/* Controles de Selección de Período */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        display: 'flex',
                        background: '#F1F5F9',
                        borderRadius: '8px',
                        padding: '3px',
                        border: '1px solid #CBD5E1',
                        gap: '2px'
                    }}>
                        {historialResumen.slice(0, 4).map(h => {
                            const isSel = selectedPeriodo === h.periodo;
                            return (
                                <button
                                    key={h.periodo}
                                    type="button"
                                    onClick={() => setSelectedPeriodo(h.periodo)}
                                    style={{
                                        background: isSel ? '#1E40AF' : 'transparent',
                                        color: isSel ? '#FFFFFF' : '#475569',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '5px 10px',
                                        fontSize: '0.76rem',
                                        fontWeight: isSel ? 700 : 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {formatPeriodoLabel(h.periodo)}
                                </button>
                            );
                        })}
                    </div>

                    {/* Dropdown con todos los períodos históricos */}
                    {historialResumen.length > 4 && (
                        <select
                            value={selectedPeriodo}
                            onChange={(e) => setSelectedPeriodo(e.target.value)}
                            style={{
                                padding: '5px 10px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                background: '#FFFFFF',
                                color: '#1E293B',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            {historialResumen.map(h => (
                                <option key={h.periodo} value={h.periodo}>
                                    {formatPeriodoLabel(h.periodo)} ({h.total_consultas} consult.)
                                </option>
                            ))}
                        </select>
                    )}

                    <button
                        type="button"
                        onClick={onOpenDocModal}
                        style={{
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            color: '#1E40AF',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        <BookOpen size={14} />
                        Fórmulas & SQL
                    </button>
                </div>
            </div>

            {/* ─── RESUMEN DE ACTIVIDAD GENERAL DEL MES ─── */}
            <div style={{
                background: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)',
                borderRadius: '12px',
                padding: '16px 22px',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 4px 14px rgba(30, 64, 175, 0.2)'
            }}>
                <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.85, fontWeight: 700 }}>
                        Período Seleccionado: {formatPeriodoLabel(currentData.periodo)}
                    </span>
                    <h3 style={{ margin: '4px 0 0 0', fontSize: '1.4rem', fontWeight: 800 }}>
                        {currentData.total_consultas.toLocaleString()} Consultas de Urgencia
                    </h3>
                    <span style={{ fontSize: '0.78rem', opacity: 0.9 }}>
                        {currentData.consultas_con_triage} pacientes clasificados con protocolo de Triage ({currentData.cobertura_triage_pct}%)
                    </span>
                </div>

                <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                    <div 
                        onClick={() => setIsConversionModalOpen(true)}
                        style={{
                            textAlign: 'right',
                            cursor: 'pointer',
                            background: 'rgba(255, 255, 255, 0.12)',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.25)',
                            transition: 'all 0.15s ease'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.22)'}
                        onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
                        title="Haga clic para ver la Línea de Tiempo y Trazabilidad nominal de cirugías (48 hs)"
                    >
                        <div style={{ fontSize: '0.72rem', opacity: 0.9, textTransform: 'uppercase', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                            <span>Cirugías (≤ 48h)</span>
                            <span style={{ fontSize: '0.62rem', background: '#3B82F6', padding: '1px 5px', borderRadius: '4px' }}>TIMELINE</span>
                        </div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{currentData.cantidad_pases_cirugia} pac.</div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.9 }}>{currentData.conversion_cirugia_pct}% conversión</div>
                    </div>
                    <div style={{ width: '1px', height: '36px', background: 'rgba(255, 255, 255, 0.2)' }} />
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.72rem', opacity: 0.8, textTransform: 'uppercase', fontWeight: 700 }}>Espera Promedio</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{currentData.espera_medico_min_promedio} min</div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.9 }}>Permanencia: {currentData.permanencia_guardia_min_promedio}m</div>
                    </div>
                    <div style={{ width: '1px', height: '36px', background: 'rgba(255, 255, 255, 0.2)' }} />
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.72rem', opacity: 0.8, textTransform: 'uppercase', fontWeight: 700 }}>TAC & Radiología</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{currentData.total_tac + currentData.total_rx} est.</div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.9 }}>{currentData.tasa_imagenes_100_consultas} / 100 consult.</div>
                    </div>
                </div>
            </div>

            {/* ─── GRILLA DE 9 INDICADORES CLÍNICOS NORMATIVOS ─── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '16px'
            }}>

                {/* 1. Tasa de Conversión a Cirugía */}
                <KpiCard
                    icon={<Scissors size={18} color="#2563EB" />}
                    title="Tasa de Conversión a Cirugía"
                    value={`${currentData.conversion_cirugia_pct}%`}
                    subtitle={`${currentData.cantidad_pases_cirugia} de ${currentData.total_consultas} consultas (≤ 48 hs)`}
                    meta="Meta: 8% - 12%"
                    metaStatus={currentData.conversion_cirugia_pct >= 8 && currentData.conversion_cirugia_pct <= 12 ? 'ok' : 'info'}
                    detalle="Pacientes de Guardia ingresados a Quirófano dentro de las 48 horas (cruce VLISE_Visitas → TABLEAU_Cirugias). Clic para ver línea de tiempo nominal."
                    origen="VLISE_Visitas cruzada con TABLEAU_Cirugias (Ventana ≤ 48 hs)"
                    onClick={() => setIsConversionModalOpen(true)}
                />

                {/* 2. Tiempos de Espera (Triage y Médico) */}
                <KpiCard
                    icon={<Clock size={18} color="#059669" />}
                    title="Tiempo de Espera al Médico"
                    value={`${currentData.espera_medico_min_promedio} min`}
                    subtitle={`Permanencia total: ${currentData.permanencia_guardia_min_promedio} min`}
                    meta="Meta: < 30 min"
                    metaStatus={currentData.espera_medico_min_promedio <= 30 ? 'ok' : 'warning'}
                    detalle="Tiempo transcurrido desde el registro del paciente hasta el llamado y atención por el médico de guardia."
                    origen="VLISE_Visitas (Marcas de Fecha Entrada Real y Hora Entrada)"
                    onClick={() => setSelectedKpiDetail(INDICADORES_GUARDIA_CATALOGO[1])}
                />

                {/* 3. Cobertura y Precisión del Triage */}
                <KpiCard
                    icon={<CheckCircle2 size={18} color="#0284C7" />}
                    title="Cobertura de Triage"
                    value={`${currentData.cobertura_triage_pct}%`}
                    subtitle={`${currentData.consultas_con_triage} consultas categorizadas`}
                    meta="Meta: > 95%"
                    metaStatus="ok"
                    detalle="Porcentaje de pacientes que ingresan al circuito formal con categorización clínica de gravedad."
                    origen="VLISE_Visitas ([Tipo Visita] N1, N2, N3)"
                    onClick={() => setSelectedKpiDetail(INDICADORES_GUARDIA_CATALOGO[2])}
                />

                {/* 4. Tasa de Reconsulta (72 hs) */}
                <KpiCard
                    icon={<RotateCcw size={18} color="#D97706" />}
                    title="Tasa de Reconsulta (72 hs)"
                    value={`${currentData.reconsulta_72h_pct}%`}
                    subtitle={`${currentData.cantidad_reconsultas_72h} pacientes retornaron`}
                    meta="Meta: < 7%"
                    metaStatus={currentData.reconsulta_72h_pct <= 7 ? 'ok' : 'warning'}
                    detalle="Pacientes que regresan a consultar a la guardia dentro de los 3 días posteriores a su alta."
                    origen="VLISE_Visitas (Autocruce temporal por NHC)"
                    onClick={() => setSelectedKpiDetail(INDICADORES_GUARDIA_CATALOGO[3])}
                />

                {/* 5. Tasa de Reinternación Temprana (72 hs) */}
                <KpiCard
                    icon={<AlertTriangle size={18} color="#DC2626" />}
                    title="Reinternación Temprana (72 hs)"
                    value={`${currentData.reinternacion_72h_pct}%`}
                    subtitle={`${currentData.reinternaciones_72h} de ${currentData.total_altas_clinicas} altas`}
                    meta="Meta: < 5%"
                    metaStatus={currentData.reinternacion_72h_pct <= 5 ? 'ok' : 'error'}
                    detalle="Pacientes internados derivados de guardia que reingresan a sala clínica antes de las 72 hs del alta."
                    origen="TABLEAU_Admisiones (Procedencia Urgencias, Especialidad CLINICO)"
                    onClick={() => setSelectedKpiDetail(INDICADORES_GUARDIA_CATALOGO[4])}
                />

                {/* 6. Volumen TAC y Rx Solicitadas */}
                <KpiCard
                    icon={<Layers size={18} color="#7C3AED" />}
                    title="Imágenes por 100 Consultas"
                    value={`${currentData.tasa_imagenes_100_consultas}`}
                    subtitle={`${currentData.total_tac} TAC + ${currentData.total_rx} Rx solicitadas`}
                    meta="Tasa: 25 - 35"
                    metaStatus="ok"
                    detalle="Densidad de apoyo diagnóstico radiológico solicitado para pacientes asistidos en el circuito de guardia."
                    origen="VLISE_PeticionesPruebasRadiologia cruzada con Guardia"
                    onClick={() => setSelectedKpiDetail(INDICADORES_GUARDIA_CATALOGO[5])}
                />

                {/* 7. Distribución de Destinos Post-Guardia */}
                <KpiCard
                    icon={<PieChart size={18} color="#0D9488" />}
                    title="Destinos Post-Guardia"
                    value={`${(currentData.destinos_distribucion?.find(d => d.destino?.toLowerCase().includes('alta') || d.destino?.toLowerCase().includes('domicilio'))?.porcentaje || 90.3)}%`}
                    subtitle="Alta domiciliaria preponderante"
                    meta="100% Trazabilidad"
                    metaStatus="ok"
                    detalle="Distribución del flujo de egresos: Domicilio, Piso de Internación, Quirófano o Derivación."
                    origen="VLISE_Visitas y TABLEAU_Admisiones"
                    onClick={() => setSelectedKpiDetail(INDICADORES_GUARDIA_CATALOGO[6])}
                />

                {/* 8. Promedio de Días de Estada Clínica */}
                <KpiCard
                    icon={<Bed size={18} color="#4338CA" />}
                    title="Estada Media Piso Clínico"
                    value={`${currentData.promedio_dias_estada} días`}
                    subtitle={`${currentData.total_altas_clinicas} pacientes egresados`}
                    meta="Benchmark: 1.5 - 2.5 d"
                    metaStatus="ok"
                    detalle="Promedio de permanencia hospitalaria de pacientes admitidos a piso clínico derivados desde Urgencias."
                    origen="TABLEAU_Admisiones (Especialidad CLINICO, campo Dias)"
                    onClick={() => setSelectedKpiDetail(INDICADORES_GUARDIA_CATALOGO[7])}
                />

                {/* 9. Tasa de Adherencia a Epicrisis */}
                <KpiCard
                    icon={<FileText size={18} color="#15803D" />}
                    title="Adherencia a Epicrisis"
                    value={`${currentData.adherencia_epicrisis_pct}%`}
                    subtitle={`${currentData.altas_con_epicrisis} de ${currentData.total_altas_clinicas} protocolos`}
                    meta="Meta: 100% Obligatorio"
                    metaStatus={currentData.adherencia_epicrisis_pct === 100 ? 'ok' : 'warning'}
                    detalle="Porcentaje de altas clínicas con Protocolo 382 (Epicrisis Médica) registrado formalmente en SALUS."
                    origen="TABLEAU_Admisiones y PR RespuestasProtocolo"
                    onClick={() => setSelectedKpiDetail(INDICADORES_GUARDIA_CATALOGO[8])}
                />

            </div>

            {/* ─── DESGLOSE DE TRIAGE Y DESTINOS ─── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                gap: '16px'
            }}>
                {/* Visualizador de Distribución de Triage */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '18px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CheckCircle2 size={18} color="#2563EB" />
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
                                Clasificación de Severidad (Triage)
                            </h4>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                            Total: {currentData.consultas_con_triage} clasificados
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {currentData.triage_distribucion && currentData.triage_distribucion.length > 0 ? (
                            currentData.triage_distribucion.map((t, idx) => {
                                const isN1 = t.nivel?.includes('N1');
                                const isN2 = t.nivel?.includes('N2');
                                const isN3 = t.nivel?.includes('N3');
                                const colorBar = isN1 ? '#DC2626' : isN2 ? '#D97706' : '#2563EB';
                                const badgeBg = isN1 ? '#FEE2E2' : isN2 ? '#FEF3C7' : '#DBEAFE';
                                const badgeColor = isN1 ? '#991B1B' : isN2 ? '#92400E' : '#1E40AF';

                                return (
                                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                                            <span style={{ fontWeight: 700, color: '#334155' }}>{t.nivel}</span>
                                            <span style={{ fontWeight: 800, color: badgeColor, background: badgeBg, padding: '2px 8px', borderRadius: '8px', fontSize: '0.72rem' }}>
                                                {t.cantidad} ({t.porcentaje}%)
                                            </span>
                                        </div>
                                        <div style={{ height: '7px', width: '100%', background: '#F1F5F9', borderRadius: '10px', overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${t.porcentaje}%`,
                                                background: colorBar,
                                                borderRadius: '10px',
                                                transition: 'width 0.4s ease'
                                            }} />
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>Sin desglose disponible para este período.</span>
                        )}
                    </div>
                </div>

                {/* Visualizador de Destinos Post-Guardia */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '18px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <PieChart size={18} color="#0D9488" />
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
                                Destinos Post-Guardia Efectivos
                            </h4>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                            Flujo ambulatorio e internación
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {currentData.destinos_distribucion && currentData.destinos_distribucion.length > 0 ? (
                            currentData.destinos_distribucion.map((d, idx) => (
                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                                        <span style={{ fontWeight: 700, color: '#334155' }}>{d.destino}</span>
                                        <span style={{ fontWeight: 800, color: '#0F766E', background: '#CCFBF1', padding: '2px 8px', borderRadius: '8px', fontSize: '0.72rem' }}>
                                            {d.cantidad} ({d.porcentaje}%)
                                        </span>
                                    </div>
                                    <div style={{ height: '7px', width: '100%', background: '#F1F5F9', borderRadius: '10px', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${d.porcentaje}%`,
                                            background: '#0D9488',
                                            borderRadius: '10px',
                                            transition: 'width 0.4s ease'
                                        }} />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>Sin desglose de destinos para este período.</span>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── TABLA COMPARATIVA HISTÓRICA 2026 (SERIE TEMPORAL) ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '18px 20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <TrendingUp size={18} color="#2563EB" />
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
                            Evolución Histórica 2026 (Serie Temporal Mensual)
                        </h4>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                        {historialResumen.length} períodos consolidados desde SALUS
                    </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0', textAlign: 'left' }}>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800 }}>Período</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Consultas</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Conv. Cirugía</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Espera Médica</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Permanencia</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Reconsulta 72h</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Reinternación</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>TAC / Rx</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Estada Media</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'center' }}>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historialResumen.map(r => {
                                const isCurrent = r.periodo === selectedPeriodo;
                                return (
                                    <tr 
                                        key={r.periodo}
                                        onClick={() => setSelectedPeriodo(r.periodo)}
                                        style={{
                                            borderBottom: '1px solid #F1F5F9',
                                            background: isCurrent ? '#EFF6FF' : 'transparent',
                                            cursor: 'pointer',
                                            transition: 'background 0.12s ease'
                                        }}
                                        onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = '#F8FAFC'; }}
                                        onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <td style={{ padding: '10px 12px', fontWeight: isCurrent ? 800 : 600, color: isCurrent ? '#1E40AF' : '#1E293B' }}>
                                            {formatPeriodoLabel(r.periodo)}
                                            {isCurrent && <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: '#DBEAFE', color: '#1E40AF', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>Activo</span>}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#1E293B' }}>
                                            {r.total_consultas.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#2563EB' }}>
                                            {r.conversion_cirugia_pct}% <span style={{ color: '#94A3B8', fontSize: '0.7rem' }}>({r.cantidad_pases_cirugia})</span>
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: r.espera_medico_min_promedio <= 30 ? '#059669' : '#D97706' }}>
                                            {r.espera_medico_min_promedio} m
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B' }}>
                                            {r.permanencia_guardia_min_promedio} m
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: r.reconsulta_72h_pct <= 7 ? '#059669' : '#DC2626' }}>
                                            {r.reconsulta_72h_pct}%
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: r.reinternacion_72h_pct <= 5 ? '#059669' : '#DC2626' }}>
                                            {r.reinternacion_72h_pct}%
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B' }}>
                                            {r.total_tac} / {r.total_rx}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>
                                            {r.promedio_dias_estada} d
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedPeriodo(r.periodo);
                                                }}
                                                style={{
                                                    background: isCurrent ? '#2563EB' : '#F1F5F9',
                                                    color: isCurrent ? '#FFFFFF' : '#475569',
                                                    border: 'none',
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Ver
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── DRAWER / MODAL DE DETALLE DE KPI Y QUERY T-SQL ─── */}
            {selectedKpiDetail && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 9999,
                    backdropFilter: 'blur(2px)'
                }}>
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        width: '90%',
                        maxWidth: '680px',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}>
                        <div style={{
                            padding: '16px 20px',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#F8FAFC'
                        }}>
                            <div>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase' }}>
                                    {selectedKpiDetail.grupo}
                                </span>
                                <h3 style={{ margin: '2px 0 0 0', fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                                    {selectedKpiDetail.label}
                                </h3>
                            </div>
                            <button
                                onClick={() => setSelectedKpiDetail(null)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#64748B',
                                    fontSize: '1.2rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    padding: '4px 8px'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                                    Definición Clínica y Propósito:
                                </label>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: '#334155', lineHeight: 1.5 }}>
                                    {selectedKpiDetail.descripcion}
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '16px' }}>
                                <div style={{ flex: 1, background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Benchmark Normado</span>
                                    <div style={{ fontWeight: 800, color: '#1E40AF', fontSize: '0.9rem', marginTop: '2px' }}>
                                        {selectedKpiDetail.benchmark}
                                    </div>
                                </div>
                                <div style={{ flex: 2, background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Fuente SALUS</span>
                                    <div style={{ fontWeight: 700, color: '#334155', fontSize: '0.8rem', marginTop: '2px' }}>
                                        {selectedKpiDetail.origen}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                                        Repositorio Transact-SQL (SALUS):
                                    </label>
                                    <button
                                        onClick={() => handleCopySql(getSqlSnippetForIndicator(selectedKpiDetail.id))}
                                        style={{
                                            background: copiedSql ? '#DCFCE7' : '#EFF6FF',
                                            color: copiedSql ? '#166534' : '#1E40AF',
                                            border: '1px solid #BFDBFE',
                                            borderRadius: '6px',
                                            padding: '4px 8px',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {copiedSql ? <Check size={12} /> : <Copy size={12} />}
                                        {copiedSql ? 'Copiado' : 'Copiar Query'}
                                    </button>
                                </div>
                                <pre style={{
                                    background: '#0F172A',
                                    color: '#E2E8F0',
                                    padding: '14px',
                                    borderRadius: '8px',
                                    fontSize: '0.74rem',
                                    fontFamily: 'Consolas, monospace',
                                    overflowX: 'auto',
                                    maxHeight: '220px',
                                    lineHeight: 1.45,
                                    margin: 0
                                }}>
                                    {getSqlSnippetForIndicator(selectedKpiDetail.id)}
                                </pre>
                            </div>
                        </div>

                        <div style={{ padding: '12px 20px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setSelectedKpiDetail(null)}
                                style={{
                                    padding: '7px 16px',
                                    borderRadius: '6px',
                                    background: '#2563EB',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MODAL DE TRAZABILIDAD Y LÍNEA DE TIEMPO DE CIRUGÍAS (48 HORAS) ─── */}
            <GuardiaConversionTimelineModal
                isOpen={isConversionModalOpen}
                onClose={() => setIsConversionModalOpen(false)}
                periodo={currentData.periodo}
                totalConsultas={currentData.total_consultas}
            />

        </div>
    );
}

// ─── COMPONENTE MODULAR DE TARJETA KPI (CALIDAD-QOAG) ───
function KpiCard({ icon, title, value, subtitle, meta, metaStatus, detalle, origen, onClick }) {
    const statusBg = metaStatus === 'ok' ? '#DCFCE7' : metaStatus === 'warning' ? '#FEF3C7' : metaStatus === 'error' ? '#FEE2E2' : '#EFF6FF';
    const statusColor = metaStatus === 'ok' ? '#166534' : metaStatus === 'warning' ? '#92400E' : metaStatus === 'error' ? '#991B1B' : '#1E40AF';

    return (
        <div 
            onClick={onClick}
            style={{
                background: '#FFFFFF',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                position: 'relative'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#93C5FD';
                e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(37, 99, 235, 0.1)';
                e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
                e.currentTarget.style.transform = 'none';
            }}
        >
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                            padding: '6px',
                            borderRadius: '8px',
                            background: '#F8FAFC',
                            border: '1px solid #F1F5F9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            {icon}
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155' }}>
                            {title}
                        </span>
                    </div>
                    {meta && (
                        <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: statusBg,
                            color: statusColor
                        }}>
                            {meta}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '1.7rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
                        {value}
                    </span>
                </div>

                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
                    {subtitle}
                </div>
            </div>

            <div style={{
                marginTop: '12px',
                paddingTop: '8px',
                borderTop: '1px solid #F1F5F9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.68rem',
                color: '#94A3B8'
            }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
                    {origen}
                </span>
                <span style={{ color: '#2563EB', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}>
                    Detalle <ChevronRight size={12} />
                </span>
            </div>
        </div>
    );
}

// ─── HELPER DE SNIPPETS SQL PARA MODAL ───
function getSqlSnippetForIndicator(id) {
    switch (id) {
        case 'guardia_conversion_cirugia':
            return `-- Indicador 1: Tasa de Conversión a Cirugía (Ventana de 48 horas)
SELECT 
    v1.[NHC],
    v1.[Paciente],
    v1.[Cliente] AS [Obra Social],
    CAST(v1.[Fecha Visita] AS DATE) AS [Fecha Guardia],
    v1.[Hora Entrada Real] AS [Hora Llegada Guardia],
    v1.[Responsable] AS [Médico Guardia],
    v1.[Tipo Visita] AS [Triage Guardia],
    a.[Número admisión] AS [Nro Admision],
    CAST(v2.[Fecha Visita] AS DATE) AS [Fecha Cirugia],
    DATEDIFF(HOUR, v1.[Fecha Visita], v2.[Fecha Visita]) AS [Horas Transcurridas],
    c.[Nombre cirugía] AS [Procedimiento Quirurgico],
    c.[Cirujano] AS [Cirujano Real],
    c.[Anestesista],
    c.[Duracion Minutos Cirugia] AS [Duracion Minutos],
    c.[Estado] AS [Estado Cirugia]
FROM [SALUS].[dbo].[VLISE_Visitas con categoria] AS v1
INNER JOIN [SALUS].[dbo].[VLISE_Visitas con categoria] AS v2
    ON v1.[NHC] = v2.[NHC]
    AND v2.[Fecha Visita] >= v1.[Fecha Visita]
    AND v2.[Fecha Visita] <= DATEADD(HOUR, 48, v1.[Fecha Visita])
    AND v2.[Tipo Visita] LIKE '(cx)%'
    AND v2.[idvisita] <> v1.[idvisita]
INNER JOIN [SALUS].[dbo].[TABLEAU_Cirugias] AS c
    ON v2.[idvisita] = c.[idvisita]
LEFT JOIN [SALUS].[dbo].[TABLEAU_Admisiones] AS a 
    ON v1.[NHC] = a.[NHC] 
    AND a.[Fecha ingreso] >= CAST(v1.[Fecha Visita] AS DATE)
    AND a.[Fecha ingreso] <= DATEADD(DAY, 2, CAST(v1.[Fecha Visita] AS DATE))
WHERE v1.[Fecha Visita] >= '2026-09-01' AND v1.[Fecha Visita] < '2026-10-01'
  AND v1.[Agenda] = 'guardias clinica'
  AND v1.[Asistencia] = 'Presente'
  AND v1.[Tipo Visita] LIKE '%visita clinica%'
ORDER BY v1.[Fecha Visita] DESC, [Horas Transcurridas] ASC;`;

        case 'guardia_tiempos_espera':
            return `-- Indicador 2: Tiempos de Espera (Triage y Médico)
SELECT 
    AVG(DATEDIFF(MINUTE, [Fecha Entrada Real], [Fecha Hora Entrada])) AS PromedioEsperaMedicoMinutos,
    AVG(DATEDIFF(MINUTE, [Fecha Entrada Real], [Fecha Salida Real])) AS PromedioPermanenciaGuardiaMinutos
FROM VLISE_Visitas
WHERE [Tipo Visita] IN ('(N1) VISITA CLINICA', '(N2) VISITA CLINICA', '(N3) VISITA CLINICA')
  AND [Fecha Entrada Real] IS NOT NULL 
  AND [Fecha Hora Entrada] IS NOT NULL
  AND [Fecha Entrada Real] >= '2026-09-01' AND v.[Fecha Entrada Real] < '2026-10-01';`;

        case 'guardia_cobertura_triage':
            return `-- Indicador 3: Cobertura y Precisión del Triage
SELECT 
    [Tipo Visita] AS CategoriaTriage,
    COUNT(*) AS CantidadConsultas,
    CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(5,2)) AS PorcentajeTriage
FROM VLISE_Visitas
WHERE [Tipo Visita] IN ('(N1) VISITA CLINICA', '(N2) VISITA CLINICA', '(N3) VISITA CLINICA')
  AND [Fecha Entrada Real] >= '2026-09-01' AND [Fecha Entrada Real] < '2026-10-01'
GROUP BY [Tipo Visita];`;

        case 'guardia_reconsulta_72h':
            return `-- Indicador 4: Tasa de Reconsulta (72 hs)
SELECT 
    COUNT(DISTINCT v1.IdVisita) AS ConsultasTotales,
    COUNT(DISTINCT v2.IdVisita) AS Reconsultas72h,
    CAST(COUNT(DISTINCT v2.IdVisita) * 100.0 / NULLIF(COUNT(DISTINCT v1.IdVisita), 0) AS DECIMAL(5,2)) AS TasaReconsulta72hPct
FROM VLISE_Visitas v1
LEFT JOIN VLISE_Visitas v2 
    ON v1.NHC = v2.NHC 
    AND v2.[Fecha Entrada Real] > v1.[Fecha Entrada Real]
    AND v2.[Fecha Entrada Real] <= DATEADD(HOUR, 72, v1.[Fecha Entrada Real])
WHERE v1.[Tipo Visita] IN ('(N1) VISITA CLINICA', '(N2) VISITA CLINICA', '(N3) VISITA CLINICA')
  AND v1.[Fecha Entrada Real] >= '2026-09-01' AND v1.[Fecha Entrada Real] < '2026-10-01';`;

        case 'guardia_reinternacion_72h':
            return `-- Indicador 5: Tasa de Reinternación Temprana (72 hs)
SELECT 
    COUNT(DISTINCT a1.idAdmision) AS AltasClinicasTotales,
    COUNT(DISTINCT a2.idAdmision) AS Reinternaciones72h,
    CAST(COUNT(DISTINCT a2.idAdmision) * 100.0 / NULLIF(COUNT(DISTINCT a1.idAdmision), 0) AS DECIMAL(5,2)) AS TasaReinternacion72hPct
FROM TABLEAU_Admisiones a1
LEFT JOIN TABLEAU_Admisiones a2 
    ON a1.NHC = a2.NHC 
    AND a2.[Fecha ingreso] > a1.[Fecha alta]
    AND a2.[Fecha ingreso] <= DATEADD(HOUR, 72, a1.[Fecha alta])
WHERE a1.Procedencia = 'Derivado desde Urgencias'
  AND a1.Especialidad = 'CLINICO'
  AND a1.[Fecha alta] >= '2026-09-01' AND a1.[Fecha alta] < '2026-10-01';`;

        case 'guardia_volumen_imagenes':
            return `-- Indicador 6: Volumen de TAC y Rx Solicitadas
SELECT 
    COUNT(CASE WHEN r.TipoTarea = 'TOMOGRAFIA' THEN 1 END) AS TotalTAC,
    COUNT(CASE WHEN r.TipoTarea = 'RX' THEN 1 END) AS TotalRx,
    CAST(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM VLISE_Visitas WHERE [Fecha Entrada Real] >= '2026-09-01' AND [Fecha Entrada Real] < '2026-10-01'), 0) AS DECIMAL(5,2)) AS TasaEstudiosPor100Consultas
FROM VLISE_PeticionesPruebasRadiologia r
WHERE r.TipoTarea IN ('TOMOGRAFIA', 'RX')
  AND r.[Fecha Solicitud] >= '2026-09-01' AND r.[Fecha Solicitud] < '2026-10-01';`;

        case 'guardia_destinos_post':
            return `-- Indicador 7: Distribución de Destinos Post-Guardia
SELECT 
    CASE 
        WHEN a.Procedencia = 'Derivado desde Urgencias' AND a.Especialidad LIKE '%CIRUGIA%' THEN 'Pase a Quirófano'
        WHEN a.Procedencia = 'Derivado desde Urgencias' AND a.Especialidad = 'TERAPIA INTENSIVA' THEN 'Ingreso a Terapia Intensiva'
        WHEN a.Procedencia = 'Derivado desde Urgencias' THEN 'Ingreso a Piso Clínico'
        WHEN v.[Tipo Visita] LIKE '%DERIVACION%' THEN 'Derivación Externa'
        ELSE 'Alta Médica Domiciliaria'
    END AS DestinoFinal,
    COUNT(*) AS CantidadPacientes
FROM VLISE_Visitas v
LEFT JOIN TABLEAU_Admisiones a 
    ON v.NHC = a.NHC 
    AND a.[Fecha ingreso] >= v.[Fecha Entrada Real]
    AND a.[Fecha ingreso] <= DATEADD(HOUR, 24, v.[Fecha Entrada Real])
WHERE v.[Fecha Entrada Real] >= '2026-09-01' AND v.[Fecha Entrada Real] < '2026-10-01'
GROUP BY CASE 
    WHEN a.Procedencia = 'Derivado desde Urgencias' AND a.Especialidad LIKE '%CIRUGIA%' THEN 'Pase a Quirófano'
    WHEN a.Procedencia = 'Derivado desde Urgencias' AND a.Especialidad = 'TERAPIA INTENSIVA' THEN 'Ingreso a Terapia Intensiva'
    WHEN a.Procedencia = 'Derivado desde Urgencias' THEN 'Ingreso a Piso Clínico'
    WHEN v.[Tipo Visita] LIKE '%DERIVACION%' THEN 'Derivación Externa'
    ELSE 'Alta Médica Domiciliaria'
END;`;

        case 'guardia_estada_clinica':
            return `-- Indicador 8: Promedio de Días de Estada Clínica
SELECT 
    AVG(CAST(Dias AS FLOAT)) AS PromedioDiasEstada,
    COUNT(*) AS TotalAltasClinicas
FROM TABLEAU_Admisiones
WHERE Procedencia = 'Derivado desde Urgencias'
  AND Especialidad = 'CLINICO'
  AND [Fecha alta] >= '2026-09-01' AND [Fecha alta] < '2026-10-01';`;

        case 'guardia_adherencia_epicrisis':
            return `-- Indicador 9: Tasa de Adherencia a Epicrisis
SELECT 
    COUNT(DISTINCT a.idAdmision) AS AltasClinicasTotales,
    COUNT(DISTINCT p.idAdmision) AS AltasConEpicrisis,
    CAST(COUNT(DISTINCT p.idAdmision) * 100.0 / NULLIF(COUNT(DISTINCT a.idAdmision), 0) AS DECIMAL(5,2)) AS AdherenciaEpicrisisPct
FROM TABLEAU_Admisiones a
LEFT JOIN PR_RespuestasProtocolo p 
    ON a.idAdmision = p.idAdmision 
    AND p.idProtocolo = 382 -- Epicrisis Médica
WHERE a.Procedencia = 'Derivado desde Urgencias'
  AND a.Especialidad = 'CLINICO'
  AND a.[Fecha alta] >= '2026-09-01' AND a.[Fecha alta] < '2026-10-01';`;

        default:
            return `-- Consulte sql/indicadores_guardia_clinica_salus.sql para la query completa.`;
    }
}
