import React, { useMemo } from 'react';
import {
  LineChart, Line, ScatterChart, Scatter, ZAxis, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar
} from 'recharts';

// Paleta PRO-MAX
const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#0ea5e9'];

// Helpers
function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChartsPanel({ metricas, config }) {
    
    // 1. Line Chart: Llegadas por Hora
    const arrivalsByHour = useMemo(() => {
        if (!metricas?.turnosRaw) return [];
        const hours = {};
        metricas.turnosRaw.forEach(t => {
            const h = new Date(t.created_at).getHours();
            const label = `${h}:00`;
            hours[label] = (hours[label] || 0) + 1;
        });
        return Object.entries(hours).map(([hour, count]) => ({ hour, turnos: count })).sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
    }, [metricas]);

    // 2. Scatter Plot: Espera vs Atención
    const scatterData = useMemo(() => {
        if (!metricas?.turnosRaw || !metricas?.atencionesRaw) return [];
        const data = [];
        metricas.turnosRaw.filter(t => t.estado === 'atendido' && t.llamado_at && t.finalizado_at).forEach(t => {
            const espera = Math.round((new Date(t.llamado_at) - new Date(t.created_at)) / 60000);
            const atencion = Math.round((new Date(t.finalizado_at) - new Date(t.llamado_at)) / 60000);
            if (espera >= 0 && atencion >= 0 && atencion < 120 && espera < 120) {
                data.push({
                    nombre: t.numero_turno,
                    espera,
                    atencion,
                    tramite: config.find(c => c.tipo_tramite === t.tipo_tramite)?.label || t.tipo_tramite
                });
            }
        });
        return data;
    }, [metricas, config]);

    // 3. Pie Chart: Proporción de Trámites
    const pieData = useMemo(() => {
        if (!metricas?.porTipo) return [];
        return Object.entries(metricas.porTipo).map(([tipo, data]) => {
            const label = config.find(c => c.tipo_tramite === tipo)?.label || tipo;
            return { name: label, value: data.total };
        }).sort((a,b) => b.value - a.value);
    }, [metricas, config]);

    // 4. Gauss Distribution: Tiempos de Espera
    const gaussData = useMemo(() => {
        if (!metricas?.turnosRaw) return [];
        const esperas = metricas.turnosRaw.filter(t => t.llamado_at).map(t => 
            Math.round((new Date(t.llamado_at) - new Date(t.created_at)) / 60000)
        );
        if (esperas.length === 0) return [];

        const maxEspera = Math.max(...esperas, 30);
        // Agrupar en rangos de 5 mins
        const bins = {};
        for(let i=0; i<=maxEspera; i+=5) bins[i] = 0;
        
        esperas.forEach(e => {
            const bin = Math.floor(e / 5) * 5;
            if (bins[bin] !== undefined) bins[bin]++;
        });

        return Object.entries(bins).map(([min, count]) => ({
            rango: `${min}-${parseInt(min)+4}m`,
            cantidad: count
        }));
    }, [metricas]);

    const s = {
        card: {
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(16px)',
            borderRadius: '24px',
            border: '1px solid rgba(255,255,255,0.4)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.05)',
            padding: '24px',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden', position: 'relative'
        },
        title: {
            fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '16px', letterSpacing: '-0.02em'
        }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', position: 'relative', zIndex: 10 }}>
            {/* 1. Demand Trend */}
            <div style={s.card}>
                <h3 style={s.title}>📈 Demanda por Hora</h3>
                <div style={{ height: 250, width: '100%' }}>
                    <ResponsiveContainer>
                        <LineChart data={arrivalsByHour}>
                            <defs>
                                <linearGradient id="colorTurnos" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Line type="monotone" dataKey="turnos" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 2. Wait vs Attention */}
            <div style={s.card}>
                <h3 style={s.title}>🎯 Dispersión: Espera vs. Atención (min)</h3>
                <div style={{ height: 250, width: '100%' }}>
                    <ResponsiveContainer>
                        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                            <XAxis type="number" dataKey="espera" name="Espera" unit="m" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                            <YAxis type="number" dataKey="atencion" name="Atención" unit="m" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                            <ZAxis type="category" dataKey="tramite" name="Trámite" />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Scatter name="Turnos" data={scatterData} fill="#8b5cf6" opacity={0.6} />
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 3. Distribution Gauss */}
            <div style={s.card}>
                <h3 style={s.title}>📊 Distribución de Espera (Campana)</h3>
                <div style={{ height: 250, width: '100%' }}>
                    <ResponsiveContainer>
                        <ComposedChart data={gaussData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis dataKey="rango" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Bar dataKey="cantidad" barSize={30} fill="#f43f5e" radius={[6, 6, 0, 0]} />
                            <Line type="monotone" dataKey="cantidad" stroke="#ec4899" strokeWidth={3} dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 4. Trámites Pie */}
            <div style={s.card}>
                <h3 style={s.title}>🍩 Demanda por Trámite</h3>
                <div style={{ height: 250, width: '100%' }}>
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
