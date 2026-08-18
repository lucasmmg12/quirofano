import { useState, useEffect, useCallback } from 'react';
import { 
    Shield, MapPin, Activity, Calendar, Wrench, Download, AlertTriangle, 
    Image as ImageIcon, CheckCircle, Clock, Plus, ArrowLeft, FileText, ExternalLink
} from 'lucide-react';
import { fetchEquipoById, fetchIntervenciones, registrarIntervencion } from '../services/activosService';

export default function EquipoAuditoriaView({ equipoId }) {
    const [equipo, setEquipo] = useState(null);
    const [historial, setHistorial] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('historial'); // 'historial' | 'nueva'
    
    // Form state
    const [form, setForm] = useState({
        tipo_tarea: 'Mantenimiento Preventivo', 
        responsable: '', 
        fecha_intervencion: new Date().toISOString().split('T')[0],
        proximo_mantenimiento: '', 
        estado_post: 'Operativo', 
        notas: ''
    });
    const [file, setFile] = useState(null);
    const [saving, setSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const loadData = useCallback(async () => {
        try {
            const [eq, hist] = await Promise.all([
                fetchEquipoById(equipoId),
                fetchIntervenciones(equipoId)
            ]);
            setEquipo(eq);
            setHistorial(hist || []);
            setForm(prev => ({ 
                ...prev, 
                estado_post: eq.estado_operativo || 'Operativo',
                proximo_mantenimiento: eq.proximo_mantenimiento || ''
            }));
        } catch (err) {
            console.error(err);
            setError('No se pudo cargar la información del equipo. Es posible que el enlace no sea válido.');
        } finally {
            setLoading(false);
        }
    }, [equipoId]);

    useEffect(() => {
        if (equipoId) {
            loadData();
        }
    }, [equipoId, loadData]);

    const addMonthsToDate = (months) => {
        const base = form.fecha_intervencion ? new Date(form.fecha_intervencion + 'T00:00:00') : new Date();
        base.setMonth(base.getMonth() + months);
        const yyyy = base.getFullYear();
        const mm = String(base.getMonth() + 1).padStart(2, '0');
        const dd = String(base.getDate()).padStart(2, '0');
        setForm(prev => ({ ...prev, proximo_mantenimiento: `${yyyy}-${mm}-${dd}` }));
    };

    const getMaintenanceAlert = (dateStr) => {
        if (!dateStr) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(dateStr + 'T00:00:00');
        const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { type: 'overdue', days: Math.abs(diffDays), label: `Vencido hace ${Math.abs(diffDays)} día(s)` };
        } else if (diffDays <= 30) {
            return { type: 'warning', days: diffDays, label: diffDays === 0 ? 'Vence hoy' : `Próximo vencimiento en ${diffDays} día(s)` };
        } else {
            return { type: 'ok', days: diffDays, label: `Al día (${diffDays} días restantes)` };
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setSuccessMessage('');
        try {
            await registrarIntervencion({
                equipo_id: equipo.id,
                ...form,
                created_by: 'Escaneo QR'
            }, file);
            
            setSuccessMessage('¡Intervención registrada exitosamente!');
            setFile(null);
            setForm(prev => ({ ...prev, notas: '' }));
            
            // Recargar datos y volver a historial
            await loadData();
            setActiveTab('historial');
            
            setTimeout(() => setSuccessMessage(''), 5000);
        } catch (err) {
            console.error(err);
            alert('Error al registrar la intervención: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', color: '#64748b', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '40px', height: '40px', border: '4px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
                    <p style={{ margin: 0, fontWeight: 500 }}>Cargando información del equipo...</p>
                </div>
            </div>
        );
    }

    if (error || !equipo) {
        return (
            <div style={{ padding: '60px 20px', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}>
                <AlertTriangle size={56} color="#ef4444" style={{ marginBottom: '16px' }} />
                <h2 style={{ color: '#0f172a', margin: '0 0 12px' }}>Equipo No Encontrado</h2>
                <p style={{ color: '#64748b', maxWidth: '400px', margin: '0 auto' }}>{error}</p>
            </div>
        );
    }

    const alertInfo = getMaintenanceAlert(equipo.proximo_mantenimiento);

    return (
        <div style={{ 
            fontFamily: "'Inter', sans-serif",
            maxWidth: '650px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh',
            paddingBottom: '60px'
        }}>
            {/* Header con gradiente institucional */}
            <div style={{ 
                background: 'linear-gradient(135deg, #1e4078, #2563eb)', 
                color: 'white', padding: '28px 20px 20px', 
                borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px', 
                boxShadow: '0 10px 25px -5px rgba(37,99,235,0.3)' 
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>
                        <Shield size={16} /> Trazabilidad de Activo Médico
                    </div>
                    <span style={{ fontSize: '0.75rem', opacity: 0.9, background: 'rgba(0,0,0,0.2)', padding: '4px 10px', borderRadius: '12px' }}>
                        ID: {equipo.id.substring(0, 8)}
                    </span>
                </div>
                
                <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 800 }}>{equipo.nombre}</h1>
                <p style={{ margin: '0 0 16px', opacity: 0.9, fontSize: '0.95rem' }}>
                    {equipo.marca} {equipo.modelo ? `- ${equipo.modelo}` : ''}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ 
                        background: 'white', color: '#1e4078', padding: '4px 12px', borderRadius: '20px', 
                        fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                        <MapPin size={14} /> Sede: {equipo.activos_sedes?.nombre || 'San Juan'}
                    </span>
                    <span style={{ 
                        background: equipo.estado_operativo === 'Operativo' ? '#dcfce7' : '#fee2e2', 
                        color: equipo.estado_operativo === 'Operativo' ? '#166534' : '#991b1b', 
                        padding: '4px 12px', borderRadius: '20px', 
                        fontSize: '0.8rem', fontWeight: 700 
                    }}>
                        Estado: {equipo.estado_operativo}
                    </span>
                </div>
            </div>

            {/* Banner Alerta de Próximo Mantenimiento (Regla de 30 Días) */}
            {alertInfo && (
                <div style={{ padding: '16px 20px 0' }}>
                    <div style={{
                        background: alertInfo.type === 'overdue' ? '#fef2f2' : alertInfo.type === 'warning' ? '#fff7ed' : '#f0fdf4',
                        border: `1px solid ${alertInfo.type === 'overdue' ? '#fca5a5' : alertInfo.type === 'warning' ? '#fdba74' : '#86efac'}`,
                        borderRadius: '14px', padding: '14px 16px',
                        display: 'flex', alignItems: 'center', gap: '12px'
                    }}>
                        <Clock size={24} color={alertInfo.type === 'overdue' ? '#dc2626' : alertInfo.type === 'warning' ? '#ea580c' : '#16a34a'} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: alertInfo.type === 'overdue' ? '#991b1b' : alertInfo.type === 'warning' ? '#9a3412' : '#166534' }}>
                                {alertInfo.type === 'overdue' ? '🚨 Mantenimiento VENCIDO' : alertInfo.type === 'warning' ? '⚠️ Alerta de Próximo Mantenimiento' : '✅ Mantenimiento Programado Al Día'}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: alertInfo.type === 'overdue' ? '#7f1d1d' : alertInfo.type === 'warning' ? '#c2410c' : '#15803d', marginTop: '2px' }}>
                                {alertInfo.label} (Fecha: {new Date(equipo.proximo_mantenimiento + 'T00:00:00').toLocaleDateString('es-AR')})
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Mensaje de Éxito */}
            {successMessage && (
                <div style={{ padding: '16px 20px 0' }}>
                    <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', fontWeight: 600 }}>
                        <CheckCircle size={20} color="#059669" /> {successMessage}
                    </div>
                </div>
            )}

            {/* Pestañas de Navegación */}
            <div style={{ padding: '20px 20px 0', display: 'flex', gap: '8px' }}>
                <button
                    onClick={() => setActiveTab('historial')}
                    style={{
                        flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                        fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        background: activeTab === 'historial' ? '#2563eb' : 'white',
                        color: activeTab === 'historial' ? 'white' : '#64748b',
                        boxShadow: activeTab === 'historial' ? '0 4px 6px -1px rgba(37,99,235,0.2)' : '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                >
                    <FileText size={18} /> Historial ({historial.length})
                </button>
                <button
                    onClick={() => setActiveTab('nueva')}
                    style={{
                        flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                        fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        background: activeTab === 'nueva' ? '#2563eb' : 'white',
                        color: activeTab === 'nueva' ? 'white' : '#64748b',
                        boxShadow: activeTab === 'nueva' ? '0 4px 6px -1px rgba(37,99,235,0.2)' : '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                >
                    <Plus size={18} /> Cargar Intervención
                </button>
            </div>

            {/* Contenido Principal */}
            <div style={{ padding: '16px 20px' }}>
                
                {/* VISTA 1: Historial de Intervenciones */}
                {activeTab === 'historial' && (
                    <div>
                        {historial.length === 0 ? (
                            <div style={{ background: 'white', borderRadius: '16px', padding: '40px 20px', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
                                <Wrench size={48} color="#cbd5e1" style={{ marginBottom: '12px' }} />
                                <h3 style={{ margin: '0 0 8px', color: '#334155' }}>Sin intervenciones registradas</h3>
                                <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '0.85rem' }}>
                                    Aún no hay mantenimientos ni auditorías cargadas para este equipo.
                                </p>
                                <button
                                    onClick={() => setActiveTab('nueva')}
                                    style={{ padding: '10px 20px', borderRadius: '8px', background: '#2563eb', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Registrar Primer Mantenimiento
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {historial.map((item, idx) => (
                                    <div key={item.id || idx} style={{ background: 'white', borderRadius: '14px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '8px' }}>
                                            <div>
                                                <span style={{ 
                                                    background: '#e0f2fe', color: '#0284c7', 
                                                    padding: '3px 8px', borderRadius: '6px', 
                                                    fontSize: '0.75rem', fontWeight: 700 
                                                }}>
                                                    {item.tipo_tarea}
                                                </span>
                                                <h4 style={{ margin: '6px 0 0', fontSize: '1rem', color: '#0f172a' }}>
                                                    {item.responsable}
                                                </h4>
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Calendar size={14} /> {new Date(item.fecha_intervencion + 'T00:00:00').toLocaleDateString('es-AR')}
                                            </span>
                                        </div>

                                        {item.notas && (
                                            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#475569', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                                {item.notas}
                                            </p>
                                        )}

                                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', pt: '8px', borderTop: '1px solid #f1f5f9', gap: '8px' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                Estado post: <strong>{item.estado_post || 'Operativo'}</strong>
                                            </span>

                                            {item.doc_url && (
                                                <a 
                                                    href={item.doc_url} 
                                                    target="_blank" 
                                                    rel="noreferrer" 
                                                    style={{ 
                                                        display: 'inline-flex', alignItems: 'center', gap: '6px', 
                                                        fontSize: '0.8rem', color: '#2563eb', fontWeight: 700, 
                                                        background: '#eff6ff', border: '1px solid #bfdbfe', 
                                                        padding: '6px 12px', borderRadius: '8px', textDecoration: 'none' 
                                                    }}
                                                >
                                                    <ExternalLink size={14} /> Ver Certificado / Adjunto
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* VISTA 2: Formulario Nueva Intervención */}
                {activeTab === 'nueva' && (
                    <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#1e293b' }}>Registrar Mantenimiento o Auditoría</h3>
                        
                        <form onSubmit={handleSubmit}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Tipo de Tarea *</label>
                            <select 
                                required 
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', marginBottom: '16px', outline: 'none' }}
                                value={form.tipo_tarea} 
                                onChange={e => setForm({...form, tipo_tarea: e.target.value})}
                            >
                                <option value="Mantenimiento Preventivo">Mantenimiento Preventivo</option>
                                <option value="Mantenimiento Correctivo">Mantenimiento Correctivo</option>
                                <option value="Calibración">Calibración</option>
                                <option value="Auditoría / Inspección">Auditoría / Inspección</option>
                            </select>

                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Estado Final del Equipo *</label>
                            <select 
                                required 
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', marginBottom: '16px', outline: 'none' }}
                                value={form.estado_post} 
                                onChange={e => setForm({...form, estado_post: e.target.value})}
                            >
                                <option value="Operativo">Operativo (Quedó OK)</option>
                                <option value="En Revisión">En Revisión (En progreso)</option>
                                <option value="Fuera de Servicio (Taller)">Fuera de Servicio (Taller)</option>
                            </select>

                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Responsable / Técnico *</label>
                            <input 
                                required 
                                type="text" 
                                placeholder="Ej. Ing. Luciana Vázquez - Biobase Argentina" 
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', marginBottom: '16px', outline: 'none', boxSizing: 'border-box' }}
                                value={form.responsable} 
                                onChange={e => setForm({...form, responsable: e.target.value})} 
                            />

                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                                <div style={{ flex: '1 1 140px' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Fecha Actual *</label>
                                    <input 
                                        required 
                                        type="date" 
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                                        value={form.fecha_intervencion} 
                                        onChange={e => setForm({...form, fecha_intervencion: e.target.value})} 
                                    />
                                </div>
                                <div style={{ flex: '1 1 180px' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Próx. Mantenimiento</label>
                                    <input 
                                        type="date" 
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                                        value={form.proximo_mantenimiento} 
                                        onChange={e => setForm({...form, proximo_mantenimiento: e.target.value})} 
                                    />
                                </div>
                            </div>

                            {/* Botones de Selección Rápida de Próximo Vencimiento */}
                            <div style={{ marginBottom: '16px', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                                    Programar Vencimiento en:
                                </span>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <button type="button" onClick={() => addMonthsToDate(1)} style={{ padding: '4px 10px', borderRadius: '6px', background: 'white', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>+1 Mes</button>
                                    <button type="button" onClick={() => addMonthsToDate(3)} style={{ padding: '4px 10px', borderRadius: '6px', background: 'white', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>+3 Meses</button>
                                    <button type="button" onClick={() => addMonthsToDate(6)} style={{ padding: '4px 10px', borderRadius: '6px', background: 'white', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>+6 Meses</button>
                                    <button type="button" onClick={() => addMonthsToDate(12)} style={{ padding: '4px 10px', borderRadius: '6px', background: 'white', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>+1 Año</button>
                                </div>
                            </div>

                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Notas Técnicas</label>
                            <textarea 
                                rows="3" 
                                placeholder="Detalles de repuestos cambiados, calibración efectuada..." 
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', marginBottom: '16px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                                value={form.notas} 
                                onChange={e => setForm({...form, notas: e.target.value})}
                            />

                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Adjuntar Certificado / Foto (Opcional)</label>
                            <div style={{ border: '2px dashed #cbd5e1', borderRadius: '10px', padding: '16px', textAlign: 'center', marginBottom: '20px', background: '#f8fafc' }}>
                                <input type="file" id="file-upload-qr" style={{ display: 'none' }} accept="image/*,.pdf" onChange={e => setFile(e.target.files[0])} />
                                <label htmlFor="file-upload-qr" style={{ cursor: 'pointer', display: 'block' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#0f172a', fontWeight: 600 }}>
                                        <ImageIcon size={20} color="#2563eb" /> {file ? file.name : 'Seleccionar Archivo'}
                                    </div>
                                    {!file && <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#64748b' }}>Toca para adjuntar informe o foto de la etiqueta</p>}
                                </label>
                            </div>

                            <button 
                                type="submit" 
                                disabled={saving} 
                                style={{ 
                                    width: '100%', padding: '14px', borderRadius: '10px', background: '#2563eb', color: 'white', 
                                    border: 'none', fontWeight: 700, fontSize: '0.95rem', cursor: saving ? 'not-allowed' : 'pointer', 
                                    opacity: saving ? 0.7 : 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'
                                }}
                            >
                                {saving ? 'Guardando...' : 'Guardar Intervención'}
                            </button>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}
