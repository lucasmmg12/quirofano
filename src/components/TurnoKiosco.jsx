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
                        <form onSubmit={handleCreateTurno} style={{ maxWidth: '850px', margin: '0 auto', width: '100%' }}>
                            
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
                                        <div style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                                            <div style={styles.betoGreetingHeader}>
                                                ¡{saludoActual}, <span style={{ color: '#1565C0', textDecoration: 'underline' }}>{pacienteInfo.displayName}</span>! 👋
                                            </div>
                                            <div style={styles.betoGreetingBody}>
                                                Qué bueno tenerte en Sanatorio Argentino. Por favor confirmá tu DNI y presioná el botón para obtener tu número de atención.
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
                                                Por favor ingresá tu número de DNI en la pantalla táctil para sacar tu turno de atención.
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={styles.dniSection}>
                                <label style={{ ...styles.dniLabel, fontSize: '1.8rem', marginBottom: '4px', textAlign: 'center' }}>
                                    Número de Documento (DNI)
                                </label>
                                <div style={{ color: '#64748B', fontSize: '1.1rem', fontWeight: '600', marginBottom: '16px', textAlign: 'center' }}>
                                    Para cualquier tipo de trámite es obligatorio presentar DNI.
                                </div>
                                
                                <div style={{ position: 'relative', maxWidth: '520px', margin: '0 auto' }}>
                                    <input
                                        type="text"
                                        value={dni}
                                        readOnly
                                        placeholder="Ej: 37298023"
                                        style={{
                                            ...styles.dniInput,
                                            textAlign: 'center',
                                            fontSize: '3.2rem',
                                            padding: '16px',
                                            height: '84px',
                                            borderRadius: '24px',
                                            cursor: 'default',
                                            borderColor: pacienteInfo ? '#1565C0' : '#CBD5E1',
                                            boxShadow: pacienteInfo ? '0 0 0 4px rgba(21, 101, 192, 0.15)' : 'none'
                                        }}
                                    />
                                    {buscandoPaciente && (
                                        <div style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)' }}>
                                            <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', color: '#1565C0' }} />
                                        </div>
                                    )}
                                </div>

                                {/* Patient found confirmation pill */}
                                {pacienteInfo && (
                                    <div style={styles.patientConfirmedCard}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={styles.greenCheckIcon}>✓</div>
                                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0D3B66' }}>
                                                Paciente identificado: {pacienteInfo.displayName}
                                            </span>
                                        </div>
                                    </div>
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
                                    padding: '24px',
                                    borderRadius: '24px',
                                    background: (loading || !dni || dni.length < 6) ? '#94A3B8' : 'linear-gradient(135deg, #1565C0 0%, #0D3B66 100%)',
                                    color: '#fff',
                                    fontSize: '2.2rem',
                                    fontWeight: 800,
                                    border: 'none',
                                    marginTop: '16px',
                                    cursor: (loading || !dni || dni.length < 6) ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: (loading || !dni || dni.length < 6) ? 'none' : '0 10px 28px rgba(21, 101, 192, 0.35)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '12px'
                                }}
                            >
                                {loading ? 'Generando Turno...' : pacienteInfo ? `Obtener Número · ${pacienteInfo.displayName} →` : 'Obtener Número →'}
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

    // ── Dr. Beto Reception Card ──
    betoReceptionCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        background: '#FFFFFF',
        border: '2.5px solid #BFDBFE',
        borderRadius: '28px',
        padding: '24px 28px',
        marginBottom: '24px',
        boxShadow: '0 8px 32px rgba(21, 101, 192, 0.08)',
        position: 'relative',
        animation: 'fadeInUp 0.35s ease-out',
    },
    betoAvatarWrapper: {
        position: 'relative',
        width: '120px',
        height: '120px',
        flexShrink: 0,
    },
    betoAvatarImg: {
        width: '100%',
        height: '100%',
        borderRadius: '24px',
        objectFit: 'cover',
        objectPosition: 'top',
        border: '3px solid #1565C0',
        boxShadow: '0 6px 20px rgba(21, 101, 192, 0.25)',
    },
    betoBadgeTag: {
        position: 'absolute',
        bottom: '-10px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1565C0',
        color: '#FFFFFF',
        fontSize: '0.8rem',
        fontWeight: 900,
        padding: '3px 12px',
        borderRadius: '12px',
        letterSpacing: '1px',
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
    },
    betoSpeechWrapper: {
        flex: 1,
        background: '#F0F7FF',
        border: '2px solid #DBEAFE',
        borderRadius: '22px',
        padding: '20px 24px',
        position: 'relative',
        textAlign: 'left',
    },
    betoSpeechArrow: {
        position: 'absolute',
        left: '-12px',
        top: '36px',
        width: 0,
        height: 0,
        borderTop: '10px solid transparent',
        borderBottom: '10px solid transparent',
        borderRight: '12px solid #DBEAFE',
    },
    betoGreetingHeader: {
        fontSize: '1.85rem',
        fontWeight: 900,
        color: '#0D3B66',
        lineHeight: 1.25,
        marginBottom: '6px',
    },
    betoGreetingBody: {
        fontSize: '1.2rem',
        color: '#334155',
        fontWeight: 500,
        lineHeight: 1.45,
    },
    betoInfoPill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: '12px',
        background: '#DBEAFE',
        color: '#1E40AF',
        padding: '6px 14px',
        borderRadius: '12px',
        fontSize: '1.05rem',
        fontWeight: 700,
    },
    patientConfirmedCard: {
        background: '#ECFDF5',
        border: '2px solid #6EE7B7',
        borderRadius: '20px',
        padding: '14px 24px',
        marginTop: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeInUp 0.3s ease-out',
    },
    greenCheckIcon: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: '#10B981',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 900,
        fontSize: '1.2rem',
        flexShrink: 0,
    },

    // ── Ticket Hero con Dr. Beto ──
    ticketBetoHero: {
        display: 'flex',
        alignItems: 'center',
        gap: '28px',
        marginBottom: '28px',
        textAlign: 'left',
        background: '#F0F7FF',
        padding: '24px 28px',
        borderRadius: '28px',
        border: '2.5px solid #BFDBFE',
        boxShadow: '0 4px 20px rgba(21, 101, 192, 0.08)',
    },
    ticketBetoAvatarWrapper: {
        position: 'relative',
        width: '130px',
        height: '130px',
        flexShrink: 0,
    },
    ticketBetoAvatarImg: {
        width: '100%',
        height: '100%',
        borderRadius: '28px',
        objectFit: 'cover',
        objectPosition: 'top',
        border: '4px solid #1565C0',
        boxShadow: '0 8px 24px rgba(21, 101, 192, 0.28)',
    },
    ticketBetoCheckBadge: {
        position: 'absolute',
        bottom: '-6px',
        right: '-6px',
        background: '#10B981',
        borderRadius: '50%',
        width: '42px',
        height: '42px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.45)',
        border: '3px solid #FFFFFF',
    },
    ticketBetoRoleTag: {
        display: 'inline-block',
        background: '#1565C0',
        color: '#FFFFFF',
        fontSize: '0.85rem',
        fontWeight: 900,
        padding: '4px 14px',
        borderRadius: '12px',
        letterSpacing: '1px',
        marginBottom: '8px',
    },
    ticketPersonalGreeting: {
        margin: '0 0 6px',
        fontSize: '2.4rem',
        fontWeight: 900,
        color: '#0D3B66',
        lineHeight: 1.2,
    },
    ticketPersonalSub: {
        margin: 0,
        fontSize: '1.25rem',
        color: '#475569',
        fontWeight: 500,
    },
    ticketNumberWrapper: {
        background: '#FFFFFF',
        border: '3px solid #1565C0',
        borderRadius: '24px',
        padding: '24px',
        margin: '20px 0',
        boxShadow: '0 8px 30px rgba(21, 101, 192, 0.12)',
    },
    ticketNumberLabel: {
        display: 'block',
        fontSize: '1.2rem',
        fontWeight: 800,
        color: '#64748B',
        letterSpacing: '2px',
        marginBottom: '6px',
    },
    ticketNumberBig: {
        fontSize: '7.5rem',
        fontWeight: 900,
        color: '#1565C0',
        letterSpacing: '4px',
        lineHeight: 1,
        animation: 'pulseNumber 3s ease-in-out infinite',
    },
    ticketMetaGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '16px',
        marginBottom: '20px',
    },
    ticketMetaCard: {
        background: '#F8FAFC',
        border: '2px solid #E2E8F0',
        borderRadius: '20px',
        padding: '16px',
        textAlign: 'center',
    },
    ticketMetaLabel: {
        display: 'block',
        fontSize: '1rem',
        fontWeight: 700,
        color: '#64748B',
        marginBottom: '4px',
    },
    ticketMetaValue: {
        fontSize: '1.8rem',
        fontWeight: 900,
        color: '#0D3B66',
    },
    ticketWaitCard: {
        background: '#EFF6FF',
        border: '2px solid #BFDBFE',
        borderRadius: '22px',
        padding: '20px 24px',
        marginBottom: '24px',
        textAlign: 'center',
    },
    ticketAutoResetWrapper: {
        width: '100%',
        marginBottom: '20px',
    },
    ticketProgressBarBg: {
        width: '100%',
        height: '8px',
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
        padding: '18px 24px',
        borderRadius: '18px',
        background: '#FFFFFF',
        color: '#475569',
        border: '2px solid #CBD5E1',
        fontSize: '1.3rem',
        fontWeight: 800,
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
    },
};
