/**
 * BetoComponents — Rich response components for Beto chat
 * 
 * Estos componentes se renderizan inline en las burbujas del chat de Beto
 * cuando las respuestas contienen datos estructurados.
 * 
 * Ideas: #2 (Mini-Dashboard), #8 (Navigation Preview), #9 (Export), #20 (Excel Download)
 */
import { useState } from 'react';
import {
    Download, Printer, FileSpreadsheet, ArrowRight,
    Stethoscope, DollarSign, MessageCircle, ClipboardCheck,
    Ticket, Brain, Settings, Home, BarChart3, PackageCheck, Microscope,
    FileText, TrendingUp, TrendingDown, Minus, CheckCircle, AlertTriangle, XCircle,
    Presentation, Loader2,
} from 'lucide-react';

// ─── MODULE METADATA (for #8 Navigation Preview) ───
const MODULE_META = {
    inicio: { icon: Home, label: 'Inicio', color: '#3B82F6', description: 'Dashboard principal' },
    mensajeria: { icon: MessageCircle, label: 'Mensajería', color: '#25D366', description: 'Chat WhatsApp bidireccional' },
    pedidos: { icon: FileText, label: 'Pedidos', color: '#6366F1', description: 'Emisión de pedidos médicos' },
    cirugias: { icon: Stethoscope, label: 'Cirugías', color: '#10B981', description: 'Control del quirófano' },
    deudas: { icon: DollarSign, label: 'Deudas', color: '#F59E0B', description: 'Seguimiento de cobros' },
    altas: { icon: ClipboardCheck, label: 'Altas Adm', color: '#8B5CF6', description: 'Control de altas médicas' },
    turnos: { icon: Ticket, label: 'Turnos', color: '#EC4899', description: 'Cola de turnos del día' },
    metricas: { icon: BarChart3, label: 'Métricas', color: '#14B8A6', description: 'Estadísticas de cirugías' },
    asociaciones_entrega: { icon: PackageCheck, label: 'Asociaciones', color: '#F97316', description: 'Documentación de asociaciones' },
    laboratorios: { icon: Microscope, label: 'Laboratorios', color: '#7C3AED', description: 'Anatomía patológica' },
    simon: { icon: Brain, label: 'Simón IA', color: '#0EA5E9', description: 'Procesamiento de documentos' },
    config: { icon: Settings, label: 'Configuración', color: '#64748B', description: 'Ajustes del sistema' },
};

// ─── #2: Mini-Dashboard Stats Card ───
export function BetoStatsCard({ stats }) {
    if (!stats || !stats.items) return null;
    return (
        <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${Math.min(stats.items.length, 3)}, 1fr)`,
            gap: '8px', margin: '8px 0',
        }}>
            {stats.items.map((item, i) => {
                const trendIcon = item.trend === 'up' ? TrendingUp :
                    item.trend === 'down' ? TrendingDown : Minus;
                const TrendIcon = trendIcon;
                const trendColor = item.trend === 'up' ? '#10B981' :
                    item.trend === 'down' ? '#EF4444' : '#94A3B8';

                return (
                    <div key={i} style={{
                        padding: '12px', borderRadius: '12px',
                        background: `linear-gradient(135deg, ${item.color || '#6366F1'}10 0%, ${item.color || '#6366F1'}05 100%)`,
                        border: `1px solid ${item.color || '#6366F1'}20`,
                        textAlign: 'center',
                    }}>
                        <div style={{
                            fontSize: '1.4rem', fontWeight: 800,
                            color: item.color || '#6366F1', lineHeight: 1.2,
                        }}>{item.value}</div>
                        <div style={{
                            fontSize: '0.68rem', fontWeight: 600,
                            color: '#64748B', marginTop: '2px',
                        }}>{item.label}</div>
                        {item.trend && (
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '2px', marginTop: '4px',
                                fontSize: '0.6rem', fontWeight: 700, color: trendColor,
                            }}>
                                <TrendIcon size={10} />
                                {item.trendValue || ''}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── #2: Status Pipeline (for surgery status visualization) ───
export function BetoStatusPipeline({ pipeline }) {
    if (!pipeline || !pipeline.items) return null;
    const total = pipeline.items.reduce((sum, i) => sum + (i.count || 0), 0);
    const statusColors = {
        lila: '#A855F7', amarillo: '#F59E0B', verde: '#10B981',
        azul: '#3B82F6', rojo: '#EF4444', precaucion: '#F97316',
    };

    return (
        <div style={{ margin: '8px 0' }}>
            {/* Progress bar */}
            <div style={{
                display: 'flex', height: '8px', borderRadius: '4px',
                overflow: 'hidden', background: '#F1F5F9',
            }}>
                {pipeline.items.map((item, i) => (
                    <div key={i} style={{
                        width: total > 0 ? `${(item.count / total) * 100}%` : '0%',
                        background: statusColors[item.status] || '#94A3B8',
                        transition: 'width 0.5s ease',
                    }} />
                ))}
            </div>
            {/* Labels */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px',
            }}>
                {pipeline.items.map((item, i) => (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        fontSize: '0.68rem', color: '#64748B',
                    }}>
                        <div style={{
                            width: '8px', height: '8px', borderRadius: '2px',
                            background: statusColors[item.status] || '#94A3B8',
                        }} />
                        <span style={{ fontWeight: 700 }}>{item.count}</span>
                        <span>{item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── #8: Module Preview Card ───
export function BetoModulePreview({ moduleId, onNavigate }) {
    const meta = MODULE_META[moduleId];
    if (!meta) return null;
    const Icon = meta.icon;

    return (
        <button
            onClick={() => onNavigate?.(moduleId)}
            style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                width: '100%', padding: '12px 14px',
                borderRadius: '12px', border: `1px solid ${meta.color}30`,
                background: `linear-gradient(135deg, ${meta.color}08 0%, ${meta.color}03 100%)`,
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.2s', marginTop: '8px',
            }}
            onMouseOver={e => {
                e.currentTarget.style.background = `${meta.color}15`;
                e.currentTarget.style.transform = 'translateX(4px)';
            }}
            onMouseOut={e => {
                e.currentTarget.style.background = `linear-gradient(135deg, ${meta.color}08 0%, ${meta.color}03 100%)`;
                e.currentTarget.style.transform = 'translateX(0)';
            }}
        >
            <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: `${meta.color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
            }}>
                <Icon size={20} style={{ color: meta.color }} />
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>
                    {meta.label}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                    {meta.description}
                </div>
            </div>
            <ArrowRight size={16} style={{ color: meta.color, opacity: 0.6 }} />
        </button>
    );
}

