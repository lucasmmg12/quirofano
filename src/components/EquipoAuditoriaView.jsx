import { useState, useEffect } from 'react';
import { 
    Shield, MapPin, Activity, Calendar, Wrench, Download, AlertTriangle, Image as ImageIcon, CheckCircle 
} from 'lucide-react';
import { fetchEquipoById, registrarIntervencion } from '../services/activosService';

export default function EquipoAuditoriaView({ equipoId }) {
    const [equipo, setEquipo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // Form state
    const [form, setForm] = useState({
        tipo_tarea: 'Mantenimiento Preventivo', responsable: '', fecha_intervencion: new Date().toISOString().split('T')[0],
        proximo_mantenimiento: '', estado_post: '', notas: ''
    });
    const [file, setFile] = useState(null);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        async function loadData() {
            try {
                const eq = await fetchEquipoById(equipoId);
                setEquipo(eq);
                setForm(prev => ({ ...prev, estado_post: eq.estado_operativo }));
            } catch (err) {
                console.error(err);
                setError('No se pudo cargar la información del equipo. Es posible que el enlace no sea válido.');
            } finally {
                setLoading(false);
            }
        }
        if (equipoId) {
            loadData();
        }
    }, [equipoId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await registrarIntervencion({
                equipo_id: equipo.id,
                ...form,
                created_by: 'QR Publico'
            }, file);
            setSuccess(true);
        } catch (err) {
            console.error(err);
            alert('Error al registrar la intervención: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: '#64748b' }}>Cargando información del equipo...</div>;
    }

    if (error || !equipo) {
        return (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
                <h2 style={{ color: '#0f172a', margin: '0 0 12px' }}>Equipo No Encontrado</h2>
                <p style={{ color: '#64748b' }}>{error}</p>
            </div>
        );
    }

    if (success) {
        return (
            <div style={{ padding: '60px 20px', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}>
                <CheckCircle size={64} color="#10b981" style={{ marginBottom: '16px' }} />
                <h2 style={{ color: '#0f172a', margin: '0 0 12px' }}>¡Registro Exitoso!</h2>
                <p style={{ color: '#64748b', marginBottom: '24px' }}>La intervención técnica se ha guardado correctamente.</p>
                <button 
                    onClick={() => { setSuccess(false); setFile(null); setForm(prev => ({...prev, notas: ''})); }}
                    style={{ padding: '12px 24px', borderRadius: '8px', background: '#3b82f6', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                >
                    Registrar otra intervención
                </button>
            </div>
        );
    }

    const inputStyle = {
        width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', 
        fontSize: '0.9rem', marginBottom: '16px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit'
    };

    return (
        <div style={{ 
            fontFamily: "'Inter', sans-serif",
            maxWidth: '600px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh',
            paddingBottom: '40px'
        }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #1e4078, #2563eb)', color: 'white', padding: '32px 24px', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px', boxShadow: '0 10px 25px -5px rgba(37,99,235,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <Wrench size={28} />
                    <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Registro Técnico</h1>
                </div>
                
                <h2 style={{ margin: '0 0 4px', fontSize: '1.6rem', fontWeight: 700 }}>{equipo.nombre}</h2>
                <p style={{ margin: '0 0 16px', opacity: 0.9, fontSize: '1rem' }}>
                    {equipo.marca} {equipo.modelo ? `- ${equipo.modelo}` : ''}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    <span style={{ 
                        background: 'rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '20px', 
                        fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                        <MapPin size={14} /> {equipo.activos_sedes?.nombre}
                    </span>
                </div>
            </div>

            {/* Formulario */}
            <div style={{ padding: '32px 24px' }}>
                <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '1.2rem', color: '#1e293b' }}>Nueva Intervención</h3>
                    
                    <form onSubmit={handleSubmit}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Tipo de Tarea *</label>
                        <select required style={inputStyle} value={form.tipo_tarea} onChange={e => setForm({...form, tipo_tarea: e.target.value})}>
                            <option value="Mantenimiento Preventivo">Mantenimiento Preventivo</option>
                            <option value="Mantenimiento Correctivo">Mantenimiento Correctivo</option>
                            <option value="Calibración">Calibración</option>
                        </select>

                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Estado Final del Equipo *</label>
                        <select required style={inputStyle} value={form.estado_post} onChange={e => setForm({...form, estado_post: e.target.value})}>
                            <option value="Operativo">Operativo (Quedó OK)</option>
                            <option value="En Revisión">En Revisión (En progreso)</option>
                            <option value="Fuera de Servicio (Taller)">Fuera de Servicio (Taller)</option>
                        </select>

                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Responsable / Técnico *</label>
                        <input required type="text" placeholder="Ej. Juan Pérez - Empresa X" style={inputStyle} value={form.responsable} onChange={e => setForm({...form, responsable: e.target.value})} />

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 120px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Fecha *</label>
                                <input required type="date" style={inputStyle} value={form.fecha_intervencion} onChange={e => setForm({...form, fecha_intervencion: e.target.value})} />
                            </div>
                            <div style={{ flex: '1 1 120px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Próx. Mantenimiento</label>
                                <input type="date" style={inputStyle} value={form.proximo_mantenimiento} onChange={e => setForm({...form, proximo_mantenimiento: e.target.value})} />
                            </div>
                        </div>

                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Notas Técnicas</label>
                        <textarea rows="3" placeholder="Detalles de la intervención..." style={{...inputStyle, resize: 'vertical'}} value={form.notas} onChange={e => setForm({...form, notas: e.target.value})}></textarea>

                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Adjuntar Certificado / Foto (Opcional)</label>
                        <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '16px', textAlign: 'center', marginBottom: '24px', background: '#f8fafc' }}>
                            <input type="file" id="file-upload-qr" style={{ display: 'none' }} accept="image/*,.pdf" onChange={e => setFile(e.target.files[0])} />
                            <label htmlFor="file-upload-qr" style={{ cursor: 'pointer', display: 'block' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#0f172a', fontWeight: 600 }}>
                                    <ImageIcon size={20} color="#3b82f6" /> {file ? file.name : 'Seleccionar Archivo'}
                                </div>
                                {!file && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>Toca aquí para adjuntar o tomar foto</p>}
                            </label>
                        </div>

                        <button type="submit" disabled={saving} style={{ 
                            width: '100%', padding: '14px', borderRadius: '12px', background: '#2563eb', color: 'white', 
                            border: 'none', fontWeight: 700, fontSize: '1rem', cursor: saving ? 'not-allowed' : 'pointer', 
                            opacity: saving ? 0.7 : 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'
                        }}>
                            {saving ? 'Registrando...' : 'Registrar Intervención'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
