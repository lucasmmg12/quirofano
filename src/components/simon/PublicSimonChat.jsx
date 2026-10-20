import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    ChevronRight, Sun, Moon, Laptop, Monitor, LogIn, CheckCircle2, AlertTriangle, Info, X
} from 'lucide-react';
import RAGPanel from './RAGPanel.jsx';
import SystemOutageReporter from '../SystemOutageReporter.jsx';
import '../../simon-redesign.css';

/**
 * PublicSimonChat — Acceso libre y público a Simon IA (Asistente Institucional RAG).
 * Renderiza la interfaz oficial del Sanatorio Argentino idéntica a la vista interna,
 * garantizando toda la funcionalidad de consulta, archivos y normativas, con el historial
 * previo protegido por confidencialidad.
 */
export default function PublicSimonChat() {
    // Modo Oscuro sincronizado
    const [darkMode, setDarkMode] = useState(() => localStorage.getItem('dark_mode') === 'true');
    // Escala adaptativa de interfaz
    const [uiScale, setUiScale] = useState(() => localStorage.getItem('ui_scale_preference') || 'auto');
    // Sistema de notificaciones toast
    const [toasts, setToasts] = useState([]);

    const addToast = (message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    };

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
        if (darkMode) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
        localStorage.setItem('dark_mode', darkMode);
    }, [darkMode]);

    useEffect(() => {
        if (uiScale === 'auto') {
            document.body.removeAttribute('data-ui-scale');
        } else {
            document.body.setAttribute('data-ui-scale', uiScale);
        }
        localStorage.setItem('ui_scale_preference', uiScale);
    }, [uiScale]);

    const cycleUiScale = () => {
        setUiScale(prev => {
            if (prev === 'auto') return 'compact';
            if (prev === 'compact') return 'normal';
            return 'auto';
        });
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            width: '100vw',
            overflow: 'hidden',
            background: 'var(--simon-bg, #ffffff)'
        }}>
            {/* Topbar Institucional idéntica al sistema */}
            <header className="topbar" style={{ minHeight: '38px', height: '38px', flexShrink: 0 }}>
                <div className="topbar__left" style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <h1 className="topbar__title topbar__title--wave" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                        {'Plataforma'.split('').map((char, i) => (
                            <span key={`a-${i}`} className="topbar__wave-letter topbar__title-accent" style={{ animationDelay: `${i * 0.08}s` }}>
                                {char === ' ' ? '\u00A0' : char}
                            </span>
                        ))}
                        <span className="topbar__wave-letter" style={{ animationDelay: `${10 * 0.08}s` }}>&nbsp;</span>
                        {'Sanatorio Argentino'.split('').map((char, i) => (
                            <span key={`s-${i}`} className="topbar__wave-letter" style={{ animationDelay: `${(11 + i) * 0.08}s` }}>
                                {char === ' ' ? '\u00A0' : char}
                            </span>
                        ))}
                    </h1>

                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--neutral-400, #94A3B8)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        <ChevronRight size={12} />
                        <span style={{ color: 'var(--primary-500, #2563EB)', fontWeight: 600 }}>Simon IA</span>
                    </span>

                    <span className="topbar__subtitle hide-mobile" style={{ fontSize: '0.68rem', color: 'var(--neutral-400, #94A3B8)', borderLeft: '1px solid var(--neutral-200, #E2E8F0)', paddingLeft: '8px', marginLeft: '2px', whiteSpace: 'nowrap', lineHeight: 1 }}>
                        Sistema de gestión integral
                    </span>
                </div>

                <div className="topbar__right" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Botón Reportar Problema */}
                    <SystemOutageReporter
                        currentUser={{ nombre: 'Usuario Público Simón' }}
                        addToast={addToast}
                    />

                    {/* Toggle Modo Oscuro / Claro */}
                    <button
                        onClick={() => setDarkMode(d => !d)}
                        title={darkMode ? 'Modo claro' : 'Modo oscuro'}
                        style={{
                            width: '26px', height: '26px', borderRadius: '6px',
                            background: darkMode ? '#1E293B' : 'var(--neutral-50, #F8FAFC)',
                            border: `1px solid ${darkMode ? '#334155' : 'var(--neutral-200, #E2E8F0)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: darkMode ? '#FBBF24' : 'var(--neutral-500, #64748B)',
                            transition: 'all 0.2s',
                        }}
                    >
                        {darkMode ? <Sun size={13} /> : <Moon size={13} />}
                    </button>

                    {/* Selector de Escala Adaptativa */}
                    <button
                        onClick={cycleUiScale}
                        title={`Escala visual: ${uiScale === 'auto' ? 'Automática' : uiScale === 'compact' ? 'Compacto (85%)' : 'Normal (100%)'}`}
                        style={{
                            height: '26px',
                            padding: '0 7px',
                            borderRadius: '6px',
                            background: uiScale !== 'auto'
                                ? (darkMode ? '#1E3A8A' : '#EFF6FF')
                                : (darkMode ? '#1E293B' : 'var(--neutral-50, #F8FAFC)'),
                            border: `1px solid ${uiScale !== 'auto' ? '#3B82F6' : (darkMode ? '#334155' : 'var(--neutral-200, #E2E8F0)')}`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                            color: uiScale !== 'auto'
                                ? (darkMode ? '#93C5FD' : '#2563EB')
                                : (darkMode ? '#94A3B8' : 'var(--neutral-500, #64748B)'),
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            transition: 'all 0.2s',
                        }}
                    >
                        {uiScale === 'compact' ? <Laptop size={13} /> : <Monitor size={13} />}
                        <span style={{ fontSize: '0.67rem' }}>
                            {uiScale === 'auto' ? 'Auto' : uiScale === 'compact' ? '85%' : '100%'}
                        </span>
                    </button>

                    {/* Fecha de la Jornada */}
                    <span className="topbar__date">
                        {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>

                    {/* Acceso / Volver al Login */}
                    <Link
                        to="/"
                        title="Volver al inicio de sesión"
                        style={{
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '2px 10px 2px 8px',
                            background: darkMode ? '#1E293B' : 'var(--neutral-50, #F8FAFC)',
                            borderRadius: '14px',
                            border: `1px solid ${darkMode ? '#334155' : 'var(--neutral-200, #E2E8F0)'}`,
                            height: '26px',
                            color: darkMode ? '#E2E8F0' : 'var(--neutral-700, #334155)',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={e => {
                            e.currentTarget.style.borderColor = '#3B82F6';
                            e.currentTarget.style.color = '#2563EB';
                        }}
                        onMouseOut={e => {
                            e.currentTarget.style.borderColor = darkMode ? '#334155' : 'var(--neutral-200, #E2E8F0)';
                            e.currentTarget.style.color = darkMode ? '#E2E8F0' : 'var(--neutral-700, #334155)';
                        }}
                    >
                        <LogIn size={12} style={{ color: '#2563EB' }} />
                        <span className="hide-mobile">Iniciar Sesión</span>
                    </Link>
                </div>
            </header>

            {/* Panel Principal Simon IA (RAG) con historial general protegido */}
            <main style={{
                flex: 1,
                height: 'calc(100vh - 38px)',
                width: '100%',
                overflow: 'hidden',
                position: 'relative'
            }}>
                <RAGPanel
                    isPublic={true}
                    hideHistory={true}
                    initialUser="invitado_publico"
                    addToast={addToast}
                />
            </main>

            {/* Contenedor flotante de Toasts */}
            {toasts.length > 0 && (
                <div style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    pointerEvents: 'none'
                }}>
                    {toasts.map(t => (
                        <div
                            key={t.id}
                            style={{
                                pointerEvents: 'auto',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 16px',
                                borderRadius: '8px',
                                background: t.type === 'error' ? '#EF4444' : t.type === 'warning' ? '#F59E0B' : t.type === 'success' ? '#10B981' : '#1E293B',
                                color: '#FFFFFF',
                                fontSize: '0.82rem',
                                fontWeight: 500,
                                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
                                animation: 'fadeIn 0.2s ease',
                                maxWidth: '380px'
                            }}
                        >
                            {t.type === 'success' && <CheckCircle2 size={16} />}
                            {t.type === 'warning' && <AlertTriangle size={16} />}
                            {t.type === 'error' && <AlertTriangle size={16} />}
                            {t.type === 'info' && <Info size={16} />}
                            <span style={{ flex: 1 }}>{t.message}</span>
                            <button
                                onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
                                style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', padding: 0 }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
