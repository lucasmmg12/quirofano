import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
    Folder, Plus, LayoutDashboard, Activity, Mic, Target, 
    FileText, ArrowLeft, Loader2, Save, ChevronRight, ListTodo, Calendar, CalendarDays,
    Download, CheckCircle2, BookOpen, Layers, Sparkles
} from 'lucide-react';

import GobernanzaEntrevistaGrabador from './GobernanzaEntrevistaGrabador';
import GobernanzaMuro from './GobernanzaMuro';
import GobernanzaIndicadores from './GobernanzaIndicadores';
import GobernanzaDocumentos from './GobernanzaDocumentos';
import GobernanzaTareas from './GobernanzaTareas';
import GobernanzaGantt from './GobernanzaGantt';
import {
    GOBERNANZA_PROJECTS_DOSSIER_DATA,
    resolveServiceKeyFromProject,
    downloadGobernanzaServicePdf
} from '../utils/gobernanzaServiceProjectPdf';
import {
    RENDICION_GOBIERNO_DATA,
    generateGobernanzaRendicionGobiernoPdf
} from '../utils/gobernanzaRendicionGobiernoPdf';

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
    const [activeTab, setActiveTab] = useState('memoria'); // 'memoria' | 'indicadores' | 'documentos' | 'muro' | 'entrevistas' | 'tareas'
    const [isRecording, setIsRecording] = useState(false); // Para mostrar el grabador
    const [downloadingPdfId, setDownloadingPdfId] = useState(null);

    useEffect(() => {
        fetchProyectos();
    }, []);

    const fetchProyectos = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('gobernanza_proyectos')
                .select('*, gobernanza_indicadores(id, titulo, informacion_buscada, origen_informacion, estado), gobernanza_documentos(id, nombre, url), gobernanza_entrevistas(count)')
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
                fecha_hasta: newProjEnd || null
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
        setActiveTab('memoria');
        setIsRecording(false);
    };

    const handleDownloadProjectPdf = async (e, proyectoObj) => {
        if (e) e.stopPropagation();
        try {
            setDownloadingPdfId(proyectoObj.id);
            await downloadGobernanzaServicePdf(proyectoObj, proyectoObj.gobernanza_indicadores || []);
        } catch (err) {
            console.error('Error al generar PDF del proyecto:', err);
        } finally {
            setDownloadingPdfId(null);
        }
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
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setViewMode('rendicion_gobierno')}
                            style={{
                                background: 'linear-gradient(135deg, #0D3B66 0%, #1d4ed8 100%)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                padding: '12px 20px',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: 'pointer',
                                boxShadow: '0 6px 14px rgba(13, 59, 102, 0.25)'
                            }}
                        >
                            <FileText size={19} /> Informe Técnico y Contable (Gobierno SJ)
                        </button>
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
                                    <div style={{ alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.8rem', marginBottom: '12px', background: '#f8fafc', padding: '4px 10px', borderRadius: '6px', display: 'inline-flex' }}>
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
                                <div style={{ paddingTop: '16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.85rem', fontWeight: 500 }}>
                                            <FileText size={16} color="#94a3b8" />
                                            <span>{p.req_count || 0} Reqs</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.85rem', fontWeight: 500 }}>
                                            <Mic size={16} color="#94a3b8" />
                                            <span>{p.entrevistas_count || 0} Entrevistas</span>
                                        </div>
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={(e) => handleDownloadProjectPdf(e, p)}
                                            title="Descargar Documento PDF Oficial con estética de Sanatorio Argentino"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '6px 12px',
                                                borderRadius: '8px',
                                                border: '1px solid #bfdbfe',
                                                background: '#eff6ff',
                                                color: '#1d4ed8',
                                                fontSize: '0.78rem',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Download size={13} />
                                            {downloadingPdfId === p.id ? 'Generando...' : 'PDF Oficial'}
                                        </button>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
                                            <ChevronRight size={16} />
                                        </div>
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

    if (viewMode === 'rendicion_gobierno') {
        const rg = RENDICION_GOBIERNO_DATA;
        return (
            <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '32px 40px', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Header Institucional */}
                    <div style={{
                        background: 'linear-gradient(135deg, #0D3B66 0%, #1e3a8a 100%)',
                        borderRadius: '18px',
                        padding: '28px 32px',
                        color: 'white',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '20px',
                        boxShadow: '0 12px 28px rgba(13, 59, 102, 0.22)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flex: 1, minWidth: '300px' }}>
                            <button
                                onClick={() => setViewMode('lista')}
                                style={{
                                    background: 'rgba(255,255,255,0.14)',
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    color: 'white',
                                    borderRadius: '12px',
                                    padding: '10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <img
                                src="/logosanatorio.png"
                                alt="Sanatorio Argentino"
                                style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'white', padding: '4px', objectFit: 'contain' }}
                            />
                            <div>
                                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#93c5fd', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                                    {rg.programa} · {rg.subtituloPrograma}
                                </div>
                                <h1 style={{ margin: '4px 0', fontSize: '1.45rem', fontWeight: 800 }}>
                                    Informe Técnico y Contable de Avance y Rendición de Cuentas
                                </h1>
                                <div style={{ fontSize: '0.84rem', color: '#cbd5e1' }}>
                                    <strong>Sanatorio Argentino</strong> · Innovación y Transformación Digital · Representante Legal: {rg.representanteLegal}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={async () => {
                                setDownloadingPdfId('rendicion');
                                try {
                                    await generateGobernanzaRendicionGobiernoPdf();
                                } finally {
                                    setDownloadingPdfId(null);
                                }
                            }}
                            style={{
                                background: '#ffffff',
                                color: '#0D3B66',
                                border: 'none',
                                borderRadius: '12px',
                                padding: '13px 22px',
                                fontWeight: 800,
                                fontSize: '0.9rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '10px',
                                cursor: 'pointer',
                                boxShadow: '0 6px 16px rgba(0,0,0,0.18)'
                            }}
                        >
                            <Download size={18} />
                            {downloadingPdfId === 'rendicion' ? 'Generando PDF...' : 'Descargar Informe PDF Oficial (4 Págs.)'}
                        </button>
                    </div>

                    {/* KPIs Ejecutivos */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                        {[
                            { label: 'AVANCE FÍSICO TÉCNICO', val: '88,5% (Mes 5 de 6)', sub: 'Fases 1 a 6 al 100% · Fase 7 al 90%', color: '#059669' },
                            { label: 'INVERSIÓN TOTAL EJECUTADA', val: '$ 19.228.571', sub: '89,7% sobre $ 21.428.571 aprobados', color: '#0D3B66' },
                            { label: 'SUBSIDIO ANR EJECUTADO (70%)', val: '$ 13.500.000', sub: '90,0% sobre $ 15.000.000 (Resta Mes 6)', color: '#2563EB' },
                            { label: 'APORTE CONTRAPARTE SA (30%)', val: '$ 5.728.571', sub: '89,1% sobre $ 6.428.571 comprometidos', color: '#D97706' }
                        ].map((k, idx) => (
                            <div key={idx} style={{ background: 'white', borderRadius: '14px', padding: '18px 20px', border: '1px solid #e2e8f0', borderTop: `4px solid ${k.color}` }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b' }}>{k.label}</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '6px 0 4px' }}>{k.val}</div>
                                <div style={{ fontSize: '0.8rem', color: '#475569' }}>{k.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* 1. Estado Contable Consolidado y Rubros ANR */}
                    <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: '0 0 6px', color: '#0D3B66', fontSize: '1.15rem', fontWeight: 800 }}>
                            1. Rendición Contable y Financiera Consolidada (Anexo I — Punto 5)
                        </h3>
                        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.88rem' }}>
                            Ejecución acumulada al Mes 5 (Octubre 2026) respetando los topes de Bienes de Capital (30%), Consultoría (10%) y Recursos Humanos (60%).
                        </p>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                                <thead>
                                    <tr style={{ background: '#0D3B66', color: 'white', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 12px' }}>Rubro Elegible / Concepto</th>
                                        <th style={{ padding: '10px 12px' }}>Límite Reglamentario</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Presupuesto Aprobado</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ejecutado al Mes 5</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Saldo Mes 6</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>% Avance</th>
                                        <th style={{ padding: '10px 12px' }}>Respaldo Técnico-Contable</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rg.rubrosAnr.map((r, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: i === rg.rubrosAnr.length - 1 ? '#eff6ff' : 'white', fontWeight: i === rg.rubrosAnr.length - 1 ? 800 : 400 }}>
                                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0D3B66' }}>{r.rubro}</td>
                                            <td style={{ padding: '10px 12px' }}>{r.limite}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{r.asignado}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{r.ejecutado}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>{r.saldo}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800 }}>{r.avance}</td>
                                            <td style={{ padding: '10px 12px', color: '#334155', fontSize: '0.8rem' }}>{r.detalleContable}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 2. Flujo Contable Mensual (Mes 1 a Mes 6) */}
                    <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: '0 0 6px', color: '#0D3B66', fontSize: '1.15rem', fontWeight: 800 }}>
                            2. Cronograma Contable Mensual Devengado por Rubro (Junio a Noviembre 2026)
                        </h3>
                        <div style={{ overflowX: 'auto', marginTop: '12px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                                <thead>
                                    <tr style={{ background: '#1e293b', color: 'white', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 12px' }}>Período / Mes</th>
                                        <th style={{ padding: '10px 12px' }}>Fases</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Bienes Cap. (ANR)</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Consultoría (ANR)</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>RR.HH. (ANR)</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Subtotal ANR</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Contraparte SA</th>
                                        <th style={{ padding: '10px 12px' }}>Entregable / Hito Certificado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rg.cronogramaContableMensual.map((row, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: i === rg.cronogramaContableMensual.length - 1 ? '#f0fdf4' : 'white', fontWeight: i === rg.cronogramaContableMensual.length - 1 ? 800 : 400 }}>
                                            <td style={{ padding: '9px 12px', fontWeight: 700, color: '#0D3B66' }}>{row[0]}</td>
                                            <td style={{ padding: '9px 12px' }}>{row[1]}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right' }}>{row[2]}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right' }}>{row[3]}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right' }}>{row[4]}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{row[5]}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right' }}>{row[6]}</td>
                                            <td style={{ padding: '9px 12px', fontSize: '0.8rem', color: '#334155' }}>{row[7]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 3. Avance Técnico de las 8 Fases y Entregables */}
                    <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: '0 0 6px', color: '#0D3B66', fontSize: '1.15rem', fontWeight: 800 }}>
                            3. Demostración de Avance Técnico por Fase y Entregables (Fases 1 a 8)
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginTop: '14px' }}>
                            {rg.fasesAvanceTecnico.map((f, i) => (
                                <div key={i} style={{ padding: '16px 18px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: '4px solid #0D3B66' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                                        <div>
                                            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase' }}>{f.fase} · {f.responsable}</span>
                                            <h4 style={{ margin: '2px 0 0', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{f.nombre}</h4>
                                        </div>
                                        <span style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 800, background: f.estado.includes('100%') ? '#dcfce7' : '#fef3c7', color: f.estado.includes('100%') ? '#166534' : '#92400e' }}>
                                            {f.estado}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.84rem', color: '#334155', lineHeight: 1.5 }}>
                                        <strong>Evidencia verificable en Sanatorio Argentino:</strong> {f.evidenciaReal}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const activeServiceKey = resolveServiceKeyFromProject(selectedProyecto);
    const activeDossier = GOBERNANZA_PROJECTS_DOSSIER_DATA[activeServiceKey] || GOBERNANZA_PROJECTS_DOSSIER_DATA.QUIROFANO;

    // VISTA PROYECTO
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>
            {/* Header Proyecto */}
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1, minWidth: 0 }}>
                    <button onClick={closeProject} style={{ background: '#f1f5f9', border: 'none', borderRadius: '12px', padding: '10px', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <h2 style={{ margin: 0, fontSize: '1.45rem', color: '#0f172a', fontWeight: 800 }}>{selectedProyecto.nombre}</h2>
                            <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '999px', background: '#dcfce7', color: '#166534', fontWeight: 700 }}>
                                {activeDossier.codigo} · 100% Completado
                            </span>
                        </div>
                        <span style={{ fontSize: '0.86rem', color: '#64748b', display: 'block', marginTop: '4px', lineHeight: 1.4 }}>{selectedProyecto.descripcion}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    <button
                        type="button"
                        onClick={(e) => handleDownloadProjectPdf(e, selectedProyecto)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '11px 18px',
                            borderRadius: '10px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #0D3B66 0%, #2563EB 100%)',
                            color: 'white',
                            fontWeight: 700,
                            fontSize: '0.86rem',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
                        }}
                    >
                        <Download size={16} />
                        {downloadingPdfId === selectedProyecto.id ? 'Generando PDF...' : 'Descargar Documento PDF Oficial'}
                    </button>

                    {/* Inline Date Editing */}
                    <div style={{ display: 'flex', gap: '16px', background: '#f8fafc', padding: '10px 14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Inicio</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Calendar size={14} color="#94a3b8" />
                                <input 
                                    type="date" 
                                    value={selectedProyecto.fecha_desde || ''} 
                                    onChange={e => handleProjectDateChange('fecha_desde', e.target.value)}
                                    style={{ border: 'none', background: 'transparent', outline: 'none', color: '#334155', fontSize: '0.85rem', fontWeight: 600, padding: 0 }}
                                />
                            </div>
                        </div>
                        <div style={{ width: '1px', background: '#cbd5e1' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Fin</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Calendar size={14} color="#94a3b8" />
                                <input 
                                    type="date" 
                                    value={selectedProyecto.fecha_hasta || ''} 
                                    onChange={e => handleProjectDateChange('fecha_hasta', e.target.value)}
                                    style={{ border: 'none', background: 'transparent', outline: 'none', color: '#334155', fontSize: '0.85rem', fontWeight: 600, padding: 0 }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sub Nav (Tabs) */}
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 32px', display: 'flex', gap: '28px', overflowX: 'auto' }}>
                {[
                    { id: 'memoria', label: '¿Qué hicimos y Cómo lo hicimos? (Dossier)', icon: BookOpen },
                    { id: 'indicadores', label: 'Indicadores, SQL y Tablero', icon: Target },
                    { id: 'documentos', label: 'Documentos PDF', icon: FileText },
                    { id: 'muro', label: 'Muro de Actividad', icon: Activity },
                    { id: 'tareas', label: 'Tareas', icon: ListTodo },
                    { id: 'entrevistas', label: 'Auditorías de Voz', icon: Mic }
                ].map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setIsRecording(false); }}
                        style={{ 
                            background: 'transparent', border: 'none', padding: '16px 0', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap',
                            color: activeTab === tab.id ? '#2563eb' : '#64748b',
                            borderBottom: activeTab === tab.id ? '3px solid #2563eb' : '3px solid transparent',
                            transition: 'all 0.2s'
                        }}
                    >
                        <tab.icon size={18} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* Contenido Principal */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                {activeTab === 'memoria' && (
                    <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Banner Institucional Sanatorio Argentino */}
                        <div style={{
                            background: 'linear-gradient(135deg, #0D3B66 0%, #1E40AF 65%, #2563EB 100%)',
                            borderRadius: '16px',
                            padding: '28px 32px',
                            color: 'white',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '24px',
                            flexWrap: 'wrap',
                            boxShadow: '0 10px 25px -5px rgba(13, 59, 102, 0.25)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: '1 1 520px' }}>
                                <div style={{
                                    background: 'white',
                                    borderRadius: '14px',
                                    padding: '12px 16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    minWidth: '165px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
                                }}>
                                    <img
                                        src="/logosanatorio.png"
                                        alt="Sanatorio Argentino"
                                        style={{ width: '54px', height: '54px', objectFit: 'contain', marginBottom: '6px' }}
                                    />
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0D3B66', letterSpacing: '0.03em', textAlign: 'center' }}>
                                        SANATORIO ARGENTINO
                                    </span>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#2563EB', textAlign: 'center', marginTop: '2px' }}>
                                        Innovación y Transformación Digital
                                    </span>
                                </div>

                                <div>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.14)', padding: '4px 12px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px' }}>
                                        <span>PROYECTO OFICIAL DE GOBERNANZA · {activeDossier.codigo}</span>
                                    </div>
                                    <h3 style={{ margin: '0 0 6px', fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                                        {activeDossier.titulo}
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.92rem', color: '#DBEAFE', lineHeight: 1.5, maxWidth: '760px' }}>
                                        {activeDossier.subtitulo}
                                    </p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={(e) => handleDownloadProjectPdf(e, selectedProyecto)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '12px 20px',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(255,255,255,0.35)',
                                        background: 'white',
                                        color: '#0D3B66',
                                        fontWeight: 800,
                                        fontSize: '0.88rem',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                                    }}
                                >
                                    <Download size={17} color="#2563EB" />
                                    {downloadingPdfId === selectedProyecto.id ? 'Generando PDF...' : 'Descargar Dossier PDF (Sanatorio Argentino)'}
                                </button>
                                <span style={{ fontSize: '0.75rem', color: '#BFDBFE' }}>
                                    Incluye logo institucional, metodología, indicadores SQL y ejemplos reales 2026
                                </span>
                            </div>
                        </div>

                        {/* 4 KPIs Resumen del Proyecto */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                            {activeDossier.metricasResumen.map((m, idx) => (
                                <div key={idx} style={{
                                    background: 'white',
                                    borderRadius: '12px',
                                    padding: '18px 20px',
                                    border: '1px solid #DBEAFE',
                                    borderTop: '4px solid #2563EB',
                                    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)'
                                }}>
                                    <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                                        {m.etiqueta}
                                    </div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0D3B66', marginBottom: '4px' }}>
                                        {m.valor}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                        {m.detalle}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Grid de 2 Columnas: ¿Qué hemos hecho? y ¿Cómo lo hemos hecho? */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '24px' }}>
                            {/* Columna 1: ¿Qué hemos hecho? */}
                            <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
                                    <div style={{ background: '#EFF6FF', color: '#2563EB', padding: '8px', borderRadius: '8px' }}>
                                        <CheckCircle2 size={20} />
                                    </div>
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0D3B66' }}>
                                            1. ¿Qué hemos hecho en el servicio?
                                        </h4>
                                        <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                                            Soluciones, tableros y herramientas de auditoría implementadas
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    {activeDossier.queHemosHecho.map((item, idx) => (
                                        <div key={idx} style={{
                                            background: '#F8FAFC',
                                            borderRadius: '10px',
                                            padding: '14px 16px',
                                            borderLeft: '4px solid #2563EB',
                                            border: '1px solid #E2E8F0',
                                            borderLeftWidth: '4px',
                                            borderLeftColor: '#2563EB'
                                        }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0F172A', marginBottom: '6px' }}>
                                                {item.titulo}
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.55 }}>
                                                {item.detalle}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Columna 2: ¿Cómo lo hemos hecho? */}
                            <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
                                    <div style={{ background: '#F0F9FF', color: '#0284C7', padding: '8px', borderRadius: '8px' }}>
                                        <Layers size={20} />
                                    </div>
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0D3B66' }}>
                                            2. ¿Cómo lo hemos hecho? (Ingeniería y Datos)
                                        </h4>
                                        <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                                            Arquitectura SALUS SQL Server, reglas de depuración y motor Telar
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    {activeDossier.comoLoHemosHecho.map((step, idx) => (
                                        <div key={idx} style={{
                                            background: '#F8FAFC',
                                            borderRadius: '10px',
                                            padding: '14px 16px',
                                            border: '1px solid #E2E8F0',
                                            borderLeft: '4px solid #0D3B66'
                                        }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0D3B66', marginBottom: '6px' }}>
                                                {step.paso}
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.55 }}>
                                                {step.explicacion}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Sección 3: Ejemplos Reales Auditados (2026) */}
                        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9', flexWrap: 'wrap', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ background: '#ECFDF5', color: '#059669', padding: '8px', borderRadius: '8px' }}>
                                        <Sparkles size={20} />
                                    </div>
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0D3B66' }}>
                                            3. Ejemplos Reales Auditados paso a paso (Casos Prácticos 2026)
                                        </h4>
                                        <span style={{ fontSize: '0.82rem', color: '#64748B' }}>
                                            Casos concretos con datos reales de Sanatorio Argentino explicando lectura del indicador y toma de decisiones
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('indicadores')}
                                        style={{
                                            padding: '8px 14px',
                                            borderRadius: '8px',
                                            border: '1px solid #BFDBFE',
                                            background: '#EFF6FF',
                                            color: '#1D4ED8',
                                            fontWeight: 700,
                                            fontSize: '0.82rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Ver Indicadores SQL y Tablero Vivo →
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('documentos')}
                                        style={{
                                            padding: '8px 14px',
                                            borderRadius: '8px',
                                            border: '1px solid #E2E8F0',
                                            background: '#F8FAFC',
                                            color: '#334155',
                                            fontWeight: 700,
                                            fontSize: '0.82rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Ver en Repositorio de Documentos →
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {activeDossier.ejemplosDetallados.map((ej, idx) => (
                                    <div key={idx} style={{
                                        borderRadius: '12px',
                                        border: '1px solid #DBEAFE',
                                        overflow: 'hidden',
                                        background: '#FFFFFF'
                                    }}>
                                        <div style={{
                                            background: '#F0F7FF',
                                            padding: '12px 18px',
                                            borderBottom: '1px solid #DBEAFE',
                                            fontWeight: 800,
                                            fontSize: '0.96rem',
                                            color: '#0D3B66'
                                        }}>
                                            {ej.titulo}
                                        </div>
                                        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ fontSize: '0.86rem', color: '#1E40AF', lineHeight: 1.5 }}>
                                                <strong>Contexto Clínico / Gestión: </strong>
                                                <span style={{ color: '#334155', fontWeight: 500 }}>{ej.contexto}</span>
                                            </div>
                                            <div style={{ fontSize: '0.86rem', color: '#0F172A', lineHeight: 1.55, background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <strong style={{ color: '#0D3B66' }}>Lectura Detallada del Dato Real: </strong>
                                                {ej.analisisDatos}
                                            </div>
                                            <div style={{ fontSize: '0.86rem', color: '#065F46', lineHeight: 1.5, background: '#ECFDF5', padding: '10px 14px', borderRadius: '8px', border: '1px solid #A7F3D0' }}>
                                                <strong>Acción y Toma de Decisión: </strong>
                                                {ej.decisionGestion}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Pie Institucional */}
                        <div style={{
                            background: 'white',
                            borderRadius: '12px',
                            border: '1px solid #E2E8F0',
                            padding: '16px 24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <img src="/logosanatorio.png" alt="Sanatorio Argentino" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0D3B66' }}>Sanatorio Argentino</div>
                                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#2563EB' }}>Innovación y Transformación Digital</div>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                Documentación Técnica y Ejemplos Auditados · {activeDossier.codigo}
                            </div>
                        </div>
                    </div>
                )}

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
                    <GobernanzaIndicadores proyectoId={selectedProyecto.id} currentUser={currentUser} proyecto={selectedProyecto} />
                )}

                {activeTab === 'documentos' && (
                    <GobernanzaDocumentos proyectoId={selectedProyecto.id} currentUser={currentUser} />
                )}
            </div>
        </div>
    );
}
