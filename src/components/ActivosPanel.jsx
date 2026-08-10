import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Search, Plus, QrCode, Wrench, Shield, CheckCircle, AlertTriangle, 
    X, AlertCircle, RefreshCw, Upload, Image as ImageIcon, MapPin, Pencil, History
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { fetchSedes, fetchEquipos, crearEquipo, actualizarEquipo, registrarIntervencion, fetchIntervenciones } from '../services/activosService';

export default function ActivosPanel({ currentUser, addToast }) {
    const [equipos, setEquipos] = useState([]);
    const [sedes, setSedes] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [filterSede, setFilterSede] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 50;

    // Modals
    const [showAltaModal, setShowAltaModal] = useState(false);
    const [editEquipo, setEditEquipo] = useState(null);
    const [showQRModal, setShowQRModal] = useState(null); // equipo id
    const [showIntervencionModal, setShowIntervencionModal] = useState(null); // equipo id
    const [showHistorialModal, setShowHistorialModal] = useState(null); // equipo id

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [sData, eData] = await Promise.all([
                fetchSedes(),
                fetchEquipos()
            ]);
            setSedes(sData || []);
            setEquipos(eData || []);
        } catch (err) {
            console.error(err);
            addToast?.('Error al cargar activos: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const filteredEquipos = useMemo(() => {
        return equipos.filter(e => {
            const matchSearch = (e.nombre + ' ' + (e.modelo || '') + ' ' + (e.marca || '')).toLowerCase().includes(searchTerm.toLowerCase());
            const matchSede = filterSede ? e.sede_id === filterSede : true;
            return matchSearch && matchSede;
        });
    }, [equipos, searchTerm, filterSede]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterSede]);

    const paginatedEquipos = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredEquipos.slice(start, start + pageSize);
    }, [filteredEquipos, currentPage, pageSize]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'Operativo': return { bg: '#dcfce7', text: '#16a34a' };
            case 'Operativo (Quedó OK)': return { bg: '#dcfce7', text: '#16a34a' };
            case 'Fuera de Servicio': return { bg: '#fee2e2', text: '#dc2626' };
            case 'Fuera de Servicio (Taller)': return { bg: '#fee2e2', text: '#dc2626' };
            case 'En Mantenimiento': return { bg: '#ffedd5', text: '#ea580c' };
            case 'En Revisión': return { bg: '#ffedd5', text: '#ea580c' };
            case 'En Calibración': return { bg: '#e0e7ff', text: '#4f46e5' };
            default: return { bg: '#f1f5f9', text: '#64748b' };
        }
    };

    return (
        <div className="content animate-fade-in" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            
            {/* Header & Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h2 style={{ margin: '0 0 8px', fontSize: '1.5rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Shield size={24} color="#3b82f6" /> Inventario de Activos Médicos
                    </h2>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                        Gestión de equipamiento, trazabilidad y control de mantenimientos.
                    </p>
                </div>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        onClick={() => setShowAltaModal(true)}
                        style={{
                            background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px',
                            padding: '10px 16px', fontSize: '0.9rem', fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.1)'
                        }}
                    >
                        <Plus size={18} /> Nuevo Equipo
                    </button>
                    <button 
                        onClick={loadData}
                        style={{
                            background: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px',
                            padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}
                        title="Actualizar"
                    >
                        <RefreshCw size={18} className={loading ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div style={{ 
                display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', background: 'white', 
                padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' 
            }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input 
                        type="text" 
                        placeholder="Buscar por nombre, marca o modelo..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%', padding: '10px 12px 10px 38px', borderRadius: '8px',
                            border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none'
                        }}
                    />
                </div>
                <select 
                    value={filterSede} 
                    onChange={e => setFilterSede(e.target.value)}
                    style={{
                        padding: '10px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', 
                        fontSize: '0.9rem', outline: 'none', background: 'white', minWidth: '180px'
                    }}
                >
                    <option value="">Todas las Sedes</option>
                    {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
            </div>

            {/* Grid de Equipos */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Cargando equipos...</div>
            ) : filteredEquipos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                    <AlertCircle size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
                    <h3 style={{ margin: '0 0 8px', color: '#475569' }}>No se encontraron equipos</h3>
                    <p style={{ margin: 0, color: '#94a3b8' }}>Ajusta los filtros o da de alta un nuevo activo.</p>
                </div>
            ) : (
                <div style={{ 
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
                    gap: '20px' 
                }}>
                    {paginatedEquipos.map(equipo => {
                        const colors = getStatusColor(equipo.estado_operativo);
                        return (
                            <div key={equipo.id} style={{
                                background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0',
                                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                                transition: 'box-shadow 0.2s',
                                ':hover': { boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }
                            }}>
                                <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                        <span style={{ 
                                            background: colors.bg, color: colors.text, 
                                            padding: '4px 10px', borderRadius: '20px', 
                                            fontSize: '0.75rem', fontWeight: 700 
                                        }}>
                                            {equipo.estado_operativo}
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                            <MapPin size={12} /> {equipo.activos_sedes?.nombre || 'Sede desc.'}
                                        </span>
                                    </div>
                                    <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', color: '#1e293b' }}>{equipo.nombre}</h3>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                                        {equipo.marca} {equipo.modelo ? `- ${equipo.modelo}` : ''}
                                    </p>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    <button 
                                        onClick={() => setShowHistorialModal(equipo)}
                                        style={{ 
                                            background: 'white', border: '1px solid #cbd5e1', 
                                            borderRadius: '6px', padding: '8px 12px', fontSize: '0.8rem', fontWeight: 600,
                                            color: '#0ea5e9', display: 'flex', alignItems: 'center', gap: '6px',
                                            cursor: 'pointer'
                                        }}
                                        title="Ver historial de intervenciones"
                                    >
                                        <History size={16} /> Historial
                                    </button>
                                    <button 
                                        onClick={() => setShowIntervencionModal(equipo)}
                                        style={{ 
                                            flex: 1, background: 'white', border: '1px solid #cbd5e1', 
                                            borderRadius: '6px', padding: '8px', fontSize: '0.8rem', fontWeight: 600,
                                            color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Wrench size={14} /> Intervención
                                    </button>
                                    <button 
                                        onClick={() => setShowQRModal(equipo)}
                                        style={{ 
                                            background: 'white', border: '1px solid #cbd5e1', 
                                            borderRadius: '6px', padding: '8px 12px', fontSize: '0.8rem', fontWeight: 600,
                                            color: '#0284c7', display: 'flex', alignItems: 'center', gap: '6px',
                                            cursor: 'pointer'
                                        }}
                                        title="Generar etiqueta QR"
                                    >
                                        <QrCode size={16} /> QR
                                    </button>
                                    <button 
                                        onClick={() => setEditEquipo(equipo)}
                                        style={{ 
                                            background: 'white', border: '1px solid #cbd5e1', 
                                            borderRadius: '6px', padding: '8px 12px', fontSize: '0.8rem', fontWeight: 600,
                                            color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px',
                                            cursor: 'pointer'
                                        }}
                                        title="Editar equipo"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Controles de Paginación */}
            {!loading && filteredEquipos.length > pageSize && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
                    <button 
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => prev - 1)}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: currentPage === 1 ? '#f8fafc' : 'white', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontWeight: 600, color: '#475569' }}
                    >
                        Anterior
                    </button>
                    <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>
                        Página {currentPage} de {Math.ceil(filteredEquipos.length / pageSize)}
                    </span>
                    <button 
                        disabled={currentPage >= Math.ceil(filteredEquipos.length / pageSize)}
                        onClick={() => setCurrentPage(prev => prev + 1)}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: currentPage >= Math.ceil(filteredEquipos.length / pageSize) ? '#f8fafc' : 'white', cursor: currentPage >= Math.ceil(filteredEquipos.length / pageSize) ? 'not-allowed' : 'pointer', fontWeight: 600, color: '#475569' }}
                    >
                        Siguiente
                    </button>
                </div>
            )}

            {/* Modal Alta/Edición Equipo */}
            {(showAltaModal || editEquipo) && (
                <AltaEquipoModal 
                    sedes={sedes} 
                    currentUser={currentUser}
                    equipoToEdit={editEquipo}
                    onClose={() => { setShowAltaModal(false); setEditEquipo(null); }} 
                    onSuccess={() => { setShowAltaModal(false); setEditEquipo(null); loadData(); }}
                    addToast={addToast}
                />
            )}

            {/* Modal QR */}
            {showQRModal && (
                <QRModal 
                    equipo={showQRModal} 
                    onClose={() => setShowQRModal(null)} 
                />
            )}

            {/* Modal Intervención */}
            {showIntervencionModal && (
                <IntervencionModal 
                    equipo={showIntervencionModal} 
                    currentUser={currentUser}
                    onClose={() => setShowIntervencionModal(null)} 
                    onSuccess={() => { setShowIntervencionModal(null); loadData(); }}
                    addToast={addToast}
                />
            )}
            
            {showHistorialModal && (
                <HistorialModal equipo={showHistorialModal} onClose={() => setShowHistorialModal(null)} />
            )}
        </div>
    );
}

