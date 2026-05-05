/**
 * IdleHomerOverlay.jsx — Easter-egg overlay para usuario "frojo"
 * 
 * Muestra el GIF de Homer Simpson en el centro de la pantalla
 * después de 1 minuto de inactividad (sin mouse, teclado, scroll o touch).
 * Desaparece instantáneamente al interactuar con el sistema.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const IDLE_TIMEOUT_MS = 60_000; // 1 minuto

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

export default function IdleHomerOverlay() {
    const [idle, setIdle] = useState(false);
    const timerRef = useRef(null);

    const resetTimer = useCallback(() => {
        // Si está idle, ocultarlo
        setIdle(false);

        // Limpiar timer anterior
        if (timerRef.current) clearTimeout(timerRef.current);

        // Iniciar nuevo timer
        timerRef.current = setTimeout(() => {
            setIdle(true);
        }, IDLE_TIMEOUT_MS);
    }, []);

    useEffect(() => {
        // Arrancar el timer inicial
        resetTimer();

        // Escuchar todos los eventos de actividad
        ACTIVITY_EVENTS.forEach(event => {
            window.addEventListener(event, resetTimer, { passive: true });
        });

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            ACTIVITY_EVENTS.forEach(event => {
                window.removeEventListener(event, resetTimer);
            });
        };
    }, [resetTimer]);

    if (!idle) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 999998,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.35)',
                backdropFilter: 'blur(4px)',
                animation: 'homerFadeIn 0.5s ease-out',
                cursor: 'pointer',
            }}
        >
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
                animation: 'homerBounceIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}>
                <img
                    src="/homer-simpson.gif"
                    alt="Homer Simpson"
                    style={{
                        maxWidth: '320px',
                        maxHeight: '320px',
                        borderRadius: '20px',
                        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
                    }}
                />
                <span style={{
                    color: '#fff',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    opacity: 0.8,
                    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                    letterSpacing: '0.02em',
                }}>
                    Mové el mouse para volver a trabajar...
                </span>
            </div>

            {/* Inline keyframes */}
            <style>{`
                @keyframes homerFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes homerBounceIn {
                    0% { opacity: 0; transform: scale(0.3); }
                    50% { opacity: 1; transform: scale(1.05); }
                    70% { transform: scale(0.95); }
                    100% { transform: scale(1); }
                }
            `}</style>
        </div>
    );
}
