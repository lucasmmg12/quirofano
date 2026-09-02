import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Target, ChevronDown, ChevronUp, Save, Loader2, CheckCircle2, Circle } from 'lucide-react';

function AutoExpandTextarea({ value, onChange, placeholder, style, minHeight = 80, ...props }) {
    const textareaRef = useRef(null);

    const adjustHeight = () => {
        const el = textareaRef.current;
        if (el) {
            el.style.height = 'auto';
            const newHeight = Math.max(el.scrollHeight, minHeight);
            el.style.height = `${newHeight + 4}px`;
        }
    };

    useEffect(() => {
        adjustHeight();
    }, [value, minHeight]);

    return (
        <textarea
            ref={textareaRef}
            value={value}
            onChange={onChange}
            onInput={adjustHeight}
            placeholder={placeholder}
            style={{
                ...style,
                minHeight: `${minHeight}px`,
                overflowY: 'hidden',
                boxSizing: 'border-box',
                transition: 'height 0.1s ease',
            }}
            {...props}
        />
    );
}

export default function GobernanzaIndicadores({ proyectoId, currentUser }) {
    const [indicadores, setIndicadores] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // UI states
    const [expandedId, setExpandedId] = useState(null);
    const [savingId, setSavingId] = useState(null);

    // Formulario Nuevo
    const [showNew, setShowNew] = useState(false);
    const [newTitulo, setNewTitulo] = useState('');
    const [creating, setCreating] = useState(false);

    // Debounce refs
    const pendingChanges = useRef({});
    const debounceTimers = useRef({});

    useEffect(() => {
        if (proyectoId) fetchIndicadores();
        
        // Cleanup timers on unmount
        return () => {
            Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer));
        };
    }, [proyectoId]);

    const fetchIndicadores = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('gobernanza_indicadores')
                .select('*')
                .eq('proyecto_id', proyectoId)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            setIndicadores(data || []);
        } catch (err) {
            console.error("Error al cargar indicadores", err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newTitulo.trim()) return;
        setCreating(true);
        try {
            const { data, error } = await supabase.from('gobernanza_indicadores').insert({
                proyecto_id: proyectoId,
                titulo: newTitulo.trim(),
                estado: 'Borrador'
            }).select().single();

            if (error) throw error;

            await supabase.from('gobernanza_actividad').insert({
                proyecto_id: proyectoId,
                usuario_id: currentUser?.id,
                accion: 'CREO_INDICADOR',
                detalles: { titulo: data.titulo }
            });

            setIndicadores([...indicadores, data]);
            setShowNew(false);
            setNewTitulo('');
        } catch (err) {
            console.error(err);
            alert("Error al crear indicador");
        } finally {
            setCreating(false);
        }
    };

    const handleUpdate = async (ind, fields) => {
        // Actualización sincrónica para acciones instantáneas como el Check de Finalizado
        setIndicadores(prev => prev.map(i => i.id === ind.id ? { ...i, ...fields } : i));
        setSavingId(ind.id);
        try {
            const { error } = await supabase
                .from('gobernanza_indicadores')
                .update({ ...fields, updated_by: currentUser?.id })
                .eq('id', ind.id);
            if (error) throw error;
        } catch (err) {
            console.error(err);
            alert("Error al guardar");
        } finally {
            setSavingId(null);
        }
    };

    const handleFieldChange = (ind, fieldName, value) => {
        // 1. UI Local Sync (para que no se trabe al escribir)
        setIndicadores(prev => prev.map(i => i.id === ind.id ? { ...i, [fieldName]: value } : i));

        // 2. Cola de guardado
        if (!pendingChanges.current[ind.id]) pendingChanges.current[ind.id] = {};
        pendingChanges.current[ind.id][fieldName] = value;

        // 3. Debounce de 1000ms
        if (debounceTimers.current[ind.id]) clearTimeout(debounceTimers.current[ind.id]);
        
        debounceTimers.current[ind.id] = setTimeout(async () => {
            const fieldsToSave = { ...pendingChanges.current[ind.id] };
            pendingChanges.current[ind.id] = {}; // Reset local buffer
            
            setSavingId(ind.id);
            try {
                const { error } = await supabase
                    .from('gobernanza_indicadores')
                    .update({ ...fieldsToSave, updated_by: currentUser?.id })
                    .eq('id', ind.id);
                if (error) throw error;
            } catch (err) {
                console.error("Error autoguardando:", err);
            } finally {
                setSavingId(null);
            }
        }, 1000);
    };

    const getCompleteness = (ind) => {
        if (ind.estado === 'Finalizado') return 100;

        const fields = [
            ind.informacion_buscada,
            ind.origen_informacion,
            ind.ciclo_datos,
            ind.query_sql,
            ind.explicacion_query
        ];
        const filled = fields.filter(f => f && typeof f === 'string' && f.trim().length > 0).length;
        return Math.round((filled / fields.length) * 100);
    };

    if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="animate-spin" size={32} color="#94a3b8" /></div>;

    return (
        <div style={{ width: '100%', paddingBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ margin: 0, color: '#0f172a', fontWeight: 800 }}>Indicadores y Métricas</h3>
                <button onClick={() => setShowNew(true)} style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <Plus size={16} /> Nuevo Indicador
                </button>
            </div>

            {showNew && (
                <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #3b82f6', marginBottom: '24px', display: 'flex', gap: '12px' }}>
                    <input 
                        type="text" 
                        placeholder="Ej: Tasa de Ocupación UCI" 
                        value={newTitulo} 
                        onChange={e => setNewTitulo(e.target.value)} 
                        style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
                        autoFocus
                    />
                    <button onClick={() => setShowNew(false)} style={{ padding: '10px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Cancelar</button>
                    <button onClick={handleCreate} disabled={creating} style={{ background: '#3b82f6', color: 'white', padding: '10px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        {creating ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            )}

            {indicadores.length === 0 && !showNew ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#64748b', background: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                    <Target size={48} color="#cbd5e1" style={{ margin: '0 auto 16px' }} />
                    <p>No hay indicadores definidos. Empieza agregando el primero.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {indicadores.map(ind => {
                        const isExpanded = expandedId === ind.id;
                        const isCompleted = ind.estado === 'Finalizado';

                        return (
                            <div key={ind.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                {/* Header Toggle */}
                                <div 
                                    onClick={() => setExpandedId(isExpanded ? null : ind.id)}
                                    style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: isExpanded ? '#f8fafc' : 'white' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div onClick={(e) => { e.stopPropagation(); handleUpdate(ind, { estado: isCompleted ? 'Borrador' : 'Finalizado' }) }} style={{ cursor: 'pointer' }}>
                                            {isCompleted ? <CheckCircle2 size={24} color="#10b981" /> : <Circle size={24} color="#cbd5e1" />}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <h4 style={{ margin: 0, fontSize: '1.1rem', color: isCompleted ? '#64748b' : '#0f172a', textDecoration: isCompleted ? 'line-through' : 'none' }}>{ind.titulo}</h4>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: '80px', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${getCompleteness(ind)}%`, height: '100%', background: getCompleteness(ind) === 100 ? '#10b981' : '#3b82f6', transition: 'width 0.3s ease' }} />
                                                </div>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: getCompleteness(ind) === 100 ? '#10b981' : '#64748b' }}>
                                                    {getCompleteness(ind)}% Completo
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {savingId === ind.id && <Loader2 size={16} className="animate-spin" color="#3b82f6" />}
                                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                    </div>
                                </div>

                                {/* Contenido Expandido */}
                                {isExpanded && (
                                    <div style={{ padding: '24px', borderTop: '1px solid #e2e8f0', background: 'white' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>¿Qué información buscamos mostrar? ❓</label>
                                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 8px' }}>Describe la lógica de negocio detrás de este indicador.</p>
                                                <AutoExpandTextarea 
                                                    value={ind.informacion_buscada || ''}
                                                    onChange={e => handleFieldChange(ind, 'informacion_buscada', e.target.value)}
                                                    placeholder="Ej: Queremos ver el porcentaje de ocupación de camas..."
                                                    minHeight={110}
                                                    style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', lineHeight: '1.55', fontSize: '0.875rem', outline: 'none', resize: 'vertical' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>Origen y Ciclo de Datos 🔄</label>
                                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 8px' }}>¿De qué sistema viene y con qué frecuencia se actualiza?</p>
                                                <input 
                                                    type="text" 
                                                    value={ind.origen_informacion || ''}
                                                    onChange={e => handleFieldChange(ind, 'origen_informacion', e.target.value)}
                                                    placeholder="Origen (Ej: SALUS, AsisteClick)"
                                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '12px', fontSize: '0.875rem', outline: 'none' }}
                                                />
                                                <input 
                                                    type="text" 
                                                    value={ind.ciclo_datos || ''}
                                                    onChange={e => handleFieldChange(ind, 'ciclo_datos', e.target.value)}
                                                    placeholder="Frecuencia (Ej: Tiempo real, Cierre Diario)"
                                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.875rem', outline: 'none' }}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ marginBottom: '24px' }}>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>Query SQL (Tableau / Metabase) 💻</label>
                                            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 8px' }}>Pega aquí el script SQL necesario para obtener este indicador.</p>
                                            <AutoExpandTextarea 
                                                value={ind.query_sql || ''}
                                                onChange={e => handleFieldChange(ind, 'query_sql', e.target.value)}
                                                placeholder="SELECT * FROM..."
                                                minHeight={180}
                                                style={{ width: '100%', padding: '16px', borderRadius: '8px', border: '1px solid #1e293b', background: '#090d16', color: '#38bdf8', fontFamily: 'Consolas, Monaco, "Courier New", monospace', fontSize: '0.875rem', lineHeight: '1.6', outline: 'none', resize: 'vertical' }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>Explicación Técnica de la Query 📝</label>
                                            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 8px' }}>¿Qué hace exactamente la query de arriba y qué busca?</p>
                                            <AutoExpandTextarea 
                                                value={ind.explicacion_query || ''}
                                                onChange={e => handleFieldChange(ind, 'explicacion_query', e.target.value)}
                                                placeholder="La query cruza la tabla de pacientes con internaciones para..."
                                                minHeight={120}
                                                style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', lineHeight: '1.55', fontSize: '0.875rem', outline: 'none', resize: 'vertical' }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
