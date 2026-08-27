/**
 * LiquidacionesMetricasView.jsx
 * Dashboard Analítico y Estadístico de Liquidaciones Médicas — Sanatorio Argentino
 * Métricas consolidadas por Obra Social, por Médico y Desglose Financiero
 */

import React, { useState, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, CartesianGrid
} from 'recharts';
import {
    Users, Building2, DollarSign, Activity, Stethoscope,
    TrendingUp, Award, Search, Filter, ArrowUpRight,
    PieChart as PieIcon, BarChart3, CheckCircle2, FileText,
    Calendar, ArrowRight, ShieldCheck, Tag
} from 'lucide-react';
import { formatCurrency } from '../../utils/guardiaLiquidacionPdf';

const COLORS = [
    '#0D3B66', '#3B82F6', '#10B981', '#7C3AED',
    '#F59E0B', '#EC4899', '#06B6D4', '#64748B'
];

export default function LiquidacionesMetricasView({ data }) {
    const [tabView, setTabView] = useState('obras_sociales'); // 'obras_sociales' | 'medicos' | 'financiero'
    const [searchOS, setSearchOS] = useState('');
    const [searchMed, setSearchMed] = useState('');
    const [sortMedBy, setSortMedBy] = useState('atenciones'); // 'atenciones' | 'monto'

    const analytics = data?.analytics || {};
    const obrasSociales = analytics.metricasObrasSociales || [];
    const prestadores = data?.prestadores || [];

    // Obras sociales filtradas
    const filteredOS = useMemo(() => {
        if (!searchOS.trim()) return obrasSociales;
        const q = searchOS.toLowerCase();
        return obrasSociales.filter(os => os.obraSocial.toLowerCase().includes(q));
    }, [obrasSociales, searchOS]);

    // Médicos ordenados y filtrados
    const filteredMedicos = useMemo(() => {
        let list = [...prestadores];
        if (sortMedBy === 'atenciones') {
            list.sort((a, b) => b.atenciones.length - a.atenciones.length);
        } else {
            list.sort((a, b) => (b.totalGeneralConAdicional || b.totalValor) - (a.totalGeneralConAdicional || a.totalValor));
        }

        if (searchMed.trim()) {
            const q = searchMed.toLowerCase();
            list = list.filter(m => m.nombre.toLowerCase().includes(q) || (m.matricula && m.matricula.toLowerCase().includes(q)));
        }

        return list;
    }, [prestadores, searchMed, sortMedBy]);

    // Datos para gráfico Top 10 Obras Sociales por Atenciones
    const top10OSChartData = useMemo(() => {
        return obrasSociales.slice(0, 10).map(os => ({
            name: os.obraSocial.length > 18 ? os.obraSocial.substring(0, 18) + '...' : os.obraSocial,
            fullName: os.obraSocial,
            atenciones: os.atenciones,
            monto: os.montoBruto,
            pct: os.pctAtenciones
        }));
    }, [obrasSociales]);

    // Datos para gráfico Donut Top 5 OS Facturación + Otros
    const top5OSPieData = useMemo(() => {
        if (obrasSociales.length === 0) return [];
        const top5 = obrasSociales.slice(0, 5);
        const otrosMonto = obrasSociales.slice(5).reduce((acc, os) => acc + os.montoBruto, 0);

        const result = top5.map(os => ({
            name: os.obraSocial.length > 20 ? os.obraSocial.substring(0, 20) + '...' : os.obraSocial,
            value: os.montoBruto,
            pct: os.pctMonto
        }));

        if (otrosMonto > 0) {
            result.push({
                name: `Otras (${obrasSociales.length - 5} O.S.)`,
                value: otrosMonto,
                pct: Number(((otrosMonto / (data.totalFacturadoBrutoGlobal || 1)) * 100).toFixed(2))
            });
        }
        return result;
    }, [obrasSociales, data]);

    // Datos para gráfico Top 10 Médicos con más Guardia
    const top10MedicosChartData = useMemo(() => {
        return prestadores
            .slice()
            .sort((a, b) => b.atenciones.length - a.atenciones.length)
            .slice(0, 10)
            .map(p => {
                const nombreCorto = p.nombre.split(',')[0] || p.nombre;
                return {
                    name: nombreCorto.length > 15 ? nombreCorto.substring(0, 15) + '...' : nombreCorto,
                    fullName: p.nombre,
                    atenciones: p.atenciones.length,
                    honorarios: p.totalHonorariosNeto || 0,
                    adicionales: p.totalMontoAdicional || 0,
                    total: p.totalGeneralConAdicional || p.totalValor || 0
                };
            });
    }, [prestadores]);

    // Datos de Estructura Financiera Global
    const financialPieData = useMemo(() => {
        if (!data) return [];
        const honorarios = data.totalHonorariosNetoGlobal || 0;
        const retencion = data.totalRetencionGlobal || 0;
        const adicionales = data.totalAdicionalesGlobal || 0;

        return [
            { name: `Honorarios Médicos (${data.porcentajeHonorarios || 70}%)`, value: honorarios, color: '#059669' },
            { name: `Retención Sanatorial (${data.porcentajeRetencion || 30}%)`, value: retencion, color: '#DC2626' },
            { name: `Adicionales de Guardia`, value: adicionales, color: '#7C3AED' },
        ];
    }, [data]);

    if (!data) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                No hay datos disponibles para mostrar métricas.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
            {/* Tarjetas Superiores KPI */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '14px'
            }}>
                <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Obras Sociales</span>
                        <Building2 size={18} color="#0D3B66" />
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0D3B66', marginTop: '6px' }}>
                        {analytics.totalObrasSociales || obrasSociales.length}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '3px' }}>
                        Líder: <strong style={{ color: '#0F172A' }}>{obrasSociales[0]?.obraSocial.substring(0, 18) || '—'}</strong> ({obrasSociales[0]?.pctAtenciones || 0}%)
                    </div>
                </div>

                <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Promedio x Médico</span>
                        <Users size={18} color="#3B82F6" />
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
                        {data.promedioAtencionesPorMedico ? Math.round(data.promedioAtencionesPorMedico) : 0} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B' }}>atenc.</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '3px' }}>
                        Entre {data.totalPrestadores} profesionales activos
                    </div>
                </div>

                <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Ticket Promedio</span>
                        <TrendingUp size={18} color="#059669" />
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#059669', marginTop: '6px' }}>
                        {formatCurrency(data.ticketPromedioGlobal)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '3px' }}>
                        Por consulta médica de guardia
                    </div>
                </div>

                <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Consultas con Adicional</span>
                        <Tag size={18} color="#7C3AED" />
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7C3AED', marginTop: '6px' }}>
                        {data.totalCantidadAdicionalesGlobal || 0}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '3px' }}>
                        Total adicional: <strong style={{ color: '#7C3AED' }}>{formatCurrency(data.totalAdicionalesGlobal)}</strong>
                    </div>
                </div>
            </div>

            {/* Selector de Vistas de Métricas */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                padding: '12px 20px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', background: '#F1F5F9', padding: '4px', borderRadius: '10px', gap: '4px' }}>
                    <button
                        onClick={() => setTabView('obras_sociales')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            background: tabView === 'obras_sociales' ? '#FFFFFF' : 'transparent',
                            color: tabView === 'obras_sociales' ? '#0D3B66' : '#64748B',
                            fontWeight: tabView === 'obras_sociales' ? 700 : 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            boxShadow: tabView === 'obras_sociales' ? '0 1px 4px rgba(0,0,0,0.05)' : 'none'
                        }}
                    >
                        <Building2 size={14} /> Obras Sociales ({obrasSociales.length})
                    </button>
                    <button
                        onClick={() => setTabView('medicos')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            background: tabView === 'medicos' ? '#FFFFFF' : 'transparent',
                            color: tabView === 'medicos' ? '#0D3B66' : '#64748B',
                            fontWeight: tabView === 'medicos' ? 700 : 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            boxShadow: tabView === 'medicos' ? '0 1px 4px rgba(0,0,0,0.05)' : 'none'
                        }}
                    >
                        <Users size={14} /> Ranking Médicos ({prestadores.length})
                    </button>
                    <button
                        onClick={() => setTabView('financiero')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            background: tabView === 'financiero' ? '#FFFFFF' : 'transparent',
                            color: tabView === 'financiero' ? '#0D3B66' : '#64748B',
                            fontWeight: tabView === 'financiero' ? 700 : 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            boxShadow: tabView === 'financiero' ? '0 1px 4px rgba(0,0,0,0.05)' : 'none'
                        }}
                    >
                        <DollarSign size={14} /> Estructura Financiera
                    </button>
                </div>

                <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
                    Período: <strong style={{ color: '#0F172A' }}>{data.periodo}</strong> · Liq. N° <strong style={{ color: '#0F172A' }}>{data.numeroLiquidacion}</strong>
                </div>
            </div>

            {/* SECCIÓN 1: MÉTRICAS DE OBRAS SOCIALES */}
            {tabView === 'obras_sociales' && (
                <>
                    {/* Gráficos de Obras Sociales */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                        {/* BarChart Top 10 OS */}
                        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                            <h4 style={{ margin: '0 0 14px 0', fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <BarChart3 size={16} color="#0D3B66" /> Top 10 Obras Sociales por Atenciones
                            </h4>
                            <div style={{ width: '100%', height: '280px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={top10OSChartData} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                                        <XAxis type="number" tick={{ fontSize: 10, fill: '#64748B' }} />
                                        <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10, fill: '#334155', fontWeight: 600 }} />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const d = payload[0].payload;
                                                    return (
                                                        <div style={{ background: '#0F172A', color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '0.75rem' }}>
                                                            <div style={{ fontWeight: 700, marginBottom: '2px' }}>{d.fullName}</div>
                                                            <div>Atenciones: <strong>{d.atenciones} ({d.pct}%)</strong></div>
                                                            <div>Facturado: <strong>{formatCurrency(d.monto)}</strong></div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        <Bar dataKey="atenciones" fill="#0D3B66" radius={[0, 6, 6, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* PieChart Top 5 OS + Otros */}
                        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                            <h4 style={{ margin: '0 0 14px 0', fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <PieIcon size={16} color="#3B82F6" /> Participación en Facturación Bruta (%)
                            </h4>
                            <div style={{ width: '100%', height: '280px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={top5OSPieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={95}
                                            paddingAngle={3}
                                            dataKey="value"
                                        >
                                            {top5OSPieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value) => [formatCurrency(value), 'Facturación']}
                                            contentStyle={{ background: '#0F172A', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '0.75rem' }}
                                        />
                                        <Legend
                                            layout="horizontal"
                                            verticalAlign="bottom"
                                            align="center"
                                            wrapperStyle={{ fontSize: '0.68rem', paddingTop: '10px' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Tabla Completa de Obras Sociales */}
                    <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                                Desglose Completo por Obra Social
                            </h4>
                            <div style={{ position: 'relative', width: '280px' }}>
                                <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar obra social..."
                                    value={searchOS}
                                    onChange={(e) => setSearchOS(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '6px 10px 6px 32px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.78rem',
                                        fontFamily: "'Montserrat', sans-serif",
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: '#334155', width: '40px' }}>#</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: '#334155' }}>Obra Social / Cobertura</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#0D3B66', width: '90px' }}>Atenciones</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#64748B', width: '80px' }}>% Total</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#334155', width: '130px' }}>Fact. Bruta</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#059669', width: '130px' }}>Honorarios ({data.porcentajeHonorarios || 70}%)</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#7C3AED', width: '120px' }}>Adicional ($)</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#334155', width: '90px' }}>Médicos</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredOS.map((os, idx) => (
                                    <tr key={os.obraSocial} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td style={{ padding: '10px 14px', color: '#94A3B8', fontWeight: 700 }}>{idx + 1}</td>
                                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                                            {os.obraSocial}
                                            {os.montoAdicional > 0 && (
                                                <span style={{ marginLeft: '8px', fontSize: '0.65rem', background: '#EDE9FE', color: '#6D28D9', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                                    ADICIONAL
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#0D3B66' }}>
                                            {os.atenciones}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'center', color: '#64748B', fontWeight: 600 }}>
                                            {os.pctAtenciones}%
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>
                                            {formatCurrency(os.montoBruto)}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                                            {formatCurrency(os.montoNeto)}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#7C3AED' }}>
                                            {os.montoAdicional > 0 ? formatCurrency(os.montoAdicional) : '—'}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                                            {os.cantMedicos}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* SECCIÓN 2: RANKING Y MÉTRICAS DE MÉDICOS */}
            {tabView === 'medicos' && (
                <>
                    {/* Gráfico Top 10 Médicos */}
                    <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                        <h4 style={{ margin: '0 0 14px 0', fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Users size={16} color="#0D3B66" /> Top 10 Médicos con Mayor Volumen de Atenciones en Guardia
                        </h4>
                        <div style={{ width: '100%', height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={top10MedicosChartData} margin={{ left: 10, right: 20, top: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#334155', fontWeight: 600 }} angle={-15} textAnchor="end" />
                                    <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const d = payload[0].payload;
                                                return (
                                                    <div style={{ background: '#0F172A', color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '0.75rem' }}>
                                                        <div style={{ fontWeight: 700, marginBottom: '2px' }}>{d.fullName}</div>
                                                        <div>Consultas: <strong>{d.atenciones}</strong></div>
                                                        <div>Honorarios (70%): <strong>{formatCurrency(d.honorarios)}</strong></div>
                                                        <div>Adicionales: <strong>{formatCurrency(d.adicionales)}</strong></div>
                                                        <div style={{ color: '#60A5FA', marginTop: '2px' }}>Total: <strong>{formatCurrency(d.total)}</strong></div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="atenciones" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Tabla de Desempeño por Profesional */}
                    <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                                    Ranking de Desempeño Médico
                                </h4>
                                <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', padding: '2px', borderRadius: '6px' }}>
                                    <button
                                        onClick={() => setSortMedBy('atenciones')}
                                        style={{
                                            padding: '3px 8px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            border: 'none',
                                            borderRadius: '4px',
                                            background: sortMedBy === 'atenciones' ? '#0D3B66' : 'transparent',
                                            color: sortMedBy === 'atenciones' ? '#fff' : '#64748B',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Por Atenciones
                                    </button>
                                    <button
                                        onClick={() => setSortMedBy('monto')}
                                        style={{
                                            padding: '3px 8px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            border: 'none',
                                            borderRadius: '4px',
                                            background: sortMedBy === 'monto' ? '#0D3B66' : 'transparent',
                                            color: sortMedBy === 'monto' ? '#fff' : '#64748B',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Por Monto
                                    </button>
                                </div>
                            </div>

                            <div style={{ position: 'relative', width: '280px' }}>
                                <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar profesional..."
                                    value={searchMed}
                                    onChange={(e) => setSearchMed(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '6px 10px 6px 32px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.78rem',
                                        fontFamily: "'Montserrat', sans-serif",
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
                                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#334155', width: '50px' }}>Rank</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: '#334155' }}>Profesional Médico</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#334155', width: '100px' }}>Matrícula</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#0D3B66', width: '90px' }}>Atenciones</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#64748B', width: '120px' }}>Fact. Bruta</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#059669', width: '120px' }}>Honorarios (70%)</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#7C3AED', width: '110px' }}>Adicional ($)</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#0D3B66', width: '130px' }}>Total Liquidado</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#64748B', width: '110px' }}>Ticket Prom.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredMedicos.map((m, idx) => (
                                    <tr key={m.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: idx < 3 ? '#D97706' : '#94A3B8' }}>
                                            {idx + 1}
                                        </td>
                                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                                            {m.nombre}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'center', color: '#64748B', fontWeight: 600 }}>
                                            {m.matricula || '—'}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#0D3B66' }}>
                                            {m.atenciones.length}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#64748B' }}>
                                            {formatCurrency(m.totalImporteBruto || m.totalImporte)}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                                            {formatCurrency(m.totalHonorariosNeto)}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#7C3AED' }}>
                                            {m.totalMontoAdicional > 0 ? formatCurrency(m.totalMontoAdicional) : '—'}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 900, color: '#0D3B66' }}>
                                            {formatCurrency(m.totalGeneralConAdicional || m.totalValor)}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748B' }}>
                                            {formatCurrency(m.ticketPromedio)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* SECCIÓN 3: ESTRUCTURA FINANCIERA */}
            {tabView === 'financiero' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                        <h4 style={{ margin: '0 0 14px 0', fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <PieIcon size={16} color="#059669" /> Composición del Flujo de Liquidación
                        </h4>
                        <div style={{ width: '100%', height: '280px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={financialPieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={95}
                                        paddingAngle={3}
                                        dataKey="value"
                                    >
                                        {financialPieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value) => [formatCurrency(value), 'Monto']}
                                        contentStyle={{ background: '#0F172A', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '0.75rem' }}
                                    />
                                    <Legend
                                        layout="horizontal"
                                        verticalAlign="bottom"
                                        align="center"
                                        wrapperStyle={{ fontSize: '0.72rem', paddingTop: '10px' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <h4 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                            Resumen Financiero Consolidado
                        </h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                                <span style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>Facturación Bruta Base (100%):</span>
                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>{formatCurrency(data.totalFacturadoBrutoGlobal || data.totalFacturadoGlobal)}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                                <span style={{ fontSize: '0.82rem', color: '#DC2626', fontWeight: 600 }}>Retención Sanatorial (-{data.porcentajeRetencion || 30}%):</span>
                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#DC2626' }}>-{formatCurrency(data.totalRetencionGlobal)}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                                <span style={{ fontSize: '0.82rem', color: '#059669', fontWeight: 700 }}>Honorarios Médicos Netos ({data.porcentajeHonorarios || 70}%):</span>
                                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#059669' }}>{formatCurrency(data.totalHonorariosNetoGlobal)}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                                <span style={{ fontSize: '0.82rem', color: '#7C3AED', fontWeight: 700 }}>Adicionales Guardia ({data.totalCantidadAdicionalesGlobal} consultas):</span>
                                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#7C3AED' }}>+{formatCurrency(data.totalAdicionalesGlobal)}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', marginTop: '6px' }}>
                                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0D3B66' }}>GRAN TOTAL A LIQUIDAR:</span>
                                <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0D3B66' }}>{formatCurrency(data.granTotalGlobal)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
