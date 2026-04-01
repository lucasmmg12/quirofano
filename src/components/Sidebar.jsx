import { useState } from 'react';
import {
    ClipboardList, History, BookOpen, Settings, PanelLeftClose, PanelLeft,
    Stethoscope, ChevronDown, FileText, Home, MessageSquareText, MessageCircle,
    ClipboardPlus, BarChart3, Ticket, DollarSign, ClipboardCheck, Brain, Users,
} from 'lucide-react';

export default function Sidebar({ collapsed, onToggle, activeView, onViewChange, unreadMessageCount = 0 }) {
    const [pedidosOpen, setPedidosOpen] = useState(true);
    const [mensajeriaOpen, setMensajeriaOpen] = useState(true);
    const [altasOpen, setAltasOpen] = useState(true);

    // Sub-items dentro de "Altas Adm"
    const altasSubItems = [
        { id: 'altas', label: 'Control de Altas', icon: ClipboardCheck },
        { id: 'asignaciones', label: 'Asignaciones', icon: Users },
    ];

    // Sub-items dentro de "Emisión de Pedidos"
    const pedidosSubItems = [
        { id: 'pedidos', label: 'Nuevo Pedido', icon: ClipboardList },
        { id: 'historial', label: 'Historial', icon: History },
        { id: 'nomenclador', label: 'Nomenclador', icon: BookOpen },
        { id: 'pedidos_marcela', label: 'Pedidos Marcela', icon: ClipboardPlus },
    ];

    // Sub-items dentro de "Mensajería"
    const mensajeriaSubItems = [
        { id: 'mensajeria', label: 'Chat', icon: MessageCircle },
        { id: 'plantillas', label: 'Plantillas WhatsApp', icon: MessageSquareText },
    ];

    const isPedidosActive = pedidosSubItems.some(i => activeView === i.id);
    const isMensajeriaActive = mensajeriaSubItems.some(i => activeView === i.id);
    const isAltasActive = altasSubItems.some(i => activeView === i.id);

    // Helper to render a collapsible group
    function renderGroup({ label, icon: GroupIcon, isOpen, setOpen, isGroupActive, subItems, badge }) {
        if (collapsed) {
            return subItems.map(item => {
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
            });
        }

        return (
            <div style={{ marginBottom: '4px' }}>
                <button
                    onClick={() => setOpen(prev => !prev)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        width: '100%', padding: '10px 16px', border: 'none',
                        background: isGroupActive ? 'var(--primary-50, #EFF6FF)' : 'transparent',
                        color: isGroupActive ? 'var(--primary-500, #3B82F6)' : 'var(--neutral-500, #64748B)',
                        cursor: 'pointer', borderRadius: 'var(--radius-md, 8px)',
                        fontSize: '0.82rem', fontWeight: 700, transition: 'all 0.15s',
                        textAlign: 'left',
                    }}
                >
                    <GroupIcon size={20} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{label}</span>
                    {badge}
                    <ChevronDown size={14} style={{
                        transition: 'transform 0.2s ease',
                        transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                        opacity: 0.5,
                    }} />
                </button>

                {isOpen && (
                    <div className="animate-fade-in" style={{
                        marginLeft: '20px', borderLeft: '2px solid var(--neutral-200, #E2E8F0)',
                        paddingLeft: '0', marginTop: '2px',
                    }}>
                        {subItems.map(item => {
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
        );
    }

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

                {/* ─── Mensajería (grupo colapsable) ─── */}
                {renderGroup({
                    label: 'Mensajería',
                    icon: MessageCircle,
                    isOpen: mensajeriaOpen,
                    setOpen: setMensajeriaOpen,
                    isGroupActive: isMensajeriaActive,
                    subItems: mensajeriaSubItems,
                    badge: unreadMessageCount > 0 ? (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            minWidth: '20px', height: '20px', padding: '0 5px', borderRadius: '10px',
                            background: '#EF4444', color: '#fff', fontSize: '0.65rem', fontWeight: 800,
                            lineHeight: 1, animation: 'pulse 2s ease-in-out infinite',
                            boxShadow: '0 0 8px rgba(239, 68, 68, 0.4)',
                        }}>{unreadMessageCount > 99 ? '99+' : unreadMessageCount}</span>
                    ) : null,
                })}

                {/* ─── Emisión de Pedidos (grupo colapsable) ─── */}
                {renderGroup({
                    label: 'Pedidos',
                    icon: FileText,
                    isOpen: pedidosOpen,
                    setOpen: setPedidosOpen,
                    isGroupActive: isPedidosActive,
                    subItems: pedidosSubItems,
                })}

                {/* ─── Separador visual ─── */}
                {!collapsed && (
                    <div style={{
                        height: '1px', background: 'var(--neutral-200, #E2E8F0)',
                        margin: '4px 16px 4px',
                    }} />
                )}

                {/* ─── Altas Adm (grupo colapsable) ─── */}
                {renderGroup({
                    label: 'Altas Adm',
                    icon: ClipboardCheck,
                    isOpen: altasOpen,
                    setOpen: setAltasOpen,
                    isGroupActive: isAltasActive,
                    subItems: altasSubItems,
                })}

                {/* ─── Items individuales ─── */}
                {[
                    { id: 'turnos', label: 'Cola de Turnos', icon: Ticket },
                    { id: 'deudas', label: 'Deudas', icon: DollarSign },
                    { id: 'simon', label: 'Simon IA', icon: Brain },
                    { id: 'cirugias', label: 'Control de Cirugías', icon: Stethoscope },
                    { id: 'metricas', label: 'Métricas', icon: BarChart3 },
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
