import React, { useState } from 'react';
import DiasOcupacionDashboard from './DiasOcupacionDashboard';
import TelarExportModal from './TelarExportModal';
import './Gobernanza.css';

export default function GobernanzaIndicadoresPanel({ currentUser, addToast }) {
    const [isInfografiaModalOpen, setIsInfografiaModalOpen] = useState(false);
    const [globalMetrics, setGlobalMetrics] = useState({});

    return (
        <div className="content no-print" style={{ padding: 0, height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
            {/* Dashboard Unificado Único */}
            <DiasOcupacionDashboard 
                onOpenInfografia={() => setIsInfografiaModalOpen(true)}
                onMetricsUpdate={(m) => setGlobalMetrics(m)}
                addToast={addToast}
            />

            {/* Modal de Infografía AI */}
            {isInfografiaModalOpen && (
                <TelarExportModal 
                    activeIndicators={[]} 
                    globalMetrics={globalMetrics}
                    onClose={() => setIsInfografiaModalOpen(false)} 
                />
            )}
        </div>
    );
}
