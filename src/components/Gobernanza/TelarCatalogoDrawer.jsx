import React from 'react';
import { X, Check, RotateCcw, Sliders, Layers, Bed, Activity, Clock, AlertTriangle, PieChart, BarChart3, Users, FileText } from 'lucide-react';
import { INDICADORES_CATALOGO, DEFAULT_ACTIVE_INDICATOR_IDS } from './telarConfig';

const ICON_MAP = {
    Bed: <Bed size={16} />,
    Activity: <Activity size={16} />,
    Clock: <Clock size={16} />,
    AlertTriangle: <AlertTriangle size={16} />,
    PieChart: <PieChart size={16} />,
    BarChart3: <BarChart3 size={16} />,
    Layers: <Layers size={16} />,
    Users: <Users size={16} />,
    FileText: <FileText size={16} />
};

export default function TelarCatalogoDrawer({
    isOpen,
    onClose,
    activeIds,
    onToggleIndicator,
    onResetDefaults,
    sectorLabel
}) {
    if (!isOpen) return null;

    // Agrupar indicadores por categoría
    const grupos = {};
    INDICADORES_CATALOGO.forEach(ind => {
        if (!grupos[ind.grupo]) grupos[ind.grupo] = [];
        grupos[ind.grupo].push(ind);
    });

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(2px)',
            zIndex: 10000,
            display: 'flex',
            justifyContent: 'flex-end',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                width: '420px',
                maxWidth: '90vw',
                height: '100%',
                background: '#FFFFFF',
                boxShadow: '-10px 0 25px -5px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideInRight 0.25s ease-out'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#F8FAFC'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Sliders size={18} color="#1E40AF" />
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                                Catálogo de Indicadores
                            </h3>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px', display: 'block' }}>
                            Sector: <strong>{sectorLabel}</strong> • {activeIds.length} de {INDICADORES_CATALOGO.length} activos
                        </span>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            background: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#64748B'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Acciones Rápidas */}
                <div style={{
                    padding: '12px 24px',
                    background: '#FFFFFF',
                    borderBottom: '1px solid #F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <button
                        onClick={onResetDefaults}
                        style={{
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            color: '#1E40AF',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        <RotateCcw size={13} />
                        Restablecer Predeterminados
                    </button>
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                        {DEFAULT_ACTIVE_INDICATOR_IDS.length} predeterminados
                    </span>
                </div>

                {/* Lista agrupada */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                    {Object.entries(grupos).map(([grupoName, inds]) => (
                        <div key={grupoName} style={{ marginBottom: '24px' }}>
                            <div style={{
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                color: '#64748B',
                                textTransform: 'uppercase',
                                letterSpacing: '0.6px',
                                marginBottom: '10px'
                            }}>
                                {grupoName}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {inds.map(ind => {
                                    const isActive = activeIds.includes(ind.id);
                                    return (
                                        <div
                                            key={ind.id}
                                            onClick={() => onToggleIndicator(ind.id)}
                                            style={{
                                                padding: '12px',
                                                borderRadius: '10px',
                                                border: isActive ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                                                background: isActive ? '#F0F7FF' : '#FFFFFF',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                justifyContent: 'space-between',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <div style={{ display: 'flex', gap: '10px', flex: 1, paddingRight: '8px' }}>
                                                <div style={{
                                                    color: isActive ? '#1E40AF' : '#94A3B8',
                                                    marginTop: '2px'
                                                }}>
                                                    {ICON_MAP[ind.icon] || <Activity size={16} />}
                                                </div>
                                                <div>
                                                    <div style={{
                                                        fontSize: '0.86rem',
                                                        fontWeight: 700,
                                                        color: isActive ? '#0F172A' : '#334155',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}>
                                                        {ind.label}
                                                        {ind.isDefault && (
                                                            <span style={{
                                                                fontSize: '0.65rem',
                                                                background: '#E2E8F0',
                                                                color: '#475569',
                                                                padding: '1px 5px',
                                                                borderRadius: '4px',
                                                                fontWeight: 600
                                                            }}>
                                                                Base
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p style={{ margin: '3px 0 0', fontSize: '0.74rem', color: '#64748B', lineHeight: 1.35 }}>
                                                        {ind.descripcion}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Switch toggle visual */}
                                            <div style={{
                                                width: '38px',
                                                height: '22px',
                                                borderRadius: '11px',
                                                background: isActive ? '#2563EB' : '#CBD5E1',
                                                position: 'relative',
                                                flexShrink: 0,
                                                marginTop: '2px',
                                                transition: 'background 0.2s'
                                            }}>
                                                <div style={{
                                                    width: '16px',
                                                    height: '16px',
                                                    borderRadius: '50%',
                                                    background: '#FFFFFF',
                                                    position: 'absolute',
                                                    top: '3px',
                                                    left: isActive ? '19px' : '3px',
                                                    transition: 'left 0.2s',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                                }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    display: 'flex',
                    justifyContent: 'flex-end'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '8px',
                            background: '#1E40AF',
                            color: '#FFFFFF',
                            border: 'none',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                        }}
                    >
                        Listo ({activeIds.length} activos)
                    </button>
                </div>
            </div>
        </div>
    );
}
