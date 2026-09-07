import React, { useMemo } from 'react';
import { X, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function TelarDataModal({ indicator, onClose, dateFilter, rawData = [] }) {
    
    // Preparar datos tabulares basados en el origen de los datos
    const tableData = useMemo(() => {
        if (!rawData || rawData.length === 0) return [];
        
        // Formatear datos específicamente para UCI
        if (indicator.id.startsWith('uci_')) {
            return rawData.map(r => ({
                id: r.numero_admision || r.id_admision || '-',
                fecha: r.fecha_ingreso ? new Date(r.fecha_ingreso).toLocaleDateString('es-AR') : '-',
                paciente: r.paciente || '-',
                procedencia: r.procedencia || '-',
                motivoAlta: r.motivo_de_alta || '-',
                diasEstancia: (r.fecha_ingreso && r.fecha_alta) 
                    ? Math.ceil(Math.abs(new Date(r.fecha_alta) - new Date(r.fecha_ingreso)) / (1000 * 60 * 60 * 24)) 
                    : '-'
            }));
        }
        
        return rawData;
    }, [rawData, indicator.id]);

    const tableColumns = useMemo(() => {
        if (indicator.id.startsWith('uci_')) {
            return [
                { key: 'id', label: 'ID/Admisión' },
                { key: 'fecha', label: 'F. Ingreso' },
                { key: 'paciente', label: 'Paciente' },
                { key: 'procedencia', label: 'Procedencia' },
                { key: 'motivoAlta', label: 'Motivo Alta' },
                { key: 'diasEstancia', label: 'Días Estancia' }
            ];
        }
        return [];
    }, [indicator.id]);

    const handleExportExcel = () => {
        const ws = XLSX.utils.json_to_sheet(tableData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Datos");
        XLSX.writeFile(wb, `${indicator.label}_${dateFilter.type}.xlsx`);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF('landscape');
        doc.text(`Reporte: ${indicator.label}`, 14, 15);
        doc.text(`Sector: ${indicator.sector}`, 14, 22);
        
        const head = [tableColumns.map(c => c.label)];
        const body = tableData.map(row => tableColumns.map(c => row[c.key]));

        autoTable(doc, {
            head: head,
            body: body,
            startY: 30,
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246] }
        });

        doc.save(`${indicator.label}_${dateFilter.type}.pdf`);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                background: '#fff', borderRadius: '12px', width: '90%', maxWidth: '1000px',
                maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px', borderBottom: '1px solid var(--neutral-200)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--neutral-800)' }}>
                            {indicator.label}
                        </h2>
                        <span style={{ fontSize: '0.85rem', color: 'var(--neutral-500)', display: 'block', marginTop: '4px' }}>
                            Sector: {indicator.sector} | Rango: {dateFilter.type.replace(/_/g, ' ')} | Total: {tableData.length} registros
                        </span>
                    </div>
                    <button 
                        onClick={onClose}
                        style={{
                            background: 'var(--neutral-100)', border: 'none', width: '32px', height: '32px',
                            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'var(--neutral-600)'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Actions */}
                <div style={{ padding: '16px 24px', display: 'flex', gap: '12px', background: 'var(--neutral-50)' }}>
                    <button onClick={handleExportExcel} disabled={tableData.length === 0} style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                        background: tableData.length === 0 ? '#9CA3AF' : '#10B981', color: '#fff', border: 'none', borderRadius: '6px',
                        fontWeight: 600, fontSize: '0.85rem', cursor: tableData.length === 0 ? 'not-allowed' : 'pointer'
                    }}>
                        <FileSpreadsheet size={16} /> Excel
                    </button>
                    <button onClick={handleExportPDF} disabled={tableData.length === 0} style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                        background: tableData.length === 0 ? '#9CA3AF' : '#EF4444', color: '#fff', border: 'none', borderRadius: '6px',
                        fontWeight: 600, fontSize: '0.85rem', cursor: tableData.length === 0 ? 'not-allowed' : 'pointer'
                    }}>
                        <FileText size={16} /> PDF
                    </button>
                </div>

                {/* Table Data */}
                <div style={{ padding: '0', overflowY: 'auto', flex: 1 }}>
                    {tableData.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>
                            No hay datos disponibles para mostrar.
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#F8FAFC', zIndex: 1 }}>
                                <tr>
                                    {tableColumns.map((col) => (
                                        <th key={col.key} style={{ padding: '12px 24px', borderBottom: '2px solid var(--neutral-200)', color: 'var(--neutral-600)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                            {col.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {tableData.map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--neutral-100)' }}>
                                        {tableColumns.map(col => (
                                            <td key={col.key} style={{ padding: '12px 24px', fontSize: '0.9rem', color: 'var(--neutral-700)' }}>
                                                {row[col.key]}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
