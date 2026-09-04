import React, { useState } from 'react';
import { Settings, Download, Search } from 'lucide-react';
import TelarTopBar from './TelarTopBar';
import TelarSidebar from './TelarSidebar';
import TelarCanvas from './TelarCanvas';
import './Gobernanza.css';

export default function GobernanzaIndicadoresPanel({ currentUser, addToast }) {
    // === ESTADO GLOBAL DEL DASHBOARD ===
    
    // 1. Filtros de tiempo (por defecto: Últimos 3 meses)
    const [dateFilter, setDateFilter] = useState({
        type: 'last_3_months', // 'this_month', 'last_month', 'last_3_months', 'last_6_months', 'custom'
        from: null,
        to: null
    });

    // 2. Indicadores activos en el Telar (lista de objetos con id, sector, tipo)
    const [activeIndicators, setActiveIndicators] = useState([]);

    // Handlers
    const handleAddIndicator = (indicator) => {
        if (!activeIndicators.find(i => i.id === indicator.id)) {
            setActiveIndicators(prev => [...prev, indicator]);
            addToast(`Indicador "${indicator.label}" añadido al telar`, 'success');
        } else {
            addToast('El indicador ya está en el telar', 'info');
        }
    };

    const handleRemoveIndicator = (indicatorId) => {
        setActiveIndicators(prev => prev.filter(i => i.id !== indicatorId));
    };

    return (
        <div className="content no-print" style={{ padding: 0, height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
            {/* Top Bar: Contiene el título y los filtros globales */}
            <TelarTopBar 
                dateFilter={dateFilter} 
                setDateFilter={setDateFilter} 
            />

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Sidebar Izquierda: Catálogo de Sectores e Indicadores */}
                <TelarSidebar 
                    onAddIndicator={handleAddIndicator} 
                    activeIndicators={activeIndicators}
                />

                {/* Canvas Central: El "Telar" donde caen los gráficos */}
                <div style={{ flex: 1, backgroundColor: 'var(--neutral-100)', padding: '24px', overflowY: 'auto' }}>
                    <TelarCanvas 
                        activeIndicators={activeIndicators}
                        onRemoveIndicator={handleRemoveIndicator}
                        dateFilter={dateFilter}
                    />
                </div>
            </div>
        </div>
    );
}
