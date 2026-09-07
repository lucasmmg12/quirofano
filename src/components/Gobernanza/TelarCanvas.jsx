import React, { useState, useEffect } from 'react';
import { X, Maximize2, Users, Clock, AlertTriangle, ArrowRightCircle, Loader2 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import TelarDataModal from './TelarDataModal';
import { supabase } from '../../lib/supabase';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6366F1'];

export default function TelarCanvas({ activeIndicators, onRemoveIndicator, dateFilter }) {
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

        setMetrics({
            total,
            mortalityRate,
            alos,
            transferRate,
            procedencia: procArray.slice(0, 6),
            motivoAlta: motivoArray
        });
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
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h4 style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>Volumen de Ingresos</h4>
                            <Users size={20} color="#3b82f6" />
                        </div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a' }}>{metrics.total}</div>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>Pacientes admitidos</div>
                    </div>
                );
            case 'uci_alos':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h4 style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>Promedio de Estancia</h4>
                            <Clock size={20} color="#f59e0b" />
                        </div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a' }}>{metrics.alos} <span style={{ fontSize: '1.2rem', color: '#94a3b8' }}>días</span></div>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>Tiempo medio de hospitalización</div>
                    </div>
                );
            case 'uci_mortalidad':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h4 style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>Mortalidad Cruda</h4>
                            <AlertTriangle size={20} color="#ef4444" />
                        </div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a' }}>{metrics.mortalityRate}%</div>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>Porcentaje de defunciones</div>
                    </div>
                );
            case 'uci_derivacion':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h4 style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>Tasa de Derivación</h4>
                            <ArrowRightCircle size={20} color="#8b5cf6" />
                        </div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a' }}>{metrics.transferRate}%</div>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>Traslados a otros centros</div>
                    </div>
                );
            case 'uci_procedencia':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metrics.procedencia || []} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 11}} />
                            <Tooltip cursor={{fill: '#f1f5f9'}} />
                            <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                );
            case 'uci_motivo_alta':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={metrics.motivoAlta || []}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={90}
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
                );
            default:
                return <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>Visualización no disponible</div>;
        }
    };

    return (
        <div style={{ position: 'relative', minHeight: '100%' }}>
            {activeIndicators.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--neutral-400)', marginTop: '100px' }}>
                    <Maximize2 size={48} strokeWidth={1} style={{ marginBottom: '16px' }} />
                    <h3 style={{ margin: 0, fontWeight: 500, color: 'var(--neutral-500)' }}>El Telar está vacío</h3>
                    <p style={{ fontSize: '0.9rem' }}>Selecciona indicadores desde el catálogo a la izquierda</p>
                </div>
            ) : (
                <div className="telar-grid animate-fade-in">
                    {activeIndicators.map(ind => (
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
                                        title="Quitar del Telar"
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

            {/* Modal de Tabla de Datos */}
            {selectedIndicator && (
                <TelarDataModal 
                    indicator={selectedIndicator} 
                    onClose={() => setSelectedIndicator(null)} 
                    dateFilter={dateFilter}
                />
            )}
        </div>
    );
}
