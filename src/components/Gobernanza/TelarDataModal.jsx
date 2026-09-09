import React, { useMemo, useState } from 'react';
import { X, FileSpreadsheet, FileText, Search, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function TelarDataModal({ indicator, onClose, dateFilter = {}, rawData = [] }) {
    const [searchTerm, setSearchTerm] = useState('');

    // Preparar datos tabulares basados en calidad_admisiones_ocupacion
    const tableData = useMemo(() => {
        if (!rawData || rawData.length === 0) return [];
        
        // Mapeo universal de registros de ocupación/admisiones
        return rawData.map(r => {
            let diasEstancia = '-';
            if (r.fecha_ingreso && r.fecha_alta) {
                const diffTime = Math.abs(new Date(r.fecha_alta) - new Date(r.fecha_ingreso));
                diasEstancia = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            } else if (r.fecha_ingreso) {
                const diffTime = Math.abs(new Date() - new Date(r.fecha_ingreso));
                diasEstancia = `${Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))} (activo)`;
            }

            return {
                id: r.numero_admision || r.id_admision || '-',
                habitacion: r.habitacion || '-',
                paciente: r.paciente || '-',
                edad: r.edad ?? '-',
                especialidad: r.especialidad || '-',
                fechaIngreso: r.fecha_ingreso ? new Date(r.fecha_ingreso).toLocaleDateString('es-AR') : '-',
                fechaAlta: r.fecha_alta ? new Date(r.fecha_alta).toLocaleDateString('es-AR') : 'Internado',
                diasEstancia,
                procedencia: r.procedencia || '-',
                motivoAlta: r.motivo_de_alta || '-',
                cliente: r.cliente || '-'
            };
        });
    }, [rawData]);

    const tableColumns = [
        { key: 'id', label: 'N° Admisión' },
        { key: 'habitacion', label: 'Habitación' },
        { key: 'paciente', label: 'Paciente' },
        { key: 'edad', label: 'Edad' },
        { key: 'especialidad', label: 'Especialidad' },
        { key: 'fechaIngreso', label: 'Ingreso' },
        { key: 'fechaAlta', label: 'Alta' },
        { key: 'diasEstancia', label: 'Estancia' },
        { key: 'procedencia', label: 'Procedencia' },
        { key: 'motivoAlta', label: 'Motivo Alta' },
        { key: 'cliente', label: 'Financiador' }
    ];

    // Filtrar por término de búsqueda
    const filteredTableData = useMemo(() => {
        if (!searchTerm.trim()) return tableData;
        const q = searchTerm.toLowerCase().trim();
        return tableData.filter(row =>
            row.paciente.toLowerCase().includes(q) ||
            row.id.toLowerCase().includes(q) ||
            row.habitacion.toLowerCase().includes(q) ||
            row.especialidad.toLowerCase().includes(q) ||
            row.cliente.toLowerCase().includes(q) ||
            row.procedencia.toLowerCase().includes(q)
        );
    }, [tableData, searchTerm]);

    const handleExportExcel = () => {
        const ws = XLSX.utils.json_to_sheet(filteredTableData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
        const safeLabel = (indicator?.label || 'indicador').replace(/[^a-zA-Z0-9_-]/g, '_');
        XLSX.writeFile(wb, `${safeLabel}_auditoria.xlsx`);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF('landscape');
        doc.setFontSize(14);
        doc.setTextColor(30, 64, 175);
        doc.text(`Sanatorio Argentino — Auditoría de Datos`, 14, 15);
        doc.setFontSize(11);
        doc.setTextColor(71, 85, 105);
        doc.text(`Indicador: ${indicator?.label || 'Detalle'} | Sector: ${indicator?.sector || 'General'}`, 14, 22);
        
        const head = [tableColumns.map(c => c.label)];
        const body = filteredTableData.slice(0, 150).map(row => tableColumns.map(c => row[c.key]));

        autoTable(doc, {
            head: head,
            body: body,
            startY: 28,
            theme: 'grid',
            headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold' },
            styles: { fontSize: 8, cellPadding: 2 },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });

        const safeLabel = (indicator?.label || 'indicador').replace(/[^a-zA-Z0-9_-]/g, '_');
        doc.save(`${safeLabel}_auditoria.pdf`);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)', zIndex: 11000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                background: '#FFFFFF', borderRadius: '16px', width: '92%', maxWidth: '1150px',
                height: '85vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '18px 24px', borderBottom: '1px solid #E2E8F0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#F8FAFC'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileSpreadsheet size={20} color="#1E40AF" />
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                                {indicator?.label || 'Datos Tabulados de Auditoría'}
                            </h2>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: '#64748B', display: 'block', marginTop: '3px' }}>
                            Sector: <strong>{indicator?.sector || 'UCI'}</strong> • Total: {filteredTableData.length} registros cargados de SALUS
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={handleExportExcel}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '7px 12px', borderRadius: '6px',
                                border: '1px solid #10B981', background: '#ECFDF5',
                                color: '#065F46', fontSize: '0.8rem', fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            <Download size={14} />
                            Excel (.xlsx)
                        </button>
                        <button
                            onClick={handleExportPDF}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '7px 12px', borderRadius: '6px',
                                border: '1px solid #EF4444', background: '#FEF2F2',
                                color: '#991B1B', fontSize: '0.8rem', fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            <FileText size={14} />
                            PDF
                        </button>
                        <button 
                            onClick={onClose}
                            style={{
                                background: '#FFFFFF', border: '1px solid #CBD5E1', width: '32px', height: '32px',
                                borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: '#64748B'
                            }}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Barra de Filtro de Búsqueda */}
                <div style={{
                    padding: '12px 24px', background: '#FFFFFF', borderBottom: '1px solid #F1F5F9',
                    display: 'flex', alignItems: 'center', gap: '12px'
                }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                        <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Buscar por paciente, admisión, especialidad, obra social..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%', padding: '7px 12px 7px 32px', borderRadius: '8px',
                                border: '1px solid #CBD5E1', fontSize: '0.82rem', outline: 'none'
                            }}
                        />
                    </div>
                    {searchTerm && (
                        <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                            Mostrando {filteredTableData.length} de {tableData.length}
                        </span>
                    )}
                </div>

                {/* Tabla de Datos */}
                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: 0 }}>
                    {filteredTableData.length === 0 ? (
                        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8' }}>
                            No hay registros para mostrar con los filtros actuales.
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#F8FAFC', zIndex: 2 }}>
                                <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
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
                                        <td style={{ padding: '8px 14px', fontWeight: 700, color: '#1E40AF', whiteSpace: 'nowrap' }}>
                                            {row.id}
                                        </td>
                                        <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                                            <span style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, color: '#0369A1' }}>
                                                {row.habitacion}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 14px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                                            {row.paciente}
                                        </td>
                                        <td style={{ padding: '8px 14px', color: '#64748B', whiteSpace: 'nowrap' }}>
                                            {row.edad}
                                        </td>
                                        <td style={{ padding: '8px 14px', color: '#334155', whiteSpace: 'nowrap' }}>
                                            <span style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.74rem' }}>
                                                {row.especialidad}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 14px', color: '#475569', whiteSpace: 'nowrap' }}>
                                            {row.fechaIngreso}
                                        </td>
                                        <td style={{ padding: '8px 14px', color: '#475569', whiteSpace: 'nowrap' }}>
                                            {row.fechaAlta}
                                        </td>
                                        <td style={{ padding: '8px 14px', fontWeight: 600, color: '#2563EB', whiteSpace: 'nowrap' }}>
                                            {row.diasEstancia}
                                        </td>
                                        <td style={{ padding: '8px 14px', color: '#64748B', whiteSpace: 'nowrap' }}>
                                            {row.procedencia}
                                        </td>
                                        <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600,
                                                background: row.motivoAlta.includes('Defunción') ? '#FEE2E2' : '#EFF6FF',
                                                color: row.motivoAlta.includes('Defunción') ? '#991B1B' : '#1E40AF'
                                            }}>
                                                {row.motivoAlta}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 14px', color: '#64748B', whiteSpace: 'nowrap' }}>
                                            {row.cliente}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                        Datos obtenidos directamente de SALUS SQL Server (`calidad_admisiones_ocupacion`)
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '6px 16px', borderRadius: '6px', border: '1px solid #CBD5E1',
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
