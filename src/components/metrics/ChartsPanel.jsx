import React, { useMemo } from 'react';
import {
  LineChart, Line, PieChart, Pie, Cell,
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
    

    const [historial, setHistorial] = React.useState([]);

    React.useEffect(() => {
        import('../../services/turnoService').then(({ fetchTurnosHistoricos }) => {
            fetchTurnosHistoricos(30).then(data => setHistorial(data));
        });
    }, []);

    // 2. Heatmap: Demanda Historica (Dias vs Horas)
    const heatmapData = useMemo(() => {
        if (!historial || historial.length === 0) return null;
        
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']; // Date.getDay() format (0=Sun)
        const hours = Array.from({length: 15}, (_, i) => i + 7); // 7h to 21h

        const matrix = Array(7).fill(0).map(() => Array(24).fill(0));
        let maxCount = 0;

        historial.forEach(t => {
            const d = new Date(t.created_at);
            const day = d.getDay();
            const hour = d.getHours();
            matrix[day][hour]++;
            if (matrix[day][hour] > maxCount) maxCount = matrix[day][hour];
        });

        // Reordenar para que Lunes sea el primero, Domingo el último
        const displayDays = [1, 2, 3, 4, 5, 6, 0]; 
        
        return { matrix, maxCount, displayDays, daysLabels: days, hours };
    }, [historial]);

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

    // 5. Box Performance
    const boxData = useMemo(() => {
        if (!metricas?.atencionesRaw || !metricas?.turnosRaw) return [];
        const boxes = {};
        
        metricas.atencionesRaw.forEach(a => {
            const boxId = a.box_numero || 'Desconocido';
            if (!boxes[boxId]) {
                boxes[boxId] = {
                    box: boxId === 99 ? 'UCI' : `Box ${boxId}`,
                    cantidad: 0,
                    tiempoTotal: 0,
                    tramites: {}
                };
            }
            boxes[boxId].cantidad++;
            
            if (a.hora_inicio && a.hora_fin) {
                boxes[boxId].tiempoTotal += (new Date(a.hora_fin) - new Date(a.hora_inicio)) / 60000;
            }

            // Encontrar el turno para el tipo_tramite
            const turno = metricas.turnosRaw.find(t => t.id === a.turno_id);
            if (turno) {
                const tramiteLabel = config.find(c => c.tipo_tramite === turno.tipo_tramite)?.label || turno.tipo_tramite;
                boxes[boxId].tramites[tramiteLabel] = (boxes[boxId].tramites[tramiteLabel] || 0) + 1;
            }
        });

        return Object.values(boxes).map(b => ({
            box: b.box,
            cantidad: b.cantidad,
            demoraPromedio: b.cantidad > 0 ? Math.round((b.tiempoTotal / b.cantidad) * 10) / 10 : 0,
            tramitePpal: Object.entries(b.tramites).sort((x, y) => y[1] - x[1])[0]?.[0] || 'N/A'
        })).sort((a,b) => b.cantidad - a.cantidad);
    }, [metricas, config]);

    const s = {
        card: {
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            padding: '20px',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden', position: 'relative'
        },
        title: {
            fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '16px', letterSpacing: '-0.02em',
            display: 'flex', alignItems: 'center', gap: '8px'
        }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px', position: 'relative', zIndex: 10 }}>

            {/* 2. Heatmap: Demanda Histórica */}
            <div style={{ ...s.card, gridColumn: '1 / -1' }}>
                <h3 style={s.title}>🕒 Mapa de Calor: Demanda Histórica (30 días)</h3>
                <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '10px' }}>
                    {heatmapData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '600px' }}>
                            {/* Header (Horas) */}
                            <div style={{ display: 'flex', marginLeft: '40px' }}>
                                {heatmapData.hours.map(h => (
                                    <div key={h} style={{ flex: 1, textAlign: 'center', fontSize: '11px', color: '#64748b' }}>{h}h</div>
                                ))}
                            </div>
                            
                            {/* Filas (Días) */}
                            {heatmapData.displayDays.map(dayIdx => (
                                <div key={dayIdx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <div style={{ width: '36px', fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                                        {heatmapData.daysLabels[dayIdx]}
                                    </div>
                                    {heatmapData.hours.map(h => {
                                        const count = heatmapData.matrix[dayIdx][h];
                                        const intensity = heatmapData.maxCount > 0 ? count / heatmapData.maxCount : 0;
                                        // Color calculation: Light blue to Deep blue
                                        const bg = count === 0 ? 'rgba(0,0,0,0.02)' : `rgba(37, 99, 235, ${0.1 + (intensity * 0.9)})`;
                                        const color = intensity > 0.5 ? '#fff' : '#1e293b';
                                        
                                        return (
                                            <div key={`${dayIdx}-${h}`} 
                                                title={`${heatmapData.daysLabels[dayIdx]} ${h}h: ${count} turnos`}
                                                style={{ 
                                                    flex: 1, height: '28px', backgroundColor: bg, 
                                                    borderRadius: '4px', display: 'flex', alignItems: 'center', 
                                                    justifyContent: 'center', fontSize: '11px', color, fontWeight: 600,
                                                    transition: 'all 0.2s', cursor: 'pointer'
                                                }}>
                                                {count > 0 ? count : ''}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>Cargando datos históricos...</div>
                    )}
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

            {/* 5. Rendimiento por Box */}
            <div style={{ ...s.card, gridColumn: '1 / -1' }}>
                <h3 style={s.title}>🏢 Rendimiento por Box</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    {boxData.length === 0 ? (
                        <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Sin atenciones registradas</div>
                    ) : (
                        boxData.map((b, i) => (
                            <div key={i} style={{ padding: '16px', background: 'rgba(255,255,255,0.5)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.8)' }}>
                                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>{b.box}</div>
                                <div style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '4px' }}>👥 Atendidos: <b>{b.cantidad}</b></div>
                                <div style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '4px' }}>⏱️ Demora Prom: <b>{b.demoraPromedio}m</b></div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '8px' }}>
                                    Principal: <i>{b.tramitePpal}</i>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
