import React, { useState, useCallback } from 'react';
import DiasOcupacionDashboard from './DiasOcupacionDashboard';
import TelarExportModal from './TelarExportModal';
import './Gobernanza.css';

export default function GobernanzaIndicadoresPanel({ currentUser, addToast }) {
    const [isInfografiaModalOpen, setIsInfografiaModalOpen] = useState(false);
    const [globalMetrics, setGlobalMetrics] = useState({});
    const [activeIndicators, setActiveIndicators] = useState([]);
    const [rawRows, setRawRows] = useState([]);

    const handleOpenInfografia = useCallback((indicators, metrics, rows) => {
        if (indicators && indicators.length > 0) setActiveIndicators(indicators);
        if (metrics) setGlobalMetrics(metrics);
        if (rows) setRawRows(rows);
        setIsInfografiaModalOpen(true);
    }, []);

    const handleMetricsUpdate = useCallback((m) => {
        setGlobalMetrics(m);
        if (m?.activeIndicators && m.activeIndicators.length > 0) {
            setActiveIndicators(m.activeIndicators);
        }
        if (m?.filteredRows) {
            setRawRows(m.filteredRows);
        }
    }, []);

    return (
        <div className="content no-print" style={{ padding: 0, height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
            {/* Dashboard Unificado Único */}
            <DiasOcupacionDashboard 
                onOpenInfografia={handleOpenInfografia}
                onMetricsUpdate={handleMetricsUpdate}
                addToast={addToast}
            />

            {/* Modal de Centro de Exportación Unificado */}
            {isInfografiaModalOpen && (
                <TelarExportModal 
                    activeIndicators={activeIndicators} 
                    globalMetrics={globalMetrics}
                    rawRows={rawRows}
                    onClose={() => setIsInfografiaModalOpen(false)} 
                />
            )}
        </div>
    );
}
