import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Activity, Users, Clock, AlertTriangle, ArrowRightCircle, Loader2 } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6366F1'];

export default function UciIndicatorsPanel({ dateFilter }) {
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState(null);
    const [procedenciaData, setProcedenciaData] = useState([]);
    const [motivoAltaData, setMotivoAltaData] = useState([]);

    useEffect(() => {
        fetchUciData();
    }, [dateFilter]); // Recargar cuando cambie el filtro de fecha

    const fetchUciData = async () => {
        setLoading(true);
        try {
            // Aplicar filtros de fecha si existen (simplificado por ahora, se podría usar dateFilter.from / .to)
            let query = supabase.from('calidad_uci_admisiones').select('*');
            
            // Para fines prácticos, traemos todos y filtramos en memoria para calcular los cruces
            const { data, error } = await query;
            if (error) throw error;

            if (data) {
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

        // 1. Tasa de Mortalidad
        const fallecidos = data.filter(d => d.motivo_de_alta === 'Defunción').length;
        const mortalityRate = total > 0 ? ((fallecidos / total) * 100).toFixed(1) : 0;

        // 2. ALOS (Average Length of Stay)
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

        // 3. Tasa de Derivación Externa
        const traslados = data.filter(d => 
            d.motivo_de_alta === 'Traslado a Otro Hospital' || 
            d.motivo_de_alta === 'Traslado a Otro Sanatorio/Clinica'
        ).length;
        const transferRate = total > 0 ? ((traslados / total) * 100).toFixed(1) : 0;

        setMetrics({
            total,
            mortalityRate,
            alos,
            transferRate
        });

        // 4. Agrupación por Procedencia (Top 5)
        const procCount = {};
        data.forEach(d => {
            const p = d.procedencia || 'Sin Datos';
            procCount[p] = (procCount[p] || 0) + 1;
        });
        const procArray = Object.keys(procCount).map(k => ({ name: k, value: procCount[k] }));
        procArray.sort((a, b) => b.value - a.value);
        setProcedenciaData(procArray.slice(0, 6)); // Top 6

        // 5. Agrupación por Motivo de Alta
        const motivoCount = {};
        data.forEach(d => {
            const m = d.motivo_de_alta || 'En Curso / Sin Datos';
            motivoCount[m] = (motivoCount[m] || 0) + 1;
        });
        const motivoArray = Object.keys(motivoCount).map(k => ({ name: k, value: motivoCount[k] }));
        motivoArray.sort((a, b) => b.value - a.value);
        setMotivoAltaData(motivoArray);
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column', color: '#64748b' }}>
                <Loader2 className="animate-spin" size={40} style={{ marginBottom: '16px' }} />
                <p>Calculando Indicadores de UCI...</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '24px', backgroundColor: 'var(--neutral-100)', height: '100%', overflowY: 'auto' }}>
            <div style={{ marginBottom: '24px' }}>
                <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.5rem', fontWeight: 700 }}>Tablero de Control: Terapia Intensiva</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b' }}>Indicadores clínicos y estadísticos calculados a partir de los registros de admisión.</p>
            </div>

            {/* Tarjetas KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
                <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>Volumen de Ingresos</h4>
                        <Users size={20} color="#3b82f6" />
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>{metrics?.total}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Pacientes admitidos en el periodo</div>
                </div>

                <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>Promedio de Estancia (ALOS)</h4>
                        <Clock size={20} color="#f59e0b" />
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>{metrics?.alos} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>días</span></div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Tiempo medio de hospitalización</div>
                </div>

                <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>Mortalidad Cruda</h4>
                        <AlertTriangle size={20} color="#ef4444" />
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>{metrics?.mortalityRate}%</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Porcentaje de defunciones</div>
                </div>

                <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>Tasa de Derivación</h4>
                        <ArrowRightCircle size={20} color="#8b5cf6" />
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>{metrics?.transferRate}%</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Traslados a otros centros</div>
                </div>
            </div>

            {/* Gráficos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 20px', color: '#334155', fontSize: '1rem' }}>Procedencia del Paciente</h3>
                    <div style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={procedenciaData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 11}} />
                                <Tooltip cursor={{fill: '#f1f5f9'}} />
                                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 20px', color: '#334155', fontSize: '1rem' }}>Distribución por Motivo de Alta</h3>
                    <div style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={motivoAltaData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {motivoAltaData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '12px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
