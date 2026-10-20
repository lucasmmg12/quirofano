import React, { useState, useEffect, useMemo } from 'react';
import { 
    Award, TrendingUp, Users, Calendar, CheckCircle2, AlertCircle, 
    ArrowUpRight, ArrowDownRight, Printer, RefreshCw, HelpCircle, FileText, ChevronDown, 
    ChevronUp, Shield, Sliders, DollarSign, MessageSquare, PhoneCall,
    ChevronLeft, ChevronRight, Cloud, Save, BarChart3, Activity, Target, Zap
} from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Legend,
    ReferenceLine,
    Cell
} from 'recharts';
import { 
    BASE_GARANTIZADA_HISTORICA,
    MAX_VARIABLE_TOTAL,
    TECHO_MAXIMO_TOTAL,
    INCENTIVO_CONFIG,
    getEscalonesInfo,
    fetchMetricasIncentivosSalus,
    fetchMensajesContactCenterMes,
    calcularLiquidacionCompleta,
    guardarConversacionesAuditadasMes,
    fetchHistoricoComparativoIncentivos
} from '../../services/incentivoContactCenterService';

export default function ContactCenterIncentivosTab({ activeAgent, currentUser, addToast }) {
    const [periodo, setPeriodo] = useState('2026-09');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [datosSalus, setDatosSalus] = useState(null);
    const [dataSource, setDataSource] = useState(null);
    const [lastSyncDate, setLastSyncDate] = useState(null);
    const [mensajesManuales, setMensajesManuales] = useState('');
    const [ajustesFte, setAjustesFte] = useState({});
    const [savingConvs, setSavingConvs] = useState(false);
    const [showEscalonesModal, setShowEscalonesModal] = useState(false);
    const [showReporteModal, setShowReporteModal] = useState(false);
    const [activeEscalonTab, setActiveEscalonTab] = useState('mensajes');
    const [activeViewTab, setActiveViewTab] = useState('liquidacion'); // 'liquidacion' | 'bolsas' | 'comparativa'
    const [octubreModoProyeccion, setOctubreModoProyeccion] = useState(false);

    // Estados para gráficos de performance de agentes y comparativa mes a mes
    const [historicoData, setHistoricoData] = useState(null);
    const [loadingHistorico, setLoadingHistorico] = useState(false);
    const [metricChartType, setMetricChartType] = useState('asistencia'); // 'asistencia' | 'turnos' | 'mensajes' | 'variable' | 'evolucion'

    // Navegación mes a mes
    const navegarMes = (direccion) => {
        const [yStr, mStr] = periodo.split('-');
        let y = parseInt(yStr, 10);
        let m = parseInt(mStr, 10) + direccion;
        if (m < 1) { m = 12; y--; }
        if (m > 12) { m = 1; y++; }
        const nuevoPeriodo = `${y}-${String(m).padStart(2, '0')}`;
        setPeriodo(nuevoPeriodo);
    };

    // Guardar conversaciones únicas auditadas para el mes
    const handleGuardarConversaciones = async () => {
        setSavingConvs(true);
        try {
            await guardarConversacionesAuditadasMes(periodo, mensajesManuales);
            if (addToast) addToast(`Conversaciones únicas de ${periodo} guardadas exitosamente`, 'success');
        } catch (err) {
            if (addToast) addToast(`Error al guardar conversaciones: ${err.message}`, 'error');
        } finally {
            setSavingConvs(false);
        }
    };

    // Cargar datos del período seleccionado
    const cargarPeriodo = async (p = periodo, isForce = false) => {
        setLoading(true);
        setError(null);
        try {
            const [salusRes, msgsSb] = await Promise.all([
                fetchMetricasIncentivosSalus(p, { forceRefresh: isForce }),
                fetchMensajesContactCenterMes(p)
            ]);
            const rawData = salusRes.data || salusRes;
            setDatosSalus(rawData);
            setDataSource(salusRes.source || 'cloud');
            setLastSyncDate(salusRes.updatedAt || new Date().toISOString());

            // Priorizar valor de conversaciones únicas auditadas o conteo real de CRM
            let defaultMsgs = rawData.conversacionesUnicas;
            if (p === '2026-08') {
                defaultMsgs = rawData.conversacionesUnicas || 7820;
            } else if (p === '2026-09') {
                defaultMsgs = rawData.conversacionesUnicas || 8587;
            } else {
                // Período actual o en curso: priorizar conteo real de conversaciones únicas
                if (msgsSb && msgsSb > 0) {
                    defaultMsgs = msgsSb;
                } else if (!defaultMsgs || defaultMsgs === 2772) {
                    defaultMsgs = rawData.conversacionesUnicas || 5677;
                }
            }
            setMensajesManuales(String(defaultMsgs));

            // Inicializar ajustes de FTE para casos específicos de altas/bajas
            if (p === '2026-08') {
                setAjustesFte({
                    eleal: 0.5, // Érica ingreso a mediados de agosto
                    macosta: 1.0,
                    solivier: 1.0,
                    vjacques: 1.0,
                    daguilera: 1.0
                });
            } else if (p === '2026-09') {
                setAjustesFte({
                    eleal: 0.5, // Curva 50%
                    macosta: 0.15, // Baja a principios de septiembre (días trabajados)
                    solivier: 1.0,
                    vjacques: 1.0,
                    daguilera: 1.0
                });
            } else if (p === '2026-10') {
                setAjustesFte({
                    eleal: 0.5, // Curva 50%
                    solivier: 1.0,
                    vjacques: 1.0,
                    daguilera: 1.0
                });
            } else {
                setAjustesFte({
                    eleal: 0.5,
                    solivier: 1.0,
                    vjacques: 1.0,
                    daguilera: 1.0
                });
            }
        } catch (err) {
            console.error('Error cargando métricas de incentivos:', err);
            setError(err.message || 'No se pudieron recuperar las métricas desde SALUS.');
            if (addToast) addToast(err.message || 'Error cargando datos de incentivos', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargarPeriodo(periodo, false);
    }, [periodo]);

    // Fechas dinámicas para el período seleccionado y mes en curso
    const now = new Date();
    const currentMonthIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const isCurrentMonth = periodo === currentMonthIso;
    const currentDay = isCurrentMonth ? now.getDate() : 0;
    const [pYear, pMonth] = (periodo || currentMonthIso).split('-').map(Number);
    const totalDaysInMonth = new Date(pYear, pMonth, 0).getDate();
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const periodMonthName = monthNames[pMonth - 1] || 'Octubre';

    // Cargar datos históricos comparativos mes a mes para los gráficos de performance
    useEffect(() => {
        let isMounted = true;
        setLoadingHistorico(true);
        fetchHistoricoComparativoIncentivos(periodo).then(res => {
            if (isMounted && res.success) {
                setHistoricoData(res);
            }
        }).catch(err => {
            console.error('Error cargando histórico comparativo de incentivos:', err);
        }).finally(() => {
            if (isMounted) setLoadingHistorico(false);
        });
        return () => { isMounted = false; };
    }, [periodo]);

    // Factor de proyección para el mes en curso
    const factorProyeccion = (isCurrentMonth && currentDay > 0) ? (totalDaysInMonth / currentDay) : 1;

    // 1. Liquidación Real Acumulada a la fecha
    const liquidacionReal = useMemo(() => {
        return calcularLiquidacionCompleta({
            periodo,
            mensajesTotales: Number(mensajesManuales) || 0,
            datosSalus,
            ajustesFte
        });
    }, [periodo, mensajesManuales, datosSalus, ajustesFte]);

    // 2. Liquidación Proyectada (Tendencia a Fin de Mes)
    const liquidacionProyectada = useMemo(() => {
        if (!isCurrentMonth || !datosSalus) return liquidacionReal;
        const msgsProy = datosSalus.proyeccionConvs || Math.round((Number(mensajesManuales) || 0) * factorProyeccion);
        const turnosProy = datosSalus.proyeccionTurnos || Math.round((datosSalus.turnosGrupales?.total || 0) * factorProyeccion);
        const datosProy = {
            ...datosSalus,
            turnosGrupales: {
                ...datosSalus.turnosGrupales,
                total: turnosProy
            },
            agentes: (datosSalus.agentes || []).map(ag => ({
                ...ag,
                turnos: Math.round((ag.turnos || 0) * factorProyeccion)
            }))
        };
        return calcularLiquidacionCompleta({
            periodo,
            mensajesTotales: msgsProy,
            datosSalus: datosProy,
            ajustesFte
        });
    }, [periodo, mensajesManuales, datosSalus, ajustesFte, isCurrentMonth, factorProyeccion, liquidacionReal]);

    // Cálculo activo para compatibilidad con el resto del tablero
    const liquidacion = useMemo(() => {
        return octubreModoProyeccion ? liquidacionProyectada : liquidacionReal;
    }, [octubreModoProyeccion, liquidacionProyectada, liquidacionReal]);

    // Modo de visualización en la tabla de liquidación: 'comparativa' | 'real' | 'tendencia'
    const [modoVistaTabla, setModoVistaTabla] = useState('comparativa');

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            maximumFractionDigits: 0
        }).format(val || 0);
    };

    const handleFteChange = (agenteId, newFte) => {
        setAjustesFte(prev => ({
            ...prev,
            [agenteId]: parseFloat(newFte)
        }));
    };

    // Métricas para cálculo por agente (100% FTE)
    const metricasAgentes = useMemo(() => {
        if (!liquidacion?.agentes?.length) {
            const basePleno = BASE_GARANTIZADA_HISTORICA;
            const varPleno = (liquidacion?.bolsaMensajes?.montoPorFte || 0) + (liquidacion?.bolsaTurnos?.montoPorFte || 0);
            return {
                promedioPleno: basePleno + varPleno,
                minPleno: basePleno + varPleno,
                maxPleno: basePleno + varPleno,
                totalVariablePleno: varPleno,
                hayRango: false
            };
        }
        const plenos = liquidacion.agentes.filter(a => a.fte === 1.0);
        const lista = plenos.length > 0 ? plenos : liquidacion.agentes;
        const valores = lista.map(a => a.totalALiquidar);
        const minVal = Math.min(...valores);
        const maxVal = Math.max(...valores);
        const prom = valores.reduce((acc, v) => acc + v, 0) / valores.length;
        const promVar = lista.reduce((acc, a) => acc + a.totalVariable, 0) / lista.length;

        return {
            promedioPleno: prom,
            minPleno: minVal,
            maxPleno: maxVal,
            totalVariablePleno: promVar,
            hayRango: Math.abs(maxVal - minVal) > 100
        };
    }, [liquidacion]);

    return (
        <div style={{ padding: '4px 0 20px 0', maxWidth: '1400px', margin: '0 auto' }}>
            
            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 1. ENCABEZADO Y SELECTOR DE PERÍODO                              */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '20px 24px',
                marginBottom: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #003B71 0%, #0284C7 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        boxShadow: '0 4px 10px rgba(2, 132, 199, 0.25)'
                    }}>
                        <Award size={24} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F2942' }}>
                                Esquema de Incentivos y Productividad
                            </h2>
                            <span style={{
                                background: '#ECFDF5',
                                color: '#059669',
                                border: '1px solid #A7F3D0',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '0.70rem',
                                fontWeight: 800
                            }}>
                                Modelo Oficial v13
                            </span>
                        </div>
                    </div>
                </div>

                {/* Controles de Período y Acciones Mes a Mes */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Navegador Mes a Mes */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: '#F8FAFC',
                        border: '1px solid #CBD5E1',
                        borderRadius: '10px',
                        padding: '2px 4px'
                    }}>
                        <button
                            onClick={() => navegarMes(-1)}
                            title="Mes anterior"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px 6px',
                                display: 'flex',
                                alignItems: 'center',
                                color: '#475569',
                                borderRadius: '6px'
                            }}
                        >
                            <ChevronLeft size={16} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0 6px' }}>
                            <Calendar size={14} color="#003B71" />
                            <select
                                value={periodo}
                                onChange={(e) => setPeriodo(e.target.value)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    fontWeight: 800,
                                    fontSize: '0.82rem',
                                    color: '#003B71',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="2026-07">Julio 2026 (Histórico)</option>
                                <option value="2026-08">Agosto 2026 (Liquidación 1 - Curva Érica)</option>
                                <option value="2026-09">Septiembre 2026 (Liquidación 2 - Cese Antonella)</option>
                                <option value="2026-10">Octubre 2026 (Mes en Curso)</option>
                                <option value="2026-11">Noviembre 2026 (Proyección)</option>
                                <option value="2026-12">Diciembre 2026</option>
                            </select>
                        </div>

                        <button
                            onClick={() => navegarMes(1)}
                            title="Mes siguiente"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px 6px',
                                display: 'flex',
                                alignItems: 'center',
                                color: '#475569',
                                borderRadius: '6px'
                            }}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>



                    <button
                        type="button"
                        onClick={() => cargarPeriodo(periodo, true)}
                        disabled={loading}
                        title="Sincronizar y actualizar métricas de SALUS y WhatsApp en tiempo real"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: '#F8FAFC', border: '1px solid #CBD5E1',
                            padding: '8px 12px', borderRadius: '10px',
                            fontSize: '0.76rem', fontWeight: 700, color: '#003B71',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.7 : 1,
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} color="#003B71" />
                        Actualizar SALUS
                    </button>

                    <button
                        onClick={() => setShowEscalonesModal(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: '#F1F5F9', border: '1px solid #CBD5E1',
                            padding: '8px 12px', borderRadius: '10px',
                            fontSize: '0.76rem', fontWeight: 700, color: '#334155',
                            cursor: 'pointer'
                        }}
                    >
                        <HelpCircle size={14} color="#64748B" />
                        Tabla de Escalones
                    </button>

                    <button
                        onClick={() => setShowReporteModal(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: '#003B71', border: 'none',
                            color: '#FFFFFF', padding: '8px 16px', borderRadius: '10px',
                            fontSize: '0.76rem', fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(0, 59, 113, 0.25)'
                        }}
                    >
                        <Printer size={14} />
                        Reporte Formal RRHH
                    </button>
                </div>
            </div>

            {/* Alerta de Carga / Error */}
            {loading && (
                <div style={{ padding: '16px', borderRadius: '12px', background: '#F0F9FF', border: '1px solid #BAE6FD', color: '#0369A1', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem' }}>
                    <RefreshCw size={16} className="animate-spin" />
                    Consultando registros en tiempo real en SQL Server SALUS y CRM de WhatsApp...
                </div>
            )}

            {error && (
                <div style={{ padding: '16px', borderRadius: '12px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem' }}>
                    <AlertCircle size={18} />
                    {error}
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* SUB-NAVEGACIÓN LIMPIA Y ORGANIZADA (ADN QOAG)                    */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #CBD5E1',
                padding: '5px 8px',
                marginBottom: '18px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                flexWrap: 'wrap',
                gap: '8px'
            }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setActiveViewTab('liquidacion')}
                        style={{
                            padding: '8px 16px', borderRadius: '10px', border: 'none',
                            background: activeViewTab === 'liquidacion' ? '#003B71' : 'transparent',
                            color: activeViewTab === 'liquidacion' ? '#FFFFFF' : '#475569',
                            fontWeight: 800, fontSize: '0.80rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            boxShadow: activeViewTab === 'liquidacion' ? '0 2px 5px rgba(0, 59, 113, 0.25)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <FileText size={15} />
                        Liquidación Oficial & Haberes
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveViewTab('bolsas')}
                        style={{
                            padding: '8px 16px', borderRadius: '10px', border: 'none',
                            background: activeViewTab === 'bolsas' ? '#003B71' : 'transparent',
                            color: activeViewTab === 'bolsas' ? '#FFFFFF' : '#475569',
                            fontWeight: 800, fontSize: '0.80rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            boxShadow: activeViewTab === 'bolsas' ? '0 2px 5px rgba(0, 59, 113, 0.25)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Target size={15} />
                        Regla de las 3 Bolsas (50 / 25 / 25)
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveViewTab('comparativa')}
                        style={{
                            padding: '8px 16px', borderRadius: '10px', border: 'none',
                            background: activeViewTab === 'comparativa' ? '#003B71' : 'transparent',
                            color: activeViewTab === 'comparativa' ? '#FFFFFF' : '#475569',
                            fontWeight: 800, fontSize: '0.80rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            boxShadow: activeViewTab === 'comparativa' ? '0 2px 5px rgba(0, 59, 113, 0.25)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <BarChart3 size={15} />
                        Gráficos & Comparativa Mes a Mes
                    </button>
                </div>

                {isCurrentMonth ? (
                    <span style={{
                        fontSize: '0.72rem', fontWeight: 800,
                        background: '#FEF3C7', color: '#B45309',
                        padding: '4px 12px', borderRadius: '20px',
                        display: 'flex', alignItems: 'center', gap: '6px',
                        border: '1px solid #FDE68A'
                    }}>
                        <Activity size={13} color="#D97706" />
                        Mes en Curso • Día {currentDay} de {totalDaysInMonth}
                    </span>
                ) : (
                    <span style={{
                        fontSize: '0.72rem', fontWeight: 800,
                        background: '#F0FDF4', color: '#15803D',
                        padding: '4px 12px', borderRadius: '20px',
                        display: 'flex', alignItems: 'center', gap: '6px',
                        border: '1px solid #BBF7D0'
                    }}>
                        <CheckCircle2 size={13} color="#16A34A" />
                        Período Cerrado & Auditado
                    </span>
                )}
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* SUB-TAB 1: LIQUIDACIÓN OFICIAL & HABERES                         */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {activeViewTab === 'liquidacion' && (
                <div>
                    {/* Banner de Mes en Curso: Toggle Real vs Proyección */}
                    {isCurrentMonth && (
                        <div style={{
                            background: 'linear-gradient(135deg, #FEF3C7 0%, #FFFBEB 100%)',
                            border: '1px solid #FDE68A',
                            borderRadius: '14px',
                            padding: '12px 18px',
                            marginBottom: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    background: '#F59E0B', color: '#FFFFFF',
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 2px 4px rgba(245,158,11,0.2)'
                                }}>
                                    <Activity size={18} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#92400E' }}>
                                        {periodMonthName} {pYear} está en curso (Día {currentDay} de {totalDaysInMonth})
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#B45309' }}>
                                        {octubreModoProyeccion 
                                            ? 'Mostrando liquidación estimada proyectada a fin de mes manteniendo el ritmo actual.'
                                            : `Mostrando producción real auditada acumulada al ${currentDay} de ${periodMonthName} (${Number(mensajesManuales || 0).toLocaleString('es-AR')} convs • ${Number(datosSalus?.turnosGrupales?.total || 0).toLocaleString('es-AR')} turnos).`}
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                display: 'flex', background: '#FFFFFF', borderRadius: '10px',
                                border: '1px solid #FCD34D', padding: '3px'
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setOctubreModoProyeccion(false)}
                                    style={{
                                        padding: '6px 12px', borderRadius: '8px', border: 'none',
                                        background: !octubreModoProyeccion ? '#D97706' : 'transparent',
                                        color: !octubreModoProyeccion ? '#FFFFFF' : '#78350F',
                                        fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    📍 Real Acumulado al Día (Día {currentDay})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOctubreModoProyeccion(true)}
                                    style={{
                                        padding: '6px 12px', borderRadius: '8px', border: 'none',
                                        background: octubreModoProyeccion ? '#D97706' : 'transparent',
                                        color: octubreModoProyeccion ? '#FFFFFF' : '#78350F',
                                        fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    📈 Proyección a Fin de Mes
                                </button>
                            </div>
                        </div>
                    )}

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 2.B TABLERO DESTACADO: OBJETIVO 🎯 / REAL 📍 / TENDENCIA 📈        */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '20px 22px',
                marginBottom: '18px',
                boxShadow: '0 2px 8px rgba(0, 59, 113, 0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: 'linear-gradient(135deg, #003B71 0%, #0284C7 100%)',
                            color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Target size={18} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.96rem', fontWeight: 900, color: '#0F2942', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Tablero de Cumplimiento: Objetivo / Real / Tendencia a Fin de Mes
                                <span style={{
                                    fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '12px',
                                    background: isCurrentMonth ? '#FEF3C7' : '#F1F5F9',
                                    color: isCurrentMonth ? '#B45309' : '#475569',
                                    border: isCurrentMonth ? '1px solid #FDE68A' : '1px solid #CBD5E1'
                                }}>
                                    {isCurrentMonth ? `Día ${currentDay} de ${totalDaysInMonth} (${periodMonthName})` : periodMonthName}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                Monitoreo tridimensional de metas oficiales, producción acumulada y proyección al cierre de jornada.
                            </div>
                        </div>
                    </div>

                    {/* Leyenda Visual de los 3 Estados */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F8FAFC', padding: '6px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.70rem', fontWeight: 800, color: '#0284C7' }}>
                            <Target size={13} color="#0284C7" />
                            <span>🎯 OBJETIVO (Meta)</span>
                        </div>
                        <span style={{ color: '#CBD5E1' }}>|</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.70rem', fontWeight: 800, color: '#475569' }}>
                            <Activity size={13} color="#475569" />
                            <span>📍 REAL AL DÍA</span>
                        </div>
                        <span style={{ color: '#CBD5E1' }}>|</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.70rem', fontWeight: 800, color: '#059669' }}>
                            <TrendingUp size={13} color="#059669" />
                            <span>📈 TENDENCIA FIN DE MES</span>
                        </div>
                    </div>
                </div>

                {/* 4 Tarjetas de Alto Impacto con la Triple Métrica */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '12px'
                }}>
                    {/* Tarjeta 1: Bolsa 1 Mensajes (50%) */}
                    <div style={{
                        background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0',
                        padding: '14px 16px', position: 'relative'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0369A1', textTransform: 'uppercase' }}>
                                Bolsa 1: Conv. Únicas (50%)
                            </span>
                            <MessageSquare size={15} color="#0284C7" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                                <span style={{ color: '#64748B' }}>🎯 Objetivo Meta:</span>
                                <strong style={{ color: '#0F2942' }}>7.500 convs <span style={{ color: '#64748B', fontWeight: 500 }}>(Tope 8.500)</span></strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                                <span style={{ color: '#64748B' }}>📍 Real al Día ({currentDay}):</span>
                                <strong style={{ color: '#0284C7' }}>{Number(mensajesManuales || 0).toLocaleString('es-AR')} convs</strong>
                            </div>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '6px 8px', borderRadius: '8px', background: '#ECFDF5', border: '1px solid #A7F3D0',
                                marginTop: '4px'
                            }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#065F46' }}>📈 Tendencia Fin de Mes:</span>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#059669' }}>
                                        {liquidacionProyectada.bolsaMensajes.total.toLocaleString('es-AR')} convs
                                    </div>
                                    <div style={{ fontSize: '0.64rem', color: '#047857', fontWeight: 800 }}>
                                        Escalón {liquidacionProyectada.bolsaMensajes.escalon}/10 • +{formatCurrency(liquidacionProyectada.bolsaMensajes.montoPorFte)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tarjeta 2: Bolsa 2 Turnos (25%) */}
                    <div style={{
                        background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0',
                        padding: '14px 16px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase' }}>
                                Bolsa 2: Turnos Otorgados (25%)
                            </span>
                            <PhoneCall size={15} color="#7C3AED" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                                <span style={{ color: '#64748B' }}>🎯 Objetivo Meta:</span>
                                <strong style={{ color: '#0F2942' }}>3.687 turnos <span style={{ color: '#64748B', fontWeight: 500 }}>(Piso 3.052)</span></strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                                <span style={{ color: '#64748B' }}>📍 Real al Día ({currentDay}):</span>
                                <strong style={{ color: '#7C3AED' }}>{Number(datosSalus?.turnosGrupales?.total || 0).toLocaleString('es-AR')} turnos</strong>
                            </div>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '6px 8px', borderRadius: '8px',
                                background: liquidacionProyectada.bolsaTurnos.total >= 3052 ? '#ECFDF5' : '#FFFBEB',
                                border: liquidacionProyectada.bolsaTurnos.total >= 3052 ? '1px solid #A7F3D0' : '1px solid #FCD34D',
                                marginTop: '4px'
                            }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: liquidacionProyectada.bolsaTurnos.total >= 3052 ? '#065F46' : '#92400E' }}>
                                    📈 Tendencia Fin de Mes:
                                </span>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 900, color: liquidacionProyectada.bolsaTurnos.total >= 3052 ? '#059669' : '#D97706' }}>
                                        {liquidacionProyectada.bolsaTurnos.total.toLocaleString('es-AR')} turnos
                                    </div>
                                    <div style={{ fontSize: '0.64rem', color: liquidacionProyectada.bolsaTurnos.total >= 3052 ? '#047857' : '#B45309', fontWeight: 800 }}>
                                        {liquidacionProyectada.bolsaTurnos.total >= 3052 
                                            ? `Escalón ${liquidacionProyectada.bolsaTurnos.escalon}/10 • +${formatCurrency(liquidacionProyectada.bolsaTurnos.montoPorFte)}`
                                            : `Faltan ${(3052 - liquidacionProyectada.bolsaTurnos.total).toLocaleString('es-AR')} para piso`}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tarjeta 3: Bolsa 3 Asistencia (25%) */}
                    <div style={{
                        background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0',
                        padding: '14px 16px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase' }}>
                                Bolsa 3: Asistencia (25%)
                            </span>
                            <CheckCircle2 size={15} color="#059669" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                                <span style={{ color: '#64748B' }}>🎯 Objetivo Meta:</span>
                                <strong style={{ color: '#0F2942' }}>55.0% <span style={{ color: '#64748B', fontWeight: 500 }}>(Piso 50.0%)</span></strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                                <span style={{ color: '#64748B' }}>📍 Real Promedio Equipo:</span>
                                <strong style={{ color: '#059669' }}>
                                    {(liquidacionReal.agentes.reduce((s, a) => s + (a.asistenciaPct || 0), 0) / Math.max(1, liquidacionReal.agentes.length)).toFixed(1)}%
                                </strong>
                            </div>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '6px 8px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #CBD5E1',
                                marginTop: '4px'
                            }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569' }}>📈 Estado Asistencia:</span>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F2942' }}>
                                        Evaluación individual
                                    </div>
                                    <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 600 }}>
                                        Paga a partir del 50.0%
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tarjeta 4: Total por Asesora 100% FTE */}
                    <div style={{
                        background: 'linear-gradient(135deg, #003B71 0%, #0F2942 100%)',
                        borderRadius: '12px', padding: '14px 16px', color: '#FFFFFF'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#93C5FD', textTransform: 'uppercase' }}>
                                Liquidación / Asesora (100% FTE)
                            </span>
                            <DollarSign size={15} color="#67E8F9" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                                <span style={{ color: '#BAE6FD' }}>🎯 Objetivo Techo (100%):</span>
                                <strong style={{ color: '#FFFFFF' }}>$ 278.941</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                                <span style={{ color: '#BAE6FD' }}>📍 Real Devengado Hoy:</span>
                                <strong style={{ color: '#FDE047' }}>$ 139.471 <span style={{ color: '#93C5FD', fontWeight: 500 }}>(+$ 0 var)</span></strong>
                            </div>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '6px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                                marginTop: '4px'
                            }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#A7F3D0' }}>📈 Tendencia Fin de Mes:</span>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.94rem', fontWeight: 900, color: '#FFFFFF' }}>
                                        {formatCurrency(liquidacionProyectada.agentes.find(a => a.fte === 1.0)?.totalALiquidar || (BASE_GARANTIZADA_HISTORICA + liquidacionProyectada.bolsaMensajes.montoPorFte + liquidacionProyectada.bolsaTurnos.montoPorFte))}
                                    </div>
                                    <div style={{ fontSize: '0.64rem', color: '#67E8F9', fontWeight: 700 }}>
                                        +{formatCurrency(liquidacionProyectada.agentes.find(a => a.fte === 1.0)?.totalVariable || (liquidacionProyectada.bolsaMensajes.montoPorFte + liquidacionProyectada.bolsaTurnos.montoPorFte))} variable est.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* TABLA DE LIQUIDACIÓN NOMINAL POR COLABORADORA                   */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '22px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.10rem', fontWeight: 800, color: '#0F2942', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Desglose de Liquidación Individual por Colaboradora
                        </h3>
                        <p style={{ margin: '3px 0 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                            Comparativa transparente entre el Objetivo Oficial, el Real Acumulado al día y la Tendencia a Fin de Mes.
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Selector de Modo de Vista en la Tabla */}
                        <div style={{
                            display: 'flex', background: '#F1F5F9', borderRadius: '10px', padding: '3px',
                            border: '1px solid #E2E8F0'
                        }}>
                            <button
                                type="button"
                                onClick={() => setModoVistaTabla('comparativa')}
                                style={{
                                    padding: '5px 11px', borderRadius: '7px', border: 'none',
                                    background: modoVistaTabla === 'comparativa' ? '#003B71' : 'transparent',
                                    color: modoVistaTabla === 'comparativa' ? '#FFFFFF' : '#475569',
                                    fontWeight: 800, fontSize: '0.70rem', cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                📊 Comparativa (Objetivo / Real / Tendencia)
                            </button>
                            <button
                                type="button"
                                onClick={() => setModoVistaTabla('real')}
                                style={{
                                    padding: '5px 11px', borderRadius: '7px', border: 'none',
                                    background: modoVistaTabla === 'real' ? '#003B71' : 'transparent',
                                    color: modoVistaTabla === 'real' ? '#FFFFFF' : '#475569',
                                    fontWeight: 800, fontSize: '0.70rem', cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                📍 Solo Real Acumulado
                            </button>
                            <button
                                type="button"
                                onClick={() => setModoVistaTabla('tendencia')}
                                style={{
                                    padding: '5px 11px', borderRadius: '7px', border: 'none',
                                    background: modoVistaTabla === 'tendencia' ? '#003B71' : 'transparent',
                                    color: modoVistaTabla === 'tendencia' ? '#FFFFFF' : '#475569',
                                    fontWeight: 800, fontSize: '0.70rem', cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                📈 Solo Tendencia Fin de Mes
                            </button>
                        </div>

                        <span style={{ fontSize: '0.72rem', background: '#F8FAFC', border: '1px solid #CBD5E1', padding: '4px 10px', borderRadius: '8px', fontWeight: 700, color: '#475569' }}>
                            Dotación Evaluada: {liquidacionReal.agentes.filter(ag => !(periodo >= '2026-10' && ag.id === 'macosta') && !(ag.fte === 0 && (ag.estado === 'BAJA' || ag.id === 'macosta'))).length} operadoras
                        </span>
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                                <th style={{ padding: '10px 12px', fontWeight: 800 }}>Colaboradora</th>
                                <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>Piso Garantizado</th>
                                <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>+ Bolsa Msjs (50%)</th>
                                <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>+ Bolsa Turnos (25%)</th>
                                <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>Asistencia Individual</th>
                                <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>+ Bolsa Asoc. (25%)</th>
                                <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>Total Variable</th>
                                <th style={{ padding: '10px 12px', fontWeight: 900, textAlign: 'right', color: '#003B71' }}>Total a Liquidar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {liquidacionReal.agentes.filter(ag => !(periodo >= '2026-10' && ag.id === 'macosta') && !(ag.fte === 0 && (ag.estado === 'BAJA' || ag.id === 'macosta'))).map((agReal) => {
                                const agProy = liquidacionProyectada.agentes.find(a => a.id === agReal.id) || agReal;
                                const varObjetivoTecho = MAX_VARIABLE_TOTAL * agReal.fte;
                                const maxObjetivoTecho = agReal.baseGarantizadaLiquidada + varObjetivoTecho;

                                return (
                                    <tr key={agReal.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s ease' }}>
                                        <td style={{ padding: '12px', fontWeight: 700, color: '#0F2942' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{
                                                    width: '28px', height: '28px', borderRadius: '50%',
                                                    background: agReal.fte === 1.0 ? '#003B71' : '#475569', color: '#FFFFFF',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.68rem', fontWeight: 800
                                                }}>
                                                    {agReal.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span>{agReal.name}</span>
                                                        {agReal.fte < 1.0 && (
                                                            <span style={{
                                                                fontSize: '0.62rem', padding: '1px 6px', borderRadius: '4px',
                                                                background: '#FEF3C7', color: '#92400E', fontWeight: 700, border: '1px solid #FDE68A'
                                                            }}>
                                                                {Math.round(agReal.fte * 100)}% FTE
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.66rem', color: '#94A3B8' }}>{agReal.salusKey}</div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Piso Garantizado */}
                                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>
                                            {formatCurrency(agReal.baseGarantizadaLiquidada)}
                                        </td>

                                        {/* Bolsa Mensajes */}
                                        <td style={{ padding: '12px', textAlign: 'right' }}>
                                            {modoVistaTabla === 'real' && (
                                                <div>
                                                    <div style={{ fontWeight: 800, color: '#0284C7' }}>+{formatCurrency(agReal.montoMensajes)}</div>
                                                    <div style={{ fontSize: '0.64rem', color: '#64748B' }}>{agReal.mensajesIndividuales.toLocaleString()} msjs</div>
                                                </div>
                                            )}
                                            {modoVistaTabla === 'tendencia' && (
                                                <div>
                                                    <div style={{ fontWeight: 800, color: '#059669' }}>+{formatCurrency(agProy.montoMensajes)}</div>
                                                    <div style={{ fontSize: '0.64rem', color: '#059669', fontWeight: 700 }}>
                                                        📈 {Math.round(agReal.mensajesIndividuales * factorProyeccion).toLocaleString()} msjs est.
                                                    </div>
                                                </div>
                                            )}
                                            {modoVistaTabla === 'comparativa' && (
                                                <div>
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                        📍 Real: <strong style={{ color: '#0284C7' }}>+{formatCurrency(agReal.montoMensajes)}</strong> ({agReal.mensajesIndividuales.toLocaleString()} msjs)
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                                                        📈 Tendencia: +{formatCurrency(agProy.montoMensajes)}
                                                    </div>
                                                </div>
                                            )}
                                        </td>

                                        {/* Bolsa Turnos */}
                                        <td style={{ padding: '12px', textAlign: 'right' }}>
                                            {modoVistaTabla === 'real' && (
                                                <div>
                                                    <div style={{ fontWeight: 800, color: '#7C3AED' }}>+{formatCurrency(agReal.montoTurnos)}</div>
                                                    <div style={{ fontSize: '0.64rem', color: '#64748B' }}>{agReal.turnos || 0} turnos</div>
                                                </div>
                                            )}
                                            {modoVistaTabla === 'tendencia' && (
                                                <div>
                                                    <div style={{ fontWeight: 800, color: '#059669' }}>+{formatCurrency(agProy.montoTurnos)}</div>
                                                    <div style={{ fontSize: '0.64rem', color: '#059669', fontWeight: 700 }}>
                                                        📈 {Math.round((agReal.turnos || 0) * factorProyeccion)} turnos est.
                                                    </div>
                                                </div>
                                            )}
                                            {modoVistaTabla === 'comparativa' && (
                                                <div>
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                        📍 Real: <strong style={{ color: '#7C3AED' }}>+{formatCurrency(agReal.montoTurnos)}</strong> ({agReal.turnos || 0} turnos)
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: agProy.montoTurnos > 0 ? '#059669' : '#D97706', marginTop: '2px' }}>
                                                        📈 Tendencia: +{formatCurrency(agProy.montoTurnos)}
                                                    </div>
                                                </div>
                                            )}
                                        </td>

                                        {/* Asistencia Individual % */}
                                        <td style={{ padding: '12px', textAlign: 'right' }}>
                                            <div style={{ fontWeight: 800, color: agReal.asistenciaPct >= 55 ? '#059669' : agReal.asistenciaPct >= 50 ? '#D97706' : '#DC2626' }}>
                                                {agReal.asistenciaPct}%
                                            </div>
                                            <div style={{ fontSize: '0.64rem', color: '#94A3B8' }}>
                                                {agReal.asistidas} de {agReal.evaluables} citas
                                            </div>
                                            {modoVistaTabla === 'comparativa' && (
                                                <div style={{ fontSize: '0.62rem', color: '#0284C7', fontWeight: 700, marginTop: '1px' }}>
                                                    🎯 Meta: 55%
                                                </div>
                                            )}
                                        </td>

                                        {/* Bolsa Asistencia Individual $ */}
                                        <td style={{ padding: '12px', textAlign: 'right' }}>
                                            {modoVistaTabla === 'real' && (
                                                <div style={{ fontWeight: 800, color: '#059669' }}>+{formatCurrency(agReal.montoAsistencia)}</div>
                                            )}
                                            {modoVistaTabla === 'tendencia' && (
                                                <div style={{ fontWeight: 800, color: '#059669' }}>+{formatCurrency(agProy.montoAsistencia)}</div>
                                            )}
                                            {modoVistaTabla === 'comparativa' && (
                                                <div>
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                        📍 Real: <strong>+{formatCurrency(agReal.montoAsistencia)}</strong>
                                                    </div>
                                                    <div style={{ fontSize: '0.70rem', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                                                        📈 Proy: +{formatCurrency(agProy.montoAsistencia)}
                                                    </div>
                                                </div>
                                            )}
                                        </td>

                                        {/* Total Variable */}
                                        <td style={{ padding: '12px', textAlign: 'right' }}>
                                            {modoVistaTabla === 'real' && (
                                                <div style={{ fontWeight: 800, color: '#2563EB', fontSize: '0.85rem' }}>
                                                    +{formatCurrency(agReal.totalVariable)}
                                                </div>
                                            )}
                                            {modoVistaTabla === 'tendencia' && (
                                                <div style={{ fontWeight: 900, color: '#059669', fontSize: '0.85rem' }}>
                                                    +{formatCurrency(agProy.totalVariable)}
                                                </div>
                                            )}
                                            {modoVistaTabla === 'comparativa' && (
                                                <div>
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                        📍 Real: <strong style={{ color: '#2563EB' }}>+{formatCurrency(agReal.totalVariable)}</strong>
                                                    </div>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#059669', marginTop: '2px' }}>
                                                        📈 Proy: +{formatCurrency(agProy.totalVariable)}
                                                    </div>
                                                </div>
                                            )}
                                        </td>

                                        {/* TOTAL A LIQUIDAR (QUE SE NOTE BIEN) */}
                                        <td style={{ padding: '12px', textAlign: 'right' }}>
                                            {modoVistaTabla === 'real' && (
                                                <div style={{ fontWeight: 900, color: '#003B71', fontSize: '0.92rem' }}>
                                                    {formatCurrency(agReal.totalALiquidar)}
                                                </div>
                                            )}
                                            {modoVistaTabla === 'tendencia' && (
                                                <div style={{
                                                    background: '#ECFDF5', padding: '4px 8px', borderRadius: '8px',
                                                    border: '1px solid #A7F3D0', display: 'inline-block'
                                                }}>
                                                    <div style={{ fontWeight: 900, color: '#059669', fontSize: '0.92rem' }}>
                                                        {formatCurrency(agProy.totalALiquidar)}
                                                    </div>
                                                    <div style={{ fontSize: '0.62rem', color: '#065F46', fontWeight: 800 }}>
                                                        +{formatCurrency(agProy.totalVariable)} variable
                                                    </div>
                                                </div>
                                            )}
                                            {modoVistaTabla === 'comparativa' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                                                    {/* Real al día */}
                                                    <div style={{ fontSize: '0.70rem', color: '#475569' }}>
                                                        📍 Real hoy: <strong style={{ color: '#0F2942' }}>{formatCurrency(agReal.totalALiquidar)}</strong>
                                                    </div>
                                                    {/* Tendencia a fin de mes (Badge Destacado) */}
                                                    <div style={{
                                                        background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
                                                        padding: '4px 8px', borderRadius: '8px', border: '1px solid #A7F3D0',
                                                        textAlign: 'right'
                                                    }}>
                                                        <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#065F46' }}>
                                                            📈 {formatCurrency(agProy.totalALiquidar)}
                                                        </div>
                                                        <div style={{ fontSize: '0.62rem', color: '#047857', fontWeight: 800 }}>
                                                            Tendencia a Fin de Mes
                                                        </div>
                                                    </div>
                                                    {/* Objetivo Techo */}
                                                    <div style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: 600 }}>
                                                        🎯 Objetivo Techo: {formatCurrency(maxObjetivoTecho)}
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1', fontWeight: 800 }}>
                                <td style={{ padding: '12px', color: '#0F2942' }}>
                                    TOTALES CONSOLIDADOS DEL EQUIPO
                                </td>
                                <td style={{ padding: '12px', textAlign: 'right', color: '#475569' }}>
                                    {formatCurrency(liquidacionReal.totalesEquipo.baseTotal)}
                                </td>
                                <td colSpan="4" style={{ padding: '12px', textAlign: 'right', color: '#64748B' }}>
                                    {modoVistaTabla === 'comparativa' ? 'Productividad Variable (Real ➔ Proyectada):' : 'Productividad Variable:'}
                                </td>
                                <td style={{ padding: '12px', textAlign: 'right' }}>
                                    {modoVistaTabla === 'real' && (
                                        <span style={{ color: '#2563EB', fontWeight: 900, fontSize: '0.88rem' }}>
                                            +{formatCurrency(liquidacionReal.totalesEquipo.variableTotal)}
                                        </span>
                                    )}
                                    {modoVistaTabla === 'tendencia' && (
                                        <span style={{ color: '#059669', fontWeight: 900, fontSize: '0.88rem' }}>
                                            +{formatCurrency(liquidacionProyectada.totalesEquipo.variableTotal)}
                                        </span>
                                    )}
                                    {modoVistaTabla === 'comparativa' && (
                                        <div>
                                            <div style={{ fontSize: '0.70rem', color: '#64748B' }}>
                                                📍 +{formatCurrency(liquidacionReal.totalesEquipo.variableTotal)}
                                            </div>
                                            <div style={{ fontSize: '0.84rem', fontWeight: 900, color: '#059669' }}>
                                                📈 +{formatCurrency(liquidacionProyectada.totalesEquipo.variableTotal)}
                                            </div>
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '12px', textAlign: 'right' }}>
                                    {modoVistaTabla === 'real' && (
                                        <span style={{ color: '#003B71', fontSize: '1.05rem', fontWeight: 900 }}>
                                            {formatCurrency(liquidacionReal.totalesEquipo.liquidacionTotal)}
                                        </span>
                                    )}
                                    {modoVistaTabla === 'tendencia' && (
                                        <span style={{ color: '#059669', fontSize: '1.05rem', fontWeight: 900 }}>
                                            {formatCurrency(liquidacionProyectada.totalesEquipo.liquidacionTotal)}
                                        </span>
                                    )}
                                    {modoVistaTabla === 'comparativa' && (
                                        <div>
                                            <div style={{ fontSize: '0.70rem', color: '#64748B' }}>
                                                📍 {formatCurrency(liquidacionReal.totalesEquipo.liquidacionTotal)}
                                            </div>
                                            <div style={{ fontSize: '1.02rem', fontWeight: 900, color: '#059669' }}>
                                                📈 {formatCurrency(liquidacionProyectada.totalesEquipo.liquidacionTotal)}
                                            </div>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
            </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* SUB-TAB 2: DETALLE DE LAS 3 BOLSAS (50 / 25 / 25)                */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {activeViewTab === 'bolsas' && (
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '14px',
                marginBottom: '16px'
            }}>
                {/* TARJETA BOLSA 1: CONVERSACIONES ÚNICAS */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                    padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Bolsa Grupal • Ponderación 50%
                            </span>
                            <h3 style={{ margin: '2px 0 0 0', fontSize: '1.05rem', fontWeight: 800, color: '#0F2942' }}>
                                Conversaciones Únicas (Ventana 24 hs)
                            </h3>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.66rem', color: '#64748B' }}>Tope por agente</span>
                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0284C7' }}>
                                +$69.735,29
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '6px' }}>
                        <span style={{ color: '#64748B' }}>
                            Base: <strong>6.500</strong> | Meta: <strong>7.500</strong> | Tope: <strong>8.500</strong> conv.
                        </span>
                        <span style={{ fontWeight: 800, color: '#0284C7' }}>
                            Escalón {liquidacion.bolsaMensajes.escalon}/10 (+{formatCurrency(liquidacion.bolsaMensajes.montoPorFte)})
                        </span>
                    </div>

                    {/* Barra de Progreso */}
                    <div style={{ width: '100%', height: '10px', background: '#F1F5F9', borderRadius: '6px', overflow: 'hidden', marginBottom: '14px' }}>
                        <div style={{
                            width: `${Math.min(100, Math.max(0, (liquidacion.bolsaMensajes.total / 8500) * 100))}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #38BDF8 0%, #0284C7 100%)',
                            borderRadius: '6px',
                            transition: 'width 0.4s ease'
                        }} />
                    </div>

                    {/* Control de Conversaciones Auditadas */}
                    <div style={{
                        background: '#F8FAFC', borderRadius: '10px', padding: '10px 12px',
                        border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Sliders size={15} color="#0284C7" />
                                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155' }}>
                                    Conversaciones Únicas Gestionadas:
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                    type="number"
                                    value={mensajesManuales}
                                    onChange={(e) => setMensajesManuales(e.target.value)}
                                    placeholder="Ej: 7640"
                                    style={{
                                        width: '95px', padding: '5px 8px', borderRadius: '6px',
                                        border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: 800,
                                        color: '#003B71', textAlign: 'right', outline: 'none'
                                    }}
                                />
                                <button
                                    onClick={handleGuardarConversaciones}
                                    disabled={savingConvs}
                                    title="Guardar valor para este mes en Supabase"
                                    style={{
                                        background: '#0284C7', border: 'none', color: '#FFFFFF',
                                        padding: '5px 8px', borderRadius: '6px', fontSize: '0.70rem',
                                        fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    <Save size={12} />
                                    {savingConvs ? '...' : 'Guardar'}
                                </button>
                            </div>
                        </div>

                        <div style={{
                            fontSize: '0.67rem', color: '#64748B', lineHeight: '1.3',
                            borderTop: '1px dashed #E2E8F0', paddingTop: '6px'
                        }}>
                            💡 <strong>Criterio oficial:</strong> Si un paciente escribió hoy y vuelve a escribir pasadas las 24 horas, se computa como una nueva conversación distinta.
                        </div>
                    </div>
                </div>

                {/* TARJETA BOLSA 2: TURNOS */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                    padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Bolsa Grupal • Ponderación 25%
                            </span>
                            <h3 style={{ margin: '2px 0 0 0', fontSize: '1.05rem', fontWeight: 800, color: '#0F2942' }}>
                                Turnos Otorgados (SALUS)
                            </h3>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.66rem', color: '#64748B' }}>Tope por agente</span>
                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#7C3AED' }}>
                                +$34.867,65
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '6px' }}>
                        <span style={{ color: '#64748B' }}>
                            Base: <strong>3.052</strong> | Meta: <strong>3.687</strong> | Tope: <strong>4.324</strong>
                        </span>
                        <span style={{ fontWeight: 800, color: '#7C3AED' }}>
                            Escalón {liquidacion.bolsaTurnos.escalon}/10 (+{formatCurrency(liquidacion.bolsaTurnos.montoPorFte)})
                        </span>
                    </div>

                    {/* Barra de Progreso */}
                    <div style={{ width: '100%', height: '10px', background: '#F1F5F9', borderRadius: '6px', overflow: 'hidden', marginBottom: '14px' }}>
                        <div style={{
                            width: `${Math.min(100, Math.max(0, (liquidacion.bolsaTurnos.total / 4324) * 100))}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #A78BFA 0%, #7C3AED 100%)',
                            borderRadius: '6px',
                            transition: 'width 0.4s ease'
                        }} />
                    </div>

                    <div style={{
                        background: '#FAF5FF', borderRadius: '10px', padding: '10px 12px',
                        border: '1px solid #E9D5FF', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                        <span style={{ fontSize: '0.74rem', color: '#6B21A8', fontWeight: 600 }}>
                            Total auditado en SALUS VLISE_Visitas:
                        </span>
                        <strong style={{ fontSize: '0.86rem', color: '#6B21A8' }}>
                            {liquidacion.bolsaTurnos.total.toLocaleString()} turnos
                        </strong>
                    </div>
                </div>

                {/* TARJETA BOLSA 3: ASISTENCIA */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                    padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Bolsa Individual • Ponderación 25%
                            </span>
                            <h3 style={{ margin: '2px 0 0 0', fontSize: '1.05rem', fontWeight: 800, color: '#0F2942' }}>
                                Asistencia Efectiva
                            </h3>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.66rem', color: '#64748B' }}>Tope individual</span>
                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#059669' }}>
                                +$34.867,65
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '6px' }}>
                        <span style={{ color: '#64748B' }}>
                            Base: <strong>50%</strong> | Meta: <strong>55%</strong> | Tope: <strong>$\ge$ 60%</strong>
                        </span>
                        <span style={{ fontWeight: 800, color: '#059669' }}>
                            +1% = +$3.486,76
                        </span>
                    </div>

                    {/* Resumen del equipo */}
                    <div style={{
                        background: '#ECFDF5', borderRadius: '10px', padding: '12px 14px',
                        border: '1px solid #A7F3D0', marginTop: '12px'
                    }}>
                        <div style={{ fontSize: '0.74rem', color: '#065F46', fontWeight: 600, lineHeight: 1.5 }}>
                            Cada colaboradora percibe su variable según la tasa de asistencia de las citas creadas por ella con fecha en el mes. Reconoce el seguimiento personalizado del paciente.
                        </div>
                    </div>
                </div>
            </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* SUB-TAB 3: GRÁFICOS & COMPARATIVA MES A MES                      */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {activeViewTab === 'comparativa' && (
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '22px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                marginBottom: '20px'
            }}>
                {/* Cabecera y Selector de Métrica */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <BarChart3 size={18} color="#0284C7" />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 800, color: '#0F2942' }}>
                                Performance de Operadoras y Comparativa Mes a Mes
                            </h3>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                            Auditoría de productividad de cada colaboradora y del equipo: <strong>{historicoData?.labelAnterior || 'Mes Anterior'} vs {historicoData?.labelActual || 'Mes Actual'}</strong> (SALUS y CRM WhatsApp).
                        </p>
                    </div>

                    {/* Selector de Pestañas / Tipo de Métrica */}
                    <div style={{
                        display: 'flex', gap: '4px', background: '#F1F5F9',
                        padding: '4px', borderRadius: '10px', border: '1px solid #E2E8F0',
                        flexWrap: 'wrap'
                    }}>
                        {[
                            { key: 'asistencia', label: 'Asistencia Efectiva (%)', icon: Target },
                            { key: 'turnos', label: 'Turnos Otorgados', icon: PhoneCall },
                            { key: 'mensajes', label: 'Conversaciones', icon: MessageSquare },
                            { key: 'variable', label: 'Variable Cobrado ($)', icon: DollarSign },
                            { key: 'evolucion', label: 'Evolución Equipo', icon: TrendingUp }
                        ].map(tab => {
                            const Icon = tab.icon;
                            const isActive = metricChartType === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setMetricChartType(tab.key)}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '6px 12px', borderRadius: '8px', border: 'none',
                                        background: isActive ? '#003B71' : 'transparent',
                                        color: isActive ? '#FFFFFF' : '#475569',
                                        fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        boxShadow: isActive ? '0 2px 4px rgba(0, 59, 113, 0.2)' : 'none'
                                    }}
                                >
                                    <Icon size={13} />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Mini Tarjetas de Insights y Líderes de Productividad */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    gap: '12px',
                    marginBottom: '18px'
                }}>
                    <div style={{
                        background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: '10px', padding: '10px 14px'
                    }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase' }}>
                            🥇 Más Turnos en {historicoData?.labelActual?.split(' ')[0] || ''}
                        </div>
                        <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#0F2942', marginTop: '2px' }}>
                            {historicoData?.insights?.liderTurnos?.name || '—'}
                        </div>
                        <div style={{ fontSize: '0.70rem', color: '#6B21A8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <strong>{historicoData?.insights?.liderTurnos?.turnos?.toLocaleString() || 0} turnos</strong>
                            {historicoData?.insights?.liderTurnos?.diff !== undefined && (
                                <span style={{ color: historicoData.insights.liderTurnos.diff >= 0 ? '#16A34A' : '#DC2626', fontWeight: 700 }}>
                                    ({historicoData.insights.liderTurnos.diff >= 0 ? '+' : ''}{historicoData.insights.liderTurnos.diff} vs {historicoData?.labelAnterior?.split(' ')[0] || 'Ant'})
                                </span>
                            )}
                        </div>
                    </div>

                    <div style={{
                        background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '10px 14px'
                    }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#16A34A', textTransform: 'uppercase' }}>
                            🚀 Mayor Variación en Turnos
                        </div>
                        <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#0F2942', marginTop: '2px' }}>
                            {historicoData?.insights?.liderSalto?.name || '—'}
                        </div>
                        <div style={{ fontSize: '0.70rem', color: '#15803D', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <strong>
                                {historicoData?.insights?.liderSalto?.pct !== undefined
                                    ? `${historicoData.insights.liderSalto.pct >= 0 ? '+' : ''}${historicoData.insights.liderSalto.pct}%`
                                    : '—'}
                            </strong>
                            {historicoData?.insights?.liderSalto?.prev !== undefined && (
                                <span>(de {historicoData.insights.liderSalto.prev} a {historicoData.insights.liderSalto.curr} turnos)</span>
                            )}
                        </div>
                    </div>

                    <div style={{
                        background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '10px 14px'
                    }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase' }}>
                            🎯 Mayor Asistencia a Citas
                        </div>
                        <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#0F2942', marginTop: '2px' }}>
                            {historicoData?.insights?.liderAsistencia?.name || '—'}
                        </div>
                        <div style={{ fontSize: '0.70rem', color: '#0369A1', fontWeight: 600 }}>
                            <strong>{historicoData?.insights?.liderAsistencia?.asistenciaPct || 0}%</strong> (Meta institucional: 55%)
                        </div>
                    </div>

                    <div style={{
                        background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '10px 14px'
                    }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#D97706', textTransform: 'uppercase' }}>
                            💬 Mayor Volumen de Mensajes
                        </div>
                        <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#0F2942', marginTop: '2px' }}>
                            {historicoData?.insights?.liderMensajes?.name || '—'}
                        </div>
                        <div style={{ fontSize: '0.70rem', color: '#B45309', fontWeight: 600 }}>
                            <strong>{historicoData?.insights?.liderMensajes?.mensajes?.toLocaleString() || 0} conversaciones</strong>
                        </div>
                    </div>
                </div>

                {/* Gráfico Recharts de Performance */}
                <div style={{
                    background: '#F8FAFC',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '16px 12px 8px 12px',
                    marginBottom: '16px'
                }}>
                    <div style={{ height: '330px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            {metricChartType === 'asistencia' ? (
                                <BarChart
                                    data={historicoData?.comparativoAgentes || []}
                                    margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="shortName" tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }} />
                                    <YAxis domain={[20, 80]} unit="%" tick={{ fill: '#64748B', fontSize: 11 }} />
                                    <Tooltip 
                                        formatter={(val, name) => [`${val}%`, name === 'asistPrev' ? (historicoData?.labelAnterior || 'Mes Anterior') : (historicoData?.labelActual || 'Mes Actual')]}
                                        labelFormatter={(label) => `Operadora: ${label}`}
                                        contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                                    />
                                    <Legend 
                                        formatter={(val) => val === 'asistPrev' ? `${historicoData?.labelAnterior || 'Mes Anterior'} (%)` : `${historicoData?.labelActual || 'Mes Actual'} (%)`}
                                        wrapperStyle={{ fontSize: '12px', fontWeight: 600 }}
                                    />
                                    <ReferenceLine y={55} stroke="#16A34A" strokeDasharray="4 4" label={{ value: 'Meta 55%', fill: '#16A34A', fontSize: 11, fontWeight: 700, position: 'right' }} />
                                    <ReferenceLine y={60} stroke="#059669" strokeDasharray="2 2" label={{ value: 'Tope 60%', fill: '#059669', fontSize: 11, fontWeight: 700, position: 'right' }} />
                                    <Bar dataKey="asistPrev" name="asistPrev" fill="#94A3B8" radius={[6, 6, 0, 0]} maxBarSize={36} />
                                    <Bar dataKey="asistCurr" name="asistCurr" fill="#0284C7" radius={[6, 6, 0, 0]} maxBarSize={36} />
                                </BarChart>
                            ) : metricChartType === 'turnos' ? (
                                <BarChart
                                    data={historicoData?.comparativoAgentes || []}
                                    margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="shortName" tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }} />
                                    <YAxis tick={{ fill: '#64748B', fontSize: 11 }} />
                                    <Tooltip 
                                        formatter={(val, name) => [val.toLocaleString() + ' turnos', name === 'turnosPrev' ? (historicoData?.labelAnterior || 'Mes Anterior') : (historicoData?.labelActual || 'Mes Actual')]}
                                        labelFormatter={(label) => `Operadora: ${label}`}
                                        contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                                    />
                                    <Legend 
                                        formatter={(val) => val === 'turnosPrev' ? `Turnos ${historicoData?.labelAnterior || 'Mes Anterior'}` : `Turnos ${historicoData?.labelActual || 'Mes Actual'}`}
                                        wrapperStyle={{ fontSize: '12px', fontWeight: 600 }}
                                    />
                                    <Bar dataKey="turnosPrev" name="turnosPrev" fill="#C4B5FD" radius={[6, 6, 0, 0]} maxBarSize={36} />
                                    <Bar dataKey="turnosCurr" name="turnosCurr" fill="#7C3AED" radius={[6, 6, 0, 0]} maxBarSize={36} />
                                </BarChart>
                            ) : metricChartType === 'mensajes' ? (
                                <BarChart
                                    data={historicoData?.comparativoAgentes || []}
                                    margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="shortName" tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }} />
                                    <YAxis tick={{ fill: '#64748B', fontSize: 11 }} />
                                    <Tooltip 
                                        formatter={(val, name) => [val.toLocaleString() + ' msjs', name === 'msjsPrev' ? (historicoData?.labelAnterior || 'Mes Anterior') : (historicoData?.labelActual || 'Mes Actual')]}
                                        labelFormatter={(label) => `Operadora: ${label}`}
                                        contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                                    />
                                    <Legend 
                                        formatter={(val) => val === 'msjsPrev' ? `Conversaciones ${historicoData?.labelAnterior || 'Mes Anterior'}` : `Conversaciones ${historicoData?.labelActual || 'Mes Actual'}`}
                                        wrapperStyle={{ fontSize: '12px', fontWeight: 600 }}
                                    />
                                    <Bar dataKey="msjsPrev" name="msjsPrev" fill="#7DD3FC" radius={[6, 6, 0, 0]} maxBarSize={36} />
                                    <Bar dataKey="msjsCurr" name="msjsCurr" fill="#0284C7" radius={[6, 6, 0, 0]} maxBarSize={36} />
                                </BarChart>
                            ) : metricChartType === 'variable' ? (
                                <BarChart
                                    data={historicoData?.comparativoAgentes || []}
                                    margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="shortName" tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }} />
                                    <YAxis tickFormatter={(val) => `$${Math.round(val / 1000)}k`} tick={{ fill: '#64748B', fontSize: 11 }} />
                                    <Tooltip 
                                        formatter={(val, name) => [formatCurrency(val), name === 'varPrev' ? `Variable ${historicoData?.labelAnterior || 'Mes Anterior'}` : `Variable ${historicoData?.labelActual || 'Mes Actual'}`]}
                                        labelFormatter={(label) => `Operadora: ${label}`}
                                        contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                                    />
                                    <Legend 
                                        formatter={(val) => val === 'varPrev' ? `Variable Percibido ${historicoData?.labelAnterior || 'Mes Anterior'} ($)` : `Variable Percibido ${historicoData?.labelActual || 'Mes Actual'} ($)`}
                                        wrapperStyle={{ fontSize: '12px', fontWeight: 600 }}
                                    />
                                    <Bar dataKey="varPrev" name="varPrev" fill="#86EFAC" radius={[6, 6, 0, 0]} maxBarSize={36} />
                                    <Bar dataKey="varCurr" name="varCurr" fill="#16A34A" radius={[6, 6, 0, 0]} maxBarSize={36} />
                                </BarChart>
                            ) : (
                                <LineChart
                                    data={historicoData?.evolucionEquipo || []}
                                    margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                    <XAxis dataKey="mes" tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }} />
                                    <YAxis yAxisId="left" tick={{ fill: '#64748B', fontSize: 11 }} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748B', fontSize: 11 }} />
                                    <Tooltip 
                                        formatter={(val, name) => [
                                            name === 'turnosTotales' ? `${val.toLocaleString()} turnos` : `${val.toLocaleString()} convs`,
                                            name === 'turnosTotales' ? 'Turnos SALUS' : 'Conversaciones Únicas'
                                        ]}
                                        contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 600 }} />
                                    <Line yAxisId="left" type="monotone" dataKey="turnosTotales" name="Turnos SALUS" stroke="#7C3AED" strokeWidth={3} dot={{ r: 6 }} activeDot={{ r: 8 }} />
                                    <Line yAxisId="right" type="monotone" dataKey="convsTotales" name="Conversaciones Únicas" stroke="#0284C7" strokeWidth={3} dot={{ r: 6 }} activeDot={{ r: 8 }} />
                                </LineChart>
                            )}
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Tabla Detalle de Variación Mes a Mes */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 800 }}>Colaboradora</th>
                                <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>
                                    Turnos {historicoData?.labelAnterior?.split(' ')[0] || 'Ant'} ➔ {historicoData?.labelActual?.split(' ')[0] || 'Act'}
                                </th>
                                <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>Var. Turnos</th>
                                <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>
                                    Asistencia {historicoData?.labelAnterior?.split(' ')[0] || 'Ant'} ➔ {historicoData?.labelActual?.split(' ')[0] || 'Act'}
                                </th>
                                <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>Dif. Asistencia</th>
                                <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>
                                    Mensajes {historicoData?.labelAnterior?.split(' ')[0] || 'Ant'} ➔ {historicoData?.labelActual?.split(' ')[0] || 'Act'}
                                </th>
                                <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800 }}>
                                    Variable {historicoData?.labelAnterior?.split(' ')[0] || 'Ant'} ➔ {historicoData?.labelActual?.split(' ')[0] || 'Act'}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {(historicoData?.comparativoAgentes || []).map((ag, idx) => (
                                <tr key={ag.id} style={{
                                    borderBottom: '1px solid #F1F5F9',
                                    background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'
                                }}>
                                    <td style={{ padding: '10px 10px', fontWeight: 800, color: '#0F2942' }}>
                                        {ag.name}
                                        {ag.fteCurr < 1 && (
                                            <span style={{ marginLeft: '6px', fontSize: '0.64rem', padding: '1px 5px', borderRadius: '4px', background: '#F1F5F9', color: '#64748B', fontWeight: 700 }}>
                                                {Math.round(ag.fteCurr * 100)}% FTE
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '10px 10px', textAlign: 'center', color: '#334155', fontWeight: 600 }}>
                                        {ag.turnosPrev.toLocaleString()} ➔ <strong>{ag.turnosCurr.toLocaleString()}</strong>
                                    </td>
                                    <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                                        <span style={{
                                            padding: '2px 7px', borderRadius: '6px', fontSize: '0.70rem', fontWeight: 800,
                                            background: ag.turnosDiff > 0 ? '#DCFCE7' : ag.turnosDiff < 0 ? '#FEE2E2' : '#F1F5F9',
                                            color: ag.turnosDiff > 0 ? '#15803D' : ag.turnosDiff < 0 ? '#B91C1C' : '#64748B'
                                        }}>
                                            {ag.turnosDiff > 0 ? `▲ +${ag.turnosDiff} (+${ag.turnosPct}%)` : ag.turnosDiff < 0 ? `▼ ${ag.turnosDiff} (${ag.turnosPct}%)` : '—'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 10px', textAlign: 'center', color: '#334155', fontWeight: 600 }}>
                                        {ag.asistPrev}% ➔ <strong>{ag.asistCurr}%</strong>
                                    </td>
                                    <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                                        <span style={{
                                            padding: '2px 7px', borderRadius: '6px', fontSize: '0.70rem', fontWeight: 800,
                                            background: ag.asistDiff >= 0 ? '#DCFCE7' : '#FEF3C7',
                                            color: ag.asistDiff >= 0 ? '#15803D' : '#B45309'
                                        }}>
                                            {ag.asistDiff >= 0 ? `▲ +${ag.asistDiff} pp` : `▼ ${ag.asistDiff} pp`}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 10px', textAlign: 'center', color: '#334155', fontWeight: 600 }}>
                                        {ag.msjsPrev > 0 ? ag.msjsPrev.toLocaleString() : '—'} ➔ <strong>{ag.msjsCurr > 0 ? ag.msjsCurr.toLocaleString() : '—'}</strong>
                                    </td>
                                    <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 800, color: '#003B71' }}>
                                        {formatCurrency(ag.varPrev)} ➔ <strong>{formatCurrency(ag.varCurr)}</strong>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 5. MODAL: TABLA DE ESCALONES PROGRESIVOS                         */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {showEscalonesModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999, padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF', borderRadius: '16px', maxWidth: '700px', width: '100%',
                        maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F2942' }}>
                                    Tabla Oficial de Escalones Progresivos (0 a 10)
                                </h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                    Esquema acumulativo sin penalización cruzada. Se cobra cada tramo superado.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowEscalonesModal(false)}
                                style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontWeight: 800 }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Selector de Bolsa en el Modal */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            {['mensajes', 'turnos', 'asistencia'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveEscalonTab(tab)}
                                    style={{
                                        flex: 1, padding: '8px 12px', borderRadius: '8px', border: 'none',
                                        fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                                        background: activeEscalonTab === tab ? '#003B71' : '#F1F5F9',
                                        color: activeEscalonTab === tab ? '#FFFFFF' : '#475569',
                                        textTransform: 'capitalize'
                                    }}
                                >
                                    Bolsa {tab}
                                </button>
                            ))}
                        </div>

                        {/* Tabla del Escalón Activo */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                                    <th style={{ padding: '8px 10px', fontWeight: 800 }}>Escalón</th>
                                    <th style={{ padding: '8px 10px', fontWeight: 800 }}>Rango / Umbral</th>
                                    <th style={{ padding: '8px 10px', fontWeight: 800, textAlign: 'right' }}>Monto Adicional</th>
                                    <th style={{ padding: '8px 10px', fontWeight: 800, textAlign: 'center' }}>Hito</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getEscalonesInfo(activeEscalonTab).map(esc => (
                                    <tr 
                                        key={esc.escalon} 
                                        style={{ 
                                            borderBottom: '1px solid #F1F5F9',
                                            background: esc.esMeta ? '#F0FDF4' : esc.esTope ? '#EFF6FF' : 'transparent'
                                        }}
                                    >
                                        <td style={{ padding: '8px 10px', fontWeight: 800, color: '#0F2942' }}>
                                            Escalón {esc.escalon}
                                        </td>
                                        <td style={{ padding: '8px 10px', color: '#475569' }}>
                                            {activeEscalonTab === 'asistencia' 
                                                ? `${esc.desde.toFixed(0)}% a ${esc.hasta === 100 ? '100%' : esc.hasta.toFixed(1) + '%'}`
                                                : `${esc.desde.toLocaleString()} a ${esc.hasta === Infinity ? 'en adelante' : esc.hasta.toLocaleString()}`}
                                        </td>
                                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#003B71' }}>
                                            {formatCurrency(esc.monto)}
                                        </td>
                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                            {esc.esMeta && (
                                                <span style={{ background: '#DCFCE7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontSize: '0.64rem', fontWeight: 800 }}>
                                                    🎯 META
                                                </span>
                                            )}
                                            {esc.esTope && (
                                                <span style={{ background: '#DBEAFE', color: '#1E40AF', padding: '2px 6px', borderRadius: '4px', fontSize: '0.64rem', fontWeight: 800 }}>
                                                    ⭐ TOPE MÁX
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div style={{ marginTop: '16px', textAlign: 'right' }}>
                            <button
                                onClick={() => setShowEscalonesModal(false)}
                                style={{ background: '#003B71', color: '#FFFFFF', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 6. MODAL: REPORTE FORMAL PARA RECURSOS HUMANOS                   */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {showReporteModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(5px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999, padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF', borderRadius: '16px', maxWidth: '850px', width: '100%',
                        maxHeight: '92vh', overflowY: 'auto', padding: '32px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)'
                    }}>
                        {/* Membrete Oficial Sanatorio Argentino */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #003B71', paddingBottom: '16px', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#003B71', textTransform: 'uppercase' }}>
                                    Sanatorio Argentino
                                </h2>
                                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700, marginTop: '2px' }}>
                                    Innovación, Transformación Digital & Recursos Humanos
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F2942' }}>
                                    INFORME DE CIERRE DE PRODUCTIVIDAD
                                </div>
                                <div style={{ fontSize: '0.70rem', color: '#64748B' }}>
                                    Período Liquidado: <strong>{periodo}</strong>
                                </div>
                            </div>
                        </div>

                        {/* Párrafo Formal */}
                        <div style={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.6, marginBottom: '20px' }}>
                            Por medio del presente se eleva a la Dirección de Recursos Humanos (Carolina Balaguer / Lic. Sergio Femenía) 
                            la certificación y desglose de productividad del <strong>Contact Center</strong> correspondiente al período <strong>{periodo}</strong>, 
                            conforme al esquema propuesto en el documento oficial <code>v13</code>. Se garantiza el piso histórico de <strong>{formatCurrency(BASE_GARANTIZADA_HISTORICA)}</strong> por operadora, 
                            liquidándose el adicional variable conforme a los datos auditados en SALUS SQL Server y la plataforma de mensajería.
                        </div>

                        {/* Resumen de Métricas Grupales */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px', background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                            <div>
                                <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 700 }}>Bolsa 1: Mensajes</div>
                                <div style={{ fontSize: '0.90rem', fontWeight: 900, color: '#0284C7' }}>
                                    {liquidacion.bolsaMensajes.total.toLocaleString()} msjs (Escalón {liquidacion.bolsaMensajes.escalon})
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 700 }}>Bolsa 2: Turnos SALUS</div>
                                <div style={{ fontSize: '0.90rem', fontWeight: 900, color: '#7C3AED' }}>
                                    {liquidacion.bolsaTurnos.total.toLocaleString()} turnos (Escalón {liquidacion.bolsaTurnos.escalon})
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 700 }}>Total Liquidación</div>
                                <div style={{ fontSize: '0.90rem', fontWeight: 900, color: '#003B71' }}>
                                    {formatCurrency(liquidacion.totalesEquipo.liquidacionTotal)}
                                </div>
                            </div>
                        </div>

                        {/* Tabla Imprimible */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', marginBottom: '30px' }}>
                            <thead>
                                <tr style={{ background: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1', textAlign: 'left' }}>
                                    <th style={{ padding: '8px' }}>Colaboradora</th>
                                    <th style={{ padding: '8px' }}>FTE</th>
                                    <th style={{ padding: '8px', textAlign: 'right' }}>Piso Histórico</th>
                                    <th style={{ padding: '8px', textAlign: 'right' }}>+ Var. Mensajes</th>
                                    <th style={{ padding: '8px', textAlign: 'right' }}>+ Var. Turnos</th>
                                    <th style={{ padding: '8px', textAlign: 'right' }}>Asistencia %</th>
                                    <th style={{ padding: '8px', textAlign: 'right' }}>+ Var. Asist.</th>
                                    <th style={{ padding: '8px', textAlign: 'right', fontWeight: 900, color: '#003B71' }}>Total a Transferir</th>
                                </tr>
                            </thead>
                            <tbody>
                                {liquidacion.agentes.map(ag => (
                                    <tr key={ag.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                        <td style={{ padding: '8px', fontWeight: 700 }}>{ag.name}</td>
                                        <td style={{ padding: '8px' }}>{(ag.fte * 100).toFixed(0)}%</td>
                                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(ag.baseGarantizadaLiquidada)}</td>
                                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(ag.montoMensajes)}</td>
                                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(ag.montoTurnos)}</td>
                                        <td style={{ padding: '8px', textAlign: 'right' }}>{ag.asistenciaPct}%</td>
                                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(ag.montoAsistencia)}</td>
                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 900, color: '#003B71' }}>
                                            {formatCurrency(ag.totalALiquidar)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Firmas de Validación */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #E2E8F0' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ width: '160px', borderBottom: '1px solid #94A3B8', margin: '0 auto 8px auto' }} />
                                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F2942' }}>Lucas Marinero</div>
                                <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Innovación y Transformación Digital</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ width: '160px', borderBottom: '1px solid #94A3B8', margin: '0 auto 8px auto' }} />
                                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F2942' }}>Carolina Balaguer / Sergio Femenía</div>
                                <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Recursos Humanos & Liquidación de Haberes</div>
                            </div>
                        </div>

                        {/* Botones de Acción */}
                        <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                onClick={() => setShowReporteModal(false)}
                                style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '8px 16px', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Cerrar
                            </button>
                            <button
                                onClick={() => window.print()}
                                style={{ background: '#003B71', color: '#FFFFFF', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Printer size={14} /> Imprimir / Guardar PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
