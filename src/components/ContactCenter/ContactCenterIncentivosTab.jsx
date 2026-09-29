import React, { useState, useEffect, useMemo } from 'react';
import { 
    Award, TrendingUp, Users, Calendar, CheckCircle2, AlertCircle, 
    ArrowUpRight, Printer, RefreshCw, HelpCircle, FileText, ChevronDown, 
    ChevronUp, Shield, Sliders, DollarSign, MessageSquare, PhoneCall,
    ChevronLeft, ChevronRight, Cloud, Save
} from 'lucide-react';
import { 
    BASE_GARANTIZADA_HISTORICA,
    MAX_VARIABLE_TOTAL,
    TECHO_MAXIMO_TOTAL,
    INCENTIVO_CONFIG,
    getEscalonesInfo,
    fetchMetricasIncentivosSalus,
    fetchMensajesContactCenterMes,
    calcularLiquidacionCompleta,
    guardarConversacionesAuditadasMes
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

            // Priorizar valor de conversaciones únicas auditadas (Virginia: 2505, Sofia: 2435, Daniela: 1903, Erica: 1744 = 8587)
            let defaultMsgs = rawData.conversacionesUnicas;
            if (p === '2026-09' || p === '2026-10') {
                defaultMsgs = rawData.conversacionesUnicas || 8587;
            } else if (!defaultMsgs) {
                if (p === '2026-08') defaultMsgs = 7820;
                else if (msgsSb && msgsSb > 3000) defaultMsgs = msgsSb;
                else defaultMsgs = 8587;
            }
            setMensajesManuales(String(defaultMsgs));

            // Inicializar ajustes de FTE para casos específicos de altas/bajas
            if (p === '2026-08') {
                setAjustesFte(prev => ({
                    ...prev,
                    eleal: 0.5, // Érica ingreso a mediados de agosto
                    macosta: 1.0
                }));
            } else if (p === '2026-09') {
                setAjustesFte(prev => ({
                    ...prev,
                    eleal: 0.5, // Curva 50%
                    macosta: 0.15 // Baja a principios de septiembre (días trabajados)
                }));
            } else {
                setAjustesFte(prev => ({
                    ...prev,
                    eleal: 0.5
                }));
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

    // Cálculo dinámico de la liquidación
    const liquidacion = useMemo(() => {
        const msgs = Number(mensajesManuales) || 0;
        return calcularLiquidacionCompleta({
            periodo,
            mensajesTotales: msgs,
            datosSalus,
            ajustesFte
        });
    }, [periodo, mensajesManuales, datosSalus, ajustesFte]);

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
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                            Contact Center Sanatorio Argentino • Piso garantizado $139.470,59 + Bolsas independientes 50 / 25 / 25
                        </p>
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

                    {/* Badge de Estado / Sincronización */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: '#F0FDF4',
                        border: '1px solid #BBF7D0',
                        color: '#15803D',
                        padding: '6px 10px',
                        borderRadius: '10px',
                        fontSize: '0.72rem',
                        fontWeight: 700
                    }}>
                        <Cloud size={13} color="#16A34A" />
                        <span>Cloud SALUS</span>
                    </div>

                    <button
                        onClick={() => cargarPeriodo(periodo, true)}
                        disabled={loading}
                        title="Forzar actualización directa desde SALUS SQL Server"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: '#FFFFFF', border: '1px solid #CBD5E1',
                            padding: '8px 12px', borderRadius: '10px',
                            fontSize: '0.76rem', fontWeight: 700, color: '#0284C7',
                            cursor: loading ? 'wait' : 'pointer'
                        }}
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
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
            {/* 2. TARJETAS DE INDICADORES GLOBALES (KPIs)                      */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '14px',
                marginBottom: '16px'
            }}>
                {/* KPI 1: Piso Garantizado Histórico */}
                <div style={{
                    background: '#FFFFFF', padding: '18px 20px', borderRadius: '14px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                            Piso Garantizado (Histórico)
                        </span>
                        <Shield size={16} color="#059669" />
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#0F2942' }}>
                        {formatCurrency(BASE_GARANTIZADA_HISTORICA)}
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#059669', fontWeight: 700, marginTop: '4px' }}>
                        100% Inamovible • Se cobra siempre
                    </div>
                </div>

                {/* KPI 2: Bolsa 1 Conversaciones Únicas Grupales */}
                <div style={{
                    background: '#FFFFFF', padding: '18px 20px', borderRadius: '14px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                            Bolsa 1: Conv. Únicas (50%)
                        </span>
                        <MessageSquare size={16} color="#0284C7" />
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#0284C7' }}>
                        {formatCurrency(liquidacion.bolsaMensajes.montoPorFte)}
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#475569', fontWeight: 700, marginTop: '4px' }}>
                        Escalón {liquidacion.bolsaMensajes.escalon}/10 • {liquidacion.bolsaMensajes.total.toLocaleString()} conv. únicas
                    </div>
                </div>

                {/* KPI 3: Bolsa 2 Turnos Otorgados */}
                <div style={{
                    background: '#FFFFFF', padding: '18px 20px', borderRadius: '14px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                            Bolsa 2: Turnos (25%)
                        </span>
                        <PhoneCall size={16} color="#7C3AED" />
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#7C3AED' }}>
                        {formatCurrency(liquidacion.bolsaTurnos.montoPorFte)}
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#475569', fontWeight: 700, marginTop: '4px' }}>
                        Escalón {liquidacion.bolsaTurnos.escalon}/10 • {liquidacion.bolsaTurnos.total.toLocaleString()} turnos
                    </div>
                </div>

                {/* KPI 4: A Cobrar por Agente (100% FTE) */}
                <div style={{
                    background: 'linear-gradient(135deg, #003B71 0%, #0F2942 100%)',
                    padding: '18px 20px', borderRadius: '14px',
                    boxShadow: '0 4px 14px rgba(0, 59, 113, 0.25)',
                    color: '#FFFFFF'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#93C5FD', textTransform: 'uppercase' }}>
                            A Cobrar por Agente (100% FTE)
                        </span>
                        <DollarSign size={16} color="#67E8F9" />
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#FFFFFF' }}>
                        {metricasAgentes.hayRango
                            ? `${formatCurrency(metricasAgentes.minPleno)} - ${formatCurrency(metricasAgentes.maxPleno)}`
                            : formatCurrency(metricasAgentes.promedioPleno)
                        }
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#BAE6FD', fontWeight: 600, marginTop: '4px' }}>
                        Piso + Variable (+{formatCurrency(metricasAgentes.totalVariablePleno)}) • Equipo: {formatCurrency(liquidacion.totalesEquipo.liquidacionTotal)}
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 2.B MINI-TARJETAS INDIVIDUALES: CUÁNTO COBRA CADA OPERADORA       */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                padding: '16px 20px',
                marginBottom: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={16} color="#003B71" />
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F2942', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Liquidación Individual por Operadora
                        </span>
                    </div>
                    <span style={{ fontSize: '0.70rem', color: '#64748B', fontWeight: 600 }}>
                        Piso base $139.471 + Variable según cumplimiento de bolsas y presentismo
                    </span>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                    gap: '10px'
                }}>
                    {liquidacion.agentes.map(ag => (
                        <div key={ag.id} style={{
                            background: '#F8FAFC',
                            borderRadius: '12px',
                            border: '1px solid #E2E8F0',
                            padding: '12px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'all 0.15s ease'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '34px', height: '34px', borderRadius: '50%',
                                    background: ag.fte === 1.0 ? '#003B71' : '#475569',
                                    color: '#FFFFFF',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.72rem', fontWeight: 800
                                }}>
                                    {ag.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F2942' }}>
                                        {ag.name}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>
                                        {ag.fte === 1.0 ? '100% FTE' : `${Math.round(ag.fte * 100)}% FTE`}
                                        {ag.mensajesIndividuales > 0 ? ` • 💬 ${ag.mensajesIndividuales.toLocaleString()} msjs` : ''}
                                        {` • Asist: ${ag.asistenciaPct}%`}
                                    </div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '1.02rem', fontWeight: 900, color: '#003B71' }}>
                                    {formatCurrency(ag.totalALiquidar)}
                                </div>
                                <div style={{ fontSize: '0.66rem', color: '#16A34A', fontWeight: 700 }}>
                                    +{formatCurrency(ag.totalVariable)} variable
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 3. DETALLE DE LAS 3 BOLSAS Y TERMÓMETROS DE PROGRESO             */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
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

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 4. TABLA DE LIQUIDACIÓN NOMINAL POR COLABORADORA                 */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '22px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.10rem', fontWeight: 800, color: '#0F2942' }}>
                            Desglose de Liquidación Individual por Colaboradora
                        </h3>
                        <p style={{ margin: '3px 0 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                            Cálculo transparente de haberes: Piso histórico garantizado + 3 bolsas independientes prorrateadas por FTE.
                        </p>
                    </div>
                    <span style={{ fontSize: '0.72rem', background: '#F8FAFC', border: '1px solid #CBD5E1', padding: '4px 10px', borderRadius: '8px', fontWeight: 700, color: '#475569' }}>
                        Dotación Evaluada: {liquidacion.agentes.length} operadoras
                    </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                                <th style={{ padding: '10px 12px', fontWeight: 800 }}>Colaboradora</th>
                                <th style={{ padding: '10px 12px', fontWeight: 800 }}>Estado / FTE</th>
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
                            {liquidacion.agentes.map((ag) => (
                                <tr key={ag.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s ease' }}>
                                    <td style={{ padding: '12px', fontWeight: 700, color: '#0F2942' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{
                                                width: '26px', height: '26px', borderRadius: '50%',
                                                background: '#003B71', color: '#FFFFFF',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.68rem', fontWeight: 800
                                            }}>
                                                {ag.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                            </div>
                                            <div>
                                                <div>{ag.name}</div>
                                                <div style={{ fontSize: '0.66rem', color: '#94A3B8' }}>{ag.salusKey}</div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Control FTE / Estado */}
                                    <td style={{ padding: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <select
                                                value={ag.fte}
                                                onChange={(e) => handleFteChange(ag.id, e.target.value)}
                                                style={{
                                                    padding: '3px 6px', borderRadius: '6px',
                                                    border: '1px solid #CBD5E1', fontSize: '0.72rem', fontWeight: 700,
                                                    background: ag.fte === 1.0 ? '#F0FDF4' : '#FFFBEB',
                                                    color: ag.fte === 1.0 ? '#166534' : '#92400E'
                                                }}
                                            >
                                                <option value="1.0">100% FTE (Pleno)</option>
                                                <option value="0.75">75% FTE</option>
                                                <option value="0.5">50% FTE (Curva/Lic)</option>
                                                <option value="0.25">25% FTE</option>
                                                <option value="0.15">15% FTE (Cese)</option>
                                                <option value="0">0% (Inactiva)</option>
                                            </select>
                                        </div>
                                    </td>

                                    {/* Piso Garantizado */}
                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>
                                        {formatCurrency(ag.baseGarantizadaLiquidada)}
                                    </td>

                                    {/* Bolsa Mensajes */}
                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#0284C7' }}>
                                        <div>+{formatCurrency(ag.montoMensajes)}</div>
                                        {ag.mensajesIndividuales > 0 && (
                                            <div style={{ fontSize: '0.64rem', color: '#0369A1', fontWeight: 700 }}>
                                                {ag.mensajesIndividuales.toLocaleString()} msjs
                                            </div>
                                        )}
                                    </td>

                                    {/* Bolsa Turnos */}
                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#7C3AED' }}>
                                        +{formatCurrency(ag.montoTurnos)}
                                    </td>

                                    {/* Asistencia Individual % */}
                                    <td style={{ padding: '12px', textAlign: 'right' }}>
                                        <div style={{ fontWeight: 800, color: ag.asistenciaPct >= 55 ? '#059669' : ag.asistenciaPct >= 50 ? '#D97706' : '#DC2626' }}>
                                            {ag.asistenciaPct}%
                                        </div>
                                        <div style={{ fontSize: '0.64rem', color: '#94A3B8' }}>
                                            {ag.asistidas} de {ag.evaluables} citas
                                        </div>
                                    </td>

                                    {/* Bolsa Asistencia Individual $ */}
                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                                        +{formatCurrency(ag.montoAsistencia)}
                                    </td>

                                    {/* Total Variable */}
                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#2563EB' }}>
                                        +{formatCurrency(ag.totalVariable)}
                                    </td>

                                    {/* TOTAL A LIQUIDAR */}
                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 900, color: '#003B71', fontSize: '0.90rem' }}>
                                        {formatCurrency(ag.totalALiquidar)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1', fontWeight: 800 }}>
                                <td colSpan="2" style={{ padding: '12px', color: '#0F2942' }}>
                                    TOTALES CONSOLIDADOS DEL EQUIPO
                                </td>
                                <td style={{ padding: '12px', textAlign: 'right', color: '#475569' }}>
                                    {formatCurrency(liquidacion.totalesEquipo.baseTotal)}
                                </td>
                                <td colSpan="4" style={{ padding: '12px', textAlign: 'right', color: '#64748B' }}>
                                    Total Productividad Variable:
                                </td>
                                <td style={{ padding: '12px', textAlign: 'right', color: '#2563EB', fontWeight: 900 }}>
                                    +{formatCurrency(liquidacion.totalesEquipo.variableTotal)}
                                </td>
                                <td style={{ padding: '12px', textAlign: 'right', color: '#003B71', fontSize: '1.05rem', fontWeight: 900 }}>
                                    {formatCurrency(liquidacion.totalesEquipo.liquidacionTotal)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

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
