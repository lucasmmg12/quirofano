import React from 'react';

/**
 * KPICard Component
 * 
 * Componente reutilizable para visualización de KPIs principales en Dashboards.
 * Diseñado siguiendo directrices Calidad-QOAG: limpio, fondo blanco, 
 * bordes redondeados y sombras sutiles.
 */
export default function KPICard({ 
    title, 
    value, 
    icon: Icon, 
    color = '#2563EB', // Azul Institucional por defecto
    trendText = null,
    trendDirection = null, // 'up', 'down', 'neutral'
    onClick = null
}) {
    return (
        <div 
            onClick={onClick}
            style={{
                backgroundColor: '#ffffff',
                borderRadius: '0.75rem', // rounded-xl
                padding: '1.25rem', // p-5
                boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
                border: '1px solid rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease-in-out',
                cursor: onClick ? 'pointer' : 'default',
                ...(onClick ? { ':hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)' } } : {})
            }}
            className={onClick ? "hover:-translate-y-1 hover:shadow-md transition-all duration-200" : ""}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h3 style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: 600, 
                    color: '#6B7280', // neutral-500
                    margin: 0,
                    textTransform: 'uppercase',
                    letterSpacing: '0.025em'
                }}>
                    {title}
                </h3>
                <div style={{ 
                    fontSize: '1.875rem', // text-3xl
                    fontWeight: 700, 
                    color: '#111827', // gray-900
                    lineHeight: 1
                }}>
                    {value}
                </div>
                {trendText && (
                    <div style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: trendDirection === 'up' ? '#10B981' : trendDirection === 'down' ? '#EF4444' : '#6B7280'
                    }}>
                        {trendDirection === 'up' && <span>↑</span>}
                        {trendDirection === 'down' && <span>↓</span>}
                        {trendText}
                    </div>
                )}
            </div>
            
            {Icon && (
                <div style={{
                    backgroundColor: `${color}15`, // Fondo semitransparente del color
                    padding: '0.75rem',
                    borderRadius: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: color
                }}>
                    <Icon size={24} strokeWidth={2} />
                </div>
            )}
        </div>
    );
}
