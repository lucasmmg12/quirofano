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

    // Funciones de utilidad seguras para zonas horarias
    const startOfDayUTC = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const dateDiffInDays = (a, b) => Math.floor((startOfDayUTC(b) - startOfDayUTC(a)) / (1000 * 60 * 60 * 24));

    // Encontrar fechas extremas
    let minDate = new Date(Math.min(...validProjects.map(p => p.start)));
    let maxDate = new Date(Math.max(...validProjects.map(p => p.end)));

    // Padding de 5 días
    minDate.setDate(minDate.getDate() - 5);
    maxDate.setDate(maxDate.getDate() + 5);

    // Generar array exacto de días
    const days = [];
    let d = new Date(minDate);
    while (d <= maxDate) {
        days.push(new Date(d));
        d.setDate(d.getDate() + 1);
    }
    const totalDays = days.length;
    
    // Ancho por día en píxeles
    const dayWidth = 32;
    const ganttWidth = totalDays * dayWidth;

    // Agrupar días por meses para la cabecera
    const monthsData = [];
    let currentMonth = null;
    
    days.forEach(day => {
        const monthKey = day.getFullYear() + '-' + day.getMonth();
        if (!currentMonth || currentMonth.key !== monthKey) {
            currentMonth = {
                key: monthKey,
                label: day.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
                days: []
            };
            monthsData.push(currentMonth);
        }
        currentMonth.days.push(day);
    });

    const todayStr = new Date().toDateString();

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

            <div style={{ flex: 1, padding: '32px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flex: 1, boxShadow: '0 4px 6px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
                    
                    {/* Contenedor Flex para separar nombres y calendario */}
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                        
                        {/* Columna Izquierda: Nombres de Proyectos (Fija) */}
                        <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#f8fafc', zIndex: 10 }}>
                            <div style={{ height: '60px', flexShrink: 0, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 16px', fontWeight: 700, color: '#475569', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                Proyectos
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {validProjects.map(p => (
                                    <div key={p.id} style={{ height: '50px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 16px', fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>
                                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.nombre}>
                                            {p.nombre}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Columna Derecha: Gantt Chart (Scrollable horizontal y vertical) */}
                        <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
                            <div style={{ width: `${ganttWidth}px`, minHeight: '100%' }}>
                                
                                {/* Headers: Meses y Días */}
                                <div style={{ display: 'flex', flexDirection: 'column', height: '60px', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: 'white', zIndex: 5 }}>
                                    
                                    {/* Fila Meses */}
                                    <div style={{ display: 'flex', height: '30px', borderBottom: '1px solid #e2e8f0' }}>
                                        {monthsData.map(m => (
                                            <div key={m.key} style={{ width: `${m.days.length * dayWidth}px`, borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'capitalize' }}>
                                                {m.label}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Fila Días */}
                                    <div style={{ display: 'flex', height: '30px' }}>
                                        {days.map((d, i) => {
                                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                            const isToday = d.toDateString() === todayStr;
                                            return (
                                                <div key={i} style={{ 
                                                    width: `${dayWidth}px`, 
                                                    borderRight: '1px solid #f1f5f9', 
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                    fontSize: '0.75rem', 
                                                    color: isToday ? 'white' : (isWeekend ? '#94a3b8' : '#64748b'),
                                                    background: isToday ? '#3b82f6' : (isWeekend ? '#f8fafc' : 'white'),
                                                    fontWeight: isToday ? 700 : 500,
                                                }}>
                                                    {isToday ? <div style={{ background: '#3b82f6', color: 'white', width: '22px', height: '22px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{d.getDate()}</div> : d.getDate()}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Grilla y Barras (Cuerpo) */}
                                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                    
                                    {/* Fondo Grilla vertical */}
                                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', pointerEvents: 'none', zIndex: 1 }}>
                                        {days.map((d, i) => {
                                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                            const isToday = d.toDateString() === todayStr;
                                            return (
                                                <div key={`bg-${i}`} style={{ 
                                                    width: `${dayWidth}px`, 
                                                    borderRight: '1px solid #f1f5f9', 
                                                    background: isToday ? 'rgba(59, 130, 246, 0.05)' : (isWeekend ? '#f8fafc' : 'transparent') 
                                                }} />
                                            );
                                        })}
                                    </div>

                                    {/* Filas de Proyectos */}
                                    {validProjects.map(p => {
                                        const startDiffDays = dateDiffInDays(minDate, p.start);
                                        const durationDays = dateDiffInDays(p.start, p.end) + 1; // +1 para que sea inclusivo
                                        
                                        const leftPx = startDiffDays * dayWidth;
                                        const widthPx = durationDays * dayWidth;
                                        
                                        const isCompleted = p.estado === 'Finalizado';

                                        return (
                                            <div key={p.id} style={{ height: '50px', borderBottom: '1px solid #f8fafc', position: 'relative', zIndex: 2 }}>
                                                {/* Barra */}
                                                <div 
                                                    style={{ 
                                                        position: 'absolute', 
                                                        left: `${leftPx}px`, 
                                                        width: `${widthPx}px`, 
                                                        height: '28px', 
                                                        top: '11px',
                                                        background: isCompleted ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)' : 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                                                        borderRadius: '6px',
                                                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        padding: '0 8px',
                                                        color: 'white',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        overflow: 'hidden'
                                                    }}
                                                    title={`Inicio: ${p.start.toLocaleDateString()}\nFin: ${p.end.toLocaleDateString()}\nProgreso: ${p.req_progress || 0}%`}
                                                >
                                                    {widthPx > 30 && (
                                                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {p.req_progress || 0}%
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
