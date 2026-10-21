import React, { useMemo, useState } from 'react';
import {
  BarChart, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Bar, AreaChart, Area
} from 'recharts';
import {
  Clock, CheckCircle, AlertTriangle, Users, TrendingUp,
  Award, ShieldAlert, BarChart3, Activity, UserCheck
} from 'lucide-react';

// Paleta Institucional Sanatorio Argentino & Grow Labs
const COLORS = ['#1565C0', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#6366f1'];

export default function ChartsPanel({ metricas, config = [], metricasRango = 'hoy' }) {
    const [historialFallback, setHistorialFallback] = useState([]);
    const [vistaOperador, setVistaOperador] = useState('box'); // 'box' | 'empleado'

    React.useEffect(() => {
        // Cargar historial de respaldo para el heatmap si estamos en vista de 1 día
        import('../../services/turnoService').then(({ fetchTurnosHistoricos }) => {
            fetchTurnosHistoricos(30).then(data => setHistorialFallback(data || []));
        });
    }, []);

    // 1. Dataset para Heatmap (Día de semana vs Hora)
    const heatmapData = useMemo(() => {
        // Si estamos viendo 30 días o semana, usamos los turnos filtrados; si no, el historial
        const dataset = (metricas?.turnosRaw && metricas.turnosRaw.length > 50)
            ? metricas.turnosRaw
            : historialFallback;

        if (!dataset || dataset.length === 0) return null;

        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 7h a 20h
        const matrix = Array(7).fill(0).map(() => Array(24).fill(0));
        let maxCount = 0;

        dataset.forEach(t => {
            if (!t.created_at) return;
            const d = new Date(t.created_at);
            const day = d.getDay();
            const hour = d.getHours();
            if (hour >= 0 && hour < 24) {
                matrix[day][hour]++;
                if (matrix[day][hour] > maxCount) maxCount = matrix[day][hour];
            }
        });

        // Lunes primero, Domingo último
        const displayDays = [1, 2, 3, 4, 5, 6, 0];
        return { matrix, maxCount, displayDays, daysLabels: days, hours };
    }, [metricas?.turnosRaw, historialFallback]);

    // 2. Curva de Flujo Horario (Demanda por Hora y Espera)
    const flujoHorarioData = useMemo(() => {
        if (metricas?.porHora && metricas.porHora.length > 0) {
            return metricas.porHora;
        }
        return [];
    }, [metricas?.porHora]);

    // 3. Evolución Cronológica del Tiempo de Espera (Line Chart ordenado)
    const evolucionEsperaData = useMemo(() => {
        if (!metricas?.turnosRaw || metricas.turnosRaw.length === 0) return [];

        const turnosConLlamado = metricas.turnosRaw.filter(t => t.llamado_at && t.created_at);
        if (turnosConLlamado.length === 0) return [];

        const isSingleDay = metricasRango === 'hoy' || metricasRango === 'ayer';
        const groups = {};

        turnosConLlamado.forEach(t => {
            const d = new Date(t.created_at);
            const esperaMin = Math.max(0, (new Date(t.llamado_at) - d) / 60000);
            if (esperaMin > 300) return; // descartar anomalías de > 5h

            // Clave cronológica: hora exacta
            const epochHour = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
            if (!groups[epochHour]) {
                groups[epochHour] = {
                    epoch: epochHour,
                    date: d,
                    sum: 0,
                    count: 0,
                    max: 0
                };
            }
            groups[epochHour].sum += esperaMin;
            groups[epochHour].count++;
            if (esperaMin > groups[epochHour].max) groups[epochHour].max = esperaMin;
        });

        return Object.values(groups)
            .sort((a, b) => a.epoch - b.epoch)
            .map(g => {
                const hourStr = `${g.date.getHours().toString().padStart(2, '0')}:00`;
                const dateStr = `${g.date.getDate().toString().padStart(2, '0')}/${(g.date.getMonth() + 1).toString().padStart(2, '0')}`;
                return {
                    time: isSingleDay ? hourStr : `${dateStr} ${hourStr}`,
                    esperaPromedio: Math.round((g.sum / g.count) * 10) / 10,
                    esperaMax: Math.round(g.max),
                    cantidad: g.count
                };
            });
    }, [metricas?.turnosRaw, metricasRango]);

    // 4. Proporción de Trámites (Donut Pie)
    const pieData = useMemo(() => {
        if (!metricas?.porTipo) return [];
        return Object.entries(metricas.porTipo).map(([tipo, data]) => {
            const cfg = config.find(c => c.tipo_tramite === tipo);
            const label = cfg?.label || tipo;
            return {
                name: label,
                value: data.total,
                atendidos: data.atendidos,
                esperaPromedio: data.esperaPromedio || 0
            };
        }).sort((a, b) => b.value - a.value);
    }, [metricas?.porTipo, config]);

    // 5. Histograma de Tiempos de Espera (Distribución SLA)
    const histogramaEsperaData = useMemo(() => {
        if (!metricas?.turnosRaw) return [];
        const turnosConEspera = metricas.turnosRaw
            .filter(t => t.estado === 'atendido' && t.llamado_at && t.created_at)
            .map(t => Math.max(0, (new Date(t.llamado_at) - new Date(t.created_at)) / 60000))
            .filter(m => m < 300);

        if (turnosConEspera.length === 0) return [];

        const ranges = [
            { label: '0-5m', min: 0, max: 5, color: '#10B981' },
            { label: '6-10m', min: 6, max: 10, color: '#3B82F6' },
            { label: '11-15m', min: 11, max: 15, color: '#1565C0' },
            { label: '16-20m', min: 16, max: 20, color: '#F59E0B' },
            { label: '21-30m', min: 21, max: 30, color: '#F97316' },
            { label: '>30m', min: 31, max: 9999, color: '#EF4444' }
        ];

        return ranges.map(r => {
            const count = turnosConEspera.filter(m => m >= r.min && m <= r.max).length;
            const pct = Math.round((count / turnosConEspera.length) * 100);
            return {
                rango: r.label,
                cantidad: count,
                porcentaje: pct,
                color: r.color
            };
        });
    }, [metricas?.turnosRaw]);

    // 6. Rendimiento por Box
    const boxData = useMemo(() => {
        if (!metricas?.atencionesRaw || !metricas?.turnosRaw) return [];
        const boxes = {};

        metricas.atencionesRaw.forEach(a => {
            const boxId = a.box_numero || 'General';
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
        })).sort((a, b) => b.cantidad - a.cantidad);
    }, [metricas, config]);

    // 7. Rendimiento por Empleado / Operador
    const empleadoData = useMemo(() => {
        if (!metricas?.porEmpleado) return [];
        return Object.entries(metricas.porEmpleado).map(([nombre, d]) => ({
            nombre,
            cantidad: d.cantidad,
            tiempoPromedio: d.tiempoPromedio
        })).sort((a, b) => b.cantidad - a.cantidad);
    }, [metricas?.porEmpleado]);

    const s = {
        card: {
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative'
        },
        title: {
            fontSize: '1.02rem',
            fontWeight: 700,
            color: '#0D3B66',
            marginBottom: '14px',
            letterSpacing: '-0.01em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
        },
        kpiBox: {
            padding: '12px 16px',
            borderRadius: '12px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', zIndex: 10 }}>
            {/* ═══ TARJETAS DE SLA Y CALIDAD DE ATENCIÓN ═══ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '14px'
            }}>
                {/* SLA Cumplimiento */}
                <div style={{ ...s.kpiBox, background: 'linear-gradient(135deg, #EFF6FF 0%, #FFFFFF 100%)', borderColor: '#BFDBFE' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1E40AF', textTransform: 'uppercase' }}>
                            Cumplimiento SLA (≤15m)
                        </span>
                        <Award size={18} color="#2563EB" />
                    </div>
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#1D4ED8' }}>
                        {metricas?.sla?.cumplimiento ?? 100}%
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        Meta Sanatorio: ≥ 85% de turnos en término
                    </span>
                </div>

                {/* Espera Promedio */}
                <div style={{ ...s.kpiBox, background: 'linear-gradient(135deg, #FAF5FF 0%, #FFFFFF 100%)', borderColor: '#E9D5FF' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B21A8', textTransform: 'uppercase' }}>
                            Espera Promedio
                        </span>
                        <Clock size={18} color="#9333EA" />
                    </div>
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#7E22CE' }}>
                        {metricas?.esperaPromedio ?? 0}<span style={{ fontSize: '1rem', fontWeight: 600 }}> min</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        Máxima registrada: {metricas?.esperaMax ?? 0} min
                    </span>
                </div>

                {/* Tiempo de Atención Promedio */}
                <div style={{ ...s.kpiBox, background: 'linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 100%)', borderColor: '#BBF7D0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#166534', textTransform: 'uppercase' }}>
                            Duración Box Promedio
                        </span>
                        <Activity size={18} color="#16A34A" />
                    </div>
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#15803D' }}>
                        {metricas?.tiempoPromedio ?? 0}<span style={{ fontSize: '1rem', fontWeight: 600 }}> min</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {metricas?.atendidos ?? 0} consultas finalizadas
                    </span>
                </div>

                {/* Tasa de Abandono / Cancelación */}
                <div style={{ ...s.kpiBox, background: 'linear-gradient(135deg, #FEF2F2 0%, #FFFFFF 100%)', borderColor: '#FECACA' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#991B1B', textTransform: 'uppercase' }}>
                            Tasa de Cancelación
                        </span>
                        <ShieldAlert size={18} color="#DC2626" />
                    </div>
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#B91C1C' }}>
                        {metricas?.tasaCancelacion ?? 0}%
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {metricas?.cancelados ?? 0} turnos cancelados o ausentes
                    </span>
                </div>
            </div>

            {/* ═══ GRID DE GRÁFICOS PRINCIPALES ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px' }}>
                
                {/* 1. Curva de Flujo Horario (Demanda por Hora) */}
                <div style={{ ...s.card, gridColumn: '1 / -1' }}>
                    <div style={s.title}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <TrendingUp size={18} color="#1565C0" />
                            Curva de Demanda por Hora (Afluencia & Picos de Atención)
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748B' }}>
                            07:00 a 20:00 hs
                        </span>
                    </div>
                    <div style={{ height: 260, width: '100%' }}>
                        {flujoHorarioData.length === 0 ? (
                            <div style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center', padding: '50px' }}>
                                Sin datos suficientes para el período
                            </div>
                        ) : (
                            <ResponsiveContainer>
                                <ComposedChart data={flujoHorarioData} margin={{ top: 10, right: 20, bottom: 10, left: -10 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                    <XAxis dataKey="hora" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#1565C0' }} />
                                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8B5CF6' }} unit="m" />
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '12px', border: '1px solid #E2E8F0',
                                            boxShadow: '0 6px 16px rgba(0,0,0,0.08)', fontSize: '12px'
                                        }}
                                        formatter={(val, name) => {
                                            if (name === 'Espera Promedio') return [`${val} min`, name];
                                            return [val, name];
                                        }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                                    <Bar yAxisId="left" dataKey="total" name="Turnos Ingresados" fill="#1565C0" radius={[6, 6, 0, 0]} barSize={28} />
                                    <Bar yAxisId="left" dataKey="atendidos" name="Turnos Atendidos" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={28} />
                                    <Line yAxisId="right" type="monotone" dataKey="esperaPromedio" name="Espera Promedio" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 4, fill: '#8B5CF6' }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* 2. Evolución Cronológica del Tiempo de Espera */}
                <div style={s.card}>
                    <div style={s.title}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock size={18} color="#8B5CF6" />
                            Evolución del Tiempo de Espera (Promedio vs Máximo)
                        </span>
                    </div>
                    <div style={{ height: 260, width: '100%' }}>
                        {evolucionEsperaData.length === 0 ? (
                            <div style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center', padding: '50px' }}>
                                Sin turnos llamados registrados en este período
                            </div>
                        ) : (
                            <ResponsiveContainer>
                                <AreaChart data={evolucionEsperaData} margin={{ top: 10, right: 10, bottom: 10, left: -10 }}>
                                    <defs>
                                        <linearGradient id="colorEspera" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} unit="m" />
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '12px', border: '1px solid #E2E8F0',
                                            boxShadow: '0 6px 16px rgba(0,0,0,0.08)', fontSize: '12px'
                                        }}
                                        formatter={(val, name) => [`${val} min`, name]}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                                    <Area type="monotone" dataKey="esperaPromedio" name="Espera Promedio" stroke="#8B5CF6" strokeWidth={3} fillOpacity={1} fill="url(#colorEspera)" />
                                    <Line type="monotone" dataKey="esperaMax" name="Espera Máxima" stroke="#EF4444" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* 3. Histograma de Espera (Distribución SLA) */}
                <div style={s.card}>
                    <div style={s.title}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <BarChart3 size={18} color="#10B981" />
                            Distribución de Espera por Tramos (SLA)
                        </span>
                    </div>
                    <div style={{ height: 260, width: '100%' }}>
                        {histogramaEsperaData.length === 0 ? (
                            <div style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center', padding: '50px' }}>
                                Sin datos de espera en este rango
                            </div>
                        ) : (
                            <ResponsiveContainer>
                                <BarChart data={histogramaEsperaData} margin={{ top: 10, right: 10, bottom: 10, left: -10 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                    <XAxis dataKey="rango" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '12px', border: '1px solid #E2E8F0',
                                            boxShadow: '0 6px 16px rgba(0,0,0,0.08)', fontSize: '12px'
                                        }}
                                        formatter={(val, name, item) => [`${val} pacientes (${item.payload.porcentaje}%)`, 'Cantidad']}
                                    />
                                    <Bar dataKey="cantidad" radius={[6, 6, 0, 0]} barSize={36}>
                                        {histogramaEsperaData.map((entry, index) => (
                                            <Cell key={`cell-hist-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* 4. Donut: Demanda por Trámite */}
                <div style={s.card}>
                    <div style={s.title}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Users size={18} color="#0D3B66" />
                            Demanda por Tipo de Trámite
                        </span>
                    </div>
                    <div style={{ height: 260, width: '100%' }}>
                        {pieData.length === 0 ? (
                            <div style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center', padding: '50px' }}>
                                Sin trámites registrados
                            </div>
                        ) : (
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={85}
                                        paddingAngle={4}
                                        dataKey="value"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-pie-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '12px', border: '1px solid #E2E8F0',
                                            boxShadow: '0 6px 16px rgba(0,0,0,0.08)', fontSize: '12px'
                                        }}
                                        formatter={(val, name, item) => [
                                            `${val} turnos (${item.payload.esperaPromedio}m espera prom.)`,
                                            name
                                        ]}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* 5. Rendimiento por Box u Operador (Alternable) */}
                <div style={s.card}>
                    <div style={s.title}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <UserCheck size={18} color="#1565C0" />
                            {vistaOperador === 'box' ? 'Desempeño por Box de Atención' : 'Desempeño por Operador / Recepcionista'}
                        </span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                                onClick={() => setVistaOperador('box')}
                                style={{
                                    padding: '3px 8px', borderRadius: '8px', fontSize: '0.72rem', border: 'none', cursor: 'pointer',
                                    background: vistaOperador === 'box' ? '#1565C0' : '#F1F5F9',
                                    color: vistaOperador === 'box' ? '#FFFFFF' : '#64748B', fontWeight: 600
                                }}
                            >
                                Boxes
                            </button>
                            <button
                                onClick={() => setVistaOperador('empleado')}
                                style={{
                                    padding: '3px 8px', borderRadius: '8px', fontSize: '0.72rem', border: 'none', cursor: 'pointer',
                                    background: vistaOperador === 'empleado' ? '#1565C0' : '#F1F5F9',
                                    color: vistaOperador === 'empleado' ? '#FFFFFF' : '#64748B', fontWeight: 600
                                }}
                            >
                                Operadores
                            </button>
                        </div>
                    </div>
                    <div style={{ height: 260, width: '100%' }}>
                        {vistaOperador === 'box' ? (
                            boxData.length === 0 ? (
                                <div style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center', padding: '50px' }}>Sin atenciones en boxes</div>
                            ) : (
                                <ResponsiveContainer>
                                    <ComposedChart data={boxData} margin={{ top: 10, right: 10, bottom: 10, left: -10 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                        <XAxis dataKey="box" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#0D3B66', fontWeight: 600 }} />
                                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#1565C0' }} />
                                        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#F59E0B' }} unit="m" />
                                        <Tooltip
                                            contentStyle={{
                                                borderRadius: '12px', border: '1px solid #E2E8F0',
                                                boxShadow: '0 6px 16px rgba(0,0,0,0.08)', fontSize: '12px'
                                            }}
                                            formatter={(val, name) => [name.includes('Demora') ? `${val} min` : val, name]}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                        <Bar yAxisId="left" dataKey="cantidad" name="Pacientes Atendidos" fill="#1565C0" radius={[6, 6, 0, 0]} barSize={34} />
                                        <Line yAxisId="right" type="monotone" dataKey="demoraPromedio" name="Demora Atención (min)" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4, fill: '#F59E0B' }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            )
                        ) : (
                            empleadoData.length === 0 ? (
                                <div style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center', padding: '50px' }}>Sin datos por operador</div>
                            ) : (
                                <div style={{ maxHeight: '250px', overflowY: 'auto', paddingRight: '6px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                                                <th style={{ padding: '8px' }}>Operador</th>
                                                <th style={{ padding: '8px', textAlign: 'center' }}>Atendidos</th>
                                                <th style={{ padding: '8px', textAlign: 'right' }}>T. Promedio</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {empleadoData.map((emp, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                    <td style={{ padding: '8px', fontWeight: 600, color: '#0D3B66' }}>{emp.nombre}</td>
                                                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: '#1565C0' }}>{emp.cantidad}</td>
                                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: '#64748B' }}>{emp.tiempoPromedio} min</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )
                        )}
                    </div>
                </div>

                {/* 6. Mapa de Calor Semanal (Día vs Horas) */}
                <div style={{ ...s.card, gridColumn: '1 / -1' }}>
                    <div style={s.title}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock size={18} color="#1565C0" />
                            Mapa de Calor Semanal de Concentración de Pacientes
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748B' }}>
                            Identificación de franjas horarias de mayor congestión
                        </span>
                    </div>
                    <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '10px' }}>
                        {heatmapData ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '650px' }}>
                                {/* Header de Horas */}
                                <div style={{ display: 'flex', marginLeft: '45px' }}>
                                    {heatmapData.hours.map(h => (
                                        <div key={h} style={{ flex: 1, textAlign: 'center', fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                                            {h}h
                                        </div>
                                    ))}
                                </div>

                                {/* Filas de Días de Semana */}
                                {heatmapData.displayDays.map(dayIdx => (
                                    <div key={dayIdx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <div style={{ width: '40px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                                            {heatmapData.daysLabels[dayIdx]}
                                        </div>
                                        {heatmapData.hours.map(h => {
                                            const count = heatmapData.matrix[dayIdx][h];
                                            const intensity = heatmapData.maxCount > 0 ? count / heatmapData.maxCount : 0;
                                            const bg = count === 0
                                                ? '#F8FAFC'
                                                : `rgba(21, 101, 192, ${0.12 + (intensity * 0.88)})`;
                                            const color = intensity > 0.45 ? '#FFFFFF' : '#0D3B66';

                                            return (
                                                <div
                                                    key={`${dayIdx}-${h}`}
                                                    title={`${heatmapData.daysLabels[dayIdx]} a las ${h}:00 hs: ${count} turnos`}
                                                    style={{
                                                        flex: 1,
                                                        height: '30px',
                                                        backgroundColor: bg,
                                                        borderRadius: '6px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '11px',
                                                        color,
                                                        fontWeight: 700,
                                                        transition: 'all 0.15s ease',
                                                        cursor: 'pointer',
                                                        border: count === 0 ? '1px solid #F1F5F9' : 'none'
                                                    }}
                                                >
                                                    {count > 0 ? count : ''}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>
                                Generando mapa de calor...
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
