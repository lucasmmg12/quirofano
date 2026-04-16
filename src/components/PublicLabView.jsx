import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Microscope, Search, RefreshCw, FileText, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function PublicLabView({ labName }) {
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('laboratorios_anatomia_patologica')
                    .select('*')
                    .ilike('laboratorio', labName)
                    .order('fecha_visita', { ascending: false })
                    .limit(500);

                if (error) throw error;
                setRecords(data || []);
            } catch (err) {
                console.error('Error fetching laboratorios:', err);
                alert('Error al conectar con la base de datos');
            } finally {
                setLoading(false);
            }
        };

        if (labName) {
            loadData();
        }
    }, [labName]);

    const updateModulo = async (id_visita, newModulo) => {
        try {
            const timestamp = new Date().toISOString();
            const username = `Portal ${labName}`;
            
            const { error } = await supabase
                .from('laboratorios_anatomia_patologica')
                .update({ 
                    modulo_asignado: newModulo,
                    clasificado_at: timestamp,
                    clasificado_por: username
                })
                .eq('id_visita', id_visita);

            if (error) throw error;

            setRecords(prev => prev.map(r => 
                r.id_visita === id_visita 
                    ? { ...r, modulo_asignado: newModulo, clasificado_at: timestamp, clasificado_por: username } 
                    : r
            ));
        } catch (err) {
            console.error('Error updating modulo:', err);
            alert('Error al asignar módulo en la base de datos');
        }
    };

    const MODULOS = ['Módulo A', 'Módulo B', 'Módulo C'];

    const filteredRecords = useMemo(() => {
        if (!searchTerm) return records;
        const lower = searchTerm.toLowerCase();
        return records.filter(r => 
            (r.paciente?.toLowerCase() || '').includes(lower) ||
            (r.dni?.toLowerCase() || '').includes(lower)
        );
    }, [records, searchTerm]);

    const renderBiopsies = (r) => {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {r.biopsia_congelacion && (
                    <div style={{ background: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                        C: {r.biopsia_congelacion}
                    </div>
                )}
                {r.biopsia_simple && (
                    <div style={{ background: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                        S: {r.biopsia_simple}
                    </div>
                )}
                {r.biopsia_ampliada && (
                    <div style={{ background: '#FFEDD5', color: '#C2410C', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                        A: {r.biopsia_ampliada}
                    </div>
                )}
                {!r.biopsia_congelacion && !r.biopsia_simple && !r.biopsia_ampliada && (
                    <span style={{ color: 'var(--neutral-400)' }}>Ninguna</span>
                )}
            </div>
        );
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text(`Anatomía Patológica - ${labName}`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Fecha de exportación: ${new Date().toLocaleDateString('es-AR')}`, 14, 28);

        const tableColumn = ["Fecha", "Paciente", "DNI", "Obra Social", "Coseguro", "Muestras / Biopsias", "Módulo"];
        const tableRows = [];

        filteredRecords.forEach(r => {
            const date = r.fecha_visita ? new Date(r.fecha_visita).toLocaleDateString('es-AR') : '-';
            let biopsias = [];
            if (r.biopsia_congelacion) biopsias.push(`C: ${r.biopsia_congelacion}`);
            if (r.biopsia_simple) biopsias.push(`S: ${r.biopsia_simple}`);
            if (r.biopsia_ampliada) biopsias.push(`A: ${r.biopsia_ampliada}`);
            if (biopsias.length === 0) biopsias.push('Ninguna');

            tableRows.push([
                date,
                r.paciente || 'S/D',
                r.dni || 'S/D',
                r.cliente || '-',
                r.coseguro || '-',
                biopsias.join('\n'),
                r.modulo_asignado || 'Sin asignar'
            ]);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 35,
            theme: 'striped',
            headStyles: { fillColor: [139, 92, 246] }
        });
        doc.save(`Laboratorio_${labName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    const exportToExcel = () => {
        const worksheetData = filteredRecords.map(r => {
            let biopsias = [];
            if (r.biopsia_congelacion) biopsias.push(`C: ${r.biopsia_congelacion}`);
            if (r.biopsia_simple) biopsias.push(`S: ${r.biopsia_simple}`);
            if (r.biopsia_ampliada) biopsias.push(`A: ${r.biopsia_ampliada}`);

            return {
                Fecha: r.fecha_visita ? new Date(r.fecha_visita).toLocaleDateString('es-AR') : '',
                Paciente: r.paciente || '',
                DNI: r.dni || '',
                ObraSocial: r.cliente || '',
                Coseguro: r.coseguro || '',
                Muestras: biopsias.join(' | ') || 'Ninguna',
                Modulo: r.modulo_asignado || 'Sin asignar'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
        XLSX.writeFile(workbook, `Laboratorio_${labName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <div style={{ minHeight: '100vh', background: '#F1F5F9', padding: '40px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <div style={{ background: '#fff', borderRadius: '16px', padding: '32px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
                    
                    {/* Header */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', borderBottom: '1px solid #E2E8F0', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Microscope size={28} style={{ color: '#8B5CF6' }} />
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: '#1E293B' }}>Portal del Laboratorio</h1>
                                <p style={{ margin: '4px 0 0', color: '#64748B', fontWeight: 500 }}>{labName}</p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ position: 'relative', width: '300px', maxWidth: '100%' }}>
                                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar paciente o DNI..." 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    style={{ width: '100%', padding: '10px 16px 10px 38px', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={exportToPDF} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEE2E2', color: '#DC2626', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                                    <FileText size={16} /> PDF
                                </button>
                                <button onClick={exportToExcel} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#DCFCE7', color: '#16A34A', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                                    <Download size={16} /> Excel
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC' }}>
                                    <th style={{ padding: '16px', color: '#64748B', fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid #E2E8F0' }}>Fecha</th>
                                    <th style={{ padding: '16px', color: '#64748B', fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid #E2E8F0' }}>Paciente</th>
                                    <th style={{ padding: '16px', color: '#64748B', fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid #E2E8F0' }}>Cobertura</th>
                                    <th style={{ padding: '16px', color: '#64748B', fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid #E2E8F0' }}>Muestras / Biopsias</th>
                                    <th style={{ padding: '16px', color: '#64748B', fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid #E2E8F0' }}>Módulo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                                            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                                            Cargando información...
                                        </td>
                                    </tr>
                                )}
                                {!loading && filteredRecords.length === 0 && (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                                            No se encontraron registros.
                                        </td>
                                    </tr>
                                )}
                                {!loading && filteredRecords.map(r => (
                                    <tr key={r.id_visita} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                        <td style={{ padding: '16px', fontSize: '0.9rem', color: '#334155' }}>
                                            {r.fecha_visita && new Date(r.fecha_visita).toLocaleDateString('es-AR')}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ fontWeight: 600, color: '#1E293B' }}>{r.paciente}</div>
                                            <div style={{ fontSize: '0.85rem', color: '#64748B' }}>DNI: {r.dni || 'S/D'}</div>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ color: '#334155', fontSize: '0.85rem' }}>{r.cliente || '-'}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{r.coseguro ? `Coseguro: ${r.coseguro}` : ''}</div>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            {renderBiopsies(r)}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <select
                                                value={r.modulo_asignado || ''}
                                                onChange={(e) => updateModulo(r.id_visita, e.target.value)}
                                                style={{
                                                    padding: '6px 12px', borderRadius: '6px', border: `1px solid ${r.modulo_asignado ? '#C7D2FE' : '#E2E8F0'}`,
                                                    background: r.modulo_asignado ? '#EEF2FF' : '#fff', color: r.modulo_asignado ? '#4F46E5' : '#64748B',
                                                    fontWeight: 600, fontSize: '0.85rem', outline: 'none', cursor: 'pointer'
                                                }}
                                            >
                                                <option value="" disabled>Seleccione Módulo</option>
                                                {MODULOS.map(m => (
                                                    <option key={m} value={m}>{m}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: '16px', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                        Portal Seguro - Sanatorio Argentino
                    </div>
                </div>
            </div>
        </div>
    );
}
