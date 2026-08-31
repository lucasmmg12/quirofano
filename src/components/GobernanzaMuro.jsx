import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, FileText, Target, Mic, Loader2, User } from 'lucide-react';

export default function GobernanzaMuro({ proyectoId }) {
    const [actividad, setActividad] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (proyectoId) fetchActividad();
    }, [proyectoId]);

    const fetchActividad = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('gobernanza_actividad')
                .select(`
                    id, accion, detalles, created_at,
                    usuario:admqui_usuarios(id, nombre)
                `)
                .eq('proyecto_id', proyectoId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setActividad(data || []);
        } catch (err) {
            console.error("Error fetching actividad:", err);
        } finally {
            setLoading(false);
        }
    };

    const getIconForAccion = (accion) => {
        if (accion.includes('PROYECTO')) return <Activity size={18} color="#3b82f6" />;
        if (accion.includes('DOCUMENTO')) return <FileText size={18} color="#10b981" />;
        if (accion.includes('INDICADOR')) return <Target size={18} color="#f59e0b" />;
        if (accion.includes('ENTREVISTA')) return <Mic size={18} color="#8b5cf6" />;
        return <Activity size={18} color="#64748b" />;
    };

    const getTextoParaAccion = (item) => {
        const nombre = item.usuario?.nombre || 'Alguien';
        const detalles = item.detalles || {};
        
        switch (item.accion) {
            case 'CREO_PROYECTO':
                return <span><b>{nombre}</b> creó el proyecto.</span>;
            case 'CREO_INDICADOR':
                return <span><b>{nombre}</b> creó el indicador <b>{detalles.titulo}</b>.</span>;
            case 'SUBIO_DOCUMENTO':
                return <span><b>{nombre}</b> subió el documento <b>{detalles.nombre}</b>.</span>;
            case 'GRABO_ENTREVISTA':
                return <span><b>{nombre}</b> grabó una auditoría de voz.</span>;
            default:
                return <span><b>{nombre}</b> realizó una acción: {item.accion}</span>;
        }
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="animate-spin" size={32} color="#94a3b8" /></div>;
    }

    if (actividad.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                <Activity size={48} color="#cbd5e1" style={{ margin: '0 auto 16px' }} />
                <p>No hay actividad registrada aún en este proyecto.</p>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h3 style={{ marginBottom: '24px', color: '#0f172a', fontWeight: 800 }}>Muro de Actividad</h3>
            <div style={{ position: 'relative', borderLeft: '2px solid #e2e8f0', paddingLeft: '24px', marginLeft: '12px' }}>
                {actividad.map(item => (
                    <div key={item.id} style={{ marginBottom: '24px', position: 'relative' }}>
                        <div style={{ 
                            position: 'absolute', left: '-36px', top: '0', 
                            background: 'white', borderRadius: '50%', padding: '4px',
                            border: '1px solid #e2e8f0'
                        }}>
                            {getIconForAccion(item.accion)}
                        </div>
                        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <p style={{ margin: '0 0 8px', color: '#334155', fontSize: '0.95rem' }}>
                                {getTextoParaAccion(item)}
                            </p>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                {new Date(item.created_at).toLocaleString('es-AR')}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
