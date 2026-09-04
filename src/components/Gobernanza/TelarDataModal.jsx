import React from 'react';
import { X, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const mockTableData = [
    { id: 1, fecha: '2026-09-01', sector: 'Quirófano', detalle: 'Cirugía General', valor: 45 },
    { id: 2, fecha: '2026-09-02', sector: 'Quirófano', detalle: 'Traumatología', valor: 30 },
    { id: 3, fecha: '2026-09-03', sector: 'Quirófano', detalle: 'Ginecología', valor: 25 },
];

export default function TelarDataModal({ indicator, onClose, dateFilter }) {
    const handleExportExcel = () => {
        const ws = XLSX.utils.json_to_sheet(mockTableData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Datos");
        XLSX.writeFile(wb, `${indicator.label}_${dateFilter.type}.xlsx`);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        doc.text(`Reporte: ${indicator.label}`, 14, 15);
        doc.text(`Sector: ${indicator.sector}`, 14, 22);
        
        const tableColumn = ["ID", "Fecha", "Sector", "Detalle", "Valor"];
        const tableRows = [];

        mockTableData.forEach(row => {
            tableRows.push([row.id, row.fecha, row.sector, row.detalle, row.valor]);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
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
                background: '#fff', borderRadius: '12px', width: '90%', maxWidth: '900px',
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
                            Sector: {indicator.sector} | Rango: {dateFilter.type.replace(/_/g, ' ')}
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
                    <button onClick={handleExportExcel} style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                        background: '#10B981', color: '#fff', border: 'none', borderRadius: '6px',
                        fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                    }}>
                        <FileSpreadsheet size={16} /> Excel
                    </button>
                    <button onClick={handleExportPDF} style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                        background: '#EF4444', color: '#fff', border: 'none', borderRadius: '6px',
                        fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                    }}>
                        <FileText size={16} /> PDF
                    </button>
                </div>

                {/* Table Data */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr>
                                <th style={{ padding: '12px', borderBottom: '2px solid var(--neutral-200)', color: 'var(--neutral-600)', fontSize: '0.85rem' }}>Fecha</th>
                                <th style={{ padding: '12px', borderBottom: '2px solid var(--neutral-200)', color: 'var(--neutral-600)', fontSize: '0.85rem' }}>Sector</th>
                                <th style={{ padding: '12px', borderBottom: '2px solid var(--neutral-200)', color: 'var(--neutral-600)', fontSize: '0.85rem' }}>Detalle</th>
                                <th style={{ padding: '12px', borderBottom: '2px solid var(--neutral-200)', color: 'var(--neutral-600)', fontSize: '0.85rem' }}>Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mockTableData.map(row => (
                                <tr key={row.id} style={{ borderBottom: '1px solid var(--neutral-100)' }}>
                                    <td style={{ padding: '12px', fontSize: '0.9rem', color: 'var(--neutral-700)' }}>{row.fecha}</td>
                                    <td style={{ padding: '12px', fontSize: '0.9rem', color: 'var(--neutral-700)' }}>{row.sector}</td>
                                    <td style={{ padding: '12px', fontSize: '0.9rem', color: 'var(--neutral-700)' }}>{row.detalle}</td>
                                    <td style={{ padding: '12px', fontSize: '0.9rem', color: 'var(--neutral-700)', fontWeight: 600 }}>{row.valor}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
