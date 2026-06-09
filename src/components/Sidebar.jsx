import { useState, useRef, useEffect, useCallback } from 'react';
import {
    ClipboardList, History, BookOpen, Settings, PanelLeftClose, PanelLeft,
    Stethoscope, ChevronDown, FileText, Home, MessageSquareText, MessageCircle,
    ClipboardPlus, BarChart3, Ticket, DollarSign, ClipboardCheck, Brain, Users, PackageCheck, Microscope,
    Activity, FileSpreadsheet, BookMarked, FolderOpen, Receipt,
} from 'lucide-react';

export default function Sidebar({ collapsed, onToggle, activeView, onViewChange, unreadMessageCount = 0, className = '', onOpenBeto, currentUser }) {
    const isFrojo = currentUser?.usuario === 'frojo';
    const [pedidosOpen, setPedidosOpen] = useState(false);
    const [mensajeriaOpen, setMensajeriaOpen] = useState(false);
    const [altasOpen, setAltasOpen] = useState(false);
    const [cirugiasOpen, setCirugiasOpen] = useState(false);

    // Sub-items dentro de "Altas Adm"
    const altasSubItems = [
        { id: 'altas', label: 'Control de Altas', icon: ClipboardCheck },
        { id: 'facturacion', label: 'Facturación', icon: Receipt },
        { id: 'asignaciones', label: 'Asignaciones', icon: Users },
        { id: 'auditoria_historias', label: 'Auditoría H.C.', icon: FileSpreadsheet },
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

    // Sub-items dentro de "Control de Cirugías"
    const cirugiasSubItems = [
        { id: 'cirugias', label: 'Control de Cirugías', icon: Stethoscope },
        { id: 'pacientes', label: 'Pacientes', icon: Users },
        { id: 'metricas', label: 'Métricas', icon: BarChart3 },
        { id: 'asociaciones_entrega', label: 'Entrega Asociaciones', icon: PackageCheck },
        { id: 'laboratorios', label: 'Anatomía Pat.', icon: Microscope },
    ];

    const isPedidosActive = pedidosSubItems.some(i => activeView === i.id);
    const isMensajeriaActive = mensajeriaSubItems.some(i => activeView === i.id);
    const isAltasActive = altasSubItems.some(i => activeView === i.id);
    const isCirugiasActive = cirugiasSubItems.some(i => activeView === i.id);

    // ── Smooth Accordion component ──
    function AccordionContent({ isOpen, children }) {
        const contentRef = useRef(null);
        const [maxHeight, setMaxHeight] = useState(isOpen ? 'none' : '0px');

        useEffect(() => {
            if (!contentRef.current) return;
            if (isOpen) {
                const h = contentRef.current.scrollHeight;
                setMaxHeight(`${h}px`);
                // After transition, set to 'none' so dynamic content can grow
                const timer = setTimeout(() => setMaxHeight('none'), 350);
                return () => clearTimeout(timer);
            } else {
                // First set explicit height, then collapse on next frame
                const h = contentRef.current.scrollHeight;
                setMaxHeight(`${h}px`);
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => setMaxHeight('0px'));
                });
            }
        }, [isOpen]);

        return (
            <div
                ref={contentRef}
                className={`sidebar__accordion ${isOpen ? 'sidebar__accordion--open' : 'sidebar__accordion--closed'}`}
                style={{ maxHeight }}
            >
                {children}
            </div>
        );
    }

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
                        background: isGroupActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                        color: isGroupActive ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                        cursor: 'pointer', borderRadius: 'var(--radius-md, 8px)',
                        fontSize: '0.82rem', fontWeight: 700, transition: 'all 0.15s',
                        textAlign: 'left',
                    }}
                >
                    <GroupIcon size={20} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{label}</span>
                    {badge}
                    <ChevronDown size={14} style={{
                        transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                        opacity: 0.5,
                    }} />
                </button>

                <AccordionContent isOpen={isOpen}>
                    <div style={{
                        marginLeft: '20px', borderLeft: '2px solid rgba(255, 255, 255, 0.2)',
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
                </AccordionContent>
            </div>
        );
    }

    return (
        <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${className}`}>
            {/* Animated video background */}
            <div className="sidebar__video-bg">
                <video
                    src="/anima_la_imagen_202606091409.mp4"
                    autoPlay
                    loop
                    muted
                    playsInline
                />
            </div>
            <div className="sidebar__brand">
                <div className="sidebar__logo">
                    <img src="/logosanatorio.png" alt="Sanatorio Argentino" className="sidebar__logo-img" style={{ width: collapsed ? 32 : 38, height: collapsed ? 32 : 38, borderRadius: '8px', objectFit: 'contain' }} />
                    {!collapsed && (
                        <div className="sidebar__brand-text animate-fade-in">
                            <span className="sidebar__brand-name" style={{ display: 'flex' }}>
                                {'Sanatorio'.split('').map((char, i) => (
                                    <span key={i} style={{ display: 'inline-block', animation: 'title-wave 3s ease-in-out infinite', animationDelay: `${i * 0.08}s` }}>{char}</span>
                                ))}
                            </span>
                            <span className="sidebar__brand-sub" style={{ display: 'flex' }}>
                                {'Argentino'.split('').map((char, i) => (
                                    <span key={i} style={{ display: 'inline-block', animation: 'title-wave 3s ease-in-out infinite', animationDelay: `${(i + 9) * 0.08}s` }}>{char}</span>
                                ))}
                            </span>
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
                        height: '1px', background: 'rgba(255, 255, 255, 0.1)',
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
                    { id: 'consultas', label: 'Consultas Guardia', icon: Activity },
                    { id: 'documentos', label: 'Documentos', icon: FolderOpen },
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

                {/* ─── Control de Cirugías (grupo colapsable) ─── */}
                {renderGroup({
                    label: 'Cirugías',
                    icon: Stethoscope,
                    isOpen: cirugiasOpen,
                    setOpen: setCirugiasOpen,
                    isGroupActive: isCirugiasActive,
                    subItems: cirugiasSubItems,
                })}

                {/* ─── Items finales ─── */}
                {[
                    { id: 'beto_analytics', label: 'Simon Analytics', icon: Brain },
                    { id: 'manual', label: 'Manual del Sistema', icon: BookMarked },
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

            <div className="sidebar__footer" style={{ padding: collapsed ? '12px 0' : '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                {/* ─── Beto Animated Avatar ─── */}
                <button
                    onClick={() => onOpenBeto?.()}
                    title={collapsed ? 'Hablar con Beto' : undefined}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: 0, position: 'relative',
                        width: collapsed ? 44 : 64, height: collapsed ? 44 : 64,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.3s ease',
                    }}
                >
                    {/* Outer breathing glow */}
                    <div style={{
                        position: 'absolute', inset: -4,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
                        animation: 'beto-breathe 3s ease-in-out infinite',
                    }} />
                    {/* Orbiting ring 1 */}
                    <div style={{
                        position: 'absolute', inset: -3,
                        borderRadius: '50%',
                        border: '1.5px solid rgba(129,140,248,0.35)',
                        animation: 'beto-orbit 8s linear infinite',
                    }} />
                    {/* Orbiting ring 2 (counter-rotate) */}
                    <div style={{
                        position: 'absolute', inset: -7,
                        borderRadius: '50%',
                        border: '1px dashed rgba(165,180,252,0.25)',
                        animation: 'beto-orbit-reverse 12s linear infinite',
                    }} />
                    {/* Pulsing dot on ring */}
                    <div style={{
                        position: 'absolute',
                        width: 6, height: 6, borderRadius: '50%',
                        background: '#818CF8',
                        boxShadow: '0 0 8px rgba(129,140,248,0.8)',
                        top: -5, left: '50%', marginLeft: -3,
                        animation: 'beto-orbit 8s linear infinite',
                        transformOrigin: `3px ${(collapsed ? 44 : 64) / 2 + 5}px`,
                    }} />
                    {/* Avatar image with glassmorphism border */}
                    <div style={{
                        width: collapsed ? 36 : 52, height: collapsed ? 36 : 52,
                        borderRadius: '50%', overflow: 'hidden',
                        border: '2px solid rgba(255,255,255,0.3)',
                        boxShadow: '0 0 20px rgba(99,102,241,0.4), 0 0 40px rgba(99,102,241,0.15), inset 0 0 10px rgba(255,255,255,0.1)',
                        animation: 'beto-float 4s ease-in-out infinite',
                        position: 'relative', zIndex: 2,
                        transition: 'all 0.3s ease',
                    }}>
                        {isFrojo ? (
                            <img
                                src="/tim-payne-ya-supero-la-barrera-de-los-cinco-JYXMRXEMGZAUJOQH5XSJ2AY2DA.avif"
                                alt="Tim Payne"
                                style={{
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    pointerEvents: 'none',
                                }}
                            />
                        ) : (
                            <video
                                src="/the_avatar_is_greetings_202606091123.mp4"
                                autoPlay
                                loop
                                muted
                                playsInline
                                style={{
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    pointerEvents: 'none',
                                }}
                            />
                        )}
                    </div>
                    {/* Online indicator */}
                    <div style={{
                        position: 'absolute',
                        bottom: collapsed ? 0 : 2,
                        right: collapsed ? 0 : 4,
                        width: 10, height: 10,
                        borderRadius: '50%',
                        background: '#10B981',
                        border: '2px solid #1E3A5F',
                        zIndex: 3,
                        animation: 'beto-pulse-dot 2s ease-in-out infinite',
                    }} />
                </button>

                {!collapsed && (
                    <div className="animate-fade-in" style={{ textAlign: 'center' }}>
                        <p style={{
                            margin: 0, fontSize: '0.72rem', fontWeight: 700,
                            color: 'rgba(255,255,255,0.9)',
                            letterSpacing: '0.5px',
                        }}>{ isFrojo ? 'TIM PAYNE' : 'BETO' } <span style={{ fontWeight: 400, opacity: 0.7 }}>IA</span></p>
                        <p style={{
                            margin: '2px 0 0', fontSize: '0.6rem',
                            color: 'rgba(255,255,255,0.45)',
                        }}>{ isFrojo ? 'No Payne, No Gain 💪' : 'Tu asistente personal' }</p>
                    </div>
                )}

                {!collapsed && (
                    <div className="animate-fade-in" style={{
                        borderTop: '1px solid rgba(255,255,255,0.08)',
                        paddingTop: '8px', width: '100%', textAlign: 'center',
                    }}>
                        <p className="sidebar__footer-version" style={{ fontSize: '0.58rem', margin: 0, opacity: 0.4 }}>ADM-QUI v1.0</p>
                        <p className="sidebar__footer-by" style={{ fontSize: '0.52rem', margin: '1px 0 0', opacity: 0.3 }}>Grow Labs × Sanatorio Argentino</p>
                    </div>
                )}
            </div>
        </aside>
    );
}
