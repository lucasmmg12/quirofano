import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Microscope, Search, RefreshCw, FileText, Download, ChevronDown, ChevronUp, Filter, Calendar } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import ModulosQuantity from './ModulosQuantity';
import MuestrasEditor from './MuestrasEditor';

export default function PublicLabView({ labName }) {
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterFecha, setFilterFecha] = useState('all');
    const [filterOS, setFilterOS] = useState('all');
    const [expandedRow, setExpandedRow] = useState(null);

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

                // Enriquecer con coseguro desde hospital_pacientes
                const labRecords = data || [];
                const dnisNeedCoseguro = [...new Set(
                    labRecords.filter(r => !r.coseguro && r.dni).map(r => r.dni)
                )];

                if (dnisNeedCoseguro.length > 0) {
                    const { data: pacientes } = await supabase
                        .from('hospital_pacientes')
                        .select('dni, coseguro')
                        .in('dni', dnisNeedCoseguro)
                        .not('coseguro', 'is', null);

                    if (pacientes && pacientes.length > 0) {
                        const coseguroMap = {};
                        pacientes.forEach(p => { coseguroMap[p.dni] = p.coseguro; });
                        labRecords.forEach(r => {
                            if (!r.coseguro && r.dni && coseguroMap[r.dni]) {
                                r.coseguro = coseguroMap[r.dni];
                            }
                        });
                    }
                }

                setRecords(labRecords);
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

    const updateModulo = async (id_visita, modA, modB, modC) => {
        try {
            const timestamp = new Date().toISOString();
            const username = `Portal ${labName}`;
            
            const { error } = await supabase
                .from('laboratorios_anatomia_patologica')
                .update({ 
                    modulo_a_qty: modA,
                    modulo_b_qty: modB,
                    modulo_c_qty: modC,
                    modulo_asignado: null,
                    clasificado_at: timestamp,
                    clasificado_por: username
                })
                .eq('id_visita', id_visita);

            if (error) throw error;

            setRecords(prev => prev.map(r => 
                r.id_visita === id_visita 
                    ? { ...r, modulo_a_qty: modA, modulo_b_qty: modB, modulo_c_qty: modC, modulo_asignado: null, clasificado_at: timestamp, clasificado_por: username } 
                    : r
            ));
        } catch (err) {
            console.error('Error updating modulo:', err);
            alert('Error al asignar módulo en la base de datos');
        }
    };

    const deleteModulo = async (id_visita) => {
        try {
            const { error } = await supabase
                .from('laboratorios_anatomia_patologica')
                .update({ 
                    modulo_a_qty: 0,
                    modulo_b_qty: 0,
                    modulo_c_qty: 0,
                    modulo_asignado: null,
                    clasificado_at: null,
                    clasificado_por: null
                })
                .eq('id_visita', id_visita);

            if (error) throw error;

            setRecords(prev => prev.map(r => 
                r.id_visita === id_visita 
                    ? { ...r, modulo_a_qty: 0, modulo_b_qty: 0, modulo_c_qty: 0, modulo_asignado: null, clasificado_at: null, clasificado_por: null } 
                    : r
            ));
        } catch (err) {
            console.error('Error deleting modulo:', err);
            alert('Error al eliminar asignación en la base de datos');
        }
    };

    const handleAssignMuestras = async (id_visita, updates) => {
        try {
            const { error } = await supabase
                .from('laboratorios_anatomia_patologica')
                .update(updates)
                .eq('id_visita', id_visita);

            if (error) throw error;

            setRecords(prev => prev.map(r => 
                r.id_visita === id_visita 
                    ? { ...r, ...updates } 
                    : r
            ));
        } catch (err) {
            console.error('Error updating muestras:', err);
            alert('Error al actualizar muestras en la base de datos');
        }
    };

    const MODULOS = ['Módulo A', 'Módulo B', 'Módulo C'];

    // Unique values for filters
    const fechasUnicas = useMemo(() => {
        const months = new Set();
        records.forEach(r => {
            if (r.fecha_visita) {
                const d = new Date(r.fecha_visita);
                const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                months.add(label.charAt(0).toUpperCase() + label.slice(1));
            }
        });
        return Array.from(months);
    }, [records]);

    const obrasSocialesUnicas = useMemo(() => {
        const unique = new Set(records.map(r => r.cliente).filter(Boolean));
        return Array.from(unique).sort();
    }, [records]);

    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            // Search filter
            if (searchTerm) {
                const lower = searchTerm.toLowerCase();
                const matchSearch = (r.paciente?.toLowerCase() || '').includes(lower) ||
                    (r.dni?.toLowerCase() || '').includes(lower) ||
                    (r.cliente?.toLowerCase() || '').includes(lower);
                if (!matchSearch) return false;
            }
            // Date filter (by month)
            if (filterFecha !== 'all' && r.fecha_visita) {
                const d = new Date(r.fecha_visita);
                const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                const formatted = label.charAt(0).toUpperCase() + label.slice(1);
                if (formatted !== filterFecha) return false;
            }
            // Obra Social filter
            if (filterOS !== 'all' && r.cliente !== filterOS) return false;
            return true;
        }).sort((a, b) => {
            const fa = a.fecha_visita || '';
            const fb = b.fecha_visita || '';
            return fb.localeCompare(fa);
        });
    }, [records, searchTerm, filterFecha, filterOS]);

    const renderBiopsies = (r) => {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {r.biopsia_congelacion && (
                    <div style={{ background: '#E0F2FE', color: '#0369A1', padding: '4px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'fit-content', fontWeight: 600, border: '1px solid #BAE6FD', fontSize: '0.75rem' }}>
                        ❄️ Congelación: {r.biopsia_congelacion}
                    </div>
                )}
                {r.biopsia_simple && (
                    <div style={{ background: '#DCFCE7', color: '#15803D', padding: '4px 8px', borderRadius: '4px', display: 'inline-block', width: 'fit-content', fontWeight: 600, border: '1px solid #BBF7D0', fontSize: '0.75rem' }}>
                        Simple: {r.biopsia_simple}
                    </div>
                )}
                {r.biopsia_ampliada && (
                    <div style={{ background: '#FFEDD5', color: '#C2410C', padding: '4px 8px', borderRadius: '4px', display: 'inline-block', width: 'fit-content', fontWeight: 600, border: '1px solid #FED7AA', fontSize: '0.75rem' }}>
                        Ampliada: {r.biopsia_ampliada}
                    </div>
                )}
                {!r.biopsia_congelacion && !r.biopsia_simple && !r.biopsia_ampliada && (
                    <span style={{ color: '#94A3B8' }}>Ninguna</span>
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

            let modText = [];
            if (r.modulo_a_qty > 0) modText.push(`A: ${r.modulo_a_qty}`);
            if (r.modulo_b_qty > 0) modText.push(`B: ${r.modulo_b_qty}`);
            if (r.modulo_c_qty > 0) modText.push(`C: ${r.modulo_c_qty}`);
            const modSummary = modText.length > 0 ? modText.join(', ') : (r.modulo_asignado || 'Sin asignar');

            tableRows.push([
                date,
                r.paciente || 'S/D',
                r.dni || 'S/D',
                r.cliente || '-',
                r.coseguro || '-',
                biopsias.join('\n'),
                modSummary
            ]);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'striped',
            headStyles: { fillColor: [30, 64, 120] } // Azul institucional #1E4078
        });
        doc.save(`Laboratorio_${labName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    const exportToExcel = () => {
        const worksheetData = filteredRecords.map(r => {
            let biopsias = [];
            if (r.biopsia_congelacion) biopsias.push(`C: ${r.biopsia_congelacion}`);
            if (r.biopsia_simple) biopsias.push(`S: ${r.biopsia_simple}`);
            if (r.biopsia_ampliada) biopsias.push(`A: ${r.biopsia_ampliada}`);

            let modText = [];
            if (r.modulo_a_qty > 0) modText.push(`A: ${r.modulo_a_qty}`);
            if (r.modulo_b_qty > 0) modText.push(`B: ${r.modulo_b_qty}`);
            if (r.modulo_c_qty > 0) modText.push(`C: ${r.modulo_c_qty}`);
            const modSummary = modText.length > 0 ? modText.join(', ') : (r.modulo_asignado || 'Sin asignar');

            return {
                Fecha: r.fecha_visita ? new Date(r.fecha_visita).toLocaleDateString('es-AR') : '',
                Paciente: r.paciente || '',
                DNI: r.dni || '',
                ObraSocial: r.cliente || '',
                Coseguro: r.coseguro || '',
                Muestras: biopsias.join(' | ') || 'Ninguna',
                Modulo: modSummary
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
                <div style={{ background: '#fff', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 20px -2px rgba(30,64,120,0.08)' }}>
                    
                    {/* Header Institucional */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '24px', borderBottom: '1px solid #E2E8F0', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <img src="/logosanatorio.png" alt="Sanatorio Argentino" style={{ height: '56px', objectFit: 'contain' }} />
                                <div>
                                    <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#1E4078', letterSpacing: '-0.02em' }}>
                                        Portal del Laboratorio
                                    </h1>
                                    <p style={{ margin: '2px 0 0', color: '#64748B', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Microscope size={16} /> 
                                        {labName}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
                                <div style={{ position: 'relative', width: '260px', maxWidth: '100%' }}>
                                    <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                    <input 
                                        type="text" 
                                        placeholder="Buscar paciente, DNI u O.S..." 
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        style={{ width: '100%', padding: '10px 16px 10px 42px', borderRadius: '10px', border: '1.5px solid #E2E8F0', outline: 'none', transition: 'all 0.2s', fontSize: '0.9rem' }}
                                        onFocus={(e) => { e.target.style.borderColor = '#1E4078'; e.target.style.boxShadow = '0 0 0 3px rgba(30,64,120,0.1)'; }}
                                        onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
                                    />
                                </div>
                                <select value={filterFecha} onChange={e => setFilterFecha(e.target.value)}
                                    style={{ padding: '10px 32px 10px 12px', borderRadius: '10px', border: '1.5px solid #E2E8F0', fontSize: '0.85rem', background: '#fff', cursor: 'pointer', outline: 'none', color: '#334155', fontWeight: 500 }}>
                                    <option value="all">Todas las fechas</option>
                                    {fechasUnicas.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                                <select value={filterOS} onChange={e => setFilterOS(e.target.value)}
                                    style={{ padding: '10px 32px 10px 12px', borderRadius: '10px', border: '1.5px solid #E2E8F0', fontSize: '0.85rem', background: '#fff', cursor: 'pointer', outline: 'none', color: '#334155', fontWeight: 500 }}>
                                    <option value="all">Todas las coberturas</option>
                                    {obrasSocialesUnicas.map(os => <option key={os} value={os}>{os}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={exportToPDF} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#DC2626', border: '1px solid #FECACA', padding: '8px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background 0.2s' }} onMouseOver={e=>e.currentTarget.style.background='#FEF2F2'} onMouseOut={e=>e.currentTarget.style.background='#fff'}>
                                    <FileText size={16} /> PDF
                                </button>
                                <button onClick={exportToExcel} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#16A34A', border: '1px solid #BBF7D0', padding: '8px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background 0.2s' }} onMouseOver={e=>e.currentTarget.style.background='#F0FDF4'} onMouseOut={e=>e.currentTarget.style.background='#fff'}>
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
                                    <th style={{ padding: '16px', color: '#64748B', fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid #E2E8F0' }}>Módulo Asignado</th>
                                    <th style={{ padding: '16px', borderBottom: '1px solid #E2E8F0' }}></th>
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
                                {!loading && filteredRecords.map(r => {
                                    const isExpanded = expandedRow === r.id_visita;
                                    return (
                                    <React.Fragment key={r.id_visita}>
                                    <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid #E2E8F0', cursor: 'pointer', transition: 'background 0.2s', background: isExpanded ? '#F8FAFC' : 'transparent' }} onMouseOver={e => { if(!isExpanded) e.currentTarget.style.background = '#F8FAFC' }} onMouseOut={e => { if(!isExpanded) e.currentTarget.style.background = 'transparent' }} onClick={() => setExpandedRow(isExpanded ? null : r.id_visita)}>
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
                                            <ModulosQuantity record={r} displayMode="badge" />
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'center', color: '#94A3B8' }}>
                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                            <td colSpan={6} style={{ padding: '0 24px 24px 24px' }}>
                                                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                                    <div style={{ flex: '1', minWidth: '250px' }}>
                                                        <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>Detalles de Muestras</h4>
                                                        <MuestrasEditor record={r} onSave={handleAssignMuestras} />
                                                    </div>
                                                    <div style={{ flex: '1', minWidth: '350px', borderLeft: '1px solid #F1F5F9', paddingLeft: '24px' }}>
                                                        <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>Gestión de Módulo</h4>
                                                        <div style={{ marginTop: '12px' }}>
                                                            <ModulosQuantity record={r} onSave={updateModulo} onDelete={deleteModulo} displayMode="editor" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.8rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                        Portal Seguro • Sanatorio Argentino
                    </div>
                </div>
            </div>
        </div>
    );
}
