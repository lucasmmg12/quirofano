import React, { useState } from 'react';
import { Settings, Download, Search } from 'lucide-react';
import TelarTopBar from './TelarTopBar';
import TelarSidebar from './TelarSidebar';
import TelarCanvas from './TelarCanvas';
import TelarExportModal from './TelarExportModal';
import { useTelarStore } from '../../store/telarStore';
import './Gobernanza.css';

import DiasOcupacionDashboard from './DiasOcupacionDashboard';

export default function GobernanzaIndicadoresPanel({ currentUser, addToast }) {
    // === ESTADO GLOBAL DEL DASHBOARD ===
    const [activeViewMode, setActiveViewMode] = useState('ocupacion'); // 'ocupacion' (Default Tableau) | 'catalogo'
    
    // 1. Filtros de tiempo (por defecto: Últimos 3 meses)
    const [dateFilter, setDateFilter] = useState({
        type: 'last_3_months', // 'this_month', 'last_month', 'last_3_months', 'last_6_months', 'custom'
        from: null,
        to: null
    });

    // 2. Indicadores activos en el Telar (lista de objetos con id, sector, tipo)
    const { activeIndicators, addIndicator, removeIndicator } = useTelarStore();

    // 3. Estado del Modal de Infografía AI
    const [isInfografiaModalOpen, setIsInfografiaModalOpen] = useState(false);

    // 4. Métricas calculadas por los Canvas
    const [globalMetrics, setGlobalMetrics] = useState({});

    // Handlers
    const handleAddIndicator = (indicator) => {
        if (!activeIndicators.find(i => i.id === indicator.id)) {
            addIndicator(indicator);
            if (addToast) addToast(`Indicador "${indicator.label}" añadido al dashboard`, 'success');
        } else {
            if (addToast) addToast('El indicador ya está en el dashboard', 'info');
        }
    };

    const handleRemoveIndicator = (indicatorId) => {
        removeIndicator(indicatorId);
    };

    const handleMetricsUpdate = (newMetrics) => {
        setGlobalMetrics(prev => ({ ...prev, ...newMetrics }));
    };

    return (
        <div className="content no-print" style={{ padding: 0, height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
            {/* Top Bar: Contiene el título, switcher de vista y filtros globales */}
            <TelarTopBar 
                dateFilter={dateFilter} 
                setDateFilter={setDateFilter} 
                onOpenInfografia={() => setIsInfografiaModalOpen(true)}
                activeViewMode={activeViewMode}
                setActiveViewMode={setActiveViewMode}
            />

            {/* VISTA 1: DÍAS OCUPACIÓN (TABLEAU DASHBOARD EJECUTIVO) */}
            {activeViewMode === 'ocupacion' ? (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <DiasOcupacionDashboard />
                </div>
            ) : (
                /* VISTA 2: CATÁLOGO LIBRE & EXPLORADOR */
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    <TelarSidebar 
                        onAddIndicator={handleAddIndicator} 
                        activeIndicators={activeIndicators}
                    />

                    <div style={{ flex: 1, backgroundColor: 'var(--neutral-100)', padding: '24px', overflowY: 'auto' }}>
                        <TelarCanvas 
                            activeIndicators={activeIndicators}
                            onRemoveIndicator={handleRemoveIndicator}
                            dateFilter={dateFilter}
                            onMetricsUpdate={handleMetricsUpdate}
                        />
                    </div>
                </div>
            )}

            {/* Modal de Infografía AI */}
            {isInfografiaModalOpen && (
                <TelarExportModal 
                    activeIndicators={activeIndicators} 
                    globalMetrics={globalMetrics}
                    onClose={() => setIsInfografiaModalOpen(false)} 
                />
            )}
        </div>
    );
}
