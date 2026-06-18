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
            const timer = setTimeout(handleReset, 8000);
            return () => clearTimeout(timer);
        }
    }, [step, handleReset]);

    // Helper: descripción largo para el ticket (incluye grupo si aplica)
    const getTicketTramiteLabel = useCallback(() => {
        if (!selectedType) return '';
        if (selectedType.grupo_label) {
            return `${selectedType.grupo_label} \u2014 ${selectedType.label}`;
        }
        return selectedType.label;
    }, [selectedType]);

    // ─── RawBT / Thermal Printing ───────────────────────────────────
    const isAndroid = /android/i.test(navigator.userAgent);

    // Genera ticket compacto con ESC/POS para Nictom 58mm
    const buildTicketText = useCallback(() => {
        if (!turno || !selectedType) return '';

        const ESC = '\x1B';
        const GS = '\x1D';
        const INIT = ESC + '\x40';
        const CENTER = ESC + '\x61\x01';
        const LEFT = ESC + '\x61\x00';
        const BOLD_ON = ESC + '\x45\x01';
        const BOLD_OFF = ESC + '\x45\x00';
        const DOUBLE = GS + '\x21\x11';
        const NORMAL = GS + '\x21\x00';
        const FEED = ESC + '\x64\x02';       // Feed 2 lines
        const CUT = GS + '\x56\x01';

        const tramiteLabel = getTicketTramiteLabel();
        const hora = new Date(turno.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

        let t = INIT + CENTER;

        // Header compacto
        t += BOLD_ON + 'SANATORIO ARGENTINO\n' + BOLD_OFF;
        t += '--------------------------------\n';

        // Número GRANDE
        t += DOUBLE + BOLD_ON;
        t += turno.numero_turno + '\n';
        t += NORMAL + BOLD_OFF;
        t += '--------------------------------\n';

        // Detalles en una zona compacta
        t += LEFT;
        t += tramiteLabel + '\n';
        if (turno.dni) t += 'DNI ' + turno.dni + '\n';
        t += hora + '\n';

        // Footer
        t += CENTER + '--------------------------------\n';
        t += BOLD_ON + 'Aguarde a ser llamado/a\n' + BOLD_OFF;

        t += FEED + CUT;
        return t;
    }, [turno, selectedType, getTicketTramiteLabel]);

    // Envía texto directamente a RawBT via intent URI (silencioso)
    const printViaRawBT = useCallback((text) => {
        const encoded = encodeURI(text);
        const intentURI = 'intent:' + encoded
            + '#Intent;'
            + 'scheme=rawbt;'
            + 'package=ru.a402d.rawbtprinter;'
            + 'end;';
        window.location.href = intentURI;
    }, []);

    // Imprimir ticket: RawBT en Android, window.print() en PC
    const handlePrint = useCallback(() => {
        if (isAndroid) {
            const text = buildTicketText();
            if (text) printViaRawBT(text);
        } else {
            window.print();
        }
    }, [isAndroid, buildTicketText, printViaRawBT]);

    // Auto-imprimir el ticket apenas se genera
    useEffect(() => {
        if (step === STEPS.TICKET) {
            const timer = setTimeout(() => {
                handlePrint();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [step, handlePrint]);

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

                {/* ═══ PASO 2: TICKET GENERADO (Kiosco-friendly: sin botones) ═══ */}
                {step === STEPS.TICKET && turno && (
                    <div style={styles.ticketContainer}>
                        <div style={styles.ticketCard} id="turno-ticket">
                            {/* Animated success icon */}
                            <div style={{
                                width: '80px', height: '80px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, #16A34A, #22C55E)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 16px',
                                boxShadow: '0 8px 32px rgba(22,163,74,0.3)',
                                animation: 'fadeInUp 0.4s ease-out',
                            }}>
                                <CheckCircle size={44} style={{ color: '#fff' }} />
                            </div>

                            <h2 style={{
                                margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 800,
                                color: '#16A34A', animation: 'fadeInUp 0.5s ease-out',
                            }}>
                                ¡Turno generado!
                            </h2>

                            <p style={{
                                margin: '0 0 20px', fontSize: '0.9rem', color: '#64748B',
                                animation: 'fadeInUp 0.6s ease-out',
                            }}>
                                🖨️ Retirá tu ticket de la impresora
                            </p>

                            {/* Número grande */}
                            <div style={{
                                ...styles.ticketNumber,
                                color: selectedType?.color || '#1565C0',
                                borderColor: (selectedType?.color || '#1565C0') + '30',
                                background: (selectedType?.color || '#1565C0') + '08',
                                animation: 'fadeInUp 0.5s ease-out, pulseNumber 3s ease-in-out infinite',
                            }}>
                                {turno.numero_turno}
                            </div>

                            {/* Info compacta */}
                            <div style={{
                                display: 'flex', justifyContent: 'center',
                                marginBottom: '20px', animation: 'fadeInUp 0.7s ease-out',
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#94A3B8', fontWeight: 600, marginBottom: '4px' }}>Trámite</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0D3B66' }}>{getTicketTramiteLabel()}</span>
                                </div>
                            </div>

                            {/* Mensaje de espera */}
                            <p style={{
                                ...styles.ticketWait,
                                fontSize: '1.1rem', fontWeight: 700,
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
    logo: { width: '44px', height: '44px', borderRadius: '10px', objectFit: 'contain' },
    headerTitle: {
        margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0D3B66',
    },
    headerSubtitle: {
        margin: 0, fontSize: '0.7rem', color: '#64748B', fontWeight: 500,
    },
    headerRight: { textAlign: 'right' },
    headerTime: {
        display: 'block', fontSize: '1.3rem', fontWeight: 800, color: '#0D3B66',
    },
    headerDate: {
        fontSize: '0.7rem', color: '#64748B', textTransform: 'capitalize',
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
        borderRadius: '18px',
        padding: '16px 18px',
        marginBottom: '16px',
        border: '2px solid #E2E8F0',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
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
    selectTitle: {
        fontSize: '1.6rem', fontWeight: 800, color: '#0D3B66',
        textAlign: 'center', margin: '8px 0 18px',
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
        fontSize: '1.25rem', fontWeight: 700, color: '#0D3B66',
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
        fontSize: '1.2rem', fontWeight: 700, color: '#0D3B66',
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
        borderRadius: '24px',
        padding: '32px 24px',
        width: '100%',
        boxShadow: '0 6px 32px rgba(0,0,0,0.08)',
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
