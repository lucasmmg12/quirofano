import React, { useMemo, useState } from 'react';
import { X, FileSpreadsheet, FileText, Search, Download, BarChart2, List, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function TelarDataModal({ indicator, onClose, dateFilter = {}, rawData = [] }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState(() => (indicator?.chartData && indicator.chartData.length > 0 ? 'chart_summary' : 'detailed'));

    // Determinar si los datos son de Peticiones Diagnósticas o de Admisiones Clínicas
    const isPeticiones = useMemo(() => {
        if (indicator?.dataType === 'peticiones') return true;
        if (!rawData || rawData.length === 0) return false;
        const sample = rawData[0];
        return !!(sample.estudio || sample.prestacion || sample.modalidad || sample.id_peticion);
    }, [indicator, rawData]);

    // 1. Datos Agregados del Gráfico (si están disponibles)
    const aggregatedData = useMemo(() => {
        if (!indicator?.chartData || !Array.isArray(indicator.chartData)) return [];
        return indicator.chartData.map((item, idx) => {
            const label = item.label || item.name || item.mes || item.box || item.especialidad || `Elemento ${idx + 1}`;
            const value = item.value != null ? item.value : (item.count != null ? item.count : (item.total != null ? item.total : 0));
            const pct = item.pct || item.porcentaje || null;
            return {
                label,
                value,
                pct: pct ? `${pct}%` : null,
                extra: item.extra || item.origen || ''
            };
        });
    }, [indicator]);

    // 2. Mapeo de Registros Nominales Detallados
    const tableData = useMemo(() => {
        if (!rawData || rawData.length === 0) return [];
        
        if (isPeticiones) {
            return rawData.map(r => {
                let fSolicitud = '-';
                if (r.fecha_solicitud || r.fecha) {
                    try {
                        fSolicitud = new Date(r.fecha_solicitud || r.fecha).toLocaleDateString('es-AR');
                    } catch {
                        fSolicitud = (r.fecha_solicitud || r.fecha).substring(0, 10);
                    }
                }
                const estudioLimpio = (r.estudio || r.prestacion || '-').replace(/<[^>]+>/g, '').trim();

                return {
                    id: r.id_peticion || r.numero_peticion || r.id || '-',
                    fecha: fSolicitud,
                    habitacion: r.habitacion || (r.cama ? `Cama ${r.cama}` : 'UCI / BOX'),
                    paciente: r.paciente || (r.id_paciente ? `ID ${r.id_paciente}` : '-'),
                    nhc: r.nhc || '-',
                    estudio: estudioLimpio,
                    modalidad: r.modalidad || 'Laboratorio',
                    origen: r.origen_gobernanza || r.origen || 'UCI',
                    solicitante: r.solicitante || r.medico || '-'
                };
            });
        }

        // Mapeo de Admisiones / Ocupación
        return rawData.map(r => {
            let diasEstancia = '-';
            if (r.fecha_ingreso && r.fecha_alta) {
                const diffTime = Math.abs(new Date(r.fecha_alta) - new Date(r.fecha_ingreso));
                diasEstancia = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            } else if (r.fecha_ingreso) {
                const diffTime = Math.abs(new Date() - new Date(r.fecha_ingreso));
                diasEstancia = `${Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))} (activo)`;
            }

            let fIng = '-';
            if (r.fecha_ingreso) {
                try { fIng = new Date(r.fecha_ingreso).toLocaleDateString('es-AR'); } catch { fIng = r.fecha_ingreso.substring(0, 10); }
            }
            let fAlt = 'Internado';
            if (r.fecha_alta) {
                try { fAlt = new Date(r.fecha_alta).toLocaleDateString('es-AR'); } catch { fAlt = r.fecha_alta.substring(0, 10); }
            }

            return {
                id: r.numero_admision || r.id_admision || '-',
                habitacion: r.habitacion || (r.servicio === 'UCI' ? 'BOX' : '222-229'),
                paciente: r.paciente || '-',
                nhc: r.nhc || '-',
                edad: r.edad ?? '-',
                especialidad: r.especialidad || '-',
                fechaIngreso: fIng,
                fechaAlta: fAlt,
                diasEstancia,
                procedencia: r.procedencia || '-',
                motivoAlta: r.motivo_de_alta || 'Internado Activo',
                cliente: r.cliente || 'Particular'
            };
        });
    }, [rawData, isPeticiones]);

    // Columnas según tipo de datos
    const tableColumns = useMemo(() => {
        if (isPeticiones) {
            return [
                { key: 'fecha', label: 'Fecha' },
                { key: 'habitacion', label: 'Cama / Box' },
                { key: 'paciente', label: 'Paciente' },
                { key: 'nhc', label: 'NHC' },
                { key: 'estudio', label: 'Estudio / Prueba' },
                { key: 'modalidad', label: 'Modalidad' },
                { key: 'origen', label: 'Origen' },
                { key: 'solicitante', label: 'Médico Solicitante' }
            ];
        }

        return [
            { key: 'id', label: 'N° Admisión' },
            { key: 'habitacion', label: 'Habitación / Cama' },
            { key: 'paciente', label: 'Paciente' },
            { key: 'nhc', label: 'NHC' },
            { key: 'edad', label: 'Edad' },
            { key: 'especialidad', label: 'Especialidad' },
            { key: 'fechaIngreso', label: 'Ingreso' },
            { key: 'fechaAlta', label: 'Alta' },
            { key: 'diasEstancia', label: 'Estancia' },
            { key: 'motivoAlta', label: 'Motivo Egreso' },
            { key: 'cliente', label: 'Financiador' }
        ];
    }, [isPeticiones]);

    // Filtrar por término de búsqueda
    const filteredTableData = useMemo(() => {
        if (!searchTerm.trim()) return tableData;
        const q = searchTerm.toLowerCase().trim();
        return tableData.filter(row => {
            return Object.values(row).some(val => 
                String(val).toLowerCase().includes(q)
            );
        });
    }, [tableData, searchTerm]);

    // Exportar a Excel (.xlsx) con Tabulación Real
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();
        const safeLabel = (indicator?.label || 'Auditoria').replace(/[^a-zA-Z0-9_-]/g, '_');

        // 1. Hoja de Resumen Agregado (si aplica)
        if (aggregatedData.length > 0) {
            const aggExport = aggregatedData.map(item => ({
                'Categoría / Eje': item.label,
                'Cantidad / Valor': item.value,
                'Porcentaje': item.pct || '—'
            }));
            const wsAgg = XLSX.utils.json_to_sheet(aggExport);
            wsAgg['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }];
            XLSX.utils.book_append_sheet(wb, wsAgg, "Resumen_Grafico");
        }

        // 2. Hoja de Registros Nominales Detallados
        const exportNominal = filteredTableData.map(row => {
            const obj = {};
            tableColumns.forEach(c => {
                obj[c.label] = row[c.key];
            });
            return obj;
        });

        const wsDetail = XLSX.utils.json_to_sheet(exportNominal);
        wsDetail['!cols'] = tableColumns.map(() => ({ wch: 22 }));
        XLSX.utils.book_append_sheet(wb, wsDetail, isPeticiones ? "Peticiones_Estudios" : "Admisiones_Detalle");

        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Sanatorio_Argentino_${safeLabel}_${dateStr}.xlsx`);
    };

    // Exportar a PDF
    const handleExportPDF = () => {
        const doc = new jsPDF('landscape');
        const primaryColor = [13, 59, 102]; // #0D3B66

        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 297, 18, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('SANATORIO ARGENTINO — GOBERNANZA CLÍNICA Y AUDITORÍA', 14, 12);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`, 280, 12, { align: 'right' });

        doc.setTextColor(30, 41, 59);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text(indicator?.label || 'Detalle del Indicador', 14, 26);
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.text(`Sector: ${indicator?.sector || 'Cuidados Críticos (UCI)'} | Total registros: ${filteredTableData.length}`, 14, 31);

        const head = [tableColumns.map(c => c.label)];
        const body = filteredTableData.slice(0, 150).map(row => tableColumns.map(c => row[c.key]));

        autoTable(doc, {
            head: head,
            body: body,
            startY: 35,
            theme: 'grid',
            headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
            styles: { fontSize: 7, cellPadding: 2 },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });

        const safeLabel = (indicator?.label || 'Auditoria').replace(/[^a-zA-Z0-9_-]/g, '_');
        doc.save(`Sanatorio_Argentino_${safeLabel}.pdf`);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 11000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px', animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                background: '#FFFFFF', borderRadius: '16px', width: '95%', maxWidth: '1200px',
                height: '88vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
                border: '1px solid #CBD5E1',
                overflow: 'hidden'
            }}>
                
                {/* Header */}
                <div style={{
                    padding: '16px 24px', borderBottom: '1px solid #E2E8F0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#F8FAFC'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileSpreadsheet size={20} color="#1E40AF" />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                                    {indicator?.label || 'Datos Tabulados del Gráfico'}
                                </h2>
                                <span style={{ fontSize: '0.76rem', color: '#64748B', display: 'block', marginTop: '2px' }}>
                                    Sector: <strong>{indicator?.sector || 'Cuidados Críticos (UCI)'}</strong> • {filteredTableData.length} registros cargados
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={handleExportExcel}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 16px', borderRadius: '8px',
                                border: '1px solid #16A34A', background: '#16A34A',
                                color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 700,
                                cursor: 'pointer', boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)'
                            }}
                            title="Exportar archivo Excel (.xlsx) con columnas independientes"
                        >
                            <Download size={15} />
                            Exportar Excel (.xlsx)
                        </button>

                        <button
                            onClick={handleExportPDF}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 14px', borderRadius: '8px',
                                border: '1px solid #0D3B66', background: '#0D3B66',
                                color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            <FileText size={15} />
                            PDF
                        </button>

                        <button 
                            onClick={onClose}
                            style={{
                                background: '#FFFFFF', border: '1px solid #CBD5E1', width: '34px', height: '34px',
                                borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: '#64748B', marginLeft: '6px'
                            }}
                            title="Cerrar ventana"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Barra de Tabs (Resumen del Gráfico vs Detalle Nominal) */}
                <div style={{
                    padding: '8px 24px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px'
                }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {aggregatedData.length > 0 && (
                            <button
                                onClick={() => setActiveTab('chart_summary')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 14px', borderRadius: '6px',
                                    background: activeTab === 'chart_summary' ? '#EFF6FF' : 'transparent',
                                    border: activeTab === 'chart_summary' ? '1px solid #93C5FD' : '1px solid transparent',
                                    color: activeTab === 'chart_summary' ? '#1E40AF' : '#64748B',
                                    fontWeight: activeTab === 'chart_summary' ? 700 : 500,
                                    fontSize: '0.8rem', cursor: 'pointer'
                                }}
                            >
                                <BarChart2 size={15} /> Resumen del Gráfico ({aggregatedData.length})
                            </button>
                        )}
                        <button
                            onClick={() => setActiveTab('detailed')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '6px 14px', borderRadius: '6px',
                                background: activeTab === 'detailed' ? '#EFF6FF' : 'transparent',
                                border: activeTab === 'detailed' ? '1px solid #93C5FD' : '1px solid transparent',
                                color: activeTab === 'detailed' ? '#1E40AF' : '#64748B',
                                fontWeight: activeTab === 'detailed' ? 700 : 500,
                                fontSize: '0.8rem', cursor: 'pointer'
                            }}
                        >
                            <List size={15} /> Registros Detallados ({filteredTableData.length})
                        </button>
                    </div>

                    {/* Barra de Búsqueda */}
                    <div style={{ position: 'relative', width: '320px' }}>
                        <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Buscar en registros..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%', padding: '6px 10px 6px 30px', borderRadius: '6px',
                                border: '1px solid #CBD5E1', fontSize: '0.8rem', outline: 'none'
                            }}
                        />
                    </div>
                </div>

                {/* Contenido Principal */}
                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: 0 }}>
                    
                    {/* TAB 1: RESUMEN DEL GRÁFICO */}
                    {activeTab === 'chart_summary' && aggregatedData.length > 0 ? (
                        <div style={{ padding: '20px 24px' }}>
                            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                                    Desglose Cuantitativo por Categoría:
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                    Total: {aggregatedData.reduce((acc, c) => acc + (Number(c.value) || 0), 0).toLocaleString('es-AR')}
                                </span>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#475569' }}>
                                        <th style={{ padding: '10px 14px', fontWeight: 700 }}>Categoría / Box / Eje</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Cantidad / Solicitudes</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Porcentaje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {aggregatedData.map((row, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>
                                                {row.label}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1E40AF', textAlign: 'right' }}>
                                                {Number(row.value).toLocaleString('es-AR')}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#10B981', textAlign: 'right' }}>
                                                {row.pct || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        /* TAB 2: REGISTROS DETALLADOS (TABLA AUDITORÍA) */
                        filteredTableData.length === 0 ? (
                            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8' }}>
                                No se encontraron registros coincidentes.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#F8FAFC', zIndex: 2 }}>
                                    <tr style={{ borderBottom: '2px solid #CBD5E1' }}>
                                        {tableColumns.map(col => (
                                            <th key={col.key} style={{ padding: '10px 14px', color: '#475569', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                {col.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTableData.map((row, idx) => (
                                        <tr 
                                            key={idx} 
                                            style={{ 
                                                borderBottom: '1px solid #F1F5F9',
                                                background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'
                                            }}
                                        >
                                            {tableColumns.map(col => {
                                                const val = row[col.key];
                                                if (col.key === 'habitacion') {
                                                    return (
                                                        <td key={col.key} style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                                                            <span style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '2px 8px', borderRadius: '4px', fontSize: '0.74rem', fontWeight: 700, color: '#1E40AF' }}>
                                                                {val}
                                                            </span>
                                                        </td>
                                                    );
                                                }
                                                if (col.key === 'modalidad') {
                                                    return (
                                                        <td key={col.key} style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                                                            <span style={{
                                                                padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
                                                                background: val === 'Imágenes' ? '#FAF5FF' : '#F0FDF4',
                                                                color: val === 'Imágenes' ? '#7E22CE' : '#15803D'
                                                            }}>
                                                                {val}
                                                            </span>
                                                        </td>
                                                    );
                                                }
                                                if (col.key === 'paciente') {
                                                    return (
                                                        <td key={col.key} style={{ padding: '8px 14px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                                                            {val}
                                                        </td>
                                                    );
                                                }
                                                if (col.key === 'id') {
                                                    return (
                                                        <td key={col.key} style={{ padding: '8px 14px', fontWeight: 700, color: '#2563EB', whiteSpace: 'nowrap' }}>
                                                            {val}
                                                        </td>
                                                    );
                                                }
                                                return (
                                                    <td key={col.key} style={{ padding: '8px 14px', color: '#475569', whiteSpace: 'nowrap' }}>
                                                        {val}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                        Datos obtenidos directamente de SALUS SQL Server ({isPeticiones ? 'calidad_peticiones_estudios / VLISE' : 'calidad_admisiones_ocupacion'})
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '6px 18px', borderRadius: '6px', border: '1px solid #CBD5E1',
                            background: '#FFFFFF', color: '#334155', fontWeight: 600, fontSize: '0.8rem',
                            cursor: 'pointer'
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
