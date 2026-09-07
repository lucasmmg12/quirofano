import React, { useState } from 'react';
import { BarChart3, PieChart, LineChart, ChevronDown, ChevronRight, Plus } from 'lucide-react';

// MOCK DATA REMOVED: Catálogo Real de Sectores e Indicadores
const CATALOGO = [
    {
        id: 'uci',
        label: 'Terapia Intensiva (UCI)',
        indicadores: [
            { id: 'uci_volumen', label: 'Volumen de Ingresos', type: 'kpi_users' },
            { id: 'uci_alos', label: 'Promedio de Estancia (ALOS)', type: 'kpi_clock' },
            { id: 'uci_mortalidad', label: 'Mortalidad Cruda', type: 'kpi_alert' },
            { id: 'uci_derivacion', label: 'Tasa de Derivación', type: 'kpi_arrow' },
            { id: 'uci_procedencia', label: 'Procedencia del Paciente', type: 'bar' },
            { id: 'uci_motivo_alta', label: 'Motivo de Alta', type: 'pie' }
        ]
    }
];

export default function TelarSidebar({ onAddIndicator, activeIndicators }) {
    const [expandedSectors, setExpandedSectors] = useState({ uci: true });

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
