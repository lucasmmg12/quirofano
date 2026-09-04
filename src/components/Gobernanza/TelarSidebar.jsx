import React, { useState } from 'react';
import { BarChart3, PieChart, LineChart, ChevronDown, ChevronRight, Plus } from 'lucide-react';

// MOCK DATA: Catálogo de Sectores e Indicadores
const CATALOGO = [
    {
        id: 'quirofano',
        label: 'Quirófano',
        indicadores: [
            { id: 'q_ocupacion', label: 'Tasa de Ocupación', type: 'line' },
            { id: 'q_cirugias', label: 'Cirugías por Especialidad', type: 'bar' },
            { id: 'q_suspensiones', label: 'Motivos de Suspensión', type: 'pie' }
        ]
    },
    {
        id: 'internacion',
        label: 'Internación',
        indicadores: [
            { id: 'i_promedio', label: 'Promedio Días Estada', type: 'line' },
            { id: 'i_altas', label: 'Altas Diarias', type: 'bar' }
        ]
    },
    {
        id: 'calidad',
        label: 'Calidad',
        indicadores: [
            { id: 'c_incidentes', label: 'Incidentes Reportados', type: 'bar' },
            { id: 'c_resolucion', label: 'Tiempos de Resolución', type: 'line' }
        ]
    }
];

export default function TelarSidebar({ onAddIndicator, activeIndicators }) {
    const [expandedSectors, setExpandedSectors] = useState({ quirofano: true });

    const toggleSector = (sectorId) => {
        setExpandedSectors(prev => ({ ...prev, [sectorId]: !prev[sectorId] }));
    };

    const getIcon = (type) => {
        if (type === 'bar') return <BarChart3 size={14} />;
        if (type === 'pie') return <PieChart size={14} />;
        if (type === 'line') return <LineChart size={14} />;
        return <BarChart3 size={14} />;
    };

    return (
        <div className="telar-sidebar">
            <div className="telar-sidebar__header">
                Catálogo de Indicadores
            </div>
            
            <div className="telar-sidebar__content">
                {CATALOGO.map(sector => (
                    <div key={sector.id} className="telar-sector-group">
                        <div 
                            className="telar-sector-header"
                            onClick={() => toggleSector(sector.id)}
                        >
                            <span>{sector.label}</span>
                            {expandedSectors[sector.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </div>
                        
                        {expandedSectors[sector.id] && sector.indicadores.map(ind => {
                            const isActive = activeIndicators.some(i => i.id === ind.id);
                            
                            return (
                                <div 
                                    key={ind.id} 
                                    className={`telar-indicator-item ${isActive ? 'telar-indicator-item--active' : ''}`}
                                    onClick={() => !isActive && onAddIndicator({ ...ind, sector: sector.label })}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {getIcon(ind.type)}
                                        {ind.label}
                                    </div>
                                    {!isActive && (
                                        <button className="telar-indicator-item__add" title="Añadir al Telar">
                                            <Plus size={12} />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
