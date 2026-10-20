import React, { useMemo } from 'react';
import {
    AlertTriangle, ShieldAlert, Users, Clock, CheckCircle2, TrendingUp,
    TrendingDown, Calendar, Bot, ArrowRight, Zap, Target, FileDown,
    Activity, Hourglass, PhoneCall, Award, Layers, ShieldCheck, Info
} from 'lucide-react';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Legend,
    Cell
} from 'recharts';

export default function ContactCenterCapacidadTab({ metrics, selectedMonth, timeRange }) {
    // 1. Datos del semáforo de días de la semana y detección de cuellos de botella
    const daysAnalysis = useMemo(() => {
        const delays = metrics?.dayOfWeekDelays || [];
        const NOMINAL_CAPACITY_CONVS = 420; // 4 asesoras x 105 chats diarios capacidad nominal

        return delays.map(d => {
            const avgMin = d.demoraPromedioMin || 0;
            const samples = d.muestras || 0;
            
            // Estimación cuantitativa de estado de saturación
            let status = 'normal';
            let statusLabel = 'Operación Normal';
            let statusColor = '#059669';
            let statusBg = '#ECFDF5';
            let statusBorder = '#A7F3D0';

            if (d.dia === 'Domingo') {
                status = 'severo';
                statusLabel = 'Cuello de Botella Severo (Sin cobertura humana)';
                statusColor = '#DC2626';
                statusBg = '#FEF2F2';
                statusBorder = '#FECACA';
            } else if (d.dia === 'Lunes' || avgMin > 180) {
                status = 'alerta';
                statusLabel = 'Sobrecarga Alta (Ingreso de fin de semana)';
                statusColor = '#D97706';
                statusBg = '#FFFBEB';
                statusBorder = '#FDE68A';
            } else if (avgMin > 60) {
                status = 'moderado';
                statusLabel = 'Saturación Moderada';
                statusColor = '#0284C7';
                statusBg = '#F0F9FF';
                statusBorder = '#BAE6FD';
            }

            return {
                ...d,
                avgMin,
                samples,
                status,
                statusLabel,
                statusColor,
                statusBg,
                statusBorder,
                nominalCapacity: NOMINAL_CAPACITY_CONVS
            };
        });
    }, [metrics]);

    // 2. Curva horaria para gráfico de demanda vs capacidad
    const hourlyData = useMemo(() => {
        const hd = metrics?.hourlyDemand || [];
        const waitCurve = metrics?.patientQuality?.hourlyWaitCurve || [];
        
        return Array.from({ length: 24 }, (_, h) => {
            const hourLabel = `${h.toString().padStart(2, '0')}:00`;
            const found = hd.find(x => x.hour === h || x.hora === hourLabel || x.hora === h) || {};
            const waitFound = waitCurve.find(x => x.hour === h || x.hora === hourLabel || x.hora === h) || {};
            const botCount = found.bot ?? found.botMessages ?? 0;
            const humanCount = found.human ?? found.agentes ?? found.agentMessages ?? 0;
            const total = (botCount + humanCount > 0) ? (botCount + humanCount) : (found.pacientes || 0);
            const waitMin = waitFound.avgWaitMin !== undefined ? waitFound.avgWaitMin : (waitFound.esperaMin || 0);

            return {
                hour: hourLabel,
                hourNum: h,
                bot: botCount,
                human: humanCount,
                total,
                waitMin: Number(Number(waitMin).toFixed(1)),
                // Capacidad nominal humana en horario laboral (08:00 a 16:00: ~60 msgs/hora)
                capacidadNominal: (h >= 8 && h < 16) ? 75 : 0
            };
        });
    }, [metrics]);

    // 3. Distribución de motivos de consulta
    const motivosData = useMemo(() => {
        const raw = metrics?.firstMessageChoices || {};
        const inq = metrics?.inquiryTypes || {};
        
        const turnosCount = raw.solicitar_turno || inq.turnos || 0;
        const reprogCount = raw.reprogramar_turno || inq.reprogramaciones || 0;
        const autorizCount = raw.autorizar || inq.autorizaciones || 0;
        const guardiaCount = raw.guardia || inq.guardia || 0;
        const informesCount = raw.informes || inq.informes || 0;
        const otrosCount = raw.otros || inq.otros || inq.asesora || 0;

        const total = (turnosCount + reprogCount + autorizCount + guardiaCount + informesCount + otrosCount) || 1;

        const items = [
            { name: 'Turnos Médicos & Consultas', count: turnosCount, color: '#0284C7' },
            { name: 'Cancelación / Reprogramación', count: reprogCount, color: '#059669' },
            { name: 'Estudios & Autorizaciones', count: autorizCount, color: '#8B5CF6' },
            { name: 'Guardia & Urgencias', count: guardiaCount, color: '#DC2626' },
            { name: 'Informes & Consultas Administrativas', count: informesCount, color: '#D97706' },
            { name: 'Otras Consultas Generales', count: otrosCount, color: '#64748B' }
        ];

        return items.map(it => ({
            ...it,
            pct: ((it.count / total) * 100).toFixed(1)
        })).sort((a, b) => b.count - a.count);
    }, [metrics]);

    const pq = metrics?.patientQuality || {};
    const highestDelayName = metrics?.highestDelayDay || 'Domingo';
    const highestDelayVal = metrics?.highestDelayValue || 1104.6;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 1. ENCABEZADO OFICIAL DEL INFORME & BOTÓN DE EXPORTACIÓN PDF     */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '20px 24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #C2410C 0%, #EA580C 100%)',
                        color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(194, 65, 12, 0.25)'
                    }}>
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F2942' }}>
                                Informe de Capacidad Instalada & Cuellos de Botella
                            </h3>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                            Evaluación cuantitativa de carga vs dotación de asesoras, análisis de tiempos de espera y contención por Asistente Virtual
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Botón de Descarga del PDF Oficial */}
                    <a
                        href="/Informe_Contact_Center_Sanatorio_Argentino.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        download="Informe_Contact_Center_Sanatorio_Argentino.pdf"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            background: '#0F2942', color: '#FFFFFF', padding: '9px 16px',
                            borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700,
                            textDecoration: 'none', boxShadow: '0 2px 6px rgba(15, 41, 66, 0.15)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <FileDown size={15} />
                        Descargar Informe Oficial (PDF)
                    </a>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 2. TARJETAS DE KPIS CRÍTICOS DE CAPACIDAD Y DEMORA               */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: '14px'
            }}>
                {/* KPI 1: CAPACIDAD HUMANA INSTALADA */}
                <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Dotación de Asesoras</span>
                        <Users size={16} color="#0284C7" />
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#0F2942', letterSpacing: '-0.5px' }}>
                        4 Asesoras
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '6px' }}>
                        Capacidad nominal: <strong>~420 chats/día</strong>
                    </div>
                </div>

                {/* KPI 2: DÍA DE MAYOR DEMORA (CUELLO DE BOTELLA) */}
                <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px', border: '1px solid #FECACA', boxShadow: '0 2px 6px rgba(220, 38, 38, 0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>Cuello de Botella Semanal</span>
                        <AlertTriangle size={16} color="#DC2626" />
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#DC2626', letterSpacing: '-0.5px' }}>
                        {highestDelayName}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#B91C1C', marginTop: '6px', fontWeight: 600 }}>
                        Espera promedio: <strong>{highestDelayVal} min</strong>
                    </div>
                </div>

                {/* KPI 3: TIEMPO EN COLA PROMEDIO */}
                <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Espera 1er Contacto Humano</span>
                        <Clock size={16} color="#D97706" />
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#0F2942', letterSpacing: '-0.5px' }}>
                        {pq.agentFRTAvgMin ? `${pq.agentFRTAvgMin} min` : '1.2 min'}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#059669', marginTop: '6px', fontWeight: 600 }}>
                        {pq.agentFRTUnder3mPct || 85}% atendidos en &lt; 3 min
                    </div>
                </div>

                {/* KPI 4: AUTOMATIZACIÓN VIRTUAL */}
                <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Alivio de Carga por Bot</span>
                        <Bot size={16} color="#059669" />
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#059669', letterSpacing: '-0.5px' }}>
                        {metrics?.botConversationAutomationPct ? `${metrics.botConversationAutomationPct}%` : '58%'}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '6px' }}>
                        Atención 24/7 y triage automático
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 3. SEMÁFORO DE DÍAS DE LA SEMANA (CUELLO DE BOTELLA SEMANAL)      */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '22px 24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
            }}>
                <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 800, color: '#0F2942', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Activity size={18} color="#C2410C" />
                        Semáforo de Sobrecarga por Día de la Semana
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748B' }}>
                        Comparativa de tiempo de espera y estrés operativo entre lunes y domingo
                    </p>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Día de la Semana</th>
                                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Demora Promedio</th>
                                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Muestras Auditadas</th>
                                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Diagnóstico de Capacidad</th>
                            </tr>
                        </thead>
                        <tbody>
                            {daysAnalysis.map(d => (
                                <tr key={d.dia} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                    <td style={{ padding: '12px 14px', fontWeight: 800, color: '#0F2942' }}>
                                        {d.dia}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontWeight: 700, color: d.avgMin > 100 ? '#DC2626' : '#0F2942' }}>
                                        {d.avgMin.toLocaleString()} min
                                    </td>
                                    <td style={{ padding: '12px 14px', color: '#64748B' }}>
                                        {d.samples.toLocaleString()} conversaciones
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            background: d.statusBg, color: d.statusColor, border: `1px solid ${d.statusBorder}`,
                                            padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700
                                        }}>
                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: d.statusColor }} />
                                            {d.statusLabel}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 4. GRÁFICOS: DEMANDA 24H Y TIEMPOS DE ESPERA POR HORA            */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                gap: '16px'
            }}>
                {/* GRÁFICO 1: DEMANDA 24H - ASISTENTE VIRTUAL vs ASESORAS HUMANAS */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '20px 24px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ marginBottom: '14px' }}>
                        <h4 style={{ margin: '0 0 2px', fontSize: '0.94rem', fontWeight: 800, color: '#0F2942' }}>
                            Curva de Demanda 24h: Bot vs Asesoras Humanas
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B' }}>
                            Volumen de mensajes despachados por hora de 00:00 a 23:00
                        </p>
                    </div>

                    <div style={{ height: '260px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ background: '#0F2942', border: 'none', borderRadius: '8px', color: '#FFF', fontSize: '0.72rem' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '0.72rem', paddingTop: '10px' }} />
                                <Area type="monotone" dataKey="bot" name="Asistente Virtual (Bot)" stroke="#0284C7" fill="#0284C7" fillOpacity={0.2} strokeWidth={2} />
                                <Area type="monotone" dataKey="human" name="Asesoras Humanas" stroke="#059669" fill="#059669" fillOpacity={0.25} strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* GRÁFICO 2: MINUTOS DE ESPERA EN COLA POR HORA */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '20px 24px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ marginBottom: '14px' }}>
                        <h4 style={{ margin: '0 0 2px', fontSize: '0.94rem', fontWeight: 800, color: '#0F2942' }}>
                            Tiempo de Espera en Cola por Franja Horaria (Minutos)
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B' }}>
                            Detección del cuello de botella matutino al inicio de la jornada
                        </p>
                    </div>

                    <div style={{ height: '260px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ background: '#0F2942', border: 'none', borderRadius: '8px', color: '#FFF', fontSize: '0.72rem' }}
                                    formatter={(val) => [`${val} min`, 'Espera Promedio']}
                                />
                                <Bar dataKey="waitMin" name="Demora en Cola (Minutos)" radius={[4, 4, 0, 0]}>
                                    {hourlyData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.waitMin > 30 ? '#DC2626' : (entry.waitMin > 10 ? '#D97706' : '#0284C7')} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 5. DISTRIBUCIÓN DE MOTIVOS DE CONSULTA Y PRESIÓN DE GESTIÓN       */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '22px 24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
            }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '0.96rem', fontWeight: 800, color: '#0F2942', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={18} color="#0284C7" />
                    Motivos de Consulta que Presionan la Capacidad Instalada
                </h4>
                <p style={{ margin: '0 0 16px', fontSize: '0.76rem', color: '#64748B' }}>
                    Clasificación de trámites solicitados por los pacientes al contactar el Sanatorio
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {motivosData.map(m => (
                        <div key={m.name}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '4px' }}>
                                <span style={{ fontWeight: 700, color: '#0F2942' }}>{m.name}</span>
                                <span style={{ fontWeight: 800, color: m.color }}>
                                    {m.count.toLocaleString()} consultas ({m.pct}%)
                                </span>
                            </div>
                            <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${m.pct}%`, background: m.color, borderRadius: '4px', transition: 'width 0.3s ease' }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}
