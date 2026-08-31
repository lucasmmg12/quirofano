import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
    Folder, Plus, LayoutDashboard, Activity, Mic, Target, 
    FileText, ArrowLeft, Loader2, Save, ChevronRight, ListTodo, Calendar, CalendarDays
} from 'lucide-react';

import GobernanzaEntrevistaGrabador from './GobernanzaEntrevistaGrabador';
import GobernanzaMuro from './GobernanzaMuro';
import GobernanzaIndicadores from './GobernanzaIndicadores';
import GobernanzaDocumentos from './GobernanzaDocumentos';
import GobernanzaTareas from './GobernanzaTareas';
import GobernanzaGantt from './GobernanzaGantt';

export default function GobernanzaPanel({ currentUser }) {
    const [viewMode, setViewMode] = useState('lista'); // 'lista' | 'proyecto'
    const [proyectos, setProyectos] = useState([]);
    const [selectedProyecto, setSelectedProyecto] = useState(null);
    const [loading, setLoading] = useState(true);

    // Modal Crear Proyecto
    const [showCreate, setShowCreate] = useState(false);
    const [newProjName, setNewProjName] = useState('');
    const [newProjDesc, setNewProjDesc] = useState('');
    const [newProjStart, setNewProjStart] = useState('');
    const [newProjEnd, setNewProjEnd] = useState('');
    const [creating, setCreating] = useState(false);

    // Pestaña activa dentro del proyecto
    const [activeTab, setActiveTab] = useState('muro'); // 'muro' | 'entrevistas' | 'indicadores' | 'documentos'
    const [isRecording, setIsRecording] = useState(false); // Para mostrar el grabador

    useEffect(() => {
        fetchProyectos();
    }, []);

    const fetchProyectos = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('gobernanza_proyectos')
                .select('*, gobernanza_indicadores(id, estado), gobernanza_entrevistas(count)')
                .order('created_at', { ascending: false });
            if (error) throw error;
            
            // Format counts correctly
            const formattedData = data.map(p => {
                const totalReqs = p.gobernanza_indicadores?.length || 0;
                const completedReqs = p.gobernanza_indicadores?.filter(i => i.estado === 'Finalizado').length || 0;
                const progress = totalReqs > 0 ? Math.round((completedReqs / totalReqs) * 100) : 0;

                return {
                    ...p,
                    req_count: totalReqs,
                    req_progress: progress,
                    entrevistas_count: p.gobernanza_entrevistas[0]?.count || 0
                };
            });
            
            setProyectos(formattedData || []);
        } catch (err) {
            console.error("Error fetching proyectos:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateProject = async () => {
        if (!newProjName.trim()) return alert("Debe ingresar un nombre");
        setCreating(true);
        try {
            const { data, error } = await supabase.from('gobernanza_proyectos').insert({
                nombre: newProjName.trim(),
                descripcion: newProjDesc.trim(),
                fecha_desde: newProjStart || null,
                fecha_hasta: newProjEnd || null,
                created_by: currentUser?.id
            }).select().single();
            
            if (error) throw error;

            // Log activity
            await supabase.from('gobernanza_actividad').insert({
                proyecto_id: data.id,
                usuario_id: currentUser?.id,
                accion: 'CREO_PROYECTO',
                detalles: { nombre: data.nombre }
            });

            setShowCreate(false);
            setNewProjName('');
            setNewProjDesc('');
            setNewProjStart('');
            setNewProjEnd('');
            fetchProyectos();
        } catch (err) {
            console.error(err);
            alert("Error al crear proyecto");
        } finally {
            setCreating(false);
        }
    };

    const openProject = (p) => {
        setSelectedProyecto(p);
        setViewMode('proyecto');
        setActiveTab('muro');
        setIsRecording(false);
    };

    const closeProject = () => {
        setSelectedProyecto(null);
        setViewMode('lista');
    };

    const handleProjectDateChange = async (field, value) => {
        // Optimistic UI Update
        const safeValue = value || null;
        setSelectedProyecto(prev => ({ ...prev, [field]: safeValue }));
        setProyectos(prev => prev.map(p => p.id === selectedProyecto.id ? { ...p, [field]: safeValue } : p));
        
        try {
            const { error } = await supabase
                .from('gobernanza_proyectos')
                .update({ [field]: safeValue })
                .eq('id', selectedProyecto.id);
            if (error) throw error;
        } catch (err) {
            console.error("Error al actualizar fecha del proyecto:", err);
        }
    };

    if (viewMode === 'lista') {
        return (
            <div style={{ padding: '40px', width: '100%', fontFamily: "'Inter', sans-serif", background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', minHeight: '100vh' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', padding: '16px', borderRadius: '16px', color: 'white', boxShadow: '0 10px 25px -5px rgba(59,130,246,0.4)' }}>
                            <LayoutDashboard size={36} />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '2.4rem', color: '#0f172a', fontWeight: 800, letterSpacing: '-0.5px' }}>Proyectos de Datos</h1>
                            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '1.1rem' }}>Gestión centralizada de requerimientos, entrevistas e indicadores.</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={() => setViewMode('gantt')} style={{ background: 'white', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                            <CalendarDays size={20} color="#3b82f6" /> Calendario Global
                        </button>
                        <button onClick={() => setShowCreate(true)} style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                            <Plus size={20} /> Nuevo Proyecto
                        </button>
                    </div>
                </div>

                {showCreate && (
                    <div style={{ background: 'white', padding: '24px', borderRadius: '16px', marginBottom: '32px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                        <h3 style={{ margin: '0 0 16px', color: '#0f172a' }}>Crear Proyecto</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '16px' }}>
                            <input type="text" placeholder="Nombre (Ej: Métricas UCI)" value={newProjName} onChange={e => setNewProjName(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                            <input type="text" placeholder="Descripción breve..." value={newProjDesc} onChange={e => setNewProjDesc(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Fecha de Inicio</label>
                                <input type="date" value={newProjStart} onChange={e => setNewProjStart(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Fecha Límite (Fin)</label>
                                <input type="date" value={newProjEnd} onChange={e => setNewProjEnd(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowCreate(false)} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                            <button onClick={handleCreateProject} disabled={creating} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {creating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Crear
                            </button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Loader2 className="animate-spin" size={36} color="#94a3b8" /></div>
                ) : proyectos.length === 0 ? (
                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '60px', textAlign: 'center', color: '#64748b' }}>
                        <Folder size={48} color="#cbd5e1" style={{ margin: '0 auto 16px' }} />
                        <h3 style={{ margin: '0 0 8px', color: '#334155', fontSize: '1.2rem' }}>No hay proyectos activos</h3>
                        <p style={{ margin: 0 }}>Crea tu primer proyecto para empezar a recolectar datos.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
                        {proyectos.map(p => (
                            <div 
                                key={p.id} 
                                onClick={() => openProject(p)} 
                                style={{ 
                                    background: 'white', 
                                    border: '1px solid #e2e8f0', 
                                    borderLeft: '4px solid transparent', 
                                    borderRadius: '20px', 
                                    padding: '24px', 
                                    cursor: 'pointer', 
                                    transition: 'all 0.3s ease', 
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.02)', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    height: '100%' 
                                }} 
                                onMouseOver={e => { 
                                    e.currentTarget.style.transform = 'translateY(-4px)'; 
                                    e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(59, 130, 246, 0.1), 0 10px 10px -5px rgba(59, 130, 246, 0.04)'; 
                                    e.currentTarget.style.borderLeftColor = '#3b82f6'; 
                                    e.currentTarget.style.borderColor = '#bfdbfe'; 
                                }} 
                                onMouseOut={e => { 
                                    e.currentTarget.style.transform = 'translateY(0)'; 
                                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.02)'; 
                                    e.currentTarget.style.borderLeftColor = 'transparent'; 
                                    e.currentTarget.style.borderColor = '#e2e8f0'; 
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '12px', color: '#3b82f6' }}>
                                        <Folder size={24} />
                                    </div>
                                    <span style={{ fontSize: '0.8rem', padding: '4px 12px', borderRadius: '20px', background: p.estado === 'Activo' ? '#dcfce7' : '#f1f5f9', color: p.estado === 'Activo' ? '#166534' : '#475569', fontWeight: 600 }}>
                                        {p.estado}
                                    </span>
                                </div>
                                
                                <h3 style={{ margin: '0 0 8px', fontSize: '1.4rem', color: '#0f172a', fontWeight: 800 }}>
                                    {p.nombre}
                                </h3>

                                {p.fecha_desde && p.fecha_hasta && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.8rem', marginBottom: '12px', background: '#f8fafc', padding: '4px 10px', borderRadius: '6px', display: 'inline-flex' }}>
                                        <Calendar size={14} />
                                        <span>{new Date(p.fecha_desde).toLocaleDateString()} - {new Date(p.fecha_hasta).toLocaleDateString()}</span>
                                    </div>
                                )}
                                
                                <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: '0.95rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1 }}>
                                    {p.descripcion || 'Sin descripción'}
                                </p>
                                
                                {/* Barra de Progreso del Proyecto */}
                                {p.req_count > 0 && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completitud</span>
                                            <span style={{ fontSize: '0.75rem', color: p.req_progress === 100 ? '#10b981' : '#3b82f6', fontWeight: 800 }}>{p.req_progress}%</span>
                                        </div>
                                        <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{ width: `${p.req_progress}%`, height: '100%', background: p.req_progress === 100 ? '#10b981' : '#3b82f6', transition: 'width 0.5s ease' }} />
                                        </div>
                                    </div>
                                )}
                                
                                {/* Micro-métricas estilo Dashboard */}
                                <div style={{ paddingTop: '16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', gap: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.85rem', fontWeight: 500 }}>
                                            <FileText size={16} color="#94a3b8" />
                                            <span>{p.req_count || 0} Reqs</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.85rem', fontWeight: 500 }}>
                                            <Mic size={16} color="#94a3b8" />
                                            <span>{p.entrevistas_count || 0} Entrevistas</span>
                                        </div>
                                    </div>
                                    
                                    {/* Botón visual de "Ver más" */}
                                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
                                        <ChevronRight size={16} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (viewMode === 'gantt') {
        return <GobernanzaGantt proyectos={proyectos} onBack={() => setViewMode('lista')} />;
    }

    // VISTA PROYECTO
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>
            {/* Header Proyecto */}
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <button onClick={closeProject} style={{ background: '#f1f5f9', border: 'none', borderRadius: '12px', padding: '10px', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a', fontWeight: 800 }}>{selectedProyecto.nombre}</h2>
                        <span style={{ fontSize: '0.9rem', color: '#64748b' }}>{selectedProyecto.descripcion}</span>
                    </div>
                </div>

                {/* Inline Date Editing */}
                <div style={{ display: 'flex', gap: '16px', background: '#f8fafc', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Inicio</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calendar size={14} color="#94a3b8" />
                            <input 
                                type="date" 
                                value={selectedProyecto.fecha_desde || ''} 
                                onChange={e => handleProjectDateChange('fecha_desde', e.target.value)}
                                style={{ border: 'none', background: 'transparent', outline: 'none', color: '#334155', fontSize: '0.9rem', fontWeight: 600, padding: 0 }}
                            />
                        </div>
                    </div>
                    <div style={{ width: '1px', background: '#cbd5e1' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Fin</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calendar size={14} color="#94a3b8" />
                            <input 
                                type="date" 
                                value={selectedProyecto.fecha_hasta || ''} 
                                onChange={e => handleProjectDateChange('fecha_hasta', e.target.value)}
                                style={{ border: 'none', background: 'transparent', outline: 'none', color: '#334155', fontSize: '0.9rem', fontWeight: 600, padding: 0 }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Sub Nav (Tabs) */}
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 32px', display: 'flex', gap: '32px' }}>
                {[
                    { id: 'muro', label: 'Muro de Actividad', icon: Activity },
                    { id: 'tareas', label: 'Tareas', icon: ListTodo },
                    { id: 'entrevistas', label: 'Auditorías de Voz', icon: Mic },
                    { id: 'indicadores', label: 'Indicadores y SQL', icon: Target },
                    { id: 'documentos', label: 'Documentos', icon: FileText }
                ].map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setIsRecording(false); }}
                        style={{ 
                            background: 'transparent', border: 'none', padding: '16px 0', fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            color: activeTab === tab.id ? '#3b82f6' : '#64748b',
                            borderBottom: activeTab === tab.id ? '3px solid #3b82f6' : '3px solid transparent',
                            transition: 'all 0.2s'
                        }}
                    >
                        <tab.icon size={18} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* Contenido Principal */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                {activeTab === 'muro' && (
                    <GobernanzaMuro proyectoId={selectedProyecto.id} />
                )}

                {activeTab === 'tareas' && (
                    <GobernanzaTareas proyectoId={selectedProyecto.id} currentUser={currentUser} />
                )}

                {activeTab === 'entrevistas' && (
                    <GobernanzaEntrevistaGrabador 
                        currentUser={currentUser} 
                        proyectoId={selectedProyecto.id}
                        onBack={() => {}}
                    />
                )}

                {activeTab === 'indicadores' && (
                    <GobernanzaIndicadores proyectoId={selectedProyecto.id} currentUser={currentUser} />
                )}

                {activeTab === 'documentos' && (
                    <GobernanzaDocumentos proyectoId={selectedProyecto.id} currentUser={currentUser} />
                )}
            </div>
        </div>
    );
}