// ─── #9: Export Action Bar ───
export function BetoExportBar({ onExportExcel, onPrint, onPresentation }) {
    const actions = [
        { label: 'Excel', icon: FileSpreadsheet, color: '#10B981', onClick: onExportExcel },
        { label: 'Imprimir', icon: Printer, color: '#3B82F6', onClick: onPrint },
        ...(onPresentation ? [{ label: 'Presentar', icon: Presentation, color: '#8B5CF6', onClick: onPresentation }] : []),
    ];

    return (
        <div style={{
            display: 'flex', gap: '6px', marginTop: '8px',
            padding: '8px', background: '#F8FAFC', borderRadius: '10px',
            border: '1px solid #E2E8F0',
        }}>
            {actions.map((action, i) => {
                const Icon = action.icon;
                return (
                    <button
                        key={i}
                        onClick={action.onClick}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '6px 12px', borderRadius: '8px',
                            border: `1px solid ${action.color}30`,
                            background: `${action.color}08`, color: action.color,
                            fontSize: '0.72rem', fontWeight: 600,
                            cursor: 'pointer', transition: 'all 0.15s',
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = `${action.color}20`; }}
                        onMouseOut={e => { e.currentTarget.style.background = `${action.color}08`; }}
                    >
                        <Icon size={13} />
                        {action.label}
                    </button>
                );
            })}
        </div>
    );
}

// ─── #13: Prediction/Insight Card ───
export function BetoInsightCard({ insight }) {
    if (!insight) return null;
    const typeConfig = {
        positive: { icon: CheckCircle, color: '#10B981', bg: '#F0FDF4', border: '#BBF7D0' },
        warning: { icon: AlertTriangle, color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' },
        negative: { icon: XCircle, color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
        info: { icon: TrendingUp, color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE' },
    };
    const config = typeConfig[insight.type] || typeConfig.info;
    const Icon = config.icon;

    return (
        <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            padding: '10px 14px', borderRadius: '10px',
            background: config.bg, border: `1px solid ${config.border}`,
            margin: '8px 0',
        }}>
            <Icon size={16} style={{ color: config.color, flexShrink: 0, marginTop: '1px' }} />
            <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: config.color }}>
                    {insight.title}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px', lineHeight: 1.4 }}>
                    {insight.description}
                </div>
            </div>
        </div>
    );
}

