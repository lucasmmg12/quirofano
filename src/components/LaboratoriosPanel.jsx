import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Microscope, Search, Filter, RefreshCw, Check, Clock } from 'lucide-react';

export default function LaboratoriosPanel({ addToast, currentUser }) {
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterModulo, setFilterModulo] = useState('all');

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

            return matchSearch && matchFilter;
        });
    }, [records, searchTerm, filterModulo]);

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
                                <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', borderBottom: '1px solid var(--neutral-200)' }}>Laboratorio</th>
                                <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', borderBottom: '1px solid var(--neutral-200)' }}>Muestra / Biopsia</th>
                                <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', borderBottom: '1px solid var(--neutral-200)', textAlign: 'center' }}>Módulo Asignado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--neutral-400)' }}>
                                        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                                        Cargando laboratorios...
                                    </td>
                                </tr>
                            ) : filteredRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--neutral-400)' }}>
                                        Ningún registro coincide con los filtros.
                                    </td>
                                </tr>
                            ) : filteredRecords.map((r) => (
                                <tr key={r.id_visita} style={{ borderBottom: '1px solid var(--neutral-100)', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#F8FAFC'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--neutral-600)', whiteSpace: 'nowrap' }}>
                                        {r.fecha_visita && new Date(r.fecha_visita).toLocaleDateString('es-AR')}
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--neutral-800)', fontSize: '0.85rem' }}>{r.paciente}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)' }}>DNI: {r.dni || 'S/D'}</div>
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--neutral-600)' }}>
                                        {r.laboratorio || '-'}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--neutral-600)' }}>
                                        {r.biopsia_congelacion && <div><span style={{ fontWeight: 600 }}>C:</span> {r.biopsia_congelacion}</div>}
                                        {r.biopsia_simple && <div><span style={{ fontWeight: 600 }}>S:</span> {r.biopsia_simple}</div>}
                                        {r.biopsia_ampliada && <div><span style={{ fontWeight: 600 }}>A:</span> {r.biopsia_ampliada}</div>}
                                        {!r.biopsia_congelacion && !r.biopsia_simple && !r.biopsia_ampliada && '-'}
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
                                </tr>
                            ))}
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
