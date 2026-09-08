import React from 'react';
import { LayoutDashboard, Calendar, Sparkles } from 'lucide-react';
import SalusSyncButton from '../SalusSyncButton';

export default function TelarTopBar({ dateFilter, setDateFilter, onOpenInfografia, activeViewMode, setActiveViewMode }) {
    const filters = [
        { id: 'this_month', label: 'Este Mes' },
        { id: 'last_month', label: 'Mes Anterior' },
        { id: 'last_3_months', label: 'Últ. 3 Meses' },
        { id: 'last_6_months', label: 'Últ. 6 Meses' },
        { id: 'custom', label: 'Personalizado' },
    ];

    return (
        <div className="telar-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div className="telar-topbar__title">
                    <LayoutDashboard size={20} color="var(--primary-600)" />
                    Dashboard de Indicadores
                </div>

                {/* Switcher de Vista: Días Ocupación vs Catálogo */}
                <div style={{
                    display: 'flex',
                    background: '#F1F5F9',
                    padding: '3px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    gap: '4px'
                }}>
                    <button
                        onClick={() => setActiveViewMode('ocupacion')}
                        style={{
                            padding: '5px 12px',
                            borderRadius: '6px',
                            border: 'none',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            background: activeViewMode === 'ocupacion' ? '#1E40AF' : 'transparent',
                            color: activeViewMode === 'ocupacion' ? '#FFFFFF' : '#64748B',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        🛏️ Días Ocupación
                    </button>
                    <button
                        onClick={() => setActiveViewMode('catalogo')}
                        style={{
                            padding: '5px 12px',
                            borderRadius: '6px',
                            border: 'none',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            background: activeViewMode === 'catalogo' ? '#1E40AF' : 'transparent',
                            color: activeViewMode === 'catalogo' ? '#FFFFFF' : '#64748B',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        📊 Catálogo Libre
                    </button>
                </div>
            </div>

            <div className="telar-topbar__filters">
                <Calendar size={16} color="var(--neutral-400)" style={{ marginRight: '4px' }} />
                {filters.map(f => (
                    <button
                        key={f.id}
                        className={`telar-filter-btn ${dateFilter.type === f.id ? 'telar-filter-btn--active' : ''}`}
                        onClick={() => setDateFilter({ type: f.id, from: null, to: null })}
                    >
                        {f.label}
                    </button>
                ))}
                
                <div style={{ width: '1px', height: '24px', background: 'var(--neutral-200)', margin: '0 8px' }}></div>

                {/* Sincronización */}
                <SalusSyncButton />
                
                <div style={{ width: '1px', height: '24px', background: 'var(--neutral-200)', margin: '0 8px' }}></div>
                
                <button
                    className="telar-filter-btn"
                    onClick={onOpenInfografia}
                    style={{ 
                        background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', 
                        color: 'white', 
                        border: 'none',
                        fontWeight: 600,
                        gap: '6px'
                    }}
                >
                    <Sparkles size={14} />
                    Exportación Inteligente
                </button>
            </div>
        </div>
    );
}
