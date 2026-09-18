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
    ChevronRight, FileText, Microscope, Check, Sparkles, User, Heart
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getBoxesDisponibles, getBoxBalanceado, isHorarioAtencion } from '../services/boxService';
import { fetchPatientByDniLive, getSaludoPorHora } from '../services/patientService';

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
    const [pacienteInfo, setPacienteInfo] = useState(null);
    const [buscandoPaciente, setBuscandoPaciente] = useState(false);

    const saludoActual = useMemo(() => getSaludoPorHora(), []);

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

    // Detección y búsqueda en tiempo real de paciente al tipear DNI
    useEffect(() => {
        const cleanDni = dni.replace(/\D/g, '').trim();
        if (cleanDni.length < 6) {
            setPacienteInfo(null);
            setBuscandoPaciente(false);
            return;
        }

        let active = true;
        setBuscandoPaciente(true);

        const timer = setTimeout(async () => {
            try {
                const info = await fetchPatientByDniLive(cleanDni);
                if (active) {
                    setPacienteInfo(info);
                    if (info?.displayName) {
                        try {
                            if ('speechSynthesis' in window) {
                                window.speechSynthesis.cancel();
                                const u = new SpeechSynthesisUtterance(`${saludoActual} ${info.displayName}`);
                                u.lang = 'es-AR';
                                u.rate = 0.95;
                                window.speechSynthesis.speak(u);
                            }
                        } catch (_) {}
                    }
                }
            } catch (err) {
                console.warn('[TurnoKiosco] Error buscando paciente:', err);
            } finally {
                if (active) setBuscandoPaciente(false);
            }
        }, 250);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [dni, saludoActual]);

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

            // 3. Obtener nombre del paciente (desde SALUS / Supabase)
            let nombrePaciente = pacienteInfo?.displayName || null;
            if (!nombrePaciente) {
                const live = await fetchPatientByDniLive(dni.trim());
                if (live?.displayName) {
                    nombrePaciente = live.displayName;
                    setPacienteInfo(live);
                }
            }

            // 4. Insertar turno
            const { data: turnoData, error: insertErr } = await supabase
                .from('turnos_cola')
                .insert({
                    numero_turno: numData,
                    tipo_tramite: tipo,
                    dni: dni.trim(),
                    nombre_paciente: nombrePaciente || null,
                    box_asignado: boxAsignado || 1,
                    estado: 'esperando',
                })
                .select()
                .single();

            if (insertErr) throw insertErr;

            setTurno({
                ...turnoData,
                nombre_paciente: nombrePaciente || turnoData.nombre_paciente
            });
            setStep(STEPS.TICKET);
            loadColaCount();
        } catch (err) {
            console.error('Error creating turno:', err);
            setError('Error al generar el turno. Intente nuevamente.');
        } finally {
            setLoading(false);
        }
    }, [dni, pacienteInfo, loadColaCount]);

    // Reset completo
    const handleReset = useCallback(() => {
        setStep(STEPS.DNI);
        setDni('');
        setTurno(null);
        setError(null);
        setPacienteInfo(null);
        setBuscandoPaciente(false);
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

                {/* ═══ PASO 1: INGRESAR DNI CON BIENVENIDA DE DR. BETO ═══ */}
                {step === STEPS.DNI && (isHorarioAtencion() || (boxesDisponibles && boxesDisponibles.length > 0)) && (
                    <div style={styles.selectContainer} className="no-print">
                        <form onSubmit={handleCreateTurno} style={{ maxWidth: '480px', margin: '0 auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            
                            {/* Dr. Beto Reception Card */}
                            <div style={styles.betoReceptionCard}>
                                <div style={styles.betoAvatarWrapper}>
                                    <img 
                                        src="/beto.jpg" 
                                        alt="Dr. Beto" 
                                        style={styles.betoAvatarImg}
                                    />
                                    <div style={styles.betoBadgeTag}>
                                        DR. BETO
                                    </div>
                                </div>

                                <div style={styles.betoSpeechWrapper}>
                                    <div style={styles.betoSpeechArrow} />
                                    {pacienteInfo ? (
                                        <div style={{ animation: 'fadeInUp 0.25s ease-out' }}>
                                            <div style={styles.betoGreetingHeader}>
                                                ¡{saludoActual}, <span style={{ color: '#1565C0', textDecoration: 'underline' }}>{pacienteInfo.displayName}</span>! 👋
                                            </div>
                                            <div style={styles.betoGreetingBody}>
                                                Qué bueno tenerte en Sanatorio Argentino. Confirmá tu DNI y presioná el botón para obtener tu turno.
                                            </div>
                                            {pacienteInfo.mutua && (
                                                <div style={styles.betoInfoPill}>
                                                    <span style={{ fontWeight: 700 }}>Cobertura:</span> {pacienteInfo.mutua}
                                                </div>
                                            )}
                                        </div>
                                    ) : buscandoPaciente ? (
                                        <div>
                                            <div style={styles.betoGreetingHeader}>
                                                ¡Hola! Verificando tus datos en SALUS...
                                            </div>
                                            <div style={styles.betoGreetingBody}>
                                                Aguardá un instante mientras te identificamos...
                                            </div>
                                        </div>
                                    ) : dni.length >= 7 ? (
                                        <div>
                                            <div style={styles.betoGreetingHeader}>
                                                ¡{saludoActual}! Te damos la bienvenida 👋
                                            </div>
                                            <div style={styles.betoGreetingBody}>
                                                Si tu DNI es correcto, presioná el botón para obtener tu turno.
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div style={styles.betoGreetingHeader}>
                                                ¡Hola! Te damos la bienvenida 👋
                                            </div>
                                            <div style={styles.betoGreetingBody}>
                                                Ingresá tu DNI en el teclado táctil para sacar tu turno de atención.
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={styles.dniSection}>
                                <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                                    <label style={styles.dniLabel}>
                                        Número de Documento (DNI)
                                    </label>
                                    <div style={{ color: '#64748B', fontSize: '0.78rem', fontWeight: '600' }}>
                                        Para cualquier tipo de trámite es obligatorio presentar DNI.
                                    </div>
                                </div>
                                
                                <div style={{ position: 'relative', maxWidth: '440px', margin: '0 auto', width: '100%' }}>
                                    <input
                                        type="text"
                                        value={dni}
                                        readOnly
                                        placeholder="Ej: 37298023"
                                        style={{
                                            ...styles.dniInput,
                                            borderColor: pacienteInfo ? '#1565C0' : '#CBD5E1',
                                            boxShadow: pacienteInfo ? '0 0 0 3px rgba(21, 101, 192, 0.15)' : 'none'
                                        }}
                                    />
                                    {buscandoPaciente && (
                                        <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }}>
                                            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', color: '#1565C0' }} />
                                        </div>
                                    )}
                                </div>

                                {/* Patient found confirmation pill */}
                                {pacienteInfo ? (
                                    <div style={styles.patientConfirmedCard}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={styles.greenCheckIcon}>✓</div>
                                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#065F46', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                Paciente identificado: {pacienteInfo.displayName}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ height: '6px' }} />
                                )}
                                
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
                                    maxWidth: '480px',
                                    margin: '6px auto 0',
                                    height: '50px',
                                    minHeight: '50px',
                                    borderRadius: '14px',
                                    background: (loading || !dni || dni.length < 6) ? '#94A3B8' : 'linear-gradient(135deg, #1565C0 0%, #0D3B66 100%)',
                                    color: '#fff',
                                    fontSize: '1.25rem',
                                    fontWeight: 800,
                                    border: 'none',
                                    cursor: (loading || !dni || dni.length < 6) ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: (loading || !dni || dni.length < 6) ? 'none' : '0 6px 18px rgba(21, 101, 192, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px',
                                    flexShrink: 0,
                                }}
                            >
                                {loading ? 'Generando Turno...' : pacienteInfo ? `Obtener Turno · ${pacienteInfo.displayName} →` : 'Obtener Número →'}
                            </button>
                        </form>

                        {loading && (
                            <div style={styles.loadingOverlay}>
                                <RefreshCw size={44} style={{ animation: 'spin 1s linear infinite', color: '#1565C0' }} />
                                <span style={{ fontSize: '1.3rem', color: '#0D3B66', marginTop: '16px', fontWeight: 700 }}>
                                    Generando tu turno en Sanatorio Argentino...
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ PASO 2: TICKET GENERADO CON DR. BETO ═══ */}
                {step === STEPS.TICKET && turno && (
                    <div style={styles.ticketContainer}>
                        <div style={styles.ticketCard} id="turno-ticket">
                            {/* Dr. Beto Host Banner */}
                            <div style={styles.ticketBetoHero}>
                                <div style={styles.ticketBetoAvatarWrapper}>
                                    <img 
                                        src="/beto.jpg" 
                                        alt="Dr. Beto" 
                                        style={styles.ticketBetoAvatarImg}
                                    />
                                    <div style={styles.ticketBetoCheckBadge}>
                                        <Check size={26} color="#fff" strokeWidth={3} />
                                    </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={styles.ticketBetoRoleTag}>
                                        DR. BETO · ADMISIÓN CENTRAL
                                    </div>
                                    <h2 style={styles.ticketPersonalGreeting}>
                                        ¡{saludoActual}, <span style={{ color: '#1565C0' }}>{turno.nombre_paciente || pacienteInfo?.displayName || 'Paciente'}</span>!
                                    </h2>
                                    <p style={styles.ticketPersonalSub}>
                                        Te damos la bienvenida. Tu llegada ya fue registrada con éxito en Administración.
                                    </p>
                                </div>
                            </div>

                            {/* Turno Number Box */}
                            <div style={styles.ticketNumberWrapper}>
                                <span style={styles.ticketNumberLabel}>TU NÚMERO DE TURNO</span>
                                <div style={styles.ticketNumberBig}>
                                    {turno.numero_turno}
                                </div>
                            </div>

                            {/* Turno metadata grid */}
                            <div style={styles.ticketMetaGrid}>
                                <div style={styles.ticketMetaCard}>
                                    <span style={styles.ticketMetaLabel}>DNI</span>
                                    <span style={styles.ticketMetaValue}>{turno.dni}</span>
                                </div>
                                <div style={styles.ticketMetaCard}>
                                    <span style={styles.ticketMetaLabel}>DESTINO</span>
                                    <span style={styles.ticketMetaValue}>
                                        {turno.box_asignado ? `Box ${turno.box_asignado}` : 'Administración General'}
                                    </span>
                                </div>
                            </div>

                            {/* Waiting guidance */}
                            <div style={styles.ticketWaitCard}>
                                <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0D3B66', marginBottom: '6px' }}>
                                    Por favor tomá asiento en la sala de espera
                                </div>
                                <div style={{ fontSize: '1.25rem', color: '#475569', fontWeight: 600 }}>
                                    Te llamaremos por los monitores y altavoces de atención.
                                </div>
                            </div>

                            {/* Progress bar and reset */}
                            <div style={styles.ticketAutoResetWrapper}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', color: '#94A3B8', fontWeight: 600, marginBottom: '8px' }}>
                                    <span>La pantalla volverá al inicio automáticamente</span>
                                    <span>8 segundos</span>
                                </div>
                                <div style={styles.ticketProgressBarBg}>
                                    <div style={styles.ticketProgressBarFill} />
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleReset}
                                style={styles.ticketNewTurnoBtn}
                            >
                                Finalizar / Siguiente Turno
                            </button>
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

                /* Prevent text selection and scrolling on kiosk */
                * { 
                    -webkit-user-select: none; 
                    user-select: none; 
                    box-sizing: border-box;
                }
                input { -webkit-user-select: text; user-select: text; }
                html, body {
                    overflow: hidden !important;
                    height: 100% !important;
                    max-height: 100dvh !important;
                    touch-action: manipulation;
                }
            `}</style>
        </div>
    );
}

// ─── Estilos (Optimizados para tablet vertical + personas mayores) ───
const styles = {
    container: {
        height: '100dvh',
        maxHeight: '100dvh',
        width: '100vw',
        maxWidth: '100vw',
        background: '#F0F4F8',
        fontFamily: "'Inter', -apple-system, sans-serif",
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
    },
    bgOverlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(180deg, #E8F0FE 0%, #F0F4F8 100%)',
        zIndex: 0,
    },
    header: {
        position: 'relative', zIndex: 10,
        background: 'rgba(255,255,255,0.96)',
        borderBottom: '1.5px solid rgba(21, 101, 192, 0.12)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
        flexShrink: 0,
    },
    headerInner: {
        padding: '6px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
    logo: { width: '42px', height: '42px', borderRadius: '10px', objectFit: 'contain' },
    headerTitle: {
        margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0D3B66', lineHeight: 1.15,
    },
    headerSubtitle: {
        margin: 0, fontSize: '0.75rem', color: '#64748B', fontWeight: 500,
    },
    headerRight: { textAlign: 'right' },
    headerTime: {
        display: 'block', fontSize: '1.35rem', fontWeight: 800, color: '#0D3B66', lineHeight: 1.15,
    },
    headerDate: {
        fontSize: '0.75rem', color: '#64748B', textTransform: 'capitalize',
    },
    main: {
        position: 'relative', zIndex: 10,
        padding: '6px 14px 8px',
        flex: 1,
        minHeight: 0,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box',
    },
    // ── Select step ──
    selectContainer: {
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeInUp 0.3s ease-out',
        overflow: 'hidden',
    },
    dniSection: {
        background: 'rgba(255,255,255,0.95)',
        borderRadius: '18px',
        padding: '8px 12px',
        border: '1.5px solid #E2E8F0',
        boxShadow: '0 3px 12px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
    },
    dniLabel: {
        display: 'block', fontSize: '1.05rem', fontWeight: 800, color: '#0D3B66',
        marginBottom: '1px', textAlign: 'center',
    },
    dniOptional: { fontSize: '0.75rem', fontWeight: 500, color: '#94A3B8' },
    dniInput: {
        width: '100%', padding: '4px 12px',
        borderRadius: '12px',
        border: '2px solid #CBD5E1',
        fontSize: '2rem', fontWeight: 800,
        color: '#0D3B66', letterSpacing: '2px',
        outline: 'none', transition: 'all 0.2s',
        background: '#FAFBFC',
        boxSizing: 'border-box',
        height: '48px',
        textAlign: 'center',
    },
    keypad: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '6px',
        maxWidth: '440px',
        margin: '6px auto 0',
        width: '100%',
    },
    keypadBtn: {
        background: '#F8FAFC',
        border: '2px solid #E2E8F0',
        borderRadius: '12px',
        padding: '0',
        fontSize: '1.75rem',
        fontWeight: 800,
        color: '#0D3B66',
        cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
        transition: 'all 0.1s',
        WebkitTapHighlightColor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '44px',
        minHeight: '44px',
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

    // ── Dr. Beto Reception Card ──
    betoReceptionCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: '#FFFFFF',
        border: '2px solid #BFDBFE',
        borderRadius: '16px',
        padding: '8px 12px',
        marginBottom: '6px',
        boxShadow: '0 4px 16px rgba(21, 101, 192, 0.06)',
        position: 'relative',
        animation: 'fadeInUp 0.3s ease-out',
        flexShrink: 0,
    },
    betoAvatarWrapper: {
        position: 'relative',
        width: '60px',
        height: '60px',
        flexShrink: 0,
    },
    betoAvatarImg: {
        width: '100%',
        height: '100%',
        borderRadius: '14px',
        objectFit: 'cover',
        objectPosition: 'top',
        border: '2.5px solid #1565C0',
        boxShadow: '0 3px 10px rgba(21, 101, 192, 0.2)',
    },
    betoBadgeTag: {
        position: 'absolute',
        bottom: '-6px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1565C0',
        color: '#FFFFFF',
        fontSize: '0.62rem',
        fontWeight: 900,
        padding: '2px 7px',
        borderRadius: '8px',
        letterSpacing: '0.5px',
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
    },
    betoSpeechWrapper: {
        flex: 1,
        background: '#F0F7FF',
        border: '1.5px solid #DBEAFE',
        borderRadius: '12px',
        padding: '6px 12px',
        position: 'relative',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
    },
    betoSpeechArrow: {
        position: 'absolute',
        left: '-8px',
        top: '20px',
        width: 0,
        height: 0,
        borderTop: '6px solid transparent',
        borderBottom: '6px solid transparent',
        borderRight: '8px solid #DBEAFE',
    },
    betoGreetingHeader: {
        fontSize: '1.05rem',
        fontWeight: 900,
        color: '#0D3B66',
        lineHeight: 1.2,
        marginBottom: '2px',
    },
    betoGreetingBody: {
        fontSize: '0.8rem',
        color: '#334155',
        fontWeight: 500,
        lineHeight: 1.25,
    },
    betoInfoPill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        marginTop: '3px',
        background: '#DBEAFE',
        color: '#1E40AF',
        padding: '2px 8px',
        borderRadius: '8px',
        fontSize: '0.72rem',
        fontWeight: 700,
    },
    patientConfirmedCard: {
        background: '#ECFDF5',
        border: '1.5px solid #6EE7B7',
        borderRadius: '10px',
        padding: '4px 12px',
        marginTop: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeInUp 0.25s ease-out',
        height: '28px',
        boxSizing: 'border-box',
    },
    greenCheckIcon: {
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        background: '#10B981',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 900,
        fontSize: '0.75rem',
        flexShrink: 0,
    },

    // ── Ticket Hero con Dr. Beto ──
    ticketBetoHero: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        marginBottom: '10px',
        textAlign: 'left',
        background: '#F0F7FF',
        padding: '10px 14px',
        borderRadius: '16px',
        border: '1.5px solid #BFDBFE',
    },
    ticketBetoAvatarWrapper: {
        position: 'relative',
        width: '56px',
        height: '56px',
        flexShrink: 0,
    },
    ticketBetoAvatarImg: {
        width: '100%',
        height: '100%',
        borderRadius: '14px',
        objectFit: 'cover',
        objectPosition: 'top',
        border: '2.5px solid #1565C0',
    },
    ticketBetoCheckBadge: {
        position: 'absolute',
        bottom: '-4px',
        right: '-4px',
        background: '#10B981',
        borderRadius: '50%',
        width: '24px',
        height: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.45)',
        border: '2px solid #FFFFFF',
    },
    ticketBetoRoleTag: {
        display: 'inline-block',
        background: '#1565C0',
        color: '#FFFFFF',
        fontSize: '0.62rem',
        fontWeight: 900,
        padding: '2px 7px',
        borderRadius: '6px',
        letterSpacing: '0.5px',
        marginBottom: '2px',
    },
    ticketPersonalGreeting: {
        margin: '0 0 2px',
        fontSize: '1.25rem',
        fontWeight: 900,
        color: '#0D3B66',
        lineHeight: 1.15,
    },
    ticketPersonalSub: {
        margin: 0,
        fontSize: '0.78rem',
        color: '#475569',
        fontWeight: 500,
    },
    ticketNumberWrapper: {
        background: '#FFFFFF',
        border: '2px solid #1565C0',
        borderRadius: '16px',
        padding: '8px',
        margin: '8px 0',
        boxShadow: '0 4px 16px rgba(21, 101, 192, 0.1)',
    },
    ticketNumberLabel: {
        display: 'block',
        fontSize: '0.75rem',
        fontWeight: 800,
        color: '#64748B',
        letterSpacing: '1.5px',
        marginBottom: '2px',
    },
    ticketNumberBig: {
        fontSize: '4.2rem',
        fontWeight: 900,
        color: '#1565C0',
        letterSpacing: '3px',
        lineHeight: 1,
        animation: 'pulseNumber 3s ease-in-out infinite',
    },
    ticketMetaGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        marginBottom: '8px',
    },
    ticketMetaCard: {
        background: '#F8FAFC',
        border: '1.5px solid #E2E8F0',
        borderRadius: '12px',
        padding: '8px',
        textAlign: 'center',
    },
    ticketMetaLabel: {
        display: 'block',
        fontSize: '0.72rem',
        fontWeight: 700,
        color: '#64748B',
        marginBottom: '2px',
    },
    ticketMetaValue: {
        fontSize: '1.2rem',
        fontWeight: 900,
        color: '#0D3B66',
    },
    ticketWaitCard: {
        background: '#EFF6FF',
        border: '1.5px solid #BFDBFE',
        borderRadius: '12px',
        padding: '8px 12px',
        marginBottom: '8px',
        textAlign: 'center',
    },
    ticketAutoResetWrapper: {
        width: '100%',
        marginBottom: '8px',
    },
    ticketProgressBarBg: {
        width: '100%',
        height: '6px',
        background: '#E2E8F0',
        borderRadius: '6px',
        overflow: 'hidden',
    },
    ticketProgressBarFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #1565C0, #10B981)',
        borderRadius: '6px',
        animation: 'shrinkBar 8s linear forwards',
    },
    ticketNewTurnoBtn: {
        width: '100%',
        padding: '10px 16px',
        borderRadius: '12px',
        background: '#FFFFFF',
        color: '#475569',
        border: '2px solid #CBD5E1',
        fontSize: '1.05rem',
        fontWeight: 800,
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    },
};
