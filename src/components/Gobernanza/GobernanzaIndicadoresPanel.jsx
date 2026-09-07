import React, { useState } from 'react';
import { Settings, Download, Search } from 'lucide-react';
import TelarTopBar from './TelarTopBar';
import TelarSidebar from './TelarSidebar';
import TelarCanvas from './TelarCanvas';
import TelarExportModal from './TelarExportModal';
import UciIndicatorsPanel from './UciIndicatorsPanel';
import { useTelarStore } from '../../store/telarStore';
import './Gobernanza.css';

export default function GobernanzaIndicadoresPanel({ currentUser, addToast }) {
    // === ESTADO GLOBAL DEL DASHBOARD ===
    
    // Tab activo
    const [activeTab, setActiveTab] = useState('telar'); // 'telar' | 'uci'

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

    // Handlers
    const handleAddIndicator = (indicator) => {
        if (!activeIndicators.find(i => i.id === indicator.id)) {
            addIndicator(indicator);
            addToast(`Indicador "${indicator.label}" añadido al telar`, 'success');
        } else {
            addToast('El indicador ya está en el telar', 'info');
        }
    };

    const handleRemoveIndicator = (indicatorId) => {
        removeIndicator(indicatorId);
    };

    return (
        <div className="content no-print" style={{ padding: 0, height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
            {/* Top Bar: Contiene el título y los filtros globales */}
            <TelarTopBar 
                dateFilter={dateFilter} 
                setDateFilter={setDateFilter} 
                onOpenInfografia={() => setIsInfografiaModalOpen(true)}
            />

            {/* Pestañas de Navegación (Tabs) */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: 'white', padding: '0 24px' }}>
                <button 
                    onClick={() => setActiveTab('telar')}
                    style={{ 
                        background: 'none', border: 'none', padding: '16px 24px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600,
                        borderBottom: activeTab === 'telar' ? '2px solid #3b82f6' : '2px solid transparent',
                        color: activeTab === 'telar' ? '#3b82f6' : '#64748b'
                    }}
                >
                    Telar de Gobernanza
                </button>
                <button 
                    onClick={() => setActiveTab('uci')}
                    style={{ 
                        background: 'none', border: 'none', padding: '16px 24px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600,
                        borderBottom: activeTab === 'uci' ? '2px solid #3b82f6' : '2px solid transparent',
                        color: activeTab === 'uci' ? '#3b82f6' : '#64748b'
                    }}
                >
                    Dashboard UCI (Terapia Intensiva)
                </button>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {activeTab === 'telar' ? (
                    <>
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
                    </>
                ) : (
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <UciIndicatorsPanel dateFilter={dateFilter} />
                    </div>
                )}
            </div>

            {/* Modal de Infografía AI */}
            {isInfografiaModalOpen && (
                <TelarExportModal 
                    activeIndicators={activeIndicators} 
                    onClose={() => setIsInfografiaModalOpen(false)} 
                />
            )}
        </div>
    );
}
