/**
 * AuditoriaPDFPanel — Módulo independiente de Auditoría de HC por PDF
 * Porta funcionalidad de hcvercel con la estética institucional de ADM-QUI.
 */
import { useState, useEffect, useCallback } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import {
    Upload, FileCheck, Loader2, Calendar, LayoutDashboard, AlertTriangle, Users, Activity,
    ShieldCheck, Clock, TrendingUp, Scissors, FileBarChart2, History, Download, Eye,
    Search, Filter, FileText, AlertCircle, CheckCircle, ChevronDown, ChevronUp,
    User, Stethoscope, Syringe, Send,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import {
    obtenerDatosDashboard,
    obtenerHistorialAuditorias,
    obtenerEstadisticasHistorial,
    enviarAuditoriaPDF,
} from '../services/auditoriaPdfService';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// ══════════════════════════════════════════════════════
// DESIGN TOKENS (Estética institucional Sanatorio Argentino)
// ══════════════════════════════════════════════════════
const COLORS_CHART = ['#1E5FA6', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
const PRIMARY = '#1E5FA6';
const PRIMARY_LIGHT = '#EFF6FF';
const BG = '#FAFBFC';

const cardStyle = {
    background: '#fff',
    borderRadius: '16px',
    border: '1px solid #E5E7EB',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    padding: '24px',
};

const tabBtnStyle = (active) => ({
    padding: '10px 20px',
    borderRadius: '10px',
    border: 'none',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: active ? PRIMARY : '#F3F4F6',
    color: active ? '#fff' : '#6B7280',
    boxShadow: active ? '0 2px 8px rgba(30,95,166,0.3)' : 'none',
});

// ══════════════════════════════════════════════════════
// HELPER: Abreviar estudios
// ══════════════════════════════════════════════════════
function abreviarEstudio(nombreCompleto) {
    const abreviaturas = {
        'TAC': 'TAC', 'Tomografía': 'TAC', 'Resonancia Magnética': 'RM', 'Resonancia': 'RM',
        'Radiografía': 'RX', 'Ecografía': 'ECO', 'Doppler': 'Doppler', 'Hemograma': 'Hemograma',
        'PCR': 'PCR', 'Electrocardiograma': 'ECG', 'Ecocardiograma': 'Ecocardio',
        'Endoscopía alta': 'VEDA', 'Endoscopía': 'Endoscopía', 'Colonoscopía': 'Colonoscopía',
        'Kinesiología': 'Kine', 'Procedimiento': 'Proc.',
    };
    for (const [clave, abrev] of Object.entries(abreviaturas)) {
        if (nombreCompleto.includes(clave)) {
            const partes = nombreCompleto.split(' de ');
            return partes.length > 1 ? `${abrev} ${partes[1]}` : abrev;
        }
    }
    return nombreCompleto.length > 20 ? nombreCompleto.substring(0, 17) + '...' : nombreCompleto;
}

// ══════════════════════════════════════════════════════
// SUB-COMPONENTES REUTILIZABLES
// ══════════════════════════════════════════════════════

function KpiCard({ icon: Icon, title, value, color = PRIMARY }) {
    return (
        <div style={{
            ...cardStyle,
            borderLeft: `4px solid ${color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
        onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
        >
            <div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#9CA3AF', fontWeight: 500 }}>{title}</p>
                <p style={{ margin: '4px 0 0', fontSize: '2rem', fontWeight: 800, color: '#111827' }}>{value}</p>
            </div>
            <Icon size={36} style={{ color, opacity: 0.6 }} />
        </div>
    );
}

function ChartContainer({ children, title, icon: Icon, isEmpty }) {
    return (
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #F3F4F6' }}>
                <Icon size={20} style={{ color: PRIMARY }} />
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1F2937' }}>{title}</h3>
            </div>
            <div style={{ flex: 1, minHeight: 280 }}>
                {isEmpty ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3AF' }}>
                        <Activity size={32} style={{ opacity: 0.2, marginBottom: 8 }} />
                        <p style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>Sin datos disponibles</p>
                    </div>
                ) : children}
            </div>
        </div>
    );
}

function CollapsibleSection({ title, icon: Icon, children, defaultOpen = true, badge, badgeColor = PRIMARY }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div style={{ ...cardStyle, padding: 0, marginBottom: '12px', overflow: 'hidden' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'none', border: 'none', cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseOver={e => e.currentTarget.style.background = '#F9FAFB'}
                onMouseOut={e => e.currentTarget.style.background = 'none'}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon size={22} style={{ color: PRIMARY }} />
                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#111827' }}>{title}</h2>
                    {badge !== undefined && (
                        <span style={{
                            background: badgeColor, color: '#fff', padding: '2px 10px', borderRadius: '20px',
                            fontSize: '0.75rem', fontWeight: 700,
                        }}>{badge}</span>
                    )}
                </div>
                {isOpen ? <ChevronUp size={18} color="#9CA3AF" /> : <ChevronDown size={18} color="#9CA3AF" />}
            </button>
            {isOpen && <div style={{ padding: '0 20px 20px' }}>{children}</div>}
        </div>
    );
}

// ══════════════════════════════════════════════════════
// TAB: DASHBOARD
// ══════════════════════════════════════════════════════
function DashboardTab() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        obtenerDatosDashboard()
            .then(setStats)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
            <Loader2 size={40} style={{ color: PRIMARY, animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#6B7280', marginTop: 12 }}>Cargando métricas...</p>
        </div>
    );

    if (!stats) return null;

    const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <KpiCard icon={ShieldCheck} title="Total Auditorías" value={stats.totalAuditorias} color={PRIMARY} />
                <KpiCard icon={AlertTriangle} title="Total Errores" value={stats.erroresPorEtapa.reduce((s, e) => s + e.cantidad, 0)} color="#EF4444" />
                <KpiCard icon={Users} title="Médicos Auditados" value={stats.rankingMedicos.length} color="#3B82F6" />
                <KpiCard icon={Clock} title="Días Analizados" value={stats.auditoriasPorFecha.length} color="#8B5CF6" />
            </div>

            {/* Gráficos fila 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
                <ChartContainer title="Errores por Etapa" icon={FileBarChart2} isEmpty={stats.erroresPorEtapa.every(e => e.cantidad === 0)}>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={stats.erroresPorEtapa}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                            <XAxis dataKey="etapa" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Bar dataKey="cantidad" fill={PRIMARY} radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartContainer>
                <ChartContainer title="Severidad de Errores" icon={AlertTriangle} isEmpty={stats.erroresPorSeveridad.length === 0}>
                    <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                            <Pie data={stats.erroresPorSeveridad} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={5} dataKey="cantidad" nameKey="severidad">
                                {stats.erroresPorSeveridad.map((_, i) => <Cell key={i} fill={COLORS_CHART[i % COLORS_CHART.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartContainer>
            </div>

            {/* Gráficos fila 2 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
                <ChartContainer title="Top 10 Médicos con Observaciones" icon={Users} isEmpty={stats.rankingMedicos.length === 0}>
                    <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={stats.rankingMedicos} layout="vertical" margin={{ left: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                            <XAxis type="number" stroke="#9CA3AF" fontSize={12} hide />
                            <YAxis dataKey="nombre" type="category" stroke="#6B7280" fontSize={10} width={150} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Bar dataKey="errores" fill="#3B82F6" radius={[0, 6, 6, 0]} barSize={18} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartContainer>
                <ChartContainer title="Errores por Rol Médico" icon={Activity} isEmpty={stats.erroresPorRol.length === 0}>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={stats.erroresPorRol}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                            <XAxis dataKey="rol" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Bar dataKey="cantidad" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartContainer>
            </div>

            {/* Gráficos fila 3 */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
                <ChartContainer title="Volumen de Auditorías" icon={TrendingUp} isEmpty={stats.auditoriasPorFecha.length === 0}>
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={stats.auditoriasPorFecha}>
                            <defs>
                                <linearGradient id="hcColorQty" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                            <XAxis dataKey="fecha" stroke="#9CA3AF" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Area type="monotone" dataKey="cantidad" stroke={PRIMARY} fillOpacity={1} fill="url(#hcColorQty)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </ChartContainer>
                <ChartContainer title="Bisturí Armónico" icon={Scissors} isEmpty={stats.usoBisturi.every(e => e.cantidad === 0)}>
                    <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                            <Pie data={stats.usoBisturi} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={5} dataKey="cantidad" nameKey="tipo">
                                {stats.usoBisturi.map((entry, i) => (
                                    <Cell key={i} fill={entry.tipo === 'SI' ? '#22C55E' : entry.tipo === 'NO' ? '#EF4444' : '#94A3B8'} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartContainer>
            </div>

            {/* Obra Social */}
            <ChartContainer title="Distribución por Obra Social" icon={ShieldCheck} isEmpty={stats.distribucionObraSocial.length === 0}>
                <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={stats.distribucionObraSocial} margin={{ bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                        <XAxis dataKey="nombre" stroke="#9CA3AF" fontSize={10} interval={0} tickLine={false} axisLine={false}
                            tick={(props) => {
                                const { x, y, payload } = props;
                                const label = payload.value.length > 20 ? payload.value.substring(0, 17) + '...' : payload.value;
                                return (<g transform={`translate(${x},${y})`}><text x={0} y={0} dy={16} textAnchor="end" fill="#9CA3AF" transform="rotate(-35)" fontSize={10}>{label}</text></g>);
                            }}
                        />
                        <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} width={30} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="cantidad" fill="#06B6D4" radius={[6, 6, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </ChartContainer>
        </div>
    );
}

// ══════════════════════════════════════════════════════
// TAB: AUDITAR PDF
// ══════════════════════════════════════════════════════
function AuditarPDFTab({ addToast }) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [error, setError] = useState(null);

    const extractTextFromPDF = async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(' ') + '\n';
        }
        return fullText;
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.type !== 'application/pdf') {
            setError('Por favor seleccione un archivo PDF válido');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setResultado(null);

        try {
            const pdfText = await extractTextFromPDF(file);
            if (!pdfText || pdfText.length < 100) {
                throw new Error('El PDF parece estar vacío o no contiene texto extraíble');
            }
            const data = await enviarAuditoriaPDF(pdfText, file.name);
            setResultado(data.resultado);
            addToast?.('Auditoría completada correctamente', 'success');
        } catch (err) {
            if (err instanceof TypeError && err.message.includes('fetch')) {
                setError('Error de conexión. Verifica que la Edge Function esté desplegada correctamente.');
            } else {
                setError(err.message || 'Error al procesar el archivo.');
            }
            addToast?.('Error al procesar el PDF', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
            {!resultado ? (
                <div style={{
                    ...cardStyle, padding: '48px', textAlign: 'center',
                    border: '2px dashed #D1D5DB', background: '#FAFBFC',
                    transition: 'border-color 0.2s, background 0.2s',
                }}
                onMouseOver={e => { e.currentTarget.style.borderColor = PRIMARY; e.currentTarget.style.background = PRIMARY_LIGHT; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.background = '#FAFBFC'; }}
                >
                    {isProcessing ? (
                        <>
                            <Loader2 size={56} style={{ color: PRIMARY, animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: 8 }}>Procesando Historia Clínica...</h3>
                            <p style={{ color: '#6B7280' }}>Analizando fojas, prácticas y errores con IA</p>
                        </>
                    ) : (
                        <>
                            <Upload size={56} style={{ color: '#D1D5DB', margin: '0 auto 16px', transition: 'color 0.2s' }} />
                            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: 8 }}>Cargar Historia Clínica</h3>
                            <p style={{ color: '#6B7280', marginBottom: 24 }}>
                                Arrastre su archivo PDF aquí o haga clic para seleccionar.<br />
                                <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>Solo archivos PDF permitidos</span>
                            </p>
                            <label htmlFor="hc-pdf-upload" style={{
                                display: 'inline-flex', alignItems: 'center', gap: '10px',
                                padding: '14px 32px', background: PRIMARY, color: '#fff',
                                borderRadius: '12px', fontWeight: 700, fontSize: '0.95rem',
                                cursor: 'pointer', transition: 'all 0.2s',
                                boxShadow: '0 4px 14px rgba(30,95,166,0.3)',
                            }}>
                                <FileCheck size={22} /> Seleccionar PDF
                            </label>
                            <input id="hc-pdf-upload" type="file" accept="application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} />
                        </>
                    )}
                    {error && (
                        <div style={{
                            marginTop: 24, padding: '14px 20px', background: '#FEF2F2',
                            border: '1px solid #FECACA', borderRadius: '10px',
                        }}>
                            <p style={{ color: '#DC2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                                <AlertCircle size={18} /> {error}
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div>
                    <div style={{ textAlign: 'center', marginBottom: 20 }}>
                        <button
                            onClick={() => { setResultado(null); setError(null); }}
                            style={{
                                padding: '12px 28px', background: PRIMARY, color: '#fff',
                                border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer',
                                transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(30,95,166,0.3)',
                            }}
                        >Auditar otro archivo</button>
                    </div>

                    {/* Tabla de días de internación */}
                    {resultado.listaDiasInternacion?.length > 0 && (
                        <CollapsibleSection title="Días de Internación" icon={Calendar} defaultOpen={false} badge={`${resultado.listaDiasInternacion.length} días`} badgeColor="#3B82F6">
                            <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F9FAFB' }}>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Día</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Evolución Médica</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Foja Quirúrgica</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Otros Estudios</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {resultado.listaDiasInternacion.map((dia, idx) => {
                                            const esDiaAdmision = idx === 0;
                                            const esUltimoDia = idx === resultado.listaDiasInternacion.length - 1;
                                            const esDiaAlta = esUltimoDia && !resultado.pacienteInternado;
                                            return (
                                                <tr key={dia.fecha} style={{ borderTop: '1px solid #F3F4F6', background: !dia.tieneEvolucion && !esDiaAdmision && !esDiaAlta ? '#FEF2F2' : '#fff' }}>
                                                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111827' }}>
                                                        {dia.fecha}
                                                        {esDiaAdmision && <span style={{ marginLeft: 8, fontSize: '0.7rem', color: '#9CA3AF' }}>(Admisión)</span>}
                                                        {esDiaAlta && <span style={{ marginLeft: 8, fontSize: '0.7rem', color: '#9CA3AF' }}>(Alta)</span>}
                                                        {esUltimoDia && resultado.pacienteInternado && <span style={{ marginLeft: 8, fontSize: '0.7rem', color: '#3B82F6' }}>(Hoy)</span>}
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        {esDiaAdmision ? <span style={{ color: '#9CA3AF' }}>Admisión</span> :
                                                         esDiaAlta ? <span style={{ color: '#9CA3AF' }}>Alta</span> :
                                                         dia.tieneEvolucion ? <span style={{ color: '#16A34A', fontWeight: 600 }}>✓ Sí</span> :
                                                         <span style={{ color: '#DC2626', fontWeight: 600 }}>✗ No (ERROR)</span>}
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        {dia.tieneFojaQuirurgica ? <span style={{ color: '#16A34A', fontWeight: 600 }}>✓ Sí</span> : <span style={{ color: '#D1D5DB' }}>No</span>}
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        {dia.estudios?.length > 0 ? (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                                {dia.estudios.map((estudio, eIdx) => (
                                                                    <span key={eIdx} title={estudio.tipo} style={{
                                                                        display: 'inline-block', padding: '2px 8px',
                                                                        background: PRIMARY_LIGHT, color: PRIMARY,
                                                                        borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600,
                                                                    }}>{abreviarEstudio(estudio.tipo)}</span>
                                                                ))}
                                                            </div>
                                                        ) : <span style={{ color: '#D1D5DB' }}>-</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </CollapsibleSection>
                    )}

                    {/* Informe */}
                    <InformeAuditoria resultado={resultado} />
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════
// INFORME DE AUDITORÍA
// ══════════════════════════════════════════════════════
function InformeAuditoria({ resultado }) {
    const totalErrores = resultado.totalErrores || 0;
    const estadoGeneral = totalErrores === 0 ? 'success' : totalErrores > 5 ? 'error' : 'warning';
    const estadoColors = { success: '#16A34A', warning: '#F59E0B', error: '#DC2626' };
    const estadoLabels = { success: 'Aprobado', warning: 'Requiere Atención', error: 'Crítico' };
    const estadoIcons = { success: CheckCircle, warning: AlertTriangle, error: AlertCircle };
    const StatusIcon = estadoIcons[estadoGeneral];

    return (
        <div>
            {/* Header */}
            <div style={{ ...cardStyle, marginBottom: 16, borderLeft: `4px solid ${estadoColors[estadoGeneral]}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: PRIMARY }}>Informe de Auditoría Médica</h1>
                        <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.85rem' }}>{resultado.nombreArchivo}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: '20px', border: `2px solid ${estadoColors[estadoGeneral]}`, background: `${estadoColors[estadoGeneral]}10` }}>
                        <StatusIcon size={18} style={{ color: estadoColors[estadoGeneral] }} />
                        <span style={{ fontWeight: 700, color: estadoColors[estadoGeneral], fontSize: '0.85rem' }}>{estadoLabels[estadoGeneral]}</span>
                    </div>
                </div>
            </div>

            {/* Métricas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: 16 }}>
                <KpiCard icon={Calendar} title="Días de Hospitalización" value={resultado.diasHospitalizacion} color="#3B82F6" />
                <KpiCard icon={AlertCircle} title="Total de Errores" value={totalErrores} color={estadoColors[estadoGeneral]} />
                <KpiCard icon={Send} title="Comunicaciones" value={resultado.comunicaciones?.length || 0} color="#8B5CF6" />
                <KpiCard icon={Stethoscope} title="Interconsultas" value={resultado.interconsultas?.length || 0} color="#06B6D4" />
            </div>

            {/* Datos del Paciente */}
            <CollapsibleSection title="Datos del Paciente" icon={User} defaultOpen={false}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    {[
                        { label: 'Nombre Completo', value: resultado.datosPaciente?.nombre },
                        { label: 'DNI', value: resultado.datosPaciente?.dni },
                        { label: 'Obra Social', value: resultado.datosPaciente?.obra_social },
                        { label: 'Habitación', value: resultado.datosPaciente?.habitacion },
                    ].map(({ label, value }) => (
                        <div key={label} style={{ padding: '12px 16px', background: '#F9FAFB', borderRadius: '10px' }}>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#9CA3AF', fontWeight: 500 }}>{label}</p>
                            <p style={{ margin: '4px 0 0', fontWeight: 600, color: '#111827' }}>{value || 'No especificado'}</p>
                        </div>
                    ))}
                </div>
            </CollapsibleSection>

            {/* Terapia */}
            {resultado.resultadoTerapia?.esTerapia && (
                <CollapsibleSection title="Clasificación de Terapia" icon={Activity} badge={`${resultado.resultadoTerapia.diasTerapiaIntensiva + resultado.resultadoTerapia.diasTerapiaIntermedia} días`} badgeColor="#EF4444" defaultOpen={false}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                        <KpiCard icon={Activity} title="T. Intensiva" value={resultado.resultadoTerapia.diasTerapiaIntensiva} color="#EF4444" />
                        <KpiCard icon={Activity} title="T. Intermedia" value={resultado.resultadoTerapia.diasTerapiaIntermedia} color="#F59E0B" />
                        <KpiCard icon={Activity} title="Internación General" value={resultado.resultadoTerapia.diasInternacionGeneral} color="#3B82F6" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {resultado.resultadoTerapia.clasificacionPorDia?.map((dia, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#F9FAFB', borderRadius: '8px' }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: dia.clasificacion === 'terapia_intensiva' ? '#EF4444' : dia.clasificacion === 'terapia_intermedia' ? '#F59E0B' : '#3B82F6' }} />
                                <span style={{ fontWeight: 600, color: '#374151', width: 100 }}>{dia.fecha}</span>
                                <span style={{ flex: 1, fontSize: '0.85rem', color: '#6B7280' }}>{dia.justificacion}</span>
                            </div>
                        ))}
                    </div>
                </CollapsibleSection>
            )}

            {/* Interconsultas */}
            {resultado.interconsultas?.length > 0 && (
                <CollapsibleSection title="Interconsultas" icon={Stethoscope} badge={resultado.interconsultas.length} badgeColor="#3B82F6" defaultOpen={false}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {resultado.interconsultas.map((inter, idx) => (
                            <div key={idx} style={{ padding: '14px 16px', background: PRIMARY_LIGHT, borderRadius: '10px', borderLeft: `4px solid ${PRIMARY}` }}>
                                <div style={{ fontWeight: 700, color: PRIMARY, fontSize: '1rem' }}>{inter.especialidad}</div>
                                <p style={{ margin: '4px 0', fontSize: '0.8rem', color: '#6B7280' }}>{inter.fecha} {inter.hora && `- ${inter.hora}`}</p>
                                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#374151' }}><strong>Consultor:</strong> {inter.consultor?.nombre}</p>
                                <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#374151' }}><strong>Motivo:</strong> {inter.motivo}</p>
                                {inter.diagnostico && <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#374151' }}><strong>Diagnóstico:</strong> {inter.diagnostico}</p>}
                            </div>
                        ))}
                    </div>
                </CollapsibleSection>
            )}

            {/* Prácticas Excluidas */}
            {resultado.practicasExcluidas?.length > 0 && (
                <CollapsibleSection title="Prácticas Excluidas" icon={Syringe} badge={resultado.practicasExcluidas.length} badgeColor="#F59E0B" defaultOpen={false}>
                    <div style={{ padding: '10px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', marginBottom: 12 }}>
                        <p style={{ margin: 0, fontWeight: 600, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={16} /> Requieren autorización previa y/o facturación separada</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                        {resultado.practicasExcluidas.map((p, idx) => (
                            <div key={idx} style={{ padding: '12px 14px', background: '#FFFBEB', borderRadius: '10px', border: '1px solid #FDE68A' }}>
                                <p style={{ margin: 0, fontWeight: 700, color: '#78350F' }}>{p.tipo}</p>
                                <p style={{ margin: '4px 0', fontSize: '0.82rem', color: '#92400E' }}>{p.advertencia}</p>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {p.requiere_autorizacion && <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#FECACA', color: '#991B1B', borderRadius: '6px', fontWeight: 600 }}>Requiere Autorización</span>}
                                    {p.facturacion_aparte && <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#DBEAFE', color: '#1E40AF', borderRadius: '6px', fontWeight: 600 }}>Facturación Aparte</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </CollapsibleSection>
            )}

            {/* Endoscopías */}
            {resultado.endoscopias?.length > 0 && (
                <CollapsibleSection title="Endoscopías" icon={FileText} badge={resultado.endoscopias.length} badgeColor="#8B5CF6" defaultOpen={false}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {resultado.endoscopias.map((endo, idx) => (
                            <div key={idx} style={{ padding: '14px 16px', background: '#F5F3FF', borderRadius: '10px', border: '1px solid #DDD6FE' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ fontWeight: 700, color: '#5B21B6' }}>{endo.procedimiento}</span>
                                    {endo.biopsias && <span style={{ padding: '2px 10px', background: '#DDD6FE', color: '#5B21B6', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600 }}>Con biopsias</span>}
                                </div>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#6B7280' }}>{endo.fecha} {endo.hora_inicio && `- ${endo.hora_inicio}`}</p>
                                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#374151' }}><strong>Endoscopista:</strong> {endo.endoscopista?.nombre}</p>
                                {endo.hallazgos && <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#374151', padding: '6px 10px', background: '#fff', borderRadius: '6px' }}><strong>Hallazgos:</strong> {endo.hallazgos}</p>}
                            </div>
                        ))}
                    </div>
                </CollapsibleSection>
            )}

            {/* Errores y Comunicaciones */}
            {totalErrores > 0 && (
                <CollapsibleSection title="Errores Detectados" icon={AlertCircle} badge={totalErrores} badgeColor="#EF4444" defaultOpen={true}>
                    {resultado.comunicaciones?.map((com, idx) => (
                        <div key={idx} style={{ marginBottom: 12, padding: '14px 16px', background: '#FEF2F2', borderRadius: '10px', borderLeft: '4px solid #EF4444' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div>
                                    <span style={{ fontWeight: 700, color: '#991B1B' }}>{com.sector}</span>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#B91C1C' }}>{com.responsable}</p>
                                </div>
                                <span style={{
                                    padding: '2px 10px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
                                    background: com.urgencia === 'ALTA' ? '#FECACA' : com.urgencia === 'MEDIA' ? '#FED7AA' : '#FEF9C3',
                                    color: com.urgencia === 'ALTA' ? '#991B1B' : com.urgencia === 'MEDIA' ? '#9A3412' : '#854D0E',
                                }}>{com.urgencia}</span>
                            </div>
                            <p style={{ fontSize: '0.85rem', color: '#374151', margin: '4px 0 8px' }}>{com.motivo}</p>
                            <div style={{ padding: '10px 12px', background: '#fff', borderRadius: '8px', fontSize: '0.82rem', color: '#4B5563', border: '1px solid #E5E7EB' }}>{com.mensaje}</div>
                        </div>
                    ))}
                </CollapsibleSection>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════
// TAB: HISTORIAL
// ══════════════════════════════════════════════════════
function HistorialTab() {
    const [auditorias, setAuditorias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtrosVisible, setFiltrosVisible] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [estadisticas, setEstadisticas] = useState({ totalAuditorias: 0, auditoriasPendientes: 0, auditoriasAprobadas: 0, totalErrores: 0 });
    const [selectedAuditoria, setSelectedAuditoria] = useState(null);
    const [filtros, setFiltros] = useState({ nombrePaciente: '', dni: '', fechaDesde: '', fechaHasta: '', estado: '', bisturiArmonico: '' });
    const pageSize = 10;

    const cargarDatos = useCallback(async () => {
        setLoading(true);
        const filtrosAplicados = {};
        if (filtros.nombrePaciente) filtrosAplicados.nombrePaciente = filtros.nombrePaciente;
        if (filtros.dni) filtrosAplicados.dni = filtros.dni;
        if (filtros.fechaDesde) filtrosAplicados.fechaDesde = filtros.fechaDesde;
        if (filtros.fechaHasta) filtrosAplicados.fechaHasta = filtros.fechaHasta;
        if (filtros.estado) filtrosAplicados.estado = filtros.estado;
        if (filtros.bisturiArmonico) filtrosAplicados.bisturiArmonico = filtros.bisturiArmonico;

        const { data, count } = await obtenerHistorialAuditorias(filtrosAplicados, currentPage, pageSize);
        setAuditorias(data);
        setTotalCount(count);
        const stats = await obtenerEstadisticasHistorial();
        setEstadisticas(stats);
        setLoading(false);
    }, [currentPage, filtros]);

    useEffect(() => { cargarDatos(); }, [cargarDatos]);

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(dateString));
    };

    const totalPages = Math.ceil(totalCount / pageSize);

    const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #D1D5DB', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', transition: 'border-color 0.2s' };

    return (
        <div>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: 20 }}>
                <KpiCard icon={FileText} title="Total Auditorías" value={estadisticas.totalAuditorias} color={PRIMARY} />
                <KpiCard icon={Clock} title="Pendientes" value={estadisticas.auditoriasPendientes} color="#EF4444" />
                <KpiCard icon={CheckCircle} title="Aprobadas" value={estadisticas.auditoriasAprobadas} color="#16A34A" />
                <KpiCard icon={TrendingUp} title="Total Errores" value={estadisticas.totalErrores} color="#F59E0B" />
            </div>

            {/* Filtros */}
            <div style={{ ...cardStyle, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: filtrosVisible ? 16 : 0 }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', fontWeight: 700, color: '#111827' }}><Filter size={20} style={{ color: PRIMARY }} /> Filtros</h3>
                    <button onClick={() => setFiltrosVisible(!filtrosVisible)} style={{ padding: '8px 16px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                        {filtrosVisible ? 'Ocultar' : 'Mostrar'}
                    </button>
                </div>
                {filtrosVisible && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Paciente</label>
                            <input type="text" value={filtros.nombrePaciente} onChange={e => setFiltros({ ...filtros, nombrePaciente: e.target.value })} placeholder="Buscar por nombre..." style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>DNI</label>
                            <input type="text" value={filtros.dni} onChange={e => setFiltros({ ...filtros, dni: e.target.value })} placeholder="Buscar por DNI..." style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Estado</label>
                            <select value={filtros.estado} onChange={e => setFiltros({ ...filtros, estado: e.target.value })} style={inputStyle}>
                                <option value="">Todos</option>
                                <option value="Aprobado">Aprobado</option>
                                <option value="Pendiente de corrección">Pendiente</option>
                                <option value="En Revisión">En Revisión</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Fecha Desde</label>
                            <input type="date" value={filtros.fechaDesde} onChange={e => setFiltros({ ...filtros, fechaDesde: e.target.value })} style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Fecha Hasta</label>
                            <input type="date" value={filtros.fechaHasta} onChange={e => setFiltros({ ...filtros, fechaHasta: e.target.value })} style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Bisturí Armónico</label>
                            <select value={filtros.bisturiArmonico} onChange={e => setFiltros({ ...filtros, bisturiArmonico: e.target.value })} style={inputStyle}>
                                <option value="">Todos</option>
                                <option value="SI">SI</option>
                                <option value="NO">NO</option>
                                <option value="No determinado">No determinado</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                            <button onClick={() => { setFiltros({ nombrePaciente: '', dni: '', fechaDesde: '', fechaHasta: '', estado: '', bisturiArmonico: '' }); setCurrentPage(1); }} style={{ padding: '10px 16px', background: '#6B7280', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Limpiar</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Tabla */}
            {loading ? (
                <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
                    <Loader2 size={40} style={{ color: PRIMARY, animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                    <p style={{ color: '#6B7280' }}>Cargando historial...</p>
                </div>
            ) : auditorias.length === 0 ? (
                <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
                    <FileText size={48} style={{ color: '#D1D5DB', margin: '0 auto 12px' }} />
                    <h3 style={{ color: '#111827', fontSize: '1.1rem', fontWeight: 700 }}>Sin auditorías</h3>
                    <p style={{ color: '#6B7280' }}>No hay registros con los filtros seleccionados</p>
                </div>
            ) : (
                <>
                    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: `linear-gradient(135deg, ${PRIMARY}, #2563EB)`, color: '#fff' }}>
                                        {['Fecha', 'Paciente', 'DNI', 'Obra Social', 'Errores', 'Estado', 'Archivo'].map(h => (
                                            <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, fontSize: '0.78rem' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditorias.map(a => (
                                        <tr key={a.id} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.15s', cursor: 'pointer' }}
                                            onMouseOver={e => e.currentTarget.style.background = '#F9FAFB'}
                                            onMouseOut={e => e.currentTarget.style.background = '#fff'}
                                            onClick={() => setSelectedAuditoria(a)}
                                        >
                                            <td style={{ padding: '12px 14px', color: '#374151' }}>{formatDate(a.created_at)}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600, color: '#111827' }}>{a.nombre_paciente}</td>
                                            <td style={{ padding: '12px 14px', color: '#6B7280' }}>{a.dni_paciente}</td>
                                            <td style={{ padding: '12px 14px', color: '#6B7280' }}>{a.obra_social || 'N/A'}</td>
                                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 700,
                                                    background: a.total_errores === 0 ? '#DCFCE7' : a.total_errores <= 5 ? '#FEF9C3' : '#FEE2E2',
                                                    color: a.total_errores === 0 ? '#166534' : a.total_errores <= 5 ? '#854D0E' : '#991B1B',
                                                }}>{a.total_errores}</span>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600,
                                                    background: a.total_errores === 0 ? '#DCFCE7' : '#FEE2E2',
                                                    color: a.total_errores === 0 ? '#166534' : '#991B1B',
                                                }}>
                                                    {a.total_errores === 0 ? <><CheckCircle size={14} /> Aprobado</> : <><AlertCircle size={14} /> Pendiente</>}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 14px', color: '#6B7280', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre_archivo}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 }}>
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                                style={{ padding: '8px 16px', background: currentPage === 1 ? '#E5E7EB' : '#6B7280', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: currentPage === 1 ? 'default' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}>
                                Anterior
                            </button>
                            <span style={{ fontWeight: 600, color: '#374151', fontSize: '0.85rem' }}>Página {currentPage} de {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                                style={{ padding: '8px 16px', background: currentPage === totalPages ? '#E5E7EB' : '#6B7280', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1 }}>
                                Siguiente
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Modal detalle */}
            {selectedAuditoria && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}
                    onClick={() => setSelectedAuditoria(null)}>
                    <div style={{ ...cardStyle, maxWidth: 700, width: '100%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#111827' }}>Detalle de Auditoría</h2>
                            <button onClick={() => setSelectedAuditoria(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: '#9CA3AF' }}>×</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {[
                                { l: 'Paciente', v: selectedAuditoria.nombre_paciente },
                                { l: 'DNI', v: selectedAuditoria.dni_paciente },
                                { l: 'Obra Social', v: selectedAuditoria.obra_social },
                                { l: 'Estado', v: selectedAuditoria.estado },
                                { l: 'Total Errores', v: selectedAuditoria.total_errores },
                                { l: 'Bisturí Armónico', v: selectedAuditoria.bisturi_armonico },
                                { l: 'Err. Admisión', v: selectedAuditoria.errores_admision },
                                { l: 'Err. Evoluciones', v: selectedAuditoria.errores_evoluciones },
                                { l: 'Err. Foja Quir.', v: selectedAuditoria.errores_foja_quirurgica },
                                { l: 'Err. Alta Médica', v: selectedAuditoria.errores_alta_medica },
                                { l: 'Err. Epicrisis', v: selectedAuditoria.errores_epicrisis },
                                { l: 'Archivo', v: selectedAuditoria.nombre_archivo },
                            ].map(({ l, v }) => (
                                <div key={l} style={{ padding: '10px 14px', background: '#F9FAFB', borderRadius: '8px' }}>
                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 500 }}>{l}</p>
                                    <p style={{ margin: '2px 0 0', fontWeight: 600, color: '#111827', fontSize: '0.88rem' }}>{v ?? 'N/A'}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════
// TAB: DOCUMENTACIÓN
// ══════════════════════════════════════════════════════
function DocumentacionTab() {
    const sectionStyle = { ...cardStyle, marginBottom: 16, borderLeft: '4px solid' };
    return (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#111827' }}>Sistema de Auditoría Médica</h1>
                <p style={{ fontSize: '1.05rem', color: PRIMARY, fontWeight: 600 }}>Sanatorio Argentino — San Juan</p>
                <p style={{ color: '#6B7280', maxWidth: 600, margin: '8px auto 0' }}>Automatización inteligente mediante algoritmos avanzados para la detección de errores y clasificación clínica.</p>
            </div>

            <div style={{ ...sectionStyle, borderLeftColor: PRIMARY }}>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={20} style={{ color: PRIMARY }} /> Descripción General</h2>
                <p style={{ color: '#4B5563', lineHeight: 1.6 }}>El sistema verifica la presencia de documentos clínicos e implementa un motor de análisis semántico para interpretar la narrativa médica, clasificar internaciones, detectar prácticas complejas y asegurar la trazabilidad clínica.</p>
            </div>

            <div style={{ ...sectionStyle, borderLeftColor: '#8B5CF6' }}>
                <h2 style={{ margin: '0 0 12px', fontSize: '1.1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}><Activity size={20} style={{ color: '#8B5CF6' }} /> Módulos de Análisis</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
                    {[
                        { icon: Activity, color: '#8B5CF6', bg: '#F5F3FF', title: 'Clasificación de Terapia', desc: 'Distingue Terapia Intensiva vs Intermedia. Justifica complejidad por día.' },
                        { icon: Stethoscope, color: '#3B82F6', bg: '#EFF6FF', title: 'Interconsultas', desc: 'Rastrea solicitudes de valoración por especialistas en evoluciones.' },
                        { icon: Syringe, color: '#F59E0B', bg: '#FFFBEB', title: 'Prácticas Excluidas', desc: 'Detecta procedimientos que requieren autorización previa.' },
                        { icon: Search, color: '#EC4899', bg: '#FDF2F8', title: 'Endoscopías', desc: 'Seguimiento de procedimientos endoscópicos con biopsias.' },
                    ].map(m => (
                        <div key={m.title} style={{ padding: '14px 16px', background: m.bg, borderRadius: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <m.icon size={18} style={{ color: m.color }} />
                                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>{m.title}</h3>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#4B5563' }}>{m.desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ ...sectionStyle, borderLeftColor: '#16A34A' }}>
                <h2 style={{ margin: '0 0 12px', fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>Flujo de Trabajo</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                        { n: 1, title: 'Carga del PDF', desc: 'Subida y extracción de texto mediante lectura directa.' },
                        { n: 2, title: 'Procesamiento con IA', desc: 'Análisis textual estructurado para extraer indicadores clínicos.' },
                        { n: 3, title: 'Auditoría de Procesos', desc: 'Cruce de datos: cirugía → foja, catéter → autorización, terapia → justificación.' },
                        { n: 4, title: 'Reporte y Acción', desc: 'Presentación de resultados en Dashboard con tablero de control.' },
                    ].map(s => (
                        <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', background: '#F0FDF4', borderRadius: '10px' }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#16A34A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem', flexShrink: 0 }}>{s.n}</div>
                            <div>
                                <h4 style={{ margin: 0, fontWeight: 700, color: '#111827' }}>{s.title}</h4>
                                <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#4B5563' }}>{s.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════
export default function AuditoriaPDFPanel({ addToast }) {
    const [activeTab, setActiveTab] = useState('dashboard');

    const tabs = [
        { id: 'dashboard', label: 'Estadísticas', icon: LayoutDashboard },
        { id: 'auditar', label: 'Auditar PDF', icon: FileCheck },
        { id: 'historial', label: 'Historial', icon: History },
        { id: 'documentacion', label: 'Documentación', icon: FileText },
    ];

    return (
        <div style={{ padding: '24px', background: BG, minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Stethoscope size={28} style={{ color: PRIMARY }} />
                        Auditoría HC por PDF
                    </h1>
                    <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.9rem' }}>Sistema de auditoría médica inteligente</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: '20px', background: '#DCFCE7', border: '1px solid #BBF7D0' }}>
                    <Activity size={16} style={{ color: '#16A34A' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#166534' }}>Sistema Activo</span>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} style={tabBtnStyle(activeTab === t.id)}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <t.icon size={16} />
                            {t.label}
                        </span>
                    </button>
                ))}
            </div>

            {/* Content */}
            {activeTab === 'dashboard' && <DashboardTab />}
            {activeTab === 'auditar' && <AuditarPDFTab addToast={addToast} />}
            {activeTab === 'historial' && <HistorialTab />}
            {activeTab === 'documentacion' && <DocumentacionTab />}

            {/* CSS Keyframes */}
            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