// ─── #20: Excel Download Component ───
export function BetoExcelDownload({ excelData }) {
    if (!excelData || !excelData.columns || !excelData.data) return null;
    const [downloading, setDownloading] = useState(false);
    const [downloaded, setDownloaded] = useState(false);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const XLSX = await import('xlsx');

            // Build header row with filters subtitle
            const headerRows = [];
            if (excelData.filters) {
                headerRows.push([`Reporte: ${excelData.reportName || 'Datos'}`]);
                headerRows.push([`Filtros: ${excelData.filters}`]);
                headerRows.push([`Generado: ${new Date().toLocaleDateString('es-AR')} por Beto IA`]);
                headerRows.push([]); // Empty row separator
            }
            headerRows.push(excelData.columns);

            // Build worksheet data
            const wsData = [...headerRows, ...excelData.data];
            const ws = XLSX.utils.aoa_to_sheet(wsData);

            // Style column widths based on header lengths
            ws['!cols'] = excelData.columns.map((col, i) => {
                const maxLen = Math.max(
                    col.length,
                    ...excelData.data.slice(0, 50).map(row => String(row[i] || '').length)
                );
                return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
            });

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, excelData.sheetName || 'Datos');

            const fileName = `${excelData.reportName || 'Reporte_Beto'}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);

            setDownloaded(true);
            setTimeout(() => setDownloaded(false), 4000);
        } catch (err) {
            console.error('[BetoExcelDownload] Error:', err);
        } finally {
            setDownloading(false);
        }
    };

    const rowCount = excelData.data?.length || 0;

    return (
        <div style={{
            margin: '10px 0',
            padding: '12px 14px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #10B98108 0%, #10B98103 100%)',
            border: '1px solid #10B98125',
        }}>
            {/* File info */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px',
            }}>
                <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: '#10B98118',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <FileSpreadsheet size={18} style={{ color: '#10B981' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: '0.82rem', fontWeight: 700, color: '#1E293B',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {excelData.reportName?.replace(/_/g, ' ') || 'Reporte Excel'}
                    </div>
                    <div style={{
                        fontSize: '0.68rem', color: '#64748B', marginTop: '1px',
                        display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                        <span>📊 {rowCount} registros</span>
                        {excelData.filters && <span>• {excelData.filters}</span>}
                    </div>
                </div>
            </div>

            {/* Download button */}
            <button
                onClick={handleDownload}
                disabled={downloading}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '8px', width: '100%',
                    padding: '8px 16px', borderRadius: '10px',
                    border: 'none',
                    background: downloaded
                        ? 'linear-gradient(135deg, #10B981, #059669)'
                        : downloading
                            ? '#E2E8F0'
                            : 'linear-gradient(135deg, #10B981, #059669)',
                    color: downloading ? '#64748B' : '#fff',
                    fontSize: '0.8rem', fontWeight: 700,
                    cursor: downloading ? 'wait' : 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: downloading ? 'none' : '0 2px 8px rgba(16, 185, 129, 0.3)',
                }}
                onMouseOver={e => {
                    if (!downloading) {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                    }
                }}
                onMouseOut={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = downloading ? 'none' : '0 2px 8px rgba(16, 185, 129, 0.3)';
                }}
            >
                {downloading ? (
                    <>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        Generando Excel...
                    </>
                ) : downloaded ? (
                    <>
                        <CheckCircle size={14} />
                        ¡Descargado! ✅
                    </>
                ) : (
                    <>
                        <Download size={14} />
                        📥 Descargar Excel ({rowCount} registros)
                    </>
                )}
            </button>
        </div>
    );
}

// ─── Rich Response Parser ───
// Parses Beto's response text for embedded JSON blocks and renders rich components
export function parseRichContent(text, onNavigate) {
    if (!text) return { text, richBlocks: [] };
    const richBlocks = [];
    let cleanText = text;

    // Parse ```beto-stats JSON blocks
    const statsRegex = /```beto-stats\n([\s\S]*?)\n```/g;
    let match;
    while ((match = statsRegex.exec(text)) !== null) {
        try {
            const data = JSON.parse(match[1]);
            richBlocks.push({ type: 'stats', data, position: match.index });
            cleanText = cleanText.replace(match[0], '');
        } catch (e) { /* ignore invalid JSON */ }
    }

    // Parse ```beto-pipeline JSON blocks
    const pipelineRegex = /```beto-pipeline\n([\s\S]*?)\n```/g;
    while ((match = pipelineRegex.exec(text)) !== null) {
        try {
            const data = JSON.parse(match[1]);
            richBlocks.push({ type: 'pipeline', data, position: match.index });
            cleanText = cleanText.replace(match[0], '');
        } catch (e) { /* ignore */ }
    }

    // Parse ```beto-insight JSON blocks
    const insightRegex = /```beto-insight\n([\s\S]*?)\n```/g;
    while ((match = insightRegex.exec(text)) !== null) {
        try {
            const data = JSON.parse(match[1]);
            richBlocks.push({ type: 'insight', data, position: match.index });
            cleanText = cleanText.replace(match[0], '');
        } catch (e) { /* ignore */ }
    }

    // Parse ```beto-excel JSON blocks (NEW — Excel download)
    const excelRegex = /```beto-excel\n([\s\S]*?)\n```/g;
    while ((match = excelRegex.exec(text)) !== null) {
        try {
            const data = JSON.parse(match[1]);
            richBlocks.push({ type: 'excel', data, position: match.index });
            cleanText = cleanText.replace(match[0], '');
        } catch (e) { /* ignore invalid JSON */ }
    }

    // Detect [ACTION:navigate:module] tags for preview cards
    const navRegex = /\[ACTION:navigate:(\w+)\]/g;
    while ((match = navRegex.exec(text)) !== null) {
        richBlocks.push({ type: 'modulePreview', moduleId: match[1], position: match.index });
        cleanText = cleanText.replace(match[0], '');
    }

    return { text: cleanText.trim(), richBlocks };
}

