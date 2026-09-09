import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, FileSpreadsheet, FileText, ArrowRight, ChevronRight, BarChart3, Bed, Bot } from 'lucide-react';

const TARGET_VIEWS = ['inicio', 'metricas', 'gobernanza', 'gobernanza_indicadores'];

export default function BetoGuidePopup({ activeView = 'inicio' }) {
    const [visible, setVisible] = useState(false);
    const [dontShowToday, setDontShowToday] = useState(false);
    const lastTriggeredViewRef = useRef(null);

    useEffect(() => {
        // Solo abrir si estamos en el dashboard o gobernanza de datos
        if (!TARGET_VIEWS.includes(activeView)) {
            setVisible(false);
            return;
        }

        // Si el usuario marcó no mostrar hoy, verificar timestamp
        const hideUntil = localStorage.getItem('beto_popup_hide_until');
        if (hideUntil && new Date().getTime() < parseInt(hideUntil, 10)) {
            return;
        }

        // Si ya se abrió para esta misma vista en la sesión actual de navegación rápida, evitar parpadeo repetitivo inmediato
        if (lastTriggeredViewRef.current === activeView && visible) {
            return;
        }

        lastTriggeredViewRef.current = activeView;

        // Abrir tras un brevísimo delay clínico (400ms) al entrar
        const timer = setTimeout(() => {
            setVisible(true);
        }, 400);

        return () => clearTimeout(timer);
    }, [activeView]);

    const handleClose = () => {
        setVisible(false);
        if (dontShowToday) {
            // Guardar 24hs de cooldown
            const tomorrow = new Date().getTime() + 24 * 60 * 60 * 1000;
            localStorage.setItem('beto_popup_hide_until', tomorrow.toString());
        }
    };

    const handleLaunchBeto = (query = '') => {
        setVisible(false);
        window.dispatchEvent(new CustomEvent('open-beto', {
            detail: {
                query: query || '¿Cuántos días cama tuvimos en junio 2026?',
                autoSend: Boolean(query)
            }
        }));
    };

    if (!visible) return null;

    // Etiqueta según el módulo
    const isGobernanza = activeView.startsWith('gobernanza');
    const moduleBadge = isGobernanza ? 'Gobernanza de Datos' : 'Dashboard';

    return (
        <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            width: '360px',
            maxWidth: 'calc(100vw - 32px)',
            background: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: '0 20px 45px -10px rgba(30, 58, 138, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.95)',
            fontFamily: "'Inter', sans-serif",
            overflow: 'hidden',
            animation: 'betoPopupSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}>
            {/* Animación CSS local */}
            <style>{`
                @keyframes betoPopupSlideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.96); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>

            {/* Cabecera Azul Institucional */}
            <div style={{
                background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)',
                padding: '14px 16px',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: '#FFFFFF',
                        border: '2px solid rgba(255, 255, 255, 0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                    }}>
                        <span style={{ fontSize: '1.3rem' }}>👦🏻</span>
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.92rem', letterSpacing: '-0.2px' }}>Beto IA</span>
                            <span style={{
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                background: '#DBEAFE',
                                color: '#1E40AF',
                                padding: '1px 6px',
                                borderRadius: '8px'
                            }}>
                                {moduleBadge}
                            </span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#BFDBFE' }}>
                            Tu copiloto de datos del Sanatorio
                        </span>
                    </div>
                </div>

                <button
                    onClick={handleClose}
                    title="Cerrar"
                    style={{
                        background: 'rgba(255, 255, 255, 0.15)',
                        border: 'none',
                        color: '#FFFFFF',
                        borderRadius: '8px',
                        width: '26px',
                        height: '26px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'background 0.15s'
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
                    onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                >
                    <X size={15} />
                </button>
            </div>

            {/* Cuerpo del Pop-up */}
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#334155', lineHeight: 1.4, fontWeight: 500 }}>
                    Podés consultarme en lenguaje natural <strong>cualquier dato institucional</strong> y exportarlo al instante:
                </p>

                {/* Grid de Capacidades Clave */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '9px',
                        background: '#F8FAFC',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0'
                    }}>
                        <Bed size={16} color="#2563EB" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <div>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0F172A' }}>
                                Datos & Días Cama en Vivo
                            </div>
                            <span style={{ fontSize: '0.7rem', color: '#64748B', lineHeight: 1.3, display: 'block' }}>
                                Total sanatorio, UCI (Intensiva + Intermedia), pisos y servicios.
                            </span>
                        </div>
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '9px',
                        background: '#F8FAFC',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0'
                    }}>
                        <BarChart3 size={16} color="#059669" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <div>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0F172A' }}>
                                Gráficos Interactivos
                            </div>
                            <span style={{ fontSize: '0.7rem', color: '#64748B', lineHeight: 1.3, display: 'block' }}>
                                Barras y tortas en pantalla completa para proyectar o analizar.
                            </span>
                        </div>
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '9px',
                        background: '#EFF6FF',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1px solid #BFDBFE'
                    }}>
                        <div style={{ display: 'flex', gap: '3px', marginTop: '2px', flexShrink: 0 }}>
                            <FileSpreadsheet size={15} color="#15803D" />
                            <FileText size={15} color="#DC2626" />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#1E40AF' }}>
                                Exportación Inmediata a PDF y Excel
                            </div>
                            <span style={{ fontSize: '0.7rem', color: '#1E3A8A', lineHeight: 1.3, display: 'block' }}>
                                Pedile <em>"Exportame a Excel"</em> o <em>"Generame un PDF"</em> y descargalo con 1 clic.
                            </span>
                        </div>
                    </div>
                </div>

                {/* Consultas Sugeridas de 1-Click */}
                <div style={{ marginTop: '2px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Probá una consulta con 1 click:
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '5px' }}>
                        <button
                            onClick={() => handleLaunchBeto('¿Cuántos días cama tuvimos en junio 2026?')}
                            style={{
                                background: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                padding: '6px 9px',
                                fontSize: '0.74rem',
                                color: '#1E40AF',
                                fontWeight: 600,
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.15s'
                            }}
                            onMouseOver={e => { e.currentTarget.style.borderColor = '#93C5FD'; e.currentTarget.style.background = '#F0F7FF'; }}
                            onMouseOut={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#FFFFFF'; }}
                        >
                            <span>🛏️ "¿Cuántos días cama tuvimos en junio 2026?"</span>
                            <ChevronRight size={13} color="#94A3B8" />
                        </button>
                        <button
                            onClick={() => handleLaunchBeto('¿Cuál es la ocupación de UCI y el desglose de Intensiva e Intermedia?')}
                            style={{
                                background: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                padding: '6px 9px',
                                fontSize: '0.74rem',
                                color: '#1E40AF',
                                fontWeight: 600,
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.15s'
                            }}
                            onMouseOver={e => { e.currentTarget.style.borderColor = '#93C5FD'; e.currentTarget.style.background = '#F0F7FF'; }}
                            onMouseOut={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#FFFFFF'; }}
                        >
                            <span>🏥 "Ocupación UCI (Intensiva + Intermedia)"</span>
                            <ChevronRight size={13} color="#94A3B8" />
                        </button>
                        <button
                            onClick={() => handleLaunchBeto('Exportame a Excel la ocupación mensual por servicio de 2026')}
                            style={{
                                background: '#F0FDF4',
                                border: '1px solid #BBF7D0',
                                borderRadius: '8px',
                                padding: '6px 9px',
                                fontSize: '0.74rem',
                                color: '#15803D',
                                fontWeight: 600,
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.15s'
                            }}
                            onMouseOver={e => { e.currentTarget.style.borderColor = '#86EFAC'; e.currentTarget.style.background = '#DCFCE7'; }}
                            onMouseOut={e => { e.currentTarget.style.borderColor = '#BBF7D0'; e.currentTarget.style.background = '#F0FDF4'; }}
                        >
                            <span>📥 "Exportame a Excel la ocupación mensual"</span>
                            <ChevronRight size={13} color="#15803D" />
                        </button>
                    </div>
                </div>

                {/* Footer con Botón Principal y Opción de Cooldown */}
                <div style={{
                    marginTop: '2px',
                    paddingTop: '8px',
                    borderTop: '1px solid #F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '0.68rem', color: '#64748B' }}>
                        <input
                            type="checkbox"
                            checked={dontShowToday}
                            onChange={(e) => setDontShowToday(e.target.checked)}
                            style={{ borderRadius: '3px', cursor: 'pointer' }}
                        />
                        No mostrar hoy
                    </label>

                    <button
                        onClick={() => handleLaunchBeto()}
                        style={{
                            background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)'
                        }}
                    >
                        <span>Abrir Beto</span>
                        <ArrowRight size={13} />
                    </button>
                </div>

            </div>
        </div>
    );
}
