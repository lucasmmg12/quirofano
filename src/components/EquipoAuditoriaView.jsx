import { useState, useEffect } from 'react';
import { 
    Shield, MapPin, Activity, Calendar, Wrench, Download, AlertTriangle 
} from 'lucide-react';
import { fetchEquipoById, fetchIntervenciones } from '../services/activosService';

export default function EquipoAuditoriaView({ equipoId }) {
    const [equipo, setEquipo] = useState(null);
    const [intervenciones, setIntervenciones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function loadData() {
            try {
                const eq = await fetchEquipoById(equipoId);
                const intervs = await fetchIntervenciones(equipoId);
                setEquipo(eq);
                setIntervenciones(intervs || []);
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

    const getStatusColor = (status) => {
        switch (status) {
            case 'Operativo': return { bg: '#dcfce7', text: '#16a34a' };
            case 'Fuera de Servicio': return { bg: '#fee2e2', text: '#dc2626' };
            case 'En Mantenimiento': return { bg: '#ffedd5', text: '#ea580c' };
            case 'En Calibración': return { bg: '#e0e7ff', text: '#4f46e5' };
            default: return { bg: '#f1f5f9', text: '#64748b' };
        }
    };
    
    const colors = getStatusColor(equipo.estado_operativo);

    return (
        <div style={{ 
            fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
            maxWidth: '600px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh',
            paddingBottom: '40px'
        }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #1e4078, #2563eb)', color: 'white', padding: '32px 24px', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px', boxShadow: '0 10px 25px -5px rgba(37,99,235,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <Shield size={28} />
                    <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Trazabilidad Oficial</h1>
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
                    <span style={{ 
                        background: colors.bg, color: colors.text, padding: '6px 12px', borderRadius: '20px', 
                        fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                        <Activity size={14} /> {equipo.estado_operativo}
                    </span>
                </div>
            </div>

            {/* Timeline */}
            <div style={{ padding: '32px 24px' }}>
                <h3 style={{ margin: '0 0 24px', fontSize: '1.1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Wrench size={20} color="#64748b" /> Historial de Intervenciones
                </h3>

                {intervenciones.length === 0 ? (
                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', textAlign: 'center', color: '#64748b', border: '1px solid #e2e8f0' }}>
                        No hay intervenciones registradas.
                    </div>
                ) : (
                    <div style={{ position: 'relative', paddingLeft: '16px' }}>
                        {/* Línea vertical */}
                        <div style={{ position: 'absolute', left: '7px', top: '10px', bottom: '10px', width: '2px', background: '#cbd5e1' }} />
                        
                        {intervenciones.map((intv, idx) => (
                            <div key={intv.id} style={{ position: 'relative', marginBottom: '24px', background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                {/* Punto de la línea */}
                                <div style={{ position: 'absolute', left: '-13px', top: '24px', width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6', border: '2px solid white', boxShadow: '0 0 0 2px #3b82f6' }} />
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>{intv.tipo_tarea}</h4>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b', background: '#f1f5f9', padding: '4px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                        {intv.fecha_intervencion.split('-').reverse().join('/')}
                                    </span>
                                </div>
                                
                                <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <strong>Técnico:</strong> {intv.responsable}
                                </p>

                                {intv.notas && (
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #cbd5e1', marginBottom: '12px' }}>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
                                            {intv.notas}
                                        </p>
                                    </div>
                                )}

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px' }}>
                                    {intv.estado_post && (
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <strong>Estado final:</strong> {intv.estado_post}
                                        </div>
                                    )}
                                    {intv.proximo_mantenimiento && (
                                        <div style={{ fontSize: '0.8rem', color: '#ea580c', display: 'flex', alignItems: 'center', gap: '4px', background: '#ffedd5', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                            <Calendar size={12} /> Próx: {intv.proximo_mantenimiento.split('-').reverse().join('/')}
                                        </div>
                                    )}
                                </div>

                                {intv.doc_url && (
                                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                                        <a href={intv.doc_url} target="_blank" rel="noreferrer" style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem',
                                            color: '#2563eb', textDecoration: 'none', fontWeight: 600
                                        }}>
                                            <Download size={16} /> Ver Certificado / Adjunto
                                        </a>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
