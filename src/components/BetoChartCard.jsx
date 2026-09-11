import React, { useState, useRef } from 'react';
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { Maximize2, Minimize2, Download, FileText, X, Sparkles } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const PALETTE = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#64748B'];

export default function BetoChartCard({ chartData }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const containerRef = useRef(null);

    if (!chartData || !chartData.data || chartData.data.length === 0) return null;

    const { type = 'bar', title = 'Gráfico Analítico', data = [], xKey = 'label', yKey = 'value', unit = '' } = chartData;

    // Identificar si vienen series específicas o si se deben autodetectar dinámicamente
    const autoSeries = React.useMemo(() => {
        if (chartData.series && Array.isArray(chartData.series) && chartData.series.length > 0) {
            return chartData.series;
        }
        if (chartData.lines && Array.isArray(chartData.lines) && chartData.lines.length > 0) {
            return chartData.lines;
        }

        // Inspeccionar las llaves numéricas de los elementos de data
        if (!data || data.length === 0) return [];
        const ignoredKeys = new Set(['label', 'name', 'fecha', 'fechaLabel', 'color', 'key', 'id']);
        const detectedKeySet = new Set();
        data.forEach(item => {
            if (item && typeof item === 'object') {
                Object.keys(item).forEach(k => {
                    if (!ignoredKeys.has(k) && typeof item[k] === 'number') {
                        detectedKeySet.add(k);
                    }
                });
            }
        });
        const numericKeys = Array.from(detectedKeySet);

        if (numericKeys.length > 1) {
            return numericKeys.map((key, idx) => {
                const kLower = key.toLowerCase();
                let name = key;
                let stroke = PALETTE[idx % PALETTE.length];
                let yAxisId = 'left';
                let unitStr = unit;

                if (kLower.includes('fio2')) {
                    name = 'FiO2 (%)';
                    stroke = '#2563EB';
                    yAxisId = 'left';
                    unitStr = '%';
                } else if (kLower.includes('peep')) {
                    name = 'PEEP (cmH2O)';
                    stroke = '#D97706';
                    yAxisId = 'right';
                    unitStr = 'cmH2O';
                } else if (kLower.includes('pafio') || kLower.includes('kirby')) {
                    name = 'PaFiO2';
                    stroke = '#0284C7';
                    unitStr = '';
                } else if (kLower.includes('sat_fio2') || kLower.includes('sat/fio2')) {
                    name = 'Sat/FiO2';
                    stroke = '#0D9488';
                    unitStr = '';
                } else if (kLower.includes('pico') || kLower.includes('ppico')) {
                    name = 'Presión Pico (cmH2O)';
                    stroke = '#DC2626';
                    yAxisId = 'right';
                    unitStr = 'cmH2O';
                } else if (kLower.includes('vt') || kLower.includes('volumen')) {
                    name = 'Volumen Tidal (ml)';
                    stroke = '#059669';
                    yAxisId = 'left';
                    unitStr = 'ml';
                } else if (kLower.includes('balon')) {
                    name = 'Balón (cmH2O)';
                    stroke = '#8B5CF6';
                    yAxisId = 'right';
                    unitStr = 'cmH2O';
                } else if (kLower.includes('ims')) {
                    name = 'Escala IMS (0-10)';
                    stroke = '#2563EB';
                } else if (kLower.includes('mrc')) {
                    name = 'Fuerza MRC (0-60)';
                    stroke = '#10B981';
                }

                return {
                    key,
                    name,
                    stroke,
                    yAxisId,
                    unit: unitStr
                };
            });
        }

        // Si solo hay una clave numérica o ninguna
        const singleKey = numericKeys.find(k => k === 'value') || numericKeys[0] || 'value';
        return [{ key: singleKey, name: title || 'Valor', stroke: '#2563EB', yAxisId: 'left', unit }];
    }, [chartData, data, title, unit]);

    const hasDualAxis = autoSeries.some(s => s.yAxisId === 'right');

    // Normalizar data asegurando que cada fila tenga su label y valores limpios
    const normalizedData = React.useMemo(() => {
        return data.map((d, idx) => {
            const row = {
                label: d.label || d.name || d.fechaLabel || d.fecha || d.especialidad || d.servicio || `Ítem ${idx + 1}`,
                color: d.color || PALETTE[idx % PALETTE.length],
                ...d
            };

            autoSeries.forEach(s => {
                let val = d[s.key];
                if (val === undefined && s.key === 'value') {
                    val = d.cantidad ?? d.total ?? d.monto ?? d.count;
                }
                // Si FiO2 viene en decimal ej: 0.40 -> 40%
                if (s.key.toLowerCase().includes('fio2') && val !== null && val !== undefined && val <= 1 && val > 0) {
                    val = Math.round(val * 100);
                }
                row[s.key] = val !== null && val !== undefined ? Number(val) : null;
            });

            if (row.value === undefined || row.value === null) {
                const primarySeries = autoSeries[0];
                row.value = primarySeries ? (row[primarySeries.key] ?? 0) : 0;
            }

            return row;
        });
    }, [data, autoSeries]);

    const totalValue = normalizedData.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);

    // Exportar a PDF
    const handleDownloadPdf = (e) => {
        e?.stopPropagation();
        const doc = new jsPDF('portrait');
        doc.setFontSize(16);
        doc.setTextColor(30, 64, 175);
        doc.text('Sanatorio Argentino — Reporte Analítico Beto AI', 14, 18);
        doc.setFontSize(12);
        doc.setTextColor(51, 65, 85);
        doc.text(`Gráfico: ${title}`, 14, 26);
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(`Generado automáticamente el ${new Date().toLocaleString('es-AR')}`, 14, 32);

        // Tabla de datos tabulados según series
        const isMulti = autoSeries.length > 1;
        const head = isMulti
            ? [['Punto / Fecha', ...autoSeries.map(s => s.name)]]
            : [['Categoría / Dimensión', 'Valor / Conteo', 'Participación (%)']];

        const rows = normalizedData.map(d => {
            if (isMulti) {
                return [
                    d.label,
                    ...autoSeries.map(s => {
                        const v = d[s.key];
                        return v !== null && v !== undefined ? `${v.toLocaleString('es-AR')} ${s.unit || ''}`.trim() : '—';
                    })
                ];
            }
            return [
                d.label,
                `${(d.value || 0).toLocaleString('es-AR')} ${unit}`.trim(),
                totalValue > 0 ? `${(((d.value || 0) / totalValue) * 100).toFixed(1)}%` : '-'
            ];
        });

        autoTable(doc, {
            head,
            body: rows,
            startY: 38,
            theme: 'grid',
            headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold' },
            styles: { fontSize: 9, cellPadding: 3 },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });

        const safeName = title.replace(/[^a-zA-Z0-9_-]/g, '_');
        doc.save(`Beto_${safeName}.pdf`);
    };

    const renderChartGraphic = (height = 200, isModal = false) => {
        if (type === 'pie' || type === 'donut') {
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <PieChart>
                        <Pie
                            data={normalizedData}
                            dataKey="value"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            innerRadius={type === 'donut' ? (isModal ? 70 : 45) : 0}
                            outerRadius={isModal ? 120 : 75}
                            paddingAngle={2}
                        >
                            {normalizedData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip 
                            formatter={(val) => [`${(val || 0).toLocaleString('es-AR')} ${unit}`, 'Cantidad']} 
                            contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                        />
                        <Legend wrapperStyle={{ fontSize: isModal ? '0.85rem' : '0.72rem', paddingTop: '6px' }} />
                    </PieChart>
                </ResponsiveContainer>
            );
        }

        if (type === 'line') {
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <LineChart data={normalizedData} margin={{ top: 10, right: hasDualAxis ? 30 : 15, left: -5, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="label" stroke="#64748B" fontSize={isModal ? 12 : 10} />
                        
                        {/* Eje Y Principal (Izquierdo) */}
                        <YAxis 
                            yAxisId="left" 
                            stroke={hasDualAxis ? '#2563EB' : '#64748B'} 
                            fontSize={isModal ? 12 : 10} 
                            domain={['auto', 'auto']}
                        />

                        {/* Eje Y Secundario (Derecho) para PEEP, Presión Pico, etc. */}
                        {hasDualAxis && (
                            <YAxis 
                                yAxisId="right" 
                                orientation="right" 
                                stroke="#D97706" 
                                fontSize={isModal ? 12 : 10} 
                                domain={[0, 'dataMax + 5']}
                            />
                        )}

                        <Tooltip 
                            formatter={(val, name) => {
                                if (val === null || val === undefined) return ['—', name];
                                const s = autoSeries.find(item => item.name === name || item.key === name);
                                const u = s?.unit || unit || '';
                                return [`${Number(val).toLocaleString('es-AR')} ${u}`.trim(), s?.name || name];
                            }}
                            contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem', backgroundColor: '#FFFFFF' }}
                        />
                        
                        <Legend wrapperStyle={{ fontSize: isModal ? '0.82rem' : '0.72rem', paddingTop: '4px' }} />

                        {/* Renderizar cada línea según series detectadas */}
                        {autoSeries.map(s => (
                            <Line 
                                key={s.key}
                                yAxisId={s.yAxisId || 'left'} 
                                type="monotone" 
                                dataKey={s.key} 
                                name={s.name} 
                                stroke={s.stroke || '#2563EB'} 
                                strokeWidth={2.5} 
                                dot={{ r: 3.5, fill: s.stroke || '#2563EB' }} 
                                activeDot={{ r: 5.5 }}
                                connectNulls
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            );
        }

        // Default: Bar Chart
        return (
            <ResponsiveContainer width="100%" height={height}>
                <BarChart data={normalizedData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="label" stroke="#64748B" fontSize={isModal ? 12 : 10} />
                    <YAxis stroke="#64748B" fontSize={isModal ? 12 : 10} />
                    <Tooltip 
                        formatter={(val) => [`${(val || 0).toLocaleString('es-AR')} ${unit}`, 'Cantidad']} 
                        contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {normalizedData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        );
    };

    return (
        <>
            {/* Tarjeta compacta dentro del chat */}
            <div 
                ref={containerRef}
                onClick={() => setIsExpanded(true)}
                style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    marginTop: '10px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden'
                }}
                onMouseOver={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(37, 99, 235, 0.1)';
                    e.currentTarget.style.borderColor = '#BFDBFE';
                }}
                onMouseOut={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
                    e.currentTarget.style.borderColor = '#E2E8F0';
                }}
            >
                {/* Header de la tarjeta */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={14} color="#2563EB" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                            {title}
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                            onClick={handleDownloadPdf}
                            title="Descargar PDF"
                            style={{
                                background: '#F1F5F9',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '4px',
                                color: '#475569',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            <Download size={13} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
                            title="Expandir gráfico (Pantalla Completa)"
                            style={{
                                background: '#EFF6FF',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '4px',
                                color: '#1E40AF',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            <Maximize2 size={13} />
                        </button>
                    </div>
                </div>

                {/* Lienzo del gráfico */}
                <div style={{ pointerEvents: 'none' }}>
                    {renderChartGraphic(180, false)}
                </div>

                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '6px',
                    paddingTop: '6px',
                    borderTop: '1px solid #F1F5F9',
                    fontSize: '0.7rem',
                    color: '#64748B'
                }}>
                    <span>
                        {autoSeries.length > 1 ? (
                            <>Series: <strong style={{ color: '#1E293B' }}>{autoSeries.map(s => s.name).join(' • ')}</strong></>
                        ) : type === 'line' ? (
                            <>Controles evolutivos: <strong style={{ color: '#1E293B' }}>{normalizedData.length} mediciones</strong></>
                        ) : (
                            <>Total acumulado: <strong style={{ color: '#1E293B' }}>{totalValue.toLocaleString('es-AR')} {unit}</strong></>
                        )}
                    </span>
                    <span style={{ color: '#2563EB', fontWeight: 600 }}>Toca para expandir 🔍</span>
                </div>
            </div>

            {/* Modal de Expansión / Zoom a Pantalla Completa */}
            {isExpanded && (
                <div 
                    onClick={() => setIsExpanded(false)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 20000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '24px',
                        animation: 'fadeIn 0.2s ease-out'
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#FFFFFF',
                            borderRadius: '16px',
                            width: '100%',
                            maxWidth: '900px',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            border: '1px solid #E2E8F0',
                            overflow: 'hidden',
                            animation: 'scaleUp 0.25s ease-out'
                        }}
                    >
                        {/* Modal Header */}
                        <div style={{
                            padding: '18px 24px',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#F8FAFC'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                                    {title}
                                </h3>
                                <span style={{ fontSize: '0.8rem', color: '#64748B', display: 'block', marginTop: '2px' }}>
                                    Vista detallada e interactiva generada por Beto AI • Total: {totalValue.toLocaleString('es-AR')} {unit}
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    onClick={handleDownloadPdf}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '7px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #BFDBFE',
                                        background: '#EFF6FF',
                                        color: '#1E40AF',
                                        fontSize: '0.82rem',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Download size={14} />
                                    Descargar PDF
                                </button>
                                <button
                                    onClick={() => setIsExpanded(false)}
                                    style={{
                                        background: '#FFFFFF',
                                        border: '1px solid #CBD5E1',
                                        width: '34px',
                                        height: '34px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        color: '#64748B'
                                    }}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body: Gráfico Expandido */}
                        <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                            <div style={{ width: '100%', height: '320px', marginBottom: '24px' }}>
                                {renderChartGraphic(320, true)}
                            </div>

                            {/* Tabla de desglose */}
                            <div style={{
                                border: '1px solid #E2E8F0',
                                borderRadius: '10px',
                                overflow: 'hidden'
                            }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                                    <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                        <tr>
                                            <th style={{ padding: '8px 12px', color: '#475569', fontWeight: 700 }}>Categoría</th>
                                            <th style={{ padding: '8px 12px', color: '#475569', fontWeight: 700, textAlign: 'right' }}>Valor ({unit || 'Casos'})</th>
                                            <th style={{ padding: '8px 12px', color: '#475569', fontWeight: 700, textAlign: 'right' }}>Participación</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {normalizedData.map((d, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                                                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{d.label}</span>
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1E40AF' }}>
                                                    {d.value.toLocaleString('es-AR')}
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748B' }}>
                                                    {totalValue > 0 ? `${((d.value / totalValue) * 100).toFixed(1)}%` : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