// ---------------------------
// Alta / Edición Equipo Modal
// ---------------------------
function AltaEquipoModal({ sedes, currentUser, equipoToEdit, onClose, onSuccess, addToast }) {
    const [form, setForm] = useState(equipoToEdit ? {
        nombre: equipoToEdit.nombre || '', 
        marca: equipoToEdit.marca || '', 
        modelo: equipoToEdit.modelo || '', 
        sede_id: equipoToEdit.sede_id || '', 
        estado_operativo: equipoToEdit.estado_operativo || 'Operativo', 
        observaciones: equipoToEdit.observaciones || ''
    } : {
        nombre: '', marca: '', modelo: '', sede_id: '', estado_operativo: 'Operativo', observaciones: ''
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (equipoToEdit) {
                await actualizarEquipo(equipoToEdit.id, { ...form });
                addToast('Equipo actualizado con éxito', 'success');
            } else {
                await crearEquipo({
                    ...form,
                    created_by: currentUser.id || currentUser.nombre
                });
                addToast('Equipo registrado con éxito', 'success');
            }
            onSuccess();
        } catch (error) {
            addToast('Error al guardar el equipo', 'error');
        } finally {
            setSaving(false);
        }
    };

    const inputStyle = {
        width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', 
        fontSize: '0.9rem', marginBottom: '16px', outline: 'none', boxSizing: 'border-box'
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '500px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} className="animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>{equipoToEdit ? 'Editar Equipo' : 'Alta de Nuevo Equipo'}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                </div>
                
                <form onSubmit={handleSubmit}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Sede de Asignación *</label>
                    <select required style={inputStyle} value={form.sede_id} onChange={e => setForm({...form, sede_id: e.target.value})}>
                        <option value="">Seleccione una sede...</option>
                        {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>

                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Nombre del Equipo *</label>
                    <input required type="text" placeholder="Ej. Monitor Multiparamétrico" style={inputStyle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Marca</label>
                            <input type="text" placeholder="Ej. Mindray" style={inputStyle} value={form.marca} onChange={e => setForm({...form, marca: e.target.value})} />
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Modelo</label>
                            <input type="text" placeholder="Ej. uMEC10" style={inputStyle} value={form.modelo} onChange={e => setForm({...form, modelo: e.target.value})} />
                        </div>
                    </div>

                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Estado Inicial *</label>
                    <select required style={inputStyle} value={form.estado_operativo} onChange={e => setForm({...form, estado_operativo: e.target.value})}>
                        <option value="Operativo">Operativo</option>
                        <option value="En Revisión">En Revisión</option>
                        <option value="Fuera de Servicio (Taller)">Fuera de Servicio (Taller)</option>
                    </select>

                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Observaciones</label>
                    <textarea rows={3} style={{...inputStyle, resize: 'none'}} value={form.observaciones} onChange={e => setForm({...form, observaciones: e.target.value})} />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                        <button type="button" onClick={onClose} style={{ padding: '10px 16px', borderRadius: '8px', background: '#f1f5f9', color: '#475569', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving} style={{ padding: '10px 16px', borderRadius: '8px', background: '#0ea5e9', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                            {saving ? 'Guardando...' : (equipoToEdit ? 'Guardar Cambios' : 'Registrar Equipo')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ---------------------------
// Modal Intervención / Mantenimiento
// ---------------------------
function IntervencionModal({ equipo, currentUser, onClose, onSuccess, addToast }) {
    const [form, setForm] = useState({
        tipo_tarea: 'Mantenimiento Preventivo', responsable: currentUser.nombre || '', fecha_intervencion: new Date().toISOString().split('T')[0],
        proximo_mantenimiento: '', estado_post: equipo.estado_operativo, notas: ''
    });
    const [file, setFile] = useState(null);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await registrarIntervencion({
                equipo_id: equipo.id,
                ...form,
                created_by: currentUser.usuario || currentUser.nombre
            }, file);
            addToast?.('Intervención registrada correctamente', 'success');
            onSuccess();
        } catch (err) {
            addToast?.('Error al registrar intervención: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const inputStyle = {
        width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', 
        fontSize: '0.9rem', marginBottom: '16px', outline: 'none', boxSizing: 'border-box'
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '500px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} className="animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>Registrar Intervención</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                </div>
                
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Equipo seleccionado:</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 700 }}>{equipo.nombre} ({equipo.marca})</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Tipo de Tarea *</label>
                            <select required style={inputStyle} value={form.tipo_tarea} onChange={e => setForm({...form, tipo_tarea: e.target.value})}>
                                <option value="Mantenimiento Preventivo">Mantenimiento Preventivo</option>
                                <option value="Mantenimiento Correctivo">Mantenimiento Correctivo</option>
                                <option value="Calibración">Calibración</option>
                            </select>
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Estado Final *</label>
                            <select required style={inputStyle} value={form.estado_post} onChange={e => setForm({...form, estado_post: e.target.value})}>
                                <option value="Operativo">Operativo (Quedó OK)</option>
                                <option value="En Revisión">En Revisión (En progreso)</option>
                                <option value="Fuera de Servicio (Taller)">Fuera de Servicio (Taller)</option>
                            </select>
                        </div>
                    </div>

                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Responsable / Técnico *</label>
                    <input required type="text" style={inputStyle} value={form.responsable} onChange={e => setForm({...form, responsable: e.target.value})} />

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Fecha Actual *</label>
                            <input required type="date" style={inputStyle} value={form.fecha_intervencion} onChange={e => setForm({...form, fecha_intervencion: e.target.value})} />
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Próx. Mantenimiento</label>
                            <input type="date" style={inputStyle} value={form.proximo_mantenimiento} onChange={e => setForm({...form, proximo_mantenimiento: e.target.value})} />
                        </div>
                    </div>

                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Notas Técnicas</label>
                    <textarea rows={2} style={{...inputStyle, resize: 'none'}} value={form.notas} onChange={e => setForm({...form, notas: e.target.value})} />

                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Adjuntar Certificado / Foto (Opcional)</label>
                    <div style={{ 
                        border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '16px', textAlign: 'center',
                        background: '#f8fafc', marginBottom: '20px', position: 'relative'
                    }}>
                        <input type="file" onChange={e => setFile(e.target.files[0])} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} accept="image/*,.pdf" />
                        {file ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#0f172a', fontWeight: 600 }}>
                                <CheckCircle size={18} color="#10b981" /> {file.name}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#64748b', gap: '8px' }}>
                                <Upload size={20} />
                                <span style={{ fontSize: '0.8rem' }}>Haz clic para adjuntar archivo (PDF o Imagen)</span>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '12px' }}>
                        <button type="button" onClick={onClose} style={{ flex: '1 1 auto', padding: '10px 16px', borderRadius: '8px', background: '#f1f5f9', color: '#475569', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                        <button type="submit" disabled={saving} style={{ flex: '1 1 auto', padding: '10px 16px', borderRadius: '8px', background: '#2563eb', color: 'white', border: 'none', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                            {saving ? 'Guardando...' : 'Guardar Intervención'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ---------------------------
// Modal Etiqueta QR
// ---------------------------
function QRModal({ equipo, onClose }) {
    const qrUrl = `${window.location.origin}/recepcion/equipo/${equipo.id}`;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', borderRadius: '16px', width: '90%', maxWidth: '320px', padding: '32px 24px', textAlign: 'center', position: 'relative' }} className="animate-fade-in">
                <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                
                <Shield size={32} color="#3b82f6" style={{ marginBottom: '12px' }} />
                <h3 style={{ margin: '0 0 4px', fontSize: '1.2rem', color: '#1e293b' }}>{equipo.nombre}</h3>
                <p style={{ margin: '0 0 24px', fontSize: '0.9rem', color: '#64748b' }}>{equipo.marca}</p>

                <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '2px solid #e2e8f0', display: 'inline-block', marginBottom: '24px' }}>
                    <QRCodeSVG value={qrUrl} size={180} level="H" />
                </div>
                
                <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#94a3b8' }}>
                    Escanea este código con cualquier celular para acceder al historial de auditoría del equipo.
                </p>

                <button 
                    onClick={() => window.print()}
                    style={{ padding: '10px 16px', borderRadius: '8px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', fontWeight: 600, cursor: 'pointer', width: '100%' }}
                >
                    Imprimir Etiqueta
                </button>

                {/* Etiqueta imprimible oculta en pantalla */}
                <div className="print-area print-only">
                    <div className="print-page">
                        <div className="print-patient-name" style={{ marginBottom: '4mm' }}>Sanatorio Argentino</div>
                        <div className="print-os-line" style={{ justifyContent: 'center', fontSize: '12pt', paddingBottom: '4mm', borderBottom: '2px solid #000', marginBottom: '8mm' }}>
                            GESTIÓN DE ACTIVOS CMMS
                        </div>
                        
                        <div style={{ textAlign: 'center' }}>
                            <h2 style={{ fontSize: '18pt', margin: '0 0 2mm' }}>{equipo.nombre}</h2>
                            <h3 style={{ fontSize: '14pt', margin: '0 0 10mm', color: '#444' }}>{equipo.marca} {equipo.modelo ? `- ${equipo.modelo}` : ''}</h3>
                            
                            <QRCodeSVG value={qrUrl} size={250} level="H" />
                            
                            <p style={{ marginTop: '10mm', fontSize: '12pt', color: '#666' }}>
                                Escanee el código para acceder al historial técnico.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---------------------------
// Modal Historial de Equipo
// ---------------------------
function HistorialModal({ equipo, onClose }) {
    const [historial, setHistorial] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const data = await fetchIntervenciones(equipo.id);
                setHistorial(data || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [equipo.id]);

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', borderRadius: '16px', width: '90%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} className="animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>Historial del Equipo</h3>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>{equipo.nombre} ({equipo.marca})</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Cargando historial...</div>
                    ) : historial.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                            <p style={{ margin: 0, color: '#64748b' }}>No hay registros de mantenimiento para este equipo.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {historial.map(item => (
                                <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: 'white' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '8px' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0ea5e9', background: '#e0f2fe', padding: '4px 8px', borderRadius: '4px' }}>{item.tipo_tarea}</span>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>{new Date(item.fecha_intervencion).toLocaleDateString('es-AR')}</span>
                                        </div>
                                        {item.estado_post && (
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>Estado: {item.estado_post}</span>
                                        )}
                                    </div>
                                    <p style={{ margin: '0 0 8px', fontSize: '0.9rem', color: '#1e293b' }}><strong>Técnico:</strong> {item.responsable}</p>
                                    {item.notas && <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#475569', background: '#f8fafc', padding: '8px', borderRadius: '6px' }}>{item.notas}</p>}
                                    {item.doc_url && (
                                        <a href={item.doc_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#2563eb', textDecoration: 'none', fontWeight: 600, border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '6px', background: '#eff6ff' }}>
                                            <ImageIcon size={14} /> Ver Registro Adjunto
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
