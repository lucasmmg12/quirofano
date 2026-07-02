import { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Trash2, Power, PowerOff, Shield, Image as ImageIcon } from 'lucide-react';
import { fetchAllAlerts, saveAlert, deactivateAlert, fetchOutageReports } from '../services/systemService';

export default function SystemAlertsAdmin({ addToast, currentUser }) {
    const [alerts, setAlerts] = useState([]);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    
    const [formData, setFormData] = useState({
        message: '',
        severity: 'warning',
        service_affected: '',
        is_active: true
    });

    const loadData = async () => {
        try {
            setLoading(true);
            const [al, rep] = await Promise.all([
                fetchAllAlerts(),
                fetchOutageReports()
            ]);
            setAlerts(al);
            setReports(rep);
        } catch (error) {
            addToast?.('Error al cargar alertas', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await saveAlert({ ...formData, created_by: currentUser?.nombre });
            addToast?.('Alerta guardada', 'success');
            setIsEditing(false);
            setFormData({ message: '', severity: 'warning', service_affected: '', is_active: true });
            loadData();
        } catch (e) {
            addToast?.('Error al guardar alerta', 'error');
        }
    };

    const toggleAlert = async (alert) => {
        try {
            if (alert.is_active) {
                await deactivateAlert(alert.id);
                addToast?.('Alerta desactivada', 'success');
            } else {
                await saveAlert({ ...alert, is_active: true });
                addToast?.('Alerta reactivada', 'success');
            }
            loadData();
        } catch (e) {
            addToast?.('Error al actualizar alerta', 'error');
        }
    };

    return (
        <div style={{ marginTop: '30px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#1E293B' }}>
                    <Shield size={20} color="#6366F1" />
                    Estado del Sistema y Alertas (Outages)
                </h3>
                <button
                    onClick={() => setIsEditing(!isEditing)}
                    style={{
                        padding: '6px 12px', borderRadius: '6px', background: '#4F46E5',
                        color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                        fontSize: '0.8rem', fontWeight: 600
                    }}
                >
                    <Plus size={14} /> Nueva Alerta Manual
                </button>
            </div>

            {isEditing && (
                <form onSubmit={handleSubmit} style={{
                    background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '16px', borderRadius: '8px', marginBottom: '20px'
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', fontWeight: 600 }}>Servicio Afectado</label>
                            <input 
                                type="text" value={formData.service_affected} onChange={e => setFormData({ ...formData, service_affected: e.target.value })}
                                placeholder="Ej: WhatsApp, AWS, SALUS"
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', fontWeight: 600 }}>Severidad</label>
                            <select 
                                value={formData.severity} onChange={e => setFormData({ ...formData, severity: e.target.value })}
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                            >
                                <option value="warning">Advertencia (Amarillo)</option>
                                <option value="error">Crítico (Rojo)</option>
                                <option value="info">Informativo (Azul)</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', fontWeight: 600 }}>Mensaje para los usuarios</label>
                        <textarea 
                            value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })}
                            required
                            placeholder="Ej: Actualmente experimentamos retrasos en el envío de mensajes por problemas externos..."
                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem', resize: 'vertical' }}
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button type="button" onClick={() => setIsEditing(false)} style={{ padding: '6px 12px', background: '#E2E8F0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                        <button type="submit" style={{ padding: '6px 12px', background: '#10B981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Guardar y Activar</button>
                    </div>
                </form>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Active/History Alerts */}
                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#475569' }}>Alertas Globales</h4>
                    {alerts.length === 0 ? <p style={{ fontSize: '0.8rem', color: '#94A3B8' }}>No hay alertas registradas.</p> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {alerts.map(a => (
                                <div key={a.id} style={{
                                    padding: '10px', borderRadius: '6px', border: '1px solid #E2E8F0',
                                    background: a.is_active ? (a.severity === 'error' ? '#FEF2F2' : '#FFFBEB') : '#F8FAFC',
                                    opacity: a.is_active ? 1 : 0.6
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <strong style={{ fontSize: '0.85rem' }}>{a.service_affected || 'General'}</strong>
                                            <p style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>{a.message}</p>
                                        </div>
                                        <button 
                                            onClick={() => toggleAlert(a)}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                color: a.is_active ? '#EF4444' : '#10B981'
                                            }}
                                            title={a.is_active ? 'Desactivar alerta' : 'Reactivar alerta'}
                                        >
                                            {a.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* User Reports */}
                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#475569' }}>Reportes de Usuarios</h4>
                    {reports.length === 0 ? <p style={{ fontSize: '0.8rem', color: '#94A3B8' }}>No hay reportes de caídas.</p> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                            {reports.map(r => (
                                <div key={r.id} style={{
                                    padding: '10px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#F8FAFC'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <strong style={{ fontSize: '0.8rem' }}>{r.reported_by}</strong>
                                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>{new Date(r.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#334155' }}>{r.description}</p>
                                    {r.image_url && (
                                        <a href={r.image_url} target="_blank" rel="noreferrer" style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem',
                                            color: '#2563EB', textDecoration: 'none'
                                        }}>
                                            <ImageIcon size={14} /> Ver evidencia
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
