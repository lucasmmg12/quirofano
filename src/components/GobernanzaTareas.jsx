import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, ListTodo, CheckCircle2, Circle, Loader2, Save, Calendar } from 'lucide-react';

export default function GobernanzaTareas({ proyectoId, currentUser }) {
    const [tareas, setTareas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState(null);

    // Formulario Nuevo
    const [showNew, setShowNew] = useState(false);
    const [newTitulo, setNewTitulo] = useState('');
    const [creating, setCreating] = useState(false);

    // Debounce refs
    const pendingChanges = useRef({});
    const debounceTimers = useRef({});

    useEffect(() => {
        if (proyectoId) fetchTareas();
        
        return () => {
            Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer));
        };
    }, [proyectoId]);

    const fetchTareas = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('gobernanza_tareas')
                .select('*')
                .eq('proyecto_id', proyectoId)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            setTareas(data || []);
        } catch (err) {
            console.error("Error al cargar tareas", err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newTitulo.trim()) return;
        setCreating(true);
        try {
            const { data, error } = await supabase.from('gobernanza_tareas').insert({
                proyecto_id: proyectoId,
                titulo: newTitulo.trim(),
                estado: 'Pendiente',
                created_by: currentUser?.id
            }).select().single();

            if (error) throw error;

            await supabase.from('gobernanza_actividad').insert({
                proyecto_id: proyectoId,
                usuario_id: currentUser?.id,
                accion: 'CREO_TAREA',
                detalles: { titulo: data.titulo }
            });

            setTareas([...tareas, data]);
            setShowNew(false);
            setNewTitulo('');
        } catch (err) {
            console.error(err);
            alert("Error al crear tarea: " + (err.message || JSON.stringify(err)));
        } finally {
            setCreating(false);
        }
    };

    const handleUpdate = async (tarea, fields) => {
        // Actualización sincrónica instantánea (ej: toggle de estado)
        setTareas(prev => prev.map(t => t.id === tarea.id ? { ...t, ...fields } : t));
        setSavingId(tarea.id);
        
        try {
            const { error } = await supabase
                .from('gobernanza_tareas')
                .update(fields)
                .eq('id', tarea.id);
            if (error) throw error;
        } catch (err) {
            console.error(err);
            alert("Error al guardar");
        } finally {
            setSavingId(null);
        }
    };

    const handleFieldChange = (tarea, fieldName, value) => {
        // Sync UI
        setTareas(prev => prev.map(t => t.id === tarea.id ? { ...t, [fieldName]: value } : t));

        // Queue
        if (!pendingChanges.current[tarea.id]) pendingChanges.current[tarea.id] = {};
        pendingChanges.current[tarea.id][fieldName] = value;

        // Debounce
        if (debounceTimers.current[tarea.id]) clearTimeout(debounceTimers.current[tarea.id]);
        
        debounceTimers.current[tarea.id] = setTimeout(async () => {
            const fieldsToSave = { ...pendingChanges.current[tarea.id] };
            pendingChanges.current[tarea.id] = {};
            
            setSavingId(tarea.id);
            try {
                const { error } = await supabase
                    .from('gobernanza_tareas')
                    .update(fieldsToSave)
                    .eq('id', tarea.id);
                if (error) throw error;
            } catch (err) {
                console.error("Error autoguardando:", err);
            } finally {
                setSavingId(null);
            }
        }, 1000);
    };

    const handleDelete = async (tareaId) => {
        if (!window.confirm("¿Seguro que deseas eliminar esta tarea?")) return;
        setSavingId(tareaId);
        try {
            const { error } = await supabase.from('gobernanza_tareas').delete().eq('id', tareaId);
            if (error) throw error;
            setTareas(prev => prev.filter(t => t.id !== tareaId));
        } catch (err) {
            console.error(err);
            alert("Error al eliminar");
        } finally {
            setSavingId(null);
        }
    };

    if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="animate-spin" size={32} color="#94a3b8" /></div>;

    const completadas = tareas.filter(t => t.estado === 'Completada').length;
    const total = tareas.length;
    const progress = total > 0 ? Math.round((completadas / total) * 100) : 0;

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h3 style={{ margin: 0, color: '#0f172a', fontWeight: 800 }}>Tareas Pendientes</h3>
                    {total > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                            <div style={{ width: '120px', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${progress}%`, height: '100%', background: progress === 100 ? '#10b981' : '#3b82f6', transition: 'width 0.3s ease' }} />
                            </div>
                            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{progress}% ({completadas}/{total})</span>
                        </div>
                    )}
                </div>
                <button onClick={() => setShowNew(true)} style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <Plus size={16} /> Nueva Tarea
                </button>
            </div>

            {showNew && (
                <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #3b82f6', marginBottom: '24px', display: 'flex', gap: '12px' }}>
                    <input 
                        type="text" 
                        placeholder="Ej: Levantar requerimientos con la Jefa de Enfermería" 
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

            {tareas.length === 0 && !showNew ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#64748b', background: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                    <ListTodo size={48} color="#cbd5e1" style={{ margin: '0 auto 16px' }} />
                    <p>No hay tareas pendientes en este proyecto.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {tareas.map(tarea => {
                        const isCompleted = tarea.estado === 'Completada';

                        return (
                            <div key={tarea.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', padding: '16px 20px', display: 'flex', gap: '16px' }}>
                                {/* Check */}
                                <div onClick={() => handleUpdate(tarea, { estado: isCompleted ? 'Pendiente' : 'Completada' })} style={{ cursor: 'pointer', marginTop: '2px' }}>
                                    {isCompleted ? <CheckCircle2 size={24} color="#10b981" /> : <Circle size={24} color="#cbd5e1" />}
                                </div>
                                
                                {/* Contenido */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <input 
                                            type="text" 
                                            value={tarea.titulo} 
                                            onChange={e => handleFieldChange(tarea, 'titulo', e.target.value)}
                                            style={{ 
                                                flex: 1, border: 'none', outline: 'none', fontSize: '1.1rem', fontWeight: 600, 
                                                color: isCompleted ? '#64748b' : '#0f172a', textDecoration: isCompleted ? 'line-through' : 'none',
                                                background: 'transparent'
                                            }}
                                            placeholder="Título de la tarea"
                                        />
                                        {savingId === tarea.id && <Loader2 size={16} className="animate-spin" color="#3b82f6" />}
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                                        <textarea 
                                            value={tarea.descripcion || ''} 
                                            onChange={e => handleFieldChange(tarea, 'descripcion', e.target.value)}
                                            placeholder="Agregar una descripción o notas..."
                                            style={{ flex: 2, padding: '10px', borderRadius: '8px', border: '1px solid transparent', outline: 'none', fontSize: '0.9rem', color: '#475569', minHeight: '40px', resize: 'vertical', background: '#f8fafc' }}
                                            onFocus={e => e.target.style.borderColor = '#cbd5e1'}
                                            onBlur={e => e.target.style.borderColor = 'transparent'}
                                        />
                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '10px', borderRadius: '8px', color: '#64748b' }}>
                                            <Calendar size={16} />
                                            <input 
                                                type="date"
                                                value={tarea.fecha_limite || ''}
                                                onChange={e => handleFieldChange(tarea, 'fecha_limite', e.target.value)}
                                                style={{ border: 'none', background: 'transparent', outline: 'none', color: '#475569', fontSize: '0.85rem', flex: 1 }}
                                            />
                                        </div>
                                    </div>
                                    
                                    {/* Action to delete */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button onClick={() => handleDelete(tarea.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.8rem', cursor: 'pointer', opacity: 0.7 }}>
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
