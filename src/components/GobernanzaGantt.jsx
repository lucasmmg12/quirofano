import React, { useMemo } from 'react';
import { ArrowLeft, CalendarDays } from 'lucide-react';

export default function GobernanzaGantt({ proyectos, onBack }) {
    // Filtrar proyectos que tengan fechas definidas
    const validProjects = useMemo(() => {
        return proyectos.filter(p => p.fecha_desde && p.fecha_hasta)
                        .map(p => ({
                            ...p,
                            start: new Date(p.fecha_desde),
                            end: new Date(p.fecha_hasta)
                        }))
                        .sort((a, b) => a.start - b.start);
    }, [proyectos]);

    if (validProjects.length === 0) {
        return (
            <div style={{ padding: '40px', fontFamily: "'Inter', sans-serif", background: '#f8fafc', height: '100vh' }}>
                <button onClick={onBack} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#475569', marginBottom: '32px' }}>
                    <ArrowLeft size={18} /> Volver a Proyectos
                </button>
                <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <CalendarDays size={48} color="#cbd5e1" style={{ margin: '0 auto 16px' }} />
                    <h2 style={{ color: '#0f172a', margin: '0 0 8px' }}>Diagrama de Gantt Vacío</h2>
                    <p style={{ color: '#64748b', margin: 0 }}>Ningún proyecto tiene configurada la Fecha de Inicio y Fecha Límite. Configúralas al crear o editar un proyecto para ver la línea de tiempo.</p>
                </div>
            </div>
        );
    }

    // Encontrar fechas extremas
    let minDate = new Date(Math.min(...validProjects.map(p => p.start)));
    let maxDate = new Date(Math.max(...validProjects.map(p => p.end)));

    // Padding de 10 días antes y después para que no quede pegado a los bordes
    minDate.setDate(minDate.getDate() - 10);
    maxDate.setDate(maxDate.getDate() + 10);

    const totalTime = maxDate.getTime() - minDate.getTime();

    // Generar marcadores de meses para la cabecera
    const months = [];
    let currentMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (currentMonth <= maxDate) {
        months.push(new Date(currentMonth));
        currentMonth.setMonth(currentMonth.getMonth() + 1);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '20px 32px', display: 'flex', alignItems: 'center', gap: '24px', zIndex: 10 }}>
                <button onClick={onBack} style={{ background: '#f1f5f9', border: 'none', borderRadius: '12px', padding: '10px', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center' }}>
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CalendarDays color="#3b82f6" /> Calendario Global (Gantt)
                    </h2>
                    <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Visualización temporal de todos los proyectos activos</span>
                </div>
            </div>

            <div style={{ flex: 1, padding: '32px', overflow: 'auto' }}>
                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', minWidth: '800px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                    
                    {/* Gantt Header (Months) */}
                    <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px', marginBottom: '24px', position: 'relative', height: '30px' }}>
                        {months.map((m, i) => {
                            const monthLeft = Math.max(0, (m.getTime() - minDate.getTime()) / totalTime * 100);
                            return (
                                <div key={i} style={{ position: 'absolute', left: `${monthLeft}%`, transform: 'translateX(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    {m.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}
                                    <div style={{ width: '1px', height: '12px', background: '#cbd5e1', margin: '4px auto 0' }} />
                                </div>
                            );
                        })}
                    </div>

                    {/* Gantt Body (Projects) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>
                        
                        {/* Líneas verticales de fondo (Grid) */}
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, pointerEvents: 'none' }}>
                            {months.map((m, i) => {
                                const left = Math.max(0, (m.getTime() - minDate.getTime()) / totalTime * 100);
                                return <div key={`grid-${i}`} style={{ position: 'absolute', left: `${left}%`, top: 0, bottom: 0, width: '1px', background: '#f1f5f9' }} />;
                            })}
                        </div>

                        {validProjects.map(p => {
                            const left = ((p.start.getTime() - minDate.getTime()) / totalTime) * 100;
                            const width = ((p.end.getTime() - p.start.getTime()) / totalTime) * 100;
                            const isCompleted = p.estado === 'Activo' ? false : true;

                            return (
                                <div key={p.id} style={{ display: 'flex', alignItems: 'center', position: 'relative', height: '40px' }}>
                                    {/* Sidebar Project Name */}
                                    <div style={{ width: '200px', flexShrink: 0, paddingRight: '16px', fontWeight: 600, color: '#334155', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', zIndex: 2 }}>
                                        {p.nombre}
                                    </div>
                                    
                                    {/* Timeline Area */}
                                    <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                                        <div 
                                            style={{ 
                                                position: 'absolute', 
                                                left: `${left}%`, 
                                                width: `${width}%`, 
                                                height: '24px', 
                                                top: '8px',
                                                background: isCompleted ? '#dcfce7' : 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                                                borderRadius: '12px',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '0 12px',
                                                color: isCompleted ? '#166534' : 'white',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                zIndex: 5,
                                                cursor: 'pointer'
                                            }}
                                            title={`${p.nombre}\n${p.start.toLocaleDateString()} - ${p.end.toLocaleDateString()}`}
                                        >
                                            {/* Si la barra es muy pequeña, no mostramos el % dentro */}
                                            {width > 10 && (
                                                <span>{p.req_progress || 0}%</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
