/**
 * TurnoKiosco.jsx — Pantalla pública para tablet/kiosco
 * Ruta: /turno (sin login)
 * Flujo: [DNI opcional] → [Elegir trámite] → [Sub-opción si aplica] → [Número de turno]
 * 
 * Soporta estructura jerárquica:
 *   - Items sin grupo → botón directo
 *   - Items con grupo → primero muestra grupo, luego sub-opciones
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Receipt, ShieldCheck, Building2, Users, Baby,
    HelpCircle, ArrowLeft, CheckCircle, RefreshCw,
    ChevronRight, FileText, Microscope,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getBoxesDisponibles, getBoxBalanceado, isHorarioAtencion } from '../services/boxService';

const ICON_MAP = {
    Receipt, ShieldCheck, Building2, Users, Baby, HelpCircle, FileText, Microscope,
};

const STEPS = { DNI: 'dni', TICKET: 'ticket' };

export default function TurnoKiosco() {
    const [step, setStep] = useState(STEPS.DNI);
    const [dni, setDni] = useState('');
    const [turno, setTurno] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [colaCount, setColaCount] = useState({});
    const [boxesDisponibles, setBoxesDisponibles] = useState(null); // null = loading, [] = none

    const checkBoxes = useCallback(() => {
        getBoxesDisponibles()
            .then(boxes => setBoxesDisponibles(boxes))
            .catch(() => {
                if (isHorarioAtencion()) {
                    setBoxesDisponibles([
                        { numero: 1, activo: true, usuario_nombre: 'Box 1' },
                        { numero: 2, activo: true, usuario_nombre: 'Box 2' }
                    ]);
                } else {
                    setBoxesDisponibles([]);
                }
            });
    }, []);

    // Check box availability on mount and every 30s
    useEffect(() => {
        checkBoxes();
        const boxInterval = setInterval(checkBoxes, 30000);
        return () => clearInterval(boxInterval);
    }, [checkBoxes]);

    // Cargar cantidad en espera por tipo
    const loadColaCount = useCallback(async () => {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const { data } = await supabase
            .from('turnos_cola')
            .select('tipo_tramite')
            .in('estado', ['esperando', 'llamando', 'en_atencion'])
            .gte('created_at', hoy.toISOString());

        const counts = {};
        (data || []).forEach(t => {
            counts[t.tipo_tramite] = (counts[t.tipo_tramite] || 0) + 1;
        });
        setColaCount(counts);
    }, []);

    useEffect(() => {
        loadColaCount();
        const interval = setInterval(loadColaCount, 15000);
        return () => clearInterval(interval);
    }, [loadColaCount]);

    // Contar espera total de un grupo
    const getGroupWaitCount = useCallback((children) => {
        return children.reduce((sum, c) => sum + (colaCount[c.tipo_tramite] || 0), 0);
    }, [colaCount]);

    // Crear turno con asignación balanceada de box
    const handleCreateTurno = useCallback(async (e) => {
        if (e) e.preventDefault();
        if (!dni || dni.trim().length < 6) {
            setError('Por favor, ingresá un DNI válido.');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const tipo = 'admision_general'; // Turno genérico unificado

            // 1. Obtener próximo número
            const { data: numData, error: numErr } = await supabase
                .rpc('next_turno_number', { p_tipo: tipo });
            if (numErr) throw numErr;

            // 2. Obtener box disponible con balanceo inteligente
            const boxAsignado = await getBoxBalanceado();

            // 3. Buscar nombre del paciente por DNI
            let nombrePaciente = null;
            const { data: paciente } = await supabase
                .from('hospital_pacientes')
                .select('nombre')
                .eq('dni', dni.trim())
                .limit(1)
                .maybeSingle();
                
            if (paciente?.nombre) {
                nombrePaciente = paciente.nombre;
            }

            // 4. Insertar turno
            const { data: turnoData, error: insertErr } = await supabase
                .from('turnos_cola')
                .insert({
                    numero_turno: numData,
                    tipo_tramite: tipo,
                    dni: dni.trim(),
                    nombre_paciente: nombrePaciente,
                    box_asignado: boxAsignado || 1,
                    estado: 'esperando',
                })
                .select()
                .single();

            if (insertErr) throw insertErr;

            setTurno(turnoData);
            setStep(STEPS.TICKET);
            loadColaCount();
        } catch (err) {
            console.error('Error creating turno:', err);
            setError('Error al generar el turno. Intente nuevamente.');
        } finally {
            setLoading(false);
        }
    }, [dni, loadColaCount]);

    // Reset completo
    const handleReset = useCallback(() => {
        setStep(STEPS.DNI);
        setDni('');
        setTurno(null);
        setError(null);
    }, []);

    // Auto-reset después de 8 segundos en la pantalla de ticket
    useEffect(() => {
        if (step === STEPS.TICKET) {
            const timer = setTimeout(handleReset, 8000);
            return () => clearTimeout(timer);
        }
    }, [step, handleReset]);

    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <div style={styles.container}>
            {/* Background overlay */}
            <div style={styles.bgOverlay} />

            {/* Header */}
            <header style={styles.header} className="no-print">
                <div style={styles.headerInner}>
                    <div style={styles.headerLeft}>
                        <img src="/logosanatorio.png" alt="Sanatorio" style={styles.logo} />
                        <div>
                            <h1 style={styles.headerTitle}>
                                Sanatorio <span style={{ color: '#1565C0', fontWeight: 800 }}>Argentino</span>
                            </h1>
                            <p style={styles.headerSubtitle}>Sistema de Turnos · Administración</p>
                        </div>
                    </div>
                    <div style={styles.headerRight}>
                        <span style={styles.headerTime}>{timeStr}</span>
                        <span style={styles.headerDate}>{dateStr}</span>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main style={styles.main}>
                {/* ═══ FUERA DE HORARIO (Sólo si realmente estamos fuera de horario comercial) ═══ */}
                {!isHorarioAtencion() && boxesDisponibles !== null && boxesDisponibles.length === 0 && step !== STEPS.TICKET && (
                    <div style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        textAlign: 'center', padding: '40px 24px',
                        minHeight: 'calc(100vh - 200px)',
                        animation: 'fadeInUp 0.5s ease-out',
                    }} className="no-print">
                        <div style={{
                            width: '100px', height: '100px', borderRadius: '28px',
                            background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: '24px',
                            boxShadow: '0 8px 32px rgba(30,41,59,0.3)',
                        }}>
                            <span style={{ fontSize: '3rem' }}>🌙</span>
                        </div>
                        <h2 style={{
                            margin: '0 0 12px', fontSize: '1.8rem', fontWeight: 800,
                            color: '#0D3B66', lineHeight: 1.3,
                        }}>
                            Fuera de horario<br/>de atención
                        </h2>
                        <p style={{
                            margin: '0 0 24px', fontSize: '1.2rem',
                            color: '#64748B', fontWeight: 500, lineHeight: 1.5,
                            maxWidth: '380px',
                        }}>
                            En este momento no hay boxes disponibles para la atención.
                        </p>
                        <div style={{
                            padding: '16px 28px', borderRadius: '16px',
                            background: '#EFF6FF', border: '2px solid #BFDBFE',
                            fontSize: '1.1rem', fontWeight: 700, color: '#1565C0',
                            marginBottom: '20px'
                        }}>
                            Horario de atención: 07:00 a 20:30 hs
                        </div>
                        <button
                            type="button"
                            onClick={() => checkBoxes()}
                            style={{
                                padding: '12px 24px',
                                background: '#1E5799',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '12px',
                                fontSize: '1rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            <RefreshCw size={18} /> Reintentar / Actualizar
                        </button>
                    </div>
                )}

                {/* ═══ PASO 1: INGRESAR DNI ═══ */}
                {step === STEPS.DNI && (isHorarioAtencion() || (boxesDisponibles && boxesDisponibles.length > 0)) && (
                    <div style={styles.selectContainer} className="no-print">
                        <form onSubmit={handleCreateTurno} style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                            <div style={styles.dniSection}>
                                <label style={{ ...styles.dniLabel, fontSize: '2rem', marginBottom: '8px' }}>
                                    Ingresá tu número de DNI
                                </label>
                                <div style={{ color: '#ef4444', fontSize: '1.3rem', fontWeight: '700', marginBottom: '24px', textAlign: 'center' }}>
                                    Para cualquier tipo de trámite es obligatorio presentar DNI.
                                </div>
                                <input
                                    type="text"
                                    value={dni}
                                    readOnly
                                    placeholder="Ej: 12345678"
                                    style={{
                                        ...styles.dniInput,
                                        textAlign: 'center',
                                        fontSize: '3.5rem',
                                        padding: '20px',
                                        height: '90px',
                                        borderRadius: '24px',
                                        cursor: 'default'
                                    }}
                                />
                                
                                {/* Teclado numérico en pantalla */}
                                <div style={styles.keypad}>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                        <button 
                                            key={num} type="button" 
                                            onClick={() => setDni(d => (d + num).slice(0, 8))}
                                            style={styles.keypadBtn}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                    <button 
                                        type="button" 
                                        onClick={() => setDni('')}
                                        style={{ ...styles.keypadBtn, background: '#FEE2E2', color: '#EF4444', borderColor: '#FECACA' }}
                                    >
                                        C
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setDni(d => (d + '0').slice(0, 8))}
                                        style={styles.keypadBtn}
                                    >
                                        0
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setDni(d => d.slice(0, -1))}
                                        style={{ ...styles.keypadBtn, background: '#E2E8F0', color: '#475569', borderColor: '#CBD5E1' }}
                                    >
                                        ⌫
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div style={styles.errorBanner}>
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || !dni || dni.length < 6}
                                style={{
                                    width: '100%',
                                    padding: '24px',
                                    borderRadius: '20px',
                                    background: (loading || !dni || dni.length < 6) ? '#94A3B8' : '#1565C0',
                                    color: '#fff',
                                    fontSize: '2.2rem',
                                    fontWeight: 800,
                                    border: 'none',
                                    marginTop: '16px',
                                    cursor: (loading || !dni || dni.length < 6) ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: (loading || !dni || dni.length < 6) ? 'none' : '0 8px 24px rgba(21, 101, 192, 0.3)',
                                }}
                            >
                                {loading ? 'Generando...' : 'Obtener Número'}
                            </button>
                        </form>

                        {loading && (
                            <div style={styles.loadingOverlay}>
                                <RefreshCw size={40} style={{ animation: 'spin 1s linear infinite', color: '#1565C0' }} />
                                <span style={{ fontSize: '1.1rem', color: '#475569', marginTop: '12px' }}>
                                    Procesando...
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ PASO 2: TICKET GENERADO (Kiosco-friendly: sin botones) ═══ */}
                {step === STEPS.TICKET && turno && (
                    <div style={styles.ticketContainer}>
                        <div style={styles.ticketCard} id="turno-ticket">
                            {/* Animated success icon */}
                            <div style={{
                                width: '120px', height: '120px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, #16A34A, #22C55E)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 24px',
                                boxShadow: '0 8px 32px rgba(22,163,74,0.3)',
                                animation: 'fadeInUp 0.4s ease-out',
                            }}>
                                <CheckCircle size={64} style={{ color: '#fff' }} />
                            </div>

                            <h2 style={{
                                margin: '0 0 16px', fontSize: '2.5rem', fontWeight: 800,
                                color: '#16A34A', animation: 'fadeInUp 0.5s ease-out',
                            }}>
                                ¡Turno generado!
                            </h2>

                            {/* Número grande */}
                            <div style={{
                                ...styles.ticketNumber,
                                fontSize: '8rem',
                                color: '#1565C0',
                                borderColor: '#1565C030',
                                background: '#1565C008',
                                animation: 'fadeInUp 0.5s ease-out, pulseNumber 3s ease-in-out infinite',
                            }}>
                                {turno.numero_turno}
                            </div>

                            <div style={{
                                display: 'flex', justifyContent: 'center',
                                marginBottom: '32px', animation: 'fadeInUp 0.7s ease-out',
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <span style={{ display: 'block', fontSize: '1.5rem', color: '#94A3B8', fontWeight: 600, marginBottom: '8px' }}>Paciente DNI</span>
                                    <span style={{ fontSize: '2.5rem', fontWeight: 700, color: '#0D3B66' }}>{turno.dni}</span>
                                </div>
                            </div>

                            <p style={{
                                ...styles.ticketWait,
                                fontSize: '2.2rem', fontWeight: 700,
                                padding: '24px 32px', borderRadius: '24px',
                                animation: 'fadeInUp 0.8s ease-out',
                            }}>
                                Aguarde a ser llamado/a
                            </p>

                            {/* Barra de progreso auto-reset */}
                            <div style={{
                                marginTop: '24px', width: '100%', height: '4px',
                                background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden',
                            }}>
                                <div style={{
                                    height: '100%', background: 'linear-gradient(90deg, #16A34A, #22C55E)',
                                    borderRadius: '4px',
                                    animation: 'shrinkBar 8s linear forwards',
                                }} />
                            </div>
                        </div>
                    </div>
                )}
                {/* Ticket no print (removed rawBT elements) */}
            </main>

            {/* CSS */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes pulseNumber {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.03); }
                }
                @keyframes shrinkBar {
                    from { width: 100%; }
                    to { width: 0%; }
                }
                @media print {
                    .no-print { display: none !important; }
                    .print-only { 
                        display: block !important; 
                        visibility: visible !important;
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 57mm;
                    }
                    .print-only * {
                        visibility: visible !important;
                    }
                    body { margin: 0; padding: 0; }
                    @page {
                        size: 57mm auto;
                        margin: 0;
                    }
                }
                .print-only { display: none; }

                /* Touch-friendly: larger tap targets */
                @media (pointer: coarse) {
                    button { min-height: 48px; }
                }

                /* Prevent text selection on kiosk */
                * { -webkit-user-select: none; user-select: none; }
                input { -webkit-user-select: text; user-select: text; }
            `}</style>
        </div>
    );
}

// ─── Estilos (Optimizados para tablet vertical + personas mayores) ───
const styles = {
    container: {
        minHeight: '100vh',
        background: '#F0F4F8',
        fontFamily: "'Inter', -apple-system, sans-serif",
        position: 'relative',
        overflow: 'hidden',
    },
    bgOverlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(180deg, #E8F0FE 0%, #F0F4F8 100%)',
        zIndex: 0,
    },
    header: {
        position: 'relative', zIndex: 10,
        background: 'rgba(255,255,255,0.95)',
        borderBottom: '2px solid rgba(21, 101, 192, 0.12)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
    },
    headerInner: {
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
    logo: { width: '80px', height: '80px', borderRadius: '16px', objectFit: 'contain' },
    headerTitle: {
        margin: 0, fontSize: '2.2rem', fontWeight: 700, color: '#0D3B66',
    },
    headerSubtitle: {
        margin: 0, fontSize: '1.3rem', color: '#64748B', fontWeight: 500,
    },
    headerRight: { textAlign: 'right' },
    headerTime: {
        display: 'block', fontSize: '2.5rem', fontWeight: 800, color: '#0D3B66',
    },
    headerDate: {
        fontSize: '1.3rem', color: '#64748B', textTransform: 'capitalize',
    },
    main: {
        position: 'relative', zIndex: 10,
        padding: '16px 16px 24px',
        minHeight: 'calc(100vh - 80px)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
    },
    // ── Select step ──
    selectContainer: {
        animation: 'fadeInUp 0.4s ease-out',
    },
    dniSection: {
        background: 'rgba(255,255,255,0.9)',
        borderRadius: '24px',
        padding: '20px',
        marginBottom: '16px',
        border: '2px solid #E2E8F0',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
    },
    dniLabel: {
        display: 'block', fontSize: '1.15rem', fontWeight: 700, color: '#0D3B66',
        marginBottom: '10px',
    },
    dniOptional: { fontSize: '0.9rem', fontWeight: 500, color: '#94A3B8' },
    dniInput: {
        width: '100%', padding: '18px 20px',
        borderRadius: '14px',
        border: '2px solid #CBD5E1',
        fontSize: '1.5rem', fontWeight: 700,
        color: '#0D3B66', letterSpacing: '2px',
        outline: 'none', transition: 'all 0.2s',
        background: '#FAFBFC',
        boxSizing: 'border-box',
    },
    keypad: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginTop: '24px',
        maxWidth: '480px',
        margin: '24px auto 0',
    },
    keypadBtn: {
        background: '#F8FAFC',
        border: '3px solid #E2E8F0',
        borderRadius: '20px',
        padding: '16px 0',
        fontSize: '3rem',
        fontWeight: 800,
        color: '#0D3B66',
        cursor: 'pointer',
        boxShadow: '0 6px 16px rgba(0,0,0,0.06)',
        transition: 'all 0.1s',
        WebkitTapHighlightColor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectTitle: {
        fontSize: '3.5rem', fontWeight: 800, color: '#0D3B66',
        textAlign: 'center', margin: '16px 0 32px',
        lineHeight: 1.3,
    },
    // Grid: 1 columna para botones grandes tipo lista
    grid: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    // Botón de trámite: horizontal, grande, fácil de tocar
    tramiteBtn: {
        display: 'flex', flexDirection: 'row', alignItems: 'center',
        gap: '16px',
        padding: '20px 20px',
        background: 'rgba(255,255,255,0.92)',
        borderRadius: '18px',
        border: '2.5px solid',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 3px 16px rgba(0,0,0,0.05)',
        WebkitTapHighlightColor: 'transparent',
        position: 'relative',
        minHeight: '80px',
        textAlign: 'left',
    },
    numberBadge: {
        position: 'absolute',
        top: '10px', right: '12px',
        width: '32px', height: '32px',
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff',
        fontWeight: 800,
        fontSize: '0.9rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    },
    tramiteIconWrap: {
        width: '64px', height: '64px', borderRadius: '16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },
    tramiteLabel: {
        fontSize: '2.4rem', fontWeight: 800, color: '#0D3B66',
        lineHeight: 1.3, flex: 1,
    },
    subBadge: {
        display: 'flex', alignItems: 'center', gap: '4px',
        fontSize: '0.85rem', fontWeight: 700,
        padding: '5px 14px', borderRadius: '20px',
    },
    waitBadge: {
        fontSize: '0.85rem', fontWeight: 700,
        padding: '5px 14px', borderRadius: '20px',
        position: 'absolute', bottom: '10px', right: '12px',
    },
    errorBanner: {
        marginTop: '16px', padding: '16px',
        background: '#FEE2E2', color: '#DC2626',
        borderRadius: '14px', textAlign: 'center',
        fontSize: '1.1rem', fontWeight: 700,
        border: '1px solid #FECACA',
    },
    loadingOverlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
    },
    // ── Sub-select step ──
    backBtn: {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '14px 22px', marginBottom: '16px',
        background: 'rgba(255,255,255,0.9)',
        border: '2px solid #CBD5E1',
        borderRadius: '14px',
        cursor: 'pointer',
        fontSize: '1.1rem', fontWeight: 700, color: '#475569',
        transition: 'all 0.2s',
    },
    groupHeader: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '10px', padding: '20px',
        borderRadius: '18px', border: '2px solid',
        marginBottom: '16px',
    },
    groupHeaderIcon: {
        width: '56px', height: '56px', borderRadius: '16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    groupHeaderTitle: {
        margin: 0, fontSize: '1.3rem', fontWeight: 800,
        textAlign: 'center',
    },
    groupHeaderSub: {
        margin: 0, fontSize: '1rem', color: '#64748B', fontWeight: 500,
    },
    // Sub-grid: también 1 columna
    subGrid: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    subBtn: {
        display: 'flex', flexDirection: 'row', alignItems: 'center',
        gap: '16px',
        padding: '20px',
        background: 'rgba(255,255,255,0.92)',
        borderRadius: '18px',
        border: '2.5px solid',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 3px 16px rgba(0,0,0,0.05)',
        WebkitTapHighlightColor: 'transparent',
        position: 'relative',
        minHeight: '72px',
        textAlign: 'left',
    },
    subIconWrap: {
        width: '56px', height: '56px', borderRadius: '16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },
    subLabel: {
        fontSize: '2.2rem', fontWeight: 800, color: '#0D3B66',
        lineHeight: 1.3, flex: 1,
    },
    // ── Ticket step ──
    ticketContainer: {
        animation: 'fadeInUp 0.5s ease-out',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '10px 0',
    },
    ticketCard: {
        background: 'rgba(255,255,255,0.95)',
        borderRadius: '32px',
        padding: '48px 32px',
        width: '100%',
        maxWidth: '700px',
        boxShadow: '0 8px 48px rgba(0,0,0,0.12)',
        border: '2px solid #E2E8F0',
        textAlign: 'center',
    },
    ticketHeader: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        marginBottom: '16px',
    },
    ticketSuccessText: {
        margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#16A34A',
    },
    ticketNumber: {
        fontSize: '5.5rem', fontWeight: 900, letterSpacing: '4px',
        borderRadius: '20px', padding: '12px 20px',
        margin: '8px 0 20px',
        border: '3px solid',
    },
    ticketInfo: {
        display: 'flex', flexDirection: 'column', gap: '10px',
        padding: '16px', borderRadius: '16px',
        background: 'rgba(241, 245, 249, 0.6)',
    },
    ticketInfoRow: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    },
    ticketInfoLabel: {
        fontSize: '0.85rem', fontWeight: 600, color: '#64748B',
    },
    ticketInfoValue: {
        fontSize: '0.95rem', fontWeight: 700, color: '#0D3B66',
    },
    ticketWait: {
        marginTop: '20px', fontSize: '1rem', fontWeight: 600,
        color: '#475569',
        padding: '12px 20px', borderRadius: '14px',
        background: 'rgba(59, 130, 246, 0.06)',
        border: '1px solid rgba(59, 130, 246, 0.12)',
    },
    ticketActions: {
        display: 'flex', gap: '12px', marginTop: '24px', width: '100%', maxWidth: '420px',
    },
    printBtn: {
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        padding: '16px', borderRadius: '16px',
        background: '#1565C0', color: '#fff',
        border: 'none', cursor: 'pointer',
        fontSize: '1rem', fontWeight: 700,
        boxShadow: '0 4px 16px rgba(21, 101, 192, 0.25)',
        transition: 'all 0.2s',
    },
    newBtn: {
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        padding: '16px', borderRadius: '16px',
        background: 'rgba(255,255,255,0.85)', color: '#475569',
        border: '2px solid #E2E8F0', cursor: 'pointer',
        fontSize: '1rem', fontWeight: 700,
        transition: 'all 0.2s',
    },
    autoReset: {
        marginTop: '16px', fontSize: '0.78rem', color: '#94A3B8',
        textAlign: 'center',
    },
    // ── Print ticket ──
    printTicket: {
        fontFamily: 'monospace',
    },
    thermalTicket: {
        width: '57mm', padding: '2mm', fontSize: '11px', boxSizing: 'border-box', margin: '0 auto',
    },
};
