import { useState, useEffect } from 'react';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    Legend, ResponsiveContainer, Cell
} from 'recharts';
import {
    DollarSign, TrendingUp, Users, CheckCircle2,
    Calendar, ArrowUpRight, ArrowDownRight, Activity,
    RefreshCw, Filter, ShieldCheck, ChevronRight, User, Phone,
    RotateCcw, Sparkles
} from 'lucide-react';
import { fetchMetricasAvanzadasDeudas, getRangoFechasPreset, CATEGORIAS_DEUDOR } from '../services/deudaService';

export default function DeudasMetricasDashboard({ onSelectPatient, addToast }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [periodoPreset, setPeriodoPreset] = useState('este_mes'); // 'este_mes' | 'mes_anterior' | 'personalizado' | 'todos'
    
    // Fechas para rango personalizado
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    const loadData = async (opts = {}) => {
        const preset = opts.preset !== undefined ? opts.preset : periodoPreset;
        const fDesde = opts.fechaDesde !== undefined ? opts.fechaDesde : customFrom;
        const fHasta = opts.fechaHasta !== undefined ? opts.fechaHasta : customTo;

        setLoading(true);
        try {
            const res = await fetchMetricasAvanzadasDeudas({
                preset,
                fechaDesde: fDesde,
                fechaHasta: fHasta
            });
            setData(res);
        } catch (error) {
            console.error('Error al cargar métricas avanzadas de deudas:', error);
            addToast?.('Error al cargar analíticas de cobranza', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData({ preset: 'este_mes' });
    }, []);

    const handlePresetChange = (preset) => {
        setPeriodoPreset(preset);
        if (preset !== 'personalizado') {
            loadData({ preset });
        } else {
            // Inicializar fechas por defecto si están vacías
            const now = new Date();
            const curY = now.getFullYear();
            const curM = String(now.getMonth() + 1).padStart(2, '0');
            const defaultFrom = customFrom || `${curY}-${curM}-01`;
            const defaultTo = customTo || `${curY}-${curM}-${String(now.getDate()).padStart(2, '0')}`;
            setCustomFrom(defaultFrom);
            setCustomTo(defaultTo);
            loadData({ preset: 'personalizado', fechaDesde: defaultFrom, fechaHasta: defaultTo });
        }
    };

    const handleApplyCustomRange = () => {
        if (!customFrom || !customTo) {
            addToast?.('Por favor ingresa ambas fechas para el rango personalizado', 'warning');
            return;
        }
        if (customFrom > customTo) {
            addToast?.('La fecha inicial no puede ser posterior a la fecha final', 'warning');
            return;
        }
        loadData({ preset: 'personalizado', fechaDesde: customFrom, fechaHasta: customTo });
    };

    const formatMoney = (val) => {
        const n = Number(val) || 0;
        return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };

    const formatShortMoney = (val) => {
        const n = Number(val) || 0;
        if (Math.abs(n) >= 1_000_000) {
            return `$${(n / 1_000_000).toFixed(1)}M`;
        }
        if (Math.abs(n) >= 1_000) {
            return `$${(n / 1_000).toFixed(0)}K`;
        }
        return `$${n}`;
    };

    const CustomTooltipCurrency = ({ active, payload, label }) => {
        if (!active || !payload || !payload.length) return null;
        return (
            <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '10px 14px',
                boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
                fontSize: '0.8rem',
                minWidth: '180px'
            }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                    {label}
                </div>
                {payload.map((entry, index) => (
                    <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', margin: '4px 0', alignItems: 'center' }}>
                        <span style={{ color: entry.color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color, display: 'inline-block' }} />
                            {entry.name}:
                        </span>
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>
                            {formatMoney(entry.value)}
                        </span>
                    </div>
                ))}
            </div>
        );
    };

    const getPresetBtnStyle = (isActive) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '6px 12px',
        borderRadius: '7px',
        fontSize: '0.76rem',
        fontWeight: isActive ? 800 : 600,
        border: 'none',
        background: isActive ? '#0284c7' : 'transparent',
        color: isActive ? '#ffffff' : '#475569',
        boxShadow: isActive ? '0 1px 3px rgba(2, 132, 199, 0.3)' : 'none',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        userSelect: 'none'
    });

    const isFilteredPeriod = periodoPreset !== 'todos';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeIn 0.25s ease-out' }}>
            
            {/* ─── BARRA DE CONTROL DE FILTROS TEMPORALES (Este Mes / Mes Anterior / Personalizado / Todos) ─── */}
            <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '12px 16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Filter size={15} style={{ color: '#0284c7' }} /> Período:
                        </span>

                        {/* Botones de Presets */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                            <button
                                type="button"
                                onClick={() => handlePresetChange('este_mes')}
                                style={getPresetBtnStyle(periodoPreset === 'este_mes')}
                            >
                                <Calendar size={13} /> Este Mes
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePresetChange('mes_anterior')}
                                style={getPresetBtnStyle(periodoPreset === 'mes_anterior')}
                            >
                                <RotateCcw size={13} /> Mes Anterior
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePresetChange('todos')}
                                style={getPresetBtnStyle(periodoPreset === 'todos')}
                            >
                                <Activity size={13} /> Todo el Histórico
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePresetChange('personalizado')}
                                style={getPresetBtnStyle(periodoPreset === 'personalizado')}
                            >
                                <Filter size={13} /> Personalizado
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {data?.periodo?.label && (
                            <span style={{
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                color: '#0369a1',
                                background: '#e0f2fe',
                                border: '1px solid #bae6fd',
                                padding: '4px 10px',
                                borderRadius: '7px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}>
                                <ShieldCheck size={13} style={{ color: '#0284c7' }} />
                                {data.periodo.label}
                            </span>
                        )}

                        <button
                            type="button"
                            onClick={() => loadData()}
                            disabled={loading}
                            title="Recalcular métricas del período"
                            style={{
                                border: '1px solid #cbd5e1',
                                background: '#ffffff',
                                borderRadius: '7px',
                                padding: '5px 8px',
                                cursor: 'pointer',
                                color: '#475569',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                transition: 'all 0.15s'
                            }}
                        >
                            <RefreshCw size={13} className={loading ? 'rag-spin' : ''} />
                            <span style={{ display: 'inline-block' }}>{loading ? 'Calculando...' : 'Actualizar'}</span>
                        </button>
                    </div>
                </div>

                {/* Sub-barra cuando está seleccionado "Personalizado" */}
                {periodoPreset === 'personalizado' && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        paddingTop: '10px',
                        borderTop: '1px solid #f1f5f9',
                        flexWrap: 'wrap'
                    }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>Definir fechas:</span>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Desde:</span>
                            <input
                                type="date"
                                value={customFrom}
                                onChange={(e) => setCustomFrom(e.target.value)}
                                style={{
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    color: '#0f172a',
                                    outline: 'none',
                                    background: '#ffffff'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Hasta:</span>
                            <input
                                type="date"
                                value={customTo}
                                onChange={(e) => setCustomTo(e.target.value)}
                                style={{
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    color: '#0f172a',
                                    outline: 'none',
                                    background: '#ffffff'
                                }}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={handleApplyCustomRange}
                            disabled={loading}
                            style={{
                                background: '#0284c7',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '5px 14px',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'background 0.15s'
                            }}
                        >
                            Aplicar Filtro
                        </button>
                    </div>
                )}
            </div>

            {loading && !data ? (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '60px 20px',
                    color: '#64748b'
                }}>
                    <RefreshCw size={28} className="rag-spin" style={{ color: '#0284c7', marginBottom: '12px' }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Calculando métricas del período...</span>
                </div>
            ) : !data ? null : (
                <>
                    {/* ─── FILA 1: KPIs EJECUTIVOS ─── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                        {/* 1. Total Deuda Gestionada */}
                        <div style={cardStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <span style={labelStyle}>
                                        {isFilteredPeriod ? 'Deuda Abordada en Período' : 'Total Deuda Gestionada'}
                                    </span>
                                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1e5fa6', margin: '4px 0 2px' }}>
                                        {formatMoney(data.totalDeudaGestionada)}
                                    </div>
                                </div>
                                <div style={{ width: 36, height: 36, borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                                    <DollarSign size={20} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: '#64748b', marginTop: '6px' }}>
                                <span style={{ fontWeight: 700, color: '#2563eb', background: '#dbeafe', padding: '1px 6px', borderRadius: '6px' }}>
                                    {data.porcentajeGestionado}%
                                </span>
                                <span>{data.countGestionados} de {data.totalPacientes} pacientes gestionados</span>
                            </div>
                        </div>

                        {/* 2. Total Deuda Cobrada */}
                        <div style={{ ...cardStyle, borderColor: '#bbf7d0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <span style={labelStyle}>
                                        {isFilteredPeriod ? 'Deuda Cobrada en Período' : 'Deuda Cobrada Efectiva'}
                                    </span>
                                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#16a34a', margin: '4px 0 2px' }}>
                                        {formatMoney(data.totalDeudaCobrada)}
                                    </div>
                                </div>
                                <div style={{ width: 36, height: 36, borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                                    <CheckCircle2 size={20} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: '#15803d', marginTop: '6px' }}>
                                <ArrowUpRight size={14} />
                                <span>{isFilteredPeriod ? 'Recaudado durante el período seleccionado' : 'Ingreso total recuperado al Sanatorio'}</span>
                            </div>
                        </div>

                        {/* 3. Deuda Activa Pendiente */}
                        <div style={cardStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <span style={labelStyle}>Deuda Activa Pendiente</span>
                                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#d97706', margin: '4px 0 2px' }}>
                                        {formatMoney(data.totalDeudaActiva)}
                                    </div>
                                </div>
                                <div style={{ width: 36, height: 36, borderRadius: '10px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
                                    <Activity size={20} />
                                </div>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '6px' }}>
                                <span>{data.deudoresActivos} pacientes con saldo por cobrar</span>
                            </div>
                        </div>

                        {/* 4. Efectividad de Cobranza sobre Gestión */}
                        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <span style={labelStyle}>
                                        {isFilteredPeriod ? 'Efectividad del Período' : 'Efectividad de Recupero'}
                                    </span>
                                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', margin: '4px 0 2px' }}>
                                        {data.tasaRecuperacionGestionada}%
                                    </div>
                                </div>
                                <div style={{ width: 36, height: 36, borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                                    <TrendingUp size={20} />
                                </div>
                            </div>
                            <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(100, data.tasaRecuperacionGestionada)}%`, height: '100%', background: '#16a34a', borderRadius: 4 }} />
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                                {isFilteredPeriod ? 'Cobrado vs. gestionado en este rango' : 'Deuda cobrada sobre total gestionado'}
                            </div>
                        </div>
                    </div>

                    {/* ─── FILA 2: GRÁFICOS 1 & 2 (Mes a mes: Cobrada vs Gestionada & Evolución Deuda Total) ─── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '20px' }}>
                        {/* GRÁFICO 1: Barras Mes a Mes (Deuda Cobrada vs Deuda Gestionada) */}
                        <div style={chartContainerStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <div>
                                    <h3 style={chartTitleStyle}>
                                        <Calendar size={16} color="#2563eb" />
                                        Deuda Gestionada vs. Deuda Cobrada (Mes a Mes)
                                    </h3>
                                    <span style={chartSubStyle}>
                                        Comparativa mensual de montos abordados en gestión frente a dinero efectivamente cobrado
                                    </span>
                                </div>
                            </div>

                            <div style={{ width: '100%', height: 280 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.barrasMesAMes} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="mes" stroke="#94a3b8" fontSize={11} tickLine={false} />
                                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={formatShortMoney} />
                                        <RechartsTooltip content={<CustomTooltipCurrency />} />
                                        <Legend
                                            verticalAlign="top"
                                            align="right"
                                            iconType="circle"
                                            wrapperStyle={{ fontSize: '0.76rem', paddingBottom: '10px' }}
                                        />
                                        <Bar
                                            name="Deuda Gestionada"
                                            dataKey="deudaGestionada"
                                            radius={[5, 5, 0, 0]}
                                            maxBarSize={38}
                                        >
                                            {data.barrasMesAMes.map((entry, index) => (
                                                <Cell
                                                    key={`cell-gest-${index}`}
                                                    fill={entry.inPeriod ? '#2563eb' : '#94a3b8'}
                                                    opacity={entry.inPeriod ? 1 : 0.35}
                                                />
                                            ))}
                                        </Bar>
                                        <Bar
                                            name="Deuda Cobrada"
                                            dataKey="deudaCobrada"
                                            radius={[5, 5, 0, 0]}
                                            maxBarSize={38}
                                        >
                                            {data.barrasMesAMes.map((entry, index) => (
                                                <Cell
                                                    key={`cell-cobr-${index}`}
                                                    fill={entry.inPeriod ? '#16a34a' : '#86efac'}
                                                    opacity={entry.inPeriod ? 1 : 0.35}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* GRÁFICO 2: Línea / Área de Evolución Temporal de la Deuda Total */}
                        <div style={chartContainerStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <div>
                                    <h3 style={chartTitleStyle}>
                                        <TrendingUp size={16} color="#0284c7" />
                                        Evolución Mes a Mes de la Deuda Total
                                    </h3>
                                    <span style={chartSubStyle}>Tendencia temporal del stock de pasivo acumulado a lo largo de los meses</span>
                                </div>
                            </div>

                            <div style={{ width: '100%', height: 280 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={data.evolucionDeudaTotal} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                        <defs>
                                            <linearGradient id="deudaTotalGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#0284c7" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="mes" stroke="#94a3b8" fontSize={11} tickLine={false} />
                                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={formatShortMoney} />
                                        <RechartsTooltip content={<CustomTooltipCurrency />} />
                                        <Legend
                                            verticalAlign="top"
                                            align="right"
                                            iconType="circle"
                                            wrapperStyle={{ fontSize: '0.76rem', paddingBottom: '10px' }}
                                        />
                                        <Area
                                            type="monotone"
                                            name="Deuda Total Acumulada"
                                            dataKey="deudaTotal"
                                            stroke="#0284c7"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#deudaTotalGrad)"
                                            dot={{ r: 4, fill: '#0284c7', strokeWidth: 2, stroke: '#ffffff' }}
                                            activeDot={{ r: 6, fill: '#0369a1' }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* ─── FILA 3: GRÁFICO 3 (Pacientes con Mayor Deuda) ─── */}
                    <div style={chartContainerStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                            <div>
                                <h3 style={chartTitleStyle}>
                                    <Users size={16} color="#d97706" />
                                    Pacientes con Mayor Deuda (Top Deudores Activos)
                                </h3>
                                <span style={chartSubStyle}>Concentración de mayor volumen de deuda activa — Clic en una fila o barra para abrir la ficha de gestión</span>
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius: '8px' }}>
                                Top {data.topDeudores.length} Pacientes
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(320px, 1.2fr)', gap: '20px', alignItems: 'center' }}>
                            {/* Gráfico de barras horizontal */}
                            <div style={{ width: '100%', height: 340 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        layout="vertical"
                                        data={data.topDeudores}
                                        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis type="number" stroke="#94a3b8" fontSize={11} tickFormatter={formatShortMoney} />
                                        <YAxis
                                            type="category"
                                            dataKey="nombreCorto"
                                            stroke="#475569"
                                            fontSize={10}
                                            width={140}
                                            tickLine={false}
                                        />
                                        <RechartsTooltip content={<CustomTooltipCurrency />} />
                                        <Bar
                                            dataKey="deuda"
                                            name="Deuda Pendiente"
                                            radius={[0, 6, 6, 0]}
                                            onClick={(entry) => onSelectPatient && onSelectPatient(entry)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {data.topDeudores.map((entry, index) => {
                                                const colors = ['#dc2626', '#ea580c', '#d97706', '#0284c7', '#2563eb'];
                                                return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                                            })}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Tabla compacta de ranking */}
                            <div style={{ overflowX: 'auto', maxHeight: '340px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                                            <th style={{ padding: '8px 10px', width: '32px' }}>#</th>
                                            <th style={{ padding: '8px 10px' }}>Paciente / NHC</th>
                                            <th style={{ padding: '8px 10px' }}>Estado</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Deuda Total</th>
                                            <th style={{ padding: '8px 8px', width: '28px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.topDeudores.map((p, idx) => {
                                            const catCfg = CATEGORIAS_DEUDOR[p.categoria] || { label: 'Sin Gestionar', color: '#64748b' };
                                            return (
                                                <tr
                                                    key={p.id}
                                                    onClick={() => onSelectPatient && onSelectPatient(p)}
                                                    style={{
                                                        borderBottom: '1px solid #f1f5f9',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.15s'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <td style={{ padding: '8px 10px', fontWeight: 800, color: idx < 3 ? '#d97706' : '#94a3b8' }}>
                                                        {idx + 1}
                                                    </td>
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{p.nombre}</div>
                                                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>NHC: {p.nhc} · {p.obraSocial}</div>
                                                    </td>
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <span style={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: 700,
                                                            padding: '2px 8px',
                                                            borderRadius: '6px',
                                                            background: `${catCfg.color}15`,
                                                            color: catCfg.color,
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}>
                                                            {catCfg.label}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#b91c1c' }}>
                                                        {formatMoney(p.deuda)}
                                                    </td>
                                                    <td style={{ padding: '8px 8px', textAlign: 'center', color: '#94a3b8' }}>
                                                        <ChevronRight size={14} />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Estilos Clínicos QOAG ───
const cardStyle = {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '16px 18px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
};

const labelStyle = {
    fontSize: '0.74rem',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
};

const chartContainerStyle = {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '18px 20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
};

const chartTitleStyle = {
    fontSize: '0.95rem',
    fontWeight: 800,
    color: '#0f172a',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
};

const chartSubStyle = {
    fontSize: '0.74rem',
    color: '#64748b',
    marginTop: '3px',
    display: 'block'
};
