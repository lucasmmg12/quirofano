import { useState } from 'react';
import {
    ClipboardList, History, BookOpen, Settings, PanelLeftClose, PanelLeft,
    Stethoscope, ChevronDown, FileText, Home, BedDouble,
} from 'lucide-react';

export default function Sidebar({ collapsed, onToggle, activeView, onViewChange }) {
    const [pedidosOpen, setPedidosOpen] = useState(true);

    // Sub-items dentro de "Emisión de Pedidos"
    const pedidosSubItems = [
        { id: 'pedidos', label: 'Nuevo Pedido', icon: ClipboardList },
        { id: 'internacion', label: 'Internación', icon: BedDouble },
        { id: 'historial', label: 'Historial', icon: History },
        { id: 'nomenclador', label: 'Nomenclador', icon: BookOpen },
    ];

    // Items independientes
    const standaloneItems = [
        { id: 'inicio', label: 'Inicio', icon: Home },
        { id: 'cirugias', label: 'Control de Cirugías', icon: Stethoscope },
        { id: 'config', label: 'Configuración', icon: Settings },
    ];

    const isPedidosActive = pedidosSubItems.some(i => activeView === i.id);

    return (
        <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
            <div className="sidebar__brand">
                <div className="sidebar__logo">
                    <img src="/logosanatorio.png" alt="Sanatorio Argentino" className="sidebar__logo-img" style={{ width: collapsed ? 32 : 38, height: collapsed ? 32 : 38, borderRadius: '8px', objectFit: 'contain' }} />
                    {!collapsed && (
                        <div className="sidebar__brand-text animate-fade-in">
                            <span className="sidebar__brand-name">Sanatorio</span>
                            <span className="sidebar__brand-sub">Argentino</span>
                        </div>
                    )}
                </div>
                <button
                    className="sidebar__toggle"
                    onClick={onToggle}
                    aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
                >
                    {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
                </button>
            </div>

            <nav className="sidebar__nav">
                {/* ─── Inicio ─── */}
                {(() => {
                    const isActive = activeView === 'inicio';
                    return (
                        <button
                            className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                            onClick={() => onViewChange('inicio')}
                            title={collapsed ? 'Inicio' : undefined}
                        >
                            <Home size={20} className="sidebar__item-icon" />
                            {!collapsed && <span className="sidebar__item-label">Inicio</span>}
                            {isActive && <div className="sidebar__item-indicator" />}
                        </button>
                    );
                })()}

                {/* ─── Grupo: Emisión de Pedidos ─── */}
                {collapsed ? (
                    /* Cuando está colapsado, mostrar solo iconos sin grupo */
                    pedidosSubItems.map(item => {
                        const Icon = item.icon;
                        const isActive = activeView === item.id;
                        return (
                            <button
                                key={item.id}
                                className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                                onClick={() => onViewChange(item.id)}
                                title={item.label}
                            >
                                <Icon size={20} className="sidebar__item-icon" />
                                {isActive && <div className="sidebar__item-indicator" />}
                            </button>
                        );
                    })
                ) : (
                    <div style={{ marginBottom: '4px' }}>
                        {/* Group header */}
                        <button
                            onClick={() => setPedidosOpen(prev => !prev)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                width: '100%', padding: '10px 16px', border: 'none',
                                background: isPedidosActive ? 'var(--primary-50, #EFF6FF)' : 'transparent',
                                color: isPedidosActive ? 'var(--primary-500, #3B82F6)' : 'var(--neutral-500, #64748B)',
                                cursor: 'pointer', borderRadius: 'var(--radius-md, 8px)',
                                fontSize: '0.82rem', fontWeight: 700, transition: 'all 0.15s',
                                textAlign: 'left',
                            }}
                        >
                            <FileText size={20} style={{ flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>Emisión de Pedidos</span>
                            <ChevronDown size={14} style={{
                                transition: 'transform 0.2s ease',
                                transform: pedidosOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                opacity: 0.5,
                            }} />
                        </button>

                        {/* Sub-items */}
                        {pedidosOpen && (
                            <div className="animate-fade-in" style={{
                                marginLeft: '20px', borderLeft: '2px solid var(--neutral-200, #E2E8F0)',
                                paddingLeft: '0', marginTop: '2px',
                            }}>
                                {pedidosSubItems.map(item => {
                                    const Icon = item.icon;
                                    const isActive = activeView === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                                            onClick={() => onViewChange(item.id)}
                                            style={{ paddingLeft: '14px', fontSize: '0.8rem' }}
                                        >
                                            <Icon size={17} className="sidebar__item-icon" />
                                            <span className="sidebar__item-label">{item.label}</span>
                                            {isActive && <div className="sidebar__item-indicator" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ─── Separador visual ─── */}
                {!collapsed && (
                    <div style={{
                        height: '1px', background: 'var(--neutral-200, #E2E8F0)',
                        margin: '4px 16px 4px',
                    }} />
                )}

                {/* ─── Control de Cirugías + Configuración ─── */}
                {[
                    { id: 'cirugias', label: 'Control de Cirugías', icon: Stethoscope },
                    { id: 'config', label: 'Configuración', icon: Settings },
                ].map(item => {
                    const Icon = item.icon;
                    const isActive = activeView === item.id;
                    return (
                        <button
                            key={item.id}
                            className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                            onClick={() => onViewChange(item.id)}
                            title={collapsed ? item.label : undefined}
                        >
                            <Icon size={20} className="sidebar__item-icon" />
                            {!collapsed && <span className="sidebar__item-label">{item.label}</span>}
                            {isActive && <div className="sidebar__item-indicator" />}
                        </button>
                    );
                })}
            </nav>

            <div className="sidebar__footer">
                {!collapsed && (
                    <div className="sidebar__footer-info animate-fade-in">
                        <p className="sidebar__footer-version">Sistema ADM-QUI v1.0</p>
                        <p className="sidebar__footer-by">Creado por Innovación y Transformación Digital</p>
                    </div>
                )}
            </div>
        </aside>
    );
}
