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
    HelpCircle, ArrowLeft, CheckCircle, Printer, RefreshCw,
    ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const ICON_MAP = {
    Receipt, ShieldCheck, Building2, Users, Baby, HelpCircle,
};

const STEPS = { DNI: 'dni', SELECT: 'select', SUB_SELECT: 'sub_select', TICKET: 'ticket' };

export default function TurnoKiosco() {
    const [config, setConfig] = useState([]);
    const [step, setStep] = useState(STEPS.SELECT);
    const [dni, setDni] = useState('');
    const [selectedType, setSelectedType] = useState(null);
    const [selectedGrupo, setSelectedGrupo] = useState(null);
    const [turno, setTurno] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [colaCount, setColaCount] = useState({});

    // Cargar configuración
    useEffect(() => {
        supabase.from('turnos_config').select('*').eq('activo', true).order('orden')
            .then(({ data }) => setConfig(data || []));
    }, []);

    // Construir estructura jerárquica
    const menuItems = useMemo(() => {
        const items = [];
        const gruposProcessed = new Set();

        config.forEach(cfg => {
            if (cfg.grupo) {
                // Tiene grupo → agregar grupo padre (una sola vez)
                if (!gruposProcessed.has(cfg.grupo)) {
                    gruposProcessed.add(cfg.grupo);
                    items.push({
                        type: 'group',
                        key: cfg.grupo,
                        label: cfg.grupo_label || cfg.grupo,
                        icono: cfg.grupo_icono || 'ShieldCheck',
                        color: cfg.grupo_color || '#8B5CF6',
                        children: config.filter(c => c.grupo === cfg.grupo),
                    });
                }
            } else {
                // Sin grupo → botón directo
                items.push({
                    type: 'direct',
                    key: cfg.tipo_tramite,
                    ...cfg,
                });
            }
        });

        return items;
    }, [config]);

    // Sub-opciones del grupo seleccionado
    const subItems = useMemo(() => {
        if (!selectedGrupo) return [];
        const group = menuItems.find(m => m.type === 'group' && m.key === selectedGrupo);
        return group?.children || [];
    }, [selectedGrupo, menuItems]);

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

    // Crear turno
    const handleCreateTurno = useCallback(async (tipo) => {
        setLoading(true);
        setError(null);
        try {
            // 1. Obtener próximo número
            const { data: numData, error: numErr } = await supabase
                .rpc('next_turno_number', { p_tipo: tipo });
            if (numErr) throw numErr;

            // 2. Obtener box default
            const cfgItem = config.find(c => c.tipo_tramite === tipo);
            const boxAsignado = cfgItem?.box_default || 1;

            // 3. Buscar nombre del paciente por DNI
            let nombrePaciente = null;
            if (dni.trim()) {
                const { data: paciente } = await supabase
                    .from('hospital_pacientes')
                    .select('nombre')
                    .eq('dni', dni.trim())
                    .limit(1)
                    .maybeSingle();
                if (paciente?.nombre) {
                    nombrePaciente = paciente.nombre;
                }
            }

            // 4. Insertar turno
            const { data: turnoData, error: insertErr } = await supabase
                .from('turnos_cola')
                .insert({
                    numero_turno: numData,
                    tipo_tramite: tipo,
                    dni: dni.trim() || null,
                    nombre_paciente: nombrePaciente,
                    box_asignado: boxAsignado,
                    estado: 'esperando',
                })
                .select()
                .single();

            if (insertErr) throw insertErr;

            setTurno(turnoData);
            setSelectedType(cfgItem);
            setStep(STEPS.TICKET);
            loadColaCount();
        } catch (err) {
            console.error('Error creating turno:', err);
            setError('Error al generar el turno. Intente nuevamente.');
        } finally {
            setLoading(false);
        }
    }, [config, dni, loadColaCount]);

    // Seleccionar item del menú
    const handleMenuClick = useCallback((item) => {
        if (item.type === 'group') {
            setSelectedGrupo(item.key);
            setStep(STEPS.SUB_SELECT);
        } else {
            handleCreateTurno(item.tipo_tramite);
        }
    }, [handleCreateTurno]);

    // Volver de sub-selección al menú principal
    const handleBackToMenu = useCallback(() => {
        setStep(STEPS.SELECT);
        setSelectedGrupo(null);
    }, []);

    // Reset completo
    const handleReset = useCallback(() => {
        setStep(STEPS.SELECT);
        setDni('');
        setTurno(null);
        setSelectedType(null);
        setSelectedGrupo(null);
        setError(null);
    }, []);

    // Auto-reset después de 15 segundos en la pantalla de ticket
    useEffect(() => {
        if (step === STEPS.TICKET) {
            const timer = setTimeout(handleReset, 15000);
            return () => clearTimeout(timer);
        }
    }, [step, handleReset]);

    // Intentar imprimir ticket
    const handlePrint = () => {
        window.print();
    };

    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

    // Helper: descripción largo para el ticket (incluye grupo si aplica)
    const getTicketTramiteLabel = () => {
        if (!selectedType) return '';
        if (selectedType.grupo_label) {
            return `${selectedType.grupo_label} — ${selectedType.label}`;
        }
        return selectedType.label;
    };

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
                {/* ═══ PASO 1: SELECCIONAR TRÁMITE (Menú principal) ═══ */}
                {step === STEPS.SELECT && (
                    <div style={styles.selectContainer} className="no-print">
                        {/* DNI input (optional) */}
                        <div style={styles.dniSection}>
                            <label style={styles.dniLabel}>
                                ¿Tenés tu DNI? <span style={styles.dniOptional}>(opcional)</span>
                            </label>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="Ingresá tu DNI"
                                value={dni}
                                onChange={e => setDni(e.target.value.replace(/\D/g, ''))}
                                style={styles.dniInput}
                                maxLength={10}
                            />
                        </div>

                        <h2 style={styles.selectTitle}>¿Qué trámite necesitás realizar?</h2>

                        <div style={styles.grid}>
                            {menuItems.map((item, idx) => {
                                const Icon = ICON_MAP[item.icono || item.type === 'group' ? item.icono : item.icono] || HelpCircle;
                                const isGroup = item.type === 'group';
                                const waitCount = isGroup
                                    ? getGroupWaitCount(item.children)
                                    : (colaCount[item.tipo_tramite] || 0);
                                const itemColor = isGroup ? item.color : item.color;
                                const num = idx + 1;

                                return (
                                    <button
                                        key={item.key}
                                        onClick={() => handleMenuClick(item)}
                                        disabled={loading}
                                        style={{
                                            ...styles.tramiteBtn,
                                            borderColor: itemColor + '40',
                                            opacity: loading ? 0.6 : 1,
                                        }}
                                        onTouchStart={e => {
                                            e.currentTarget.style.transform = 'scale(0.97)';
                                            e.currentTarget.style.boxShadow = `0 4px 24px ${itemColor}30`;
                                        }}
                                        onTouchEnd={e => {
                                            e.currentTarget.style.transform = 'scale(1)';
                                            e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.06)';
                                        }}
                                        onMouseDown={e => {
                                            e.currentTarget.style.transform = 'scale(0.97)';
                                            e.currentTarget.style.boxShadow = `0 4px 24px ${itemColor}30`;
                                        }}
                                        onMouseUp={e => {
                                            e.currentTarget.style.transform = 'scale(1)';
                                            e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.06)';
                                        }}
                                    >
                                        {/* Number badge */}
                                        <div style={{
                                            ...styles.numberBadge,
                                            background: itemColor,
                                        }}>
                                            {num}
                                        </div>

                                        <div style={{
                                            ...styles.tramiteIconWrap,
                                            background: itemColor + '14',
                                            border: `2px solid ${itemColor}30`,
                                        }}>
                                            <Icon size={40} style={{ color: itemColor }} />
                                        </div>

                                        <span style={styles.tramiteLabel}>{item.label}</span>

                                        {isGroup && (
                                            <span style={{
                                                ...styles.subBadge,
                                                color: itemColor,
                                                background: itemColor + '10',
                                                border: `1px solid ${itemColor}25`,
                                            }}>
                                                <ChevronRight size={14} />
                                                {item.children.length} opciones
                                            </span>
                                        )}

                                        {waitCount > 0 && (
                                            <span style={{
                                                ...styles.waitBadge,
                                                background: itemColor + '14',
                                                color: itemColor,
                                                border: `1px solid ${itemColor}30`,
                                            }}>
                                                {waitCount} en espera
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {error && (
                            <div style={styles.errorBanner}>
                                {error}
                            </div>
                        )}

                        {loading && (
                            <div style={styles.loadingOverlay}>
                                <RefreshCw size={40} style={{ animation: 'spin 1s linear infinite', color: '#1565C0' }} />
                                <span style={{ fontSize: '1.1rem', color: '#475569', marginTop: '12px' }}>
                                    Generando turno...
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ PASO 1.5: SUB-OPCIONES (ej: Autorizaciones) ═══ */}
                {step === STEPS.SUB_SELECT && (
                    <div style={styles.selectContainer} className="no-print">
                        <button
                            onClick={handleBackToMenu}
                            style={styles.backBtn}
                        >
                            <ArrowLeft size={20} />
                            Volver al menú
                        </button>

                        {/* Grupo header */}
                        {(() => {
                            const group = menuItems.find(m => m.key === selectedGrupo);
                            if (!group) return null;
                            const GrpIcon = ICON_MAP[group.icono] || ShieldCheck;
                            return (
                                <div style={{
                                    ...styles.groupHeader,
                                    borderColor: group.color + '30',
                                    background: group.color + '08',
                                }}>
                                    <div style={{
                                        ...styles.groupHeaderIcon,
                                        background: group.color + '18',
                                        border: `2px solid ${group.color}30`,
                                    }}>
                                        <GrpIcon size={32} style={{ color: group.color }} />
                                    </div>
                                    <h2 style={{ ...styles.groupHeaderTitle, color: group.color }}>
                                        {group.label}
                                    </h2>
                                    <p style={styles.groupHeaderSub}>Seleccioná el tipo de autorización</p>
                                </div>
                            );
                        })()}

                        <div style={styles.subGrid}>
                            {subItems.map((cfg, idx) => {
                                const Icon = ICON_MAP[cfg.icono] || HelpCircle;
                                const waitCount = colaCount[cfg.tipo_tramite] || 0;
                                const subNum = `2.${idx + 1}`;
                                return (
                                    <button
                                        key={cfg.tipo_tramite}
                                        onClick={() => handleCreateTurno(cfg.tipo_tramite)}
                                        disabled={loading}
                                        style={{
                                            ...styles.subBtn,
                                            borderColor: cfg.color + '40',
                                            opacity: loading ? 0.6 : 1,
                                        }}
                                        onTouchStart={e => {
                                            e.currentTarget.style.transform = 'scale(0.97)';
                                            e.currentTarget.style.boxShadow = `0 4px 24px ${cfg.color}30`;
                                        }}
                                        onTouchEnd={e => {
                                            e.currentTarget.style.transform = 'scale(1)';
                                            e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.06)';
                                        }}
                                        onMouseDown={e => {
                                            e.currentTarget.style.transform = 'scale(0.97)';
                                            e.currentTarget.style.boxShadow = `0 4px 24px ${cfg.color}30`;
                                        }}
                                        onMouseUp={e => {
                                            e.currentTarget.style.transform = 'scale(1)';
                                            e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.06)';
                                        }}
                                    >
                                        <div style={{
                                            ...styles.numberBadge,
                                            background: cfg.color,
                                            fontSize: '0.7rem',
                                            width: '30px',
                                            height: '30px',
                                        }}>
                                            {subNum}
                                        </div>

                                        <div style={{
                                            ...styles.subIconWrap,
                                            background: cfg.color + '14',
                                            border: `2px solid ${cfg.color}30`,
                                        }}>
                                            <Icon size={36} style={{ color: cfg.color }} />
                                        </div>

                                        <span style={styles.subLabel}>{cfg.label}</span>

                                        {waitCount > 0 && (
                                            <span style={{
                                                ...styles.waitBadge,
                                                background: cfg.color + '14',
                                                color: cfg.color,
                                                border: `1px solid ${cfg.color}30`,
                                            }}>
                                                {waitCount} en espera
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {error && (
                            <div style={styles.errorBanner}>
                                {error}
                            </div>
                        )}

                        {loading && (
                            <div style={styles.loadingOverlay}>
                                <RefreshCw size={40} style={{ animation: 'spin 1s linear infinite', color: '#1565C0' }} />
                                <span style={{ fontSize: '1.1rem', color: '#475569', marginTop: '12px' }}>
                                    Generando turno...
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ PASO 2: TICKET GENERADO ═══ */}
                {step === STEPS.TICKET && turno && (
                    <div style={styles.ticketContainer}>
                        {/* Ticket visual */}
                        <div style={styles.ticketCard} id="turno-ticket">
                            <div style={styles.ticketHeader}>
                                <CheckCircle size={36} style={{ color: '#16A34A' }} />
                                <h2 style={styles.ticketSuccessText}>¡Tu turno fue generado!</h2>
                            </div>

                            <div style={{
                                ...styles.ticketNumber,
                                color: selectedType?.color || '#1565C0',
                                borderColor: (selectedType?.color || '#1565C0') + '30',
                                background: (selectedType?.color || '#1565C0') + '08',
                            }}>
                                {turno.numero_turno}
                            </div>

                            <div style={styles.ticketInfo}>
                                <div style={styles.ticketInfoRow}>
                                    <span style={styles.ticketInfoLabel}>Trámite</span>
                                    <span style={{
                                        ...styles.ticketInfoValue,
                                        fontSize: selectedType?.grupo_label ? '0.82rem' : '0.95rem',
                                        textAlign: 'right',
                                        maxWidth: '220px',
                                    }}>
                                        {getTicketTramiteLabel()}
                                    </span>
                                </div>
                                <div style={styles.ticketInfoRow}>
                                    <span style={styles.ticketInfoLabel}>Box</span>
                                    <span style={styles.ticketInfoValue}>Box {turno.box_asignado}</span>
                                </div>
                                {turno.dni && (
                                    <div style={styles.ticketInfoRow}>
                                        <span style={styles.ticketInfoLabel}>DNI</span>
                                        <span style={styles.ticketInfoValue}>{turno.dni}</span>
                                    </div>
                                )}
                                <div style={styles.ticketInfoRow}>
                                    <span style={styles.ticketInfoLabel}>Hora</span>
                                    <span style={styles.ticketInfoValue}>{timeStr}</span>
                                </div>
                            </div>

                            <p style={styles.ticketWait}>
                                Por favor, aguardá a ser llamado/a
                            </p>
                        </div>

                        {/* Botones */}
                        <div style={styles.ticketActions} className="no-print">
                            <button onClick={handlePrint} style={styles.printBtn}>
                                <Printer size={20} /> Imprimir Ticket
                            </button>
                            <button onClick={handleReset} style={styles.newBtn}>
                                <ArrowLeft size={20} /> Nuevo Turno
                            </button>
                        </div>

                        {/* Auto-reset indicator */}
                        <p style={styles.autoReset} className="no-print">
                            Esta pantalla vuelve al inicio automáticamente en 15 segundos
                        </p>
                    </div>
                )}
            </main>

            {/* Print-only ticket (thermal 80mm) */}
            <div className="print-only" style={styles.printTicket}>
                {turno && (
                    <div style={styles.thermalTicket}>
                        <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
                            <strong style={{ fontSize: '14px' }}>SANATORIO ARGENTINO</strong>
                            <br />
                            <span style={{ fontSize: '10px' }}>Administración y Atención al Paciente</span>
                        </div>
                        <div style={{ textAlign: 'center', margin: '12px 0' }}>
                            <div style={{ fontSize: '48px', fontWeight: 900, letterSpacing: '2px' }}>
                                {turno.numero_turno}
                            </div>
                        </div>
                        <div style={{ fontSize: '12px', borderTop: '1px dashed #000', paddingTop: '8px' }}>
                            <div><strong>Trámite:</strong> {getTicketTramiteLabel()}</div>
                            <div><strong>Box:</strong> {turno.box_asignado}</div>
                            {turno.dni && <div><strong>DNI:</strong> {turno.dni}</div>}
                            <div><strong>Hora:</strong> {new Date(turno.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
                            <div><strong>Fecha:</strong> {new Date(turno.created_at).toLocaleDateString('es-AR')}</div>
                        </div>
                        <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '11px', borderTop: '1px dashed #000', paddingTop: '8px' }}>
                            Aguarde a ser llamado/a
                        </div>
                    </div>
                )}
            </div>

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

// ─── Estilos ───
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
        background: 'linear-gradient(135deg, #E8F0FE 0%, #F0F4F8 50%, #E8ECF4 100%)',
        zIndex: 0,
    },
    header: {
        position: 'relative', zIndex: 10,
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(21, 101, 192, 0.1)',
        boxShadow: '0 2px 20px rgba(0,0,0,0.04)',
    },
    headerInner: {
        maxWidth: '900px', margin: '0 auto',
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: '14px' },
    logo: { width: '48px', height: '48px', borderRadius: '12px', objectFit: 'contain' },
    headerTitle: {
        margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#0D3B66', letterSpacing: '-0.5px',
    },
    headerSubtitle: {
        margin: 0, fontSize: '0.78rem', color: '#64748B', fontWeight: 500,
    },
    headerRight: { textAlign: 'right' },
    headerTime: {
        display: 'block', fontSize: '1.5rem', fontWeight: 800, color: '#0D3B66',
        letterSpacing: '-0.5px',
    },
    headerDate: {
        fontSize: '0.78rem', color: '#64748B', textTransform: 'capitalize',
    },
    main: {
        position: 'relative', zIndex: 10,
        maxWidth: '900px', margin: '0 auto',
        padding: '24px',
        minHeight: 'calc(100vh - 100px)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
    },
    // ── Select step ──
    selectContainer: {
        animation: 'fadeInUp 0.4s ease-out',
    },
    dniSection: {
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        borderRadius: '20px',
        padding: '20px 24px',
        marginBottom: '24px',
        border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.04)',
    },
    dniLabel: {
        display: 'block', fontSize: '1rem', fontWeight: 700, color: '#0D3B66',
        marginBottom: '10px',
    },
    dniOptional: { fontSize: '0.8rem', fontWeight: 500, color: '#94A3B8' },
    dniInput: {
        width: '100%', padding: '16px 20px',
        borderRadius: '14px',
        border: '2px solid #E2E8F0',
        fontSize: '1.3rem', fontWeight: 600,
        color: '#0D3B66', letterSpacing: '1px',
        outline: 'none', transition: 'all 0.2s',
        background: '#FAFBFC',
        boxSizing: 'border-box',
    },
    selectTitle: {
        fontSize: '1.3rem', fontWeight: 800, color: '#0D3B66',
        textAlign: 'center', margin: '0 0 24px',
        letterSpacing: '-0.5px',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
    },
    tramiteBtn: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '12px',
        padding: '28px 16px',
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(12px)',
        borderRadius: '24px',
        border: '2px solid',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        WebkitTapHighlightColor: 'transparent',
        position: 'relative',
    },
    numberBadge: {
        position: 'absolute',
        top: '12px', left: '12px',
        width: '32px', height: '32px',
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff',
        fontWeight: 800,
        fontSize: '0.85rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    },
    tramiteIconWrap: {
        width: '80px', height: '80px', borderRadius: '24px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    tramiteLabel: {
        fontSize: '1rem', fontWeight: 700, color: '#0D3B66',
        textAlign: 'center', lineHeight: 1.3,
    },
    subBadge: {
        display: 'flex', alignItems: 'center', gap: '4px',
        fontSize: '0.75rem', fontWeight: 700,
        padding: '4px 12px', borderRadius: '20px',
    },
    waitBadge: {
        fontSize: '0.75rem', fontWeight: 700,
        padding: '4px 12px', borderRadius: '20px',
    },
    errorBanner: {
        marginTop: '16px', padding: '14px',
        background: '#FEE2E2', color: '#DC2626',
        borderRadius: '14px', textAlign: 'center',
        fontSize: '0.9rem', fontWeight: 600,
        border: '1px solid #FECACA',
    },
    loadingOverlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
    },
    // ── Sub-select step ──
    backBtn: {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '12px 20px', marginBottom: '20px',
        background: 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(12px)',
        border: '2px solid #E2E8F0',
        borderRadius: '16px',
        cursor: 'pointer',
        fontSize: '0.95rem', fontWeight: 700, color: '#475569',
        transition: 'all 0.2s',
    },
    groupHeader: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '12px', padding: '28px 24px',
        borderRadius: '24px', border: '2px solid',
        marginBottom: '24px',
    },
    groupHeaderIcon: {
        width: '64px', height: '64px', borderRadius: '20px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    groupHeaderTitle: {
        margin: 0, fontSize: '1.2rem', fontWeight: 800,
        textAlign: 'center', letterSpacing: '-0.3px',
    },
    groupHeaderSub: {
        margin: 0, fontSize: '0.85rem', color: '#64748B', fontWeight: 500,
    },
    subGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
    },
    subBtn: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '12px',
        padding: '24px 14px',
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(12px)',
        borderRadius: '22px',
        border: '2px solid',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        WebkitTapHighlightColor: 'transparent',
        position: 'relative',
    },
    subIconWrap: {
        width: '68px', height: '68px', borderRadius: '20px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    subLabel: {
        fontSize: '0.95rem', fontWeight: 700, color: '#0D3B66',
        textAlign: 'center', lineHeight: 1.3,
    },
    // ── Ticket step ──
    ticketContainer: {
        animation: 'fadeInUp 0.5s ease-out',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
    },
    ticketCard: {
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(16px)',
        borderRadius: '28px',
        padding: '36px 32px',
        maxWidth: '420px', width: '100%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
        border: '1px solid rgba(255,255,255,0.6)',
        textAlign: 'center',
    },
    ticketHeader: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        marginBottom: '20px',
    },
    ticketSuccessText: {
        margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#16A34A',
    },
    ticketNumber: {
        fontSize: '5rem', fontWeight: 900, letterSpacing: '4px',
        borderRadius: '24px', padding: '16px 24px',
        margin: '8px 0 24px',
        border: '3px solid',
        animation: 'pulseNumber 3s ease-in-out infinite',
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
