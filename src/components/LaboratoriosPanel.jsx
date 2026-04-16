import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Microscope, Search, Filter, RefreshCw, Check, Clock, FileText, Download, Link, Copy } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { getEstadoFacturacion } from '../utils/facturacionRules';

export default function LaboratoriosPanel({ addToast, currentUser }) {
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterModulo, setFilterModulo] = useState('all');
    const [filterLaboratorio, setFilterLaboratorio] = useState('all');

    const laboratoriosUnicos = useMemo(() => {
        const unique = new Set(records.map(r => r.laboratorio).filter(Boolean));
        return Array.from(unique).sort();
    }, [records]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('laboratorios_anatomia_patologica')
                .select('*')
                .order('fecha_visita', { ascending: false })
                .limit(500);

            if (error) throw error;
            setRecords(data || []);
        } catch (err) {
            console.error('Error fetching laboratorios:', err);
            addToast('Error al cargar laboratorios', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleAssignModulo = async (id_visita, newModulo) => {
        const timestamp = new Date().toISOString();
        const username = currentUser?.nombre || 'Desconocido';

        try {
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
            addToast(`Módulo actualizado a ${newModulo}`, 'success');
        } catch (err) {
            console.error('Error updating modulo:', err);
            addToast('Error al asignar módulo', 'error');
        }
    };

    const MODULOS = ['Módulo A', 'Módulo B', 'Módulo C'];

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text(`Reporte de Anatomía Patológica`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Filtros: Lab: ${filterLaboratorio !== 'all' ? filterLaboratorio : 'Todos'} | Modulo: ${filterModulo !== 'all' ? filterModulo : 'Todos'}`, 14, 28);

        const tableColumn = ["Fecha", "Paciente", "DNI", "Obra Social", "Coseguro", "Laboratorio", "Muestras / Biopsias", "Módulo", "Acción"];
        const tableRows = [];

        filteredRecords.forEach(r => {
            const date = r.fecha_visita ? new Date(r.fecha_visita).toLocaleDateString('es-AR') : '-';
            let biopsias = [];
            if (r.biopsia_congelacion) biopsias.push(`C: ${r.biopsia_congelacion}`);
            if (r.biopsia_simple) biopsias.push(`S: ${r.biopsia_simple}`);
            if (r.biopsia_ampliada) biopsias.push(`A: ${r.biopsia_ampliada}`);

            const estado = getEstadoFacturacion(r.cliente, r.laboratorio);

            tableRows.push([
                date,
                r.paciente || 'S/D',
                r.dni || 'S/D',
                r.cliente || '-',
                r.coseguro || '-',
                r.laboratorio || '-',
                biopsias.length > 0 ? biopsias.join('\n') : '-',
                r.modulo_asignado || 'Sin asignar',
                estado
            ]);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 35,
            theme: 'striped',
            headStyles: { fillColor: [139, 92, 246] }
        });
        doc.save(`Patologica_${new Date().toISOString().slice(0, 10)}.pdf`);
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
                Laboratorio: r.laboratorio || '',
                Muestras: biopsias.join(' | '),
                Modulo_Asignado: r.modulo_asignado || 'Sin asignar',
                Accion_Facturacion: getEstadoFacturacion(r.cliente, r.laboratorio)
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Patologica");
        XLSX.writeFile(workbook, `Patologica_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const copyPublicLinkLab = (labString, toastName) => {
        const token = btoa(encodeURIComponent(labString));
        const url = `${window.location.origin}/publico/laboratorio/${token}`;
        navigator.clipboard.writeText(url);
        addToast(`Enlace de ${toastName} copiado!`, 'success');
    };

    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            const matchSearch = searchTerm === '' || 
                (r.paciente?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (r.dni?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (r.laboratorio?.toLowerCase() || '').includes(searchTerm.toLowerCase());
            
            const matchFilter = filterModulo === 'all' || 
                (filterModulo === 'unassigned' && !r.modulo_asignado) ||
                (filterModulo === 'assigned' && r.modulo_asignado) ||
                r.modulo_asignado === filterModulo;

            const matchLab = filterLaboratorio === 'all' || r.laboratorio === filterLaboratorio;

            return matchSearch && matchFilter && matchLab;
        });
    }, [records, searchTerm, filterModulo, filterLaboratorio]);

    return (
        <div className="content animate-fade-in" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--neutral-800)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Microscope size={24} style={{ color: '#8B5CF6' }} />
                        Anatomía Patológica
                    </h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--neutral-500)', fontSize: '0.9rem' }}>
                        Clasificación de muestras para facturación
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => copyPublicLinkLab('LDA - Dra. Aguero o Dra Rios', 'Agüero')} style={{ padding: '6px 12px', borderRadius: '8px', background: '#F5F3FF', color: '#7C3AED', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #DDD6FE', cursor: 'pointer' }}>
                        <Link size={14} /> Link Agüero
                    </button>
                    <button onClick={() => copyPublicLinkLab('LAB. CEDAP', 'CEDAP')} style={{ padding: '6px 12px', borderRadius: '8px', background: '#F5F3FF', color: '#7C3AED', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #DDD6FE', cursor: 'pointer' }}>
                        <Link size={14} /> Link CEDAP
                    </button>
                    <button onClick={() => copyPublicLinkLab('LAB.INST.PATOLOG.CUYO', 'Cuyo')} style={{ padding: '6px 12px', borderRadius: '8px', background: '#F5F3FF', color: '#7C3AED', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #DDD6FE', cursor: 'pointer' }}>
                        <Link size={14} /> Link Cuyo
                    </button>
                    <div style={{ width: '1px', background: '#E2E8F0', margin: '0 4px' }}></div>
                    <button onClick={exportToPDF} style={{ padding: '8px 16px', borderRadius: '8px', background: '#FEE2E2', color: '#DC2626', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #FECACA', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                        <FileText size={16} /> PDF
                    </button>
                    <button onClick={exportToExcel} style={{ padding: '8px 16px', borderRadius: '8px', background: '#DCFCE7', color: '#16A34A', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #BBF7D0', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                        <Download size={16} /> Excel
                    </button>
                    <button 
                        onClick={loadData}
                        disabled={loading}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--neutral-200)',
                            background: '#fff', color: 'var(--neutral-600)', fontWeight: 600, fontSize: '0.85rem',
                            display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                            opacity: loading ? 0.7 : 1, transition: 'all 0.2s',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                        }}
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Actualizar
                    </button>
                </div>
            </div>

            <div style={{ 
                background: '#fff', borderRadius: '12px', border: '1px solid var(--neutral-200)', 
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' 
            }}>
                <div style={{ 
                    padding: '16px 20px', borderBottom: '1px solid var(--neutral-100)',
                    display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center',
                    background: '#F8FAFC'
                }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
                        <input 
                            type="text" 
                            placeholder="Buscar paciente, DNI o lab..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ 
                                width: '100%', padding: '10px 12px 10px 36px', borderRadius: '8px', 
                                border: '1px solid var(--neutral-200)', fontSize: '0.85rem', outline: 'none',
                                transition: 'border-color 0.2s'
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Filter size={16} style={{ color: 'var(--neutral-400)' }} />
                        <select 
                            value={filterLaboratorio}
                            onChange={e => setFilterLaboratorio(e.target.value)}
                            style={{
                                padding: '10px 32px 10px 12px', borderRadius: '8px', 
                                border: '1px solid var(--neutral-200)', fontSize: '0.85rem',
                                background: '#fff', cursor: 'pointer', outline: 'none'
                             }}
                        >
                            <option value="all">Todos los Laboratorios</option>
                            {laboratoriosUnicos.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <select 
                            value={filterModulo}
                            onChange={e => setFilterModulo(e.target.value)}
                            style={{
                                padding: '10px 32px 10px 12px', borderRadius: '8px', 
                                border: '1px solid var(--neutral-200)', fontSize: '0.85rem',
                                background: '#fff', cursor: 'pointer', outline: 'none'
                             }}
                        >
                            <option value="all">Todos los registros</option>
                            <option value="unassigned">Sin Asignar</option>
                            <option value="assigned">Ya Asignados</option>
                            <option disabled>──────────</option>
                            <option value="Módulo A">Módulo A</option>
                            <option value="Módulo B">Módulo B</option>
                            <option value="Módulo C">Módulo C</option>
                        </select>
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                        <thead>
                            <tr style={{ background: '#F1F5F9' }}>
                                <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', borderBottom: '1px solid var(--neutral-200)' }}>Fecha</th>
                                <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', borderBottom: '1px solid var(--neutral-200)' }}>Paciente</th>
                                <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', borderBottom: '1px solid var(--neutral-200)' }}>Obra Social</th>
                                <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', borderBottom: '1px solid var(--neutral-200)' }}>Coseguro</th>
                                <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', borderBottom: '1px solid var(--neutral-200)' }}>Laboratorio</th>
                                <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', borderBottom: '1px solid var(--neutral-200)' }}>Muestra / Biopsia</th>
                                <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', borderBottom: '1px solid var(--neutral-200)', textAlign: 'center' }}>Módulo Asignado</th>
                                <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', borderBottom: '1px solid var(--neutral-200)', textAlign: 'center' }}>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--neutral-400)' }}>
                                        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                                        Cargando laboratorios...
                                    </td>
                                </tr>
                            ) : filteredRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--neutral-400)' }}>
                                        Ningún registro coincide con los filtros.
                                    </td>
                                </tr>
                            ) : filteredRecords.map((r) => {
                                const estadoAccion = getEstadoFacturacion(r.cliente, r.laboratorio);
                                return (
                                <tr key={r.id_visita} style={{ borderBottom: '1px solid var(--neutral-100)', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#F8FAFC'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--neutral-600)', whiteSpace: 'nowrap' }}>
                                        {r.fecha_visita && new Date(r.fecha_visita).toLocaleDateString('es-AR')}
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--neutral-800)', fontSize: '0.85rem' }}>{r.paciente}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)' }}>DNI: {r.dni || 'S/D'}</div>
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--neutral-600)', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.cliente}>
                                        {r.cliente || '-'}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--neutral-600)' }}>
                                        {r.coseguro || '-'}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--neutral-600)' }}>
                                        {r.laboratorio || '-'}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--neutral-600)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {r.biopsia_congelacion && <div style={{ background: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', width: 'fit-content', fontWeight: 600 }}>C: {r.biopsia_congelacion}</div>}
                                            {r.biopsia_simple && <div style={{ background: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', width: 'fit-content', fontWeight: 600 }}>S: {r.biopsia_simple}</div>}
                                            {r.biopsia_ampliada && <div style={{ background: '#FFEDD5', color: '#C2410C', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', width: 'fit-content', fontWeight: 600 }}>A: {r.biopsia_ampliada}</div>}
                                            {!r.biopsia_congelacion && !r.biopsia_simple && !r.biopsia_ampliada && '-'}
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                        {r.modulo_asignado ? (
                                            <div style={{ display: 'inline-block', textAlign: 'left' }}>
                                                <div style={{ 
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                    padding: '4px 10px', background: '#F5F3FF', color: '#7C3AED', 
                                                    borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #DDD6FE'
                                                }}>
                                                    <Check size={12} />
                                                    {r.modulo_asignado}
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--neutral-400)', marginTop: '4px' }}>
                                                    {r.clasificado_por} • {new Date(r.clasificado_at).toLocaleDateString('es-AR')}
                                                </div>
                                            </div>
                                        ) : (
                                            <select
                                                onChange={(e) => handleAssignModulo(r.id_visita, e.target.value)}
                                                defaultValue=""
                                                style={{
                                                    padding: '6px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', 
                                                    fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-600)', 
                                                    background: '#fff', cursor: 'pointer', outline: 'none'
                                                }}
                                            >
                                                <option value="" disabled>Asignar Módulo...</option>
                                                {MODULOS.map(m => (
                                                    <option key={m} value={m}>{m}</option>
                                                ))}
                                            </select>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                        <div style={{ 
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                                            background: estadoAccion === 'FACTURAR' ? '#FEF2F2' : estadoAccion === 'ENTREGAR' ? '#F0FDF4' : '#F8FAFC',
                                            color: estadoAccion === 'FACTURAR' ? '#DC2626' : estadoAccion === 'ENTREGAR' ? '#16A34A' : '#94A3B8',
                                            border: `1px solid ${estadoAccion === 'FACTURAR' ? '#FECACA' : estadoAccion === 'ENTREGAR' ? '#BBF7D0' : '#E2E8F0'}`
                                        }}>
                                            {estadoAccion}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>

                <div style={{ padding: '12px 20px', background: '#F8FAFC', borderTop: '1px solid var(--neutral-100)', fontSize: '0.75rem', color: 'var(--neutral-400)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Mostrando {filteredRecords.length} registro/s</span>
                    <span>Actualizado automáticamente desde SALUS</span>
                </div>
            </div>
        </div>
    );
}
