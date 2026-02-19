import { ClipboardList, History, BookOpen, Settings, PanelLeftClose, PanelLeft, Stethoscope } from 'lucide-react';

export default function Sidebar({ collapsed, onToggle, activeView, onViewChange }) {
    const navItems = [
        { id: 'pedidos', label: 'Nuevo Pedido', icon: ClipboardList },
        { id: 'cirugias', label: 'Cirugías', icon: Stethoscope },
        { id: 'historial', label: 'Historial', icon: History },
        { id: 'nomenclador', label: 'Nomenclador', icon: BookOpen },
        { id: 'config', label: 'Configuración', icon: Settings },
    ];

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
                {navItems.map(item => {
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
