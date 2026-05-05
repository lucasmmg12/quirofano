/**
 * IdleHomerOverlay.jsx — Easter-egg overlay para usuario "frojo"
 * 
 * Muestra el GIF de Homer Simpson en el centro de la pantalla
 * después de 1 minuto de inactividad (sin mouse, teclado, scroll o touch).
 * Desaparece instantáneamente al interactuar con el sistema.
 */
import { useState, useEffect, useRef } from 'react';

const IDLE_TIMEOUT_MS = 60_000; // 1 minuto

export default function IdleHomerOverlay() {
    const [idle, setIdle] = useState(false);
    const timerRef = useRef(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        console.log('[IdleHomer] ✅ Componente montado — timer de', IDLE_TIMEOUT_MS / 1000, 'segundos');

        function startTimer() {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                if (mountedRef.current) {
                    console.log('[IdleHomer] 💤 Inactividad detectada — mostrando Homer');
                    setIdle(true);
                }
            }, IDLE_TIMEOUT_MS);
        }

        function handleActivity() {
            if (!mountedRef.current) return;
            setIdle(false);
            startTimer();
        }

        // Arrancar timer inicial
        startTimer();

        // Escuchar eventos en document (más confiable que window para algunos eventos)
        const events = ['mousemove', 'mousedown', 'keydown', 'keyup', 'scroll', 'touchstart', 'click', 'wheel'];
        events.forEach(evt => {
            document.addEventListener(evt, handleActivity, { passive: true, capture: true });
        });
        // También en window por si acaso
        window.addEventListener('focus', handleActivity);
        window.addEventListener('resize', handleActivity);

        return () => {
            mountedRef.current = false;
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(evt => {
                document.removeEventListener(evt, handleActivity, { capture: true });
            });
            window.removeEventListener('focus', handleActivity);
            window.removeEventListener('resize', handleActivity);
            console.log('[IdleHomer] 🔴 Componente desmontado');
        };
    }, []);

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
