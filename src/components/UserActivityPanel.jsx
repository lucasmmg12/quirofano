import React, { useState } from 'react';
import UserActivityResumen from './UserActivityResumen';
import UserActivityAuditoria from './UserActivityAuditoria';
import { Activity, ShieldCheck } from 'lucide-react';

export default function UserActivityPanel() {
    const [activeTab, setActiveTab] = useState('resumen');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--neutral-50, #f8fafc)' }}>
            <div style={{ 
                padding: '16px 24px', 
                background: 'white', 
                borderBottom: '1px solid var(--neutral-200, #e2e8f0)',
                display: 'flex',
                gap: '8px'
            }}>
                <button
                    onClick={() => setActiveTab('resumen')}
                    style={{
                        padding: '8px 16px',
                        border: 'none',
                        background: activeTab === 'resumen' ? 'var(--primary-50, #eff6ff)' : 'transparent',
                        color: activeTab === 'resumen' ? 'var(--primary-700, #1d4ed8)' : 'var(--neutral-500, #64748b)',
                        fontWeight: 600,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s'
                    }}
                >
                    <Activity size={18} /> Resumen Global
                </button>
                <button
                    onClick={() => setActiveTab('auditoria')}
                    style={{
                        padding: '8px 16px',
                        border: 'none',
                        background: activeTab === 'auditoria' ? 'var(--primary-50, #eff6ff)' : 'transparent',
                        color: activeTab === 'auditoria' ? 'var(--primary-700, #1d4ed8)' : 'var(--neutral-500, #64748b)',
                        fontWeight: 600,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s'
                    }}
                >
                    <ShieldCheck size={18} /> Log de Auditoría ECAR
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'resumen' && <UserActivityResumen />}
                {activeTab === 'auditoria' && <UserActivityAuditoria />}
            </div>
        </div>
    );
}
