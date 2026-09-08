import React, { useState, useEffect } from 'react';
import { X, Maximize2, Users, Clock, AlertTriangle, ArrowRightCircle, Loader2 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import TelarDataModal from './TelarDataModal';
import { supabase } from '../../lib/supabase';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6366F1'];

export default function TelarCanvas({ activeIndicators, onRemoveIndicator, dateFilter, onMetricsUpdate }) {
    const [selectedIndicator, setSelectedIndicator] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uciData, setUciData] = useState([]);
    const [metrics, setMetrics] = useState({});

    useEffect(() => {
        // Solo obtener los datos de UCI si hay algún indicador activo (optimización)
        if (activeIndicators.length > 0) {
            fetchUciData();
        }
    }, [activeIndicators, dateFilter]);

    const fetchUciData = async () => {
        setLoading(true);
        try {
            // Se puede agregar lógica de filtros por fecha aquí utilizando dateFilter
            const { data, error } = await supabase.from('calidad_uci_admisiones').select('*');
            if (error) throw error;
            if (data) {
                setUciData(data);
                calculateMetrics(data);
            }
        } catch (err) {
            console.error('Error fetching UCI data:', err);
        } finally {
            setLoading(false);
        }
    };

    const calculateMetrics = (data) => {
        const total = data.length;

        // Mortalidad
        const fallecidos = data.filter(d => d.motivo_de_alta === 'Defunción').length;
        const mortalityRate = total > 0 ? ((fallecidos / total) * 100).toFixed(1) : 0;

        // ALOS
        let totalDays = 0;
        let validAlosCount = 0;
        data.forEach(d => {
            if (d.fecha_ingreso && d.fecha_alta) {
                const start = new Date(d.fecha_ingreso);
                const end = new Date(d.fecha_alta);
                const diffTime = Math.abs(end - start);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                totalDays += diffDays;
                validAlosCount++;
            }
        });
        const alos = validAlosCount > 0 ? (totalDays / validAlosCount).toFixed(1) : 0;

        // Derivaciones
        const traslados = data.filter(d => 
            d.motivo_de_alta === 'Traslado a Otro Hospital' || 
            d.motivo_de_alta === 'Traslado a Otro Sanatorio/Clinica'
        ).length;
        const transferRate = total > 0 ? ((traslados / total) * 100).toFixed(1) : 0;

        // Procedencia
        const procCount = {};
        data.forEach(d => {
            const p = d.procedencia || 'Sin Datos';
            procCount[p] = (procCount[p] || 0) + 1;
        });
        const procArray = Object.keys(procCount).map(k => ({ name: k, value: procCount[k] }));
        procArray.sort((a, b) => b.value - a.value);

        // Motivos de Alta
        const motivoCount = {};
        data.forEach(d => {
            const m = d.motivo_de_alta || 'En Curso / Sin Datos';
            motivoCount[m] = (motivoCount[m] || 0) + 1;
        });
        const motivoArray = Object.keys(motivoCount).map(k => ({ name: k, value: motivoCount[k] }));
        motivoArray.sort((a, b) => b.value - a.value);

        const calculatedMetrics = {
            total,
            mortalityRate,
            alos,
            transferRate,
            procedencia: procArray.slice(0, 6),
            motivoAlta: motivoArray
        };
        
        setMetrics(calculatedMetrics);
        if (onMetricsUpdate) {
            onMetricsUpdate({ uci: calculatedMetrics });
        }
    };

    // Componente interno para renderizar el gráfico o KPI correcto según el indicador
    const renderIndicatorContent = (ind) => {
        if (loading) {
            return (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#64748b' }}>
                    <Loader2 className="animate-spin" size={24} />
                </div>
            );
        }

        switch(ind.id) {
            case 'uci_volumen':
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', height: '100%' }}>
                        <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '10px', display: 'flex' }}>
                            <Users size={24} color="#3b82f6" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <h4 style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>Volumen de Ingresos</h4>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>{metrics.total}</div>
                        </div>
                    </div>
                );
            case 'uci_alos':
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', height: '100%' }}>
                        <div style={{ background: '#fffbeb', padding: '10px', borderRadius: '10px', display: 'flex' }}>
                            <Clock size={24} color="#f59e0b" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <h4 style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>Promedio de Estancia</h4>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>{metrics.alos} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>días</span></div>
                        </div>
                    </div>
                );
            case 'uci_mortalidad':
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', height: '100%' }}>
                        <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '10px', display: 'flex' }}>
                            <AlertTriangle size={24} color="#ef4444" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <h4 style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>Mortalidad Cruda</h4>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>{metrics.mortalityRate}%</div>
                        </div>
                    </div>
                );
            case 'uci_derivacion':
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', height: '100%' }}>
                        <div style={{ background: '#f5f3ff', padding: '10px', borderRadius: '10px', display: 'flex' }}>
                            <ArrowRightCircle size={24} color="#8b5cf6" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <h4 style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>Tasa de Derivación</h4>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>{metrics.transferRate}%</div>
                        </div>
                    </div>
                );
            case 'uci_procedencia':
                return (
                    <div style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={metrics.procedencia || []} layout="vertical" margin={{ top: 10, right: 25, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 11}} />
                                <Tooltip cursor={{fill: '#f1f5f9'}} />
                                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                );
            case 'uci_motivo_alta':
                return (
                    <div style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
                        <ResponsiveContainer width="100%" height={240}>
                            <PieChart>
                                <Pie
                                    data={metrics.motivoAlta || []}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={85}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {(metrics.motivoAlta || []).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '11px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                );
            default:
                return <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>Visualización no disponible</div>;
        }
    };

    const numericIndicators = activeIndicators.filter(ind => ind.type?.startsWith('kpi_'));
    const chartIndicators = activeIndicators.filter(ind => !ind.type?.startsWith('kpi_'));

    const renderNumericSection = () => {
        if (numericIndicators.length === 0) return null;
        
        // Agrupar por sector
        const bySector = {};
        numericIndicators.forEach(ind => {
            if (!bySector[ind.sector]) bySector[ind.sector] = [];
            bySector[ind.sector].push(ind);
        });

        const kpiColors = {
            'uci_volumen': '#3b82f6',
            'uci_alos': '#f59e0b',
            'uci_mortalidad': '#ef4444',
            'uci_derivacion': '#8b5cf6'
        };

        return Object.keys(bySector).map(sector => (
            <div key={sector} style={{ marginBottom: '32px' }} className="animate-fade-in">
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>
                    <h3 style={{ fontSize: '1.2rem', color: '#1e293b', margin: 0, fontWeight: 700 }}>
                        {sector}
                    </h3>
                    <span style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 500, marginLeft: '8px', borderLeft: '1px solid #cbd5e1', paddingLeft: '8px' }}>
                        Indicadores Clave de Rendimiento
                    </span>
                    <span style={{ marginLeft: 'auto', background: '#EEF2FF', color: '#4F46E5', fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', borderRadius: '12px' }}>
                        {dateFilter.label || dateFilter.type.replace(/_/g, ' ')}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {bySector[sector].map(ind => (
                        <div key={ind.id} style={{ 
                            flex: '1 1 180px', 
                            minWidth: '180px', 
                            background: '#fff', 
                            borderRadius: '12px', 
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                            borderTop: `4px solid ${kpiColors[ind.id] || '#cbd5e1'}`,
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                        className="telar-kpi-card-hover"
                        onClick={() => setSelectedIndicator(ind)}
                        >
                            {/* Acciones Hover (Quitar/Expandir) */}
                            <div className="kpi-actions" style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '4px', zIndex: 10 }}>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setSelectedIndicator(ind); }}
                                    title="Ver Tabla de Datos"
                                    style={{ background: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <Maximize2 size={14} />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onRemoveIndicator(ind.id); }}
                                    title="Quitar del Dashboard"
                                    style={{ background: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                            {/* Contenido KPI */}
                            <div style={{ flex: 1 }}>
                                {renderIndicatorContent(ind)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        ));
    };

    return (
        <div style={{ position: 'relative', minHeight: '100%' }}>
            {activeIndicators.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--neutral-400)', marginTop: '100px' }}>
                    <Maximize2 size={48} strokeWidth={1} style={{ marginBottom: '16px' }} />
                    <h3 style={{ margin: 0, fontWeight: 500, color: 'var(--neutral-500)' }}>El Dashboard está vacío</h3>
                    <p style={{ fontSize: '0.9rem' }}>Selecciona indicadores desde el catálogo a la izquierda</p>
                </div>
            ) : (
                <div className="animate-fade-in">
                    {/* SECCIÓN 1: KPIs Numéricos (estilo Scorecards de Tableau) */}
                    {renderNumericSection()}

                    {/* SECCIÓN 2: Gráficos y Tablas Detalladas */}
                    {chartIndicators.length > 0 && (
                        <div className="telar-grid">
                            {chartIndicators.map(ind => (
                                <div key={ind.id} className="telar-card">
                                    <div className="telar-card__header">
                                        <div>
                                            <div className="telar-card__title">{ind.label}</div>
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                                <span className="telar-card__badge">{ind.sector}</span>
                                                <span className="telar-card__badge" style={{ background: '#EEF2FF', color: '#4F46E5' }}>{dateFilter.label || dateFilter.type.replace(/_/g, ' ')}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button 
                                                onClick={() => setSelectedIndicator(ind)}
                                                title="Ver Tabla de Datos"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: '4px' }}
                                            >
                                                <Maximize2 size={16} />
                                            </button>
                                            <button 
                                                onClick={() => onRemoveIndicator(ind.id)}
                                                title="Quitar del Dashboard"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: '4px' }}
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    <div 
                                        className="telar-card__content"
                                        onClick={() => setSelectedIndicator(ind)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        {renderIndicatorContent(ind)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Modal de Tabla de Datos */}
            {selectedIndicator && (
                <TelarDataModal 
                    indicator={selectedIndicator} 
                    onClose={() => setSelectedIndicator(null)} 
                    dateFilter={dateFilter}
                    rawData={uciData}
                />
            )}
        </div>
    );
}
