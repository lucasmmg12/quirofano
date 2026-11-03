import { useState, useEffect, useMemo } from 'react';
import {
    Stethoscope, MessageCircle, DollarSign,
    Clock, ArrowRight, RefreshCw,
    Users, ChevronRight,
    ShieldCheck, ClipboardCheck, Brain, Sparkles, CheckCircle2,
    FileCheck, History, Compass, Search, BookOpen, Plus, Trash2,
    CheckSquare, Square, StickyNote, Headphones, CalendarCheck,
    Receipt, PackageCheck, FileSpreadsheet, BarChart3, Wrench,
    HelpCircle, Layers, ExternalLink, UserCheck, Command,
} from 'lucide-react';
import { fetchUserPersonalCopilot } from '../services/dashboardService';
import { canUserAccessContactCenter, isContactCenterExclusiveAgent, MASTER_ADMINS } from '../services/contactCenterService';

const FRASES_MOTIVADORAS = [
    {
        frase: '¡Tú puedes con todo hoy! Cada gestión que resolvés acerca tranquilidad a un paciente y a su familia.',
        tag: 'Energía para tu jornada',
    },
    {
        frase: 'Un paso a la vez: lo que hoy parece un gran desafío, al final del día será otro logro cumplido.',
        tag: 'Enfoque y calma',
    },
    {
        frase: 'Tu compromiso, orden y calidez hacen que todo el Sanatorio funcione mejor. ¡Que tengas un gran día!',
        tag: 'Orgullo de equipo',
    },
    {
        frase: 'Confía en tu capacidad: tenés la experiencia y las herramientas para sacar adelante cualquier situación hoy.',
        tag: 'Confianza total',
    },
    {
        frase: 'Cada detalle cuenta. Cuando dejás un paciente al día, estás cerrando un círculo de calidad y cuidado.',
        tag: 'Excelencia diaria',
    },
    {
        frase: '¡Hoy va a ser un excelente día! Respirá hondo, organizá tus prioridades y avanzá a tu ritmo.',
        tag: 'Actitud positiva',
    },
    {
        frase: 'No importa cuán intensa venga la guardia o la mañana: vos tenés el talento para resolverlo todo con claridad.',
        tag: 'Fuerza y claridad',
    },
];

const WORKSPACE_CATALOG = [
    {
        id: 'ws_cirugias',
        primaryModule: 'cirugias',
        title: 'Control de Cirugías y Quirófano',
        subtitle: 'Seguimiento prequirúrgico, estados de autorización, pacientes y anatomía patológica',
        icon: Stethoscope,
        color: '#2563EB',
        bg: '#EFF6FF',
        border: '#BFDBFE',
        keywords: 'cirugias quirofano prequirurgico pacientes anatomia patologica asociaciones metricas',
        actions: [
            { id: 'cirugias', label: 'Tablero de Cirugías', icon: Stethoscope },
            { id: 'pacientes', label: 'Padrón de Pacientes', icon: Users },
            { id: 'asociaciones_entrega', label: 'Entrega Asociaciones', icon: PackageCheck },
            { id: 'laboratorios', label: 'Anatomía Patológica', icon: FileCheck },
        ],
    },
    {
        id: 'ws_altas_facturacion',
        primaryModule: 'altas',
        title: 'Altas Administrativas y Facturación',
        subtitle: 'Circuito integral desde la recepción de fichas hasta control administrativo y cierre de facturación',
        icon: ClipboardCheck,
        color: '#0D9488',
        bg: '#F0FDFA',
        border: '#99F6E4',
        keywords: 'altas administrativas entrega fichas facturacion txt provincia osp auditoria historias clinicas',
        actions: [
            { id: 'entrega_fichas', label: '1. Entrega de Fichas', icon: PackageCheck },
            { id: 'altas', label: '2. Control de Altas', icon: ClipboardCheck },
            { id: 'facturacion', label: '3. Facturación', icon: Receipt },
            { id: 'txt_provincia', label: 'Txt Provincia (OSP)', icon: FileSpreadsheet },
            { id: 'auditoria_historias', label: 'Auditoría H.C.', icon: FileCheck },
        ],
    },
    {
        id: 'ws_deudas',
        primaryModule: 'deudas',
        title: 'Gestión de Deudas y Cobranzas',
        subtitle: 'Conciliación de facturas SALUS, depósitos a cuenta, planes de pago y avisos por WhatsApp',
        icon: DollarSign,
        color: '#D97706',
        bg: '#FFFBEB',
        border: '#FDE68A',
        keywords: 'deudas cobranzas salus facturas pagos depositos cuotas libre deuda recibos',
        actions: [
            { id: 'deudas', label: 'Panel de Deudas y Cobranzas', icon: DollarSign },
        ],
    },
    {
        id: 'ws_contact_center',
        primaryModule: 'contact_center_chats',
        title: 'Contact Center y Turnos Online',
        subtitle: 'Consola omnicanal WhatsApp, auditoría de turnos duplicados, cancelaciones y métricas',
        icon: Headphones,
        color: '#4F46E5',
        bg: '#EEF2FF',
        border: '#C7D2FE',
        keywords: 'contact center whatsapp chats turnos online duplicados cancelaciones metricas incentivos',
        actions: [
            { id: 'contact_center_chats', label: 'Consola de Chats', icon: MessageCircle },
            { id: 'turnos_online', label: 'Auditoría Turnos Online', icon: CalendarCheck },
            { id: 'contact_center_cancelaciones', label: 'Cancelaciones', icon: Clock },
            { id: 'contact_center_metricas', label: 'Métricas y Costos', icon: BarChart3 },
        ],
    },
    {
        id: 'ws_pedidos',
        primaryModule: 'pedidos',
        title: 'Emisión de Pedidos y Nomenclador',
        subtitle: 'Confección de órdenes médicas, consulta de códigos del nomenclador e historial de envíos',
        icon: BookOpen,
        color: '#0284C7',
        bg: '#F0F9FF',
        border: '#BAE6FD',
        keywords: 'pedidos ordenes practicas nomenclador codigos historial marcela impresion whatsapp',
        actions: [
            { id: 'pedidos', label: 'Nuevo Pedido Médico', icon: Plus },
            { id: 'nomenclador', label: 'Consultar Nomenclador', icon: BookOpen },
            { id: 'historial', label: 'Historial de Pedidos', icon: History },
        ],
    },
    {
        id: 'ws_gobernanza',
        primaryModule: 'gobernanza_indicadores',
        title: 'Gobernanza de Datos e Indicadores',
        subtitle: 'Tableros estratégicos de Guardia, UCI, Quirófano, Imágenes, Ocupación y actas con IA',
        icon: BarChart3,
        color: '#7C3AED',
        bg: '#F5F3FF',
        border: '#DDD6FE',
        keywords: 'gobernanza indicadores calidad guardia uci quirofano imagenes ocupacion audios actas',
        actions: [
            { id: 'gobernanza_indicadores', label: 'Dashboard de Indicadores', icon: BarChart3 },
            { id: 'gobernanza', label: 'Actas, Tareas y Audios IA', icon: ShieldCheck },
        ],
    },
    {
        id: 'ws_simon',
        primaryModule: 'beto',
        title: 'Simon IA y Documentación',
        subtitle: 'Asistente inteligente del Sanatorio, consulta de normativas, reglas y manuales internos',
        icon: Brain,
        color: '#059669',
        bg: '#ECFDF5',
        border: '#A7F3D0',
        keywords: 'simon beto ia inteligencia artificial manual procedimientos documentos normas ayuda',
        actions: [
            { id: 'beto', label: 'Consultar a Simon IA', icon: Brain },
            { id: 'manual', label: 'Manual de Procedimientos', icon: BookOpen },
            { id: 'documentos', label: 'Repositorio Documental', icon: FileCheck },
        ],
    },
    {
        id: 'ws_recursos',
        primaryModule: 'liquidaciones',
        title: 'Liquidaciones, Activos y Seguridad',
        subtitle: 'Liquidaciones médicas, mantenimiento de equipamiento y administración de usuarios',
        icon: Wrench,
        color: '#475569',
        bg: '#F8FAFC',
        border: '#CBD5E1',
        keywords: 'liquidaciones medicas activos mantenimiento equipos usuarios seguridad',
        actions: [
            { id: 'liquidaciones', label: 'Liquidaciones Médicas', icon: Receipt },
            { id: 'activos', label: 'Gestión de Activos', icon: Wrench },
            { id: 'usuarios_seguridad', label: 'Usuarios y Seguridad', icon: ShieldCheck },
        ],
    },
];

function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Hace instantes';
    if (mins < 60) return `Hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Hace ${hrs}h`;
    return `Hace ${Math.floor(hrs / 24)}d`;
}

export default function HomePanel({
    onNavigate,
    currentUser,
    selectedModules,
    onOpenCommandPalette,
    onOpenProfile,
}) {
    const [copilot, setCopilot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Notas y checklist personales por usuario (guardados localmente en su PC)
    const userStoragePrefix = useMemo(
        () => `admqui_home_${(currentUser?.usuario || 'user').toLowerCase().trim()}`,
        [currentUser?.usuario]
    );

    const [quickTasks, setQuickTasks] = useState(() => {
        try {
            const raw = localStorage.getItem(`${userStoragePrefix}_tasks`);
            if (raw) return JSON.parse(raw);
        } catch { /* ignore */ }
        return [
            { id: 't1', text: 'Revisar pacientes pendientes de mi turno', done: false },
            { id: 't2', text: 'Verificar mensajes o respuestas de WhatsApp', done: false },
        ];
    });

    const [newTaskText, setNewTaskText] = useState('');
    const [quickNote, setQuickNote] = useState(() => {
        try {
            return localStorage.getItem(`${userStoragePrefix}_note`) || '';
        } catch {
            return '';
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(`${userStoragePrefix}_tasks`, JSON.stringify(quickTasks));
        } catch { /* ignore */ }
    }, [quickTasks, userStoragePrefix]);

    useEffect(() => {
        try {
            localStorage.setItem(`${userStoragePrefix}_note`, quickNote);
        } catch { /* ignore */ }
    }, [quickNote, userStoragePrefix]);

    // Frase motivadora rotativa
    const [quoteIdx, setQuoteIdx] = useState(() => {
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        return dayOfYear % FRASES_MOTIVADORAS.length;
    });

    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';
    const primerNombre = useMemo(() => {
        const full = (currentUser?.nombre || currentUser?.usuario || '').trim();
        if (!full) return '';
        if (full.includes('@')) return full.split('@')[0];
        return full.split(/\s+/)[0];
    }, [currentUser]);

    // Reglas de visibilidad por usuario (idénticas al Sidebar)
    const canSeeModule = useMemo(() => {
        const username = (currentUser?.usuario || '').toLowerCase().trim();
        const isContactCenterOnly = isContactCenterExclusiveAgent(currentUser);
        const isUciOnly = username === 'naguilera';
        const isGobernanzaDashboardOnly = ['pgarcia', 'pgarcia@sanatorioargentino.com.ar'].includes(username);
        const isGobernanzaOnly = ['gobernanza', 'gobernanza@sanatorioargentino.com.ar', 'mjpavia', 'mjpavia@sanatorioargentino.com.ar'].includes(username);
        const isMaster = MASTER_ADMINS.includes(username) || currentUser?.rol === 'admin';

        return (id) => {
            if (isGobernanzaDashboardOnly) return id === 'gobernanza_indicadores';
            if (isGobernanzaOnly) {
                return ['gobernanza', 'gobernanza_indicadores', 'beto', 'simon', 'beto_rules', 'beto_analytics'].includes(id);
            }
            if (isUciOnly) {
                return id === 'gobernanza_indicadores' || ['beto', 'simon', 'beto_rules', 'beto_analytics'].includes(id);
            }
            if (isContactCenterOnly) {
                return [
                    'contact_center', 'contact_center_chats', 'contact_center_nueva', 'contact_center_cancelaciones',
                    'turnos_online', 'contact_center_metricas', 'contact_center_incentivos', 'contact_center_config',
                    'beto', 'simon', 'beto_rules', 'beto_analytics', 'manual',
                ].includes(id);
            }
            if (['beto', 'simon', 'beto_rules', 'beto_analytics', 'manual'].includes(id)) return true;
            if (isMaster) return true;
            if (id === 'usuarios_seguridad') return isMaster;

            const CC_VIEWS = [
                'contact_center', 'contact_center_chats', 'contact_center_nueva', 'contact_center_cancelaciones',
                'turnos_online', 'contact_center_metricas', 'contact_center_incentivos', 'contact_center_config',
            ];
            if (CC_VIEWS.includes(id)) return canUserAccessContactCenter(currentUser);

            if (!selectedModules || selectedModules.length === 0) return true;
            if (selectedModules.length === 1 && selectedModules[0] === 'activos') return id === 'activos';
            if (id === 'gobernanza' || id === 'gobernanza_indicadores') {
                return selectedModules.includes('gobernanza') || selectedModules.includes('gobernanza_indicadores');
            }
            if (id === 'entrega_fichas') {
                return selectedModules.includes('altas') || selectedModules.includes('facturacion') || selectedModules.includes('entrega_fichas');
            }
            return selectedModules.includes(id);
        };
    }, [currentUser, selectedModules]);

    // Filtrar los espacios de trabajo habilitados para el usuario y según búsqueda
    const visibleWorkspaces = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return WORKSPACE_CATALOG
            .map(ws => {
                const allowedActions = ws.actions.filter(a => canSeeModule(a.id));
                if (allowedActions.length === 0) return null;
                if (q) {
                    const hayCoincidencia =
                        ws.title.toLowerCase().includes(q) ||
                        ws.subtitle.toLowerCase().includes(q) ||
                        ws.keywords.toLowerCase().includes(q) ||
                        allowedActions.some(a => a.label.toLowerCase().includes(q));
                    if (!hayCoincidencia) return null;
                }
                return { ...ws, actions: allowedActions };
            })
            .filter(Boolean);
    }, [canSeeModule, searchQuery]);

    const loadData = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const cp = await fetchUserPersonalCopilot(currentUser);
            setCopilot(cp);
        } catch (e) {
            console.error('[HomePanel] Error loading dashboard:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.usuario]);

    const handleAddTask = (e) => {
        e.preventDefault();
        const clean = newTaskText.trim();
        if (!clean) return;
        setQuickTasks(prev => [
            { id: 'tk_' + Date.now(), text: clean, done: false },
            ...prev,
        ]);
        setNewTaskText('');
    };

    const toggleTask = (id) => {
        setQuickTasks(prev => prev.map(t => (t.id === id ? { ...t, done: !t.done } : t)));
    };

    const deleteTask = (id) => {
        setQuickTasks(prev => prev.filter(t => t.id !== id));
    };

    const currentQuote = FRASES_MOTIVADORAS[quoteIdx % FRASES_MOTIVADORAS.length];

    return (
        <div className="content no-print view-transition-enter" style={{ maxWidth: '1160px', margin: '0 auto', paddingBottom: '28px' }}>

            {/* ═══════ 1. BANNER DE BIENVENIDA + FRASE MOTIVADORA + BUSCADOR DE AYUDA ═══════ */}
            <div style={{
                background: 'linear-gradient(135deg, #1E3A8A 0%, #1E4078 55%, #2563EB 100%)',
                borderRadius: '18px',
                padding: '22px 26px',
                color: '#FFFFFF',
                marginBottom: '18px',
                boxShadow: '0 10px 28px rgba(30, 64, 120, 0.18)',
            }}>
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '16px',
                }}>
                    <div style={{ flex: '1 1 500px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <h1 style={{ fontSize: '1.55rem', fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '-0.02em' }}>
                                {saludo}{primerNombre ? `, ${primerNombre}` : ''} 👋
                            </h1>
                            <span style={{
                                fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px',
                                borderRadius: '999px', background: 'rgba(255, 255, 255, 0.16)',
                                color: '#DBEAFE', letterSpacing: '0.02em',
                            }}>
                                {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </span>
                            {currentUser?.area_sector && (
                                <span style={{
                                    fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px',
                                    borderRadius: '999px', background: 'rgba(16, 185, 129, 0.22)',
                                    color: '#A7F3D0', border: '1px solid rgba(167, 243, 208, 0.35)',
                                }}>
                                    🏥 {currentUser.area_sector}
                                </span>
                            )}
                        </div>

                        {/* Frase motivadora del día */}
                        <div style={{
                            marginTop: '12px',
                            padding: '11px 14px',
                            borderRadius: '12px',
                            background: 'rgba(255, 255, 255, 0.11)',
                            border: '1px solid rgba(255, 255, 255, 0.18)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <Sparkles size={18} color="#FDE047" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.4 }}>
                                        “{currentQuote.frase}”
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#BFDBFE', marginTop: '2px', fontWeight: 600 }}>
                                        ✨ {currentQuote.tag}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setQuoteIdx(i => i + 1)}
                                title="Ver otra frase motivadora"
                                style={{
                                    background: 'rgba(255,255,255,0.14)',
                                    border: '1px solid rgba(255,255,255,0.22)',
                                    color: '#FFFFFF',
                                    borderRadius: '8px',
                                    padding: '6px 10px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                ✨ Otra frase
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {onOpenCommandPalette && (
                                <button
                                    type="button"
                                    onClick={onOpenCommandPalette}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '9px 14px', borderRadius: '10px',
                                        border: '1px solid rgba(255,255,255,0.28)',
                                        background: 'rgba(15, 23, 42, 0.25)',
                                        fontSize: '0.76rem', fontWeight: 700, color: '#FFFFFF',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <Command size={14} /> Comando Rápido (Ctrl+K)
                                </button>
                            )}
                            <button
                                onClick={() => loadData(true)}
                                disabled={refreshing}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '9px 16px', borderRadius: '10px',
                                    border: '1px solid rgba(255,255,255,0.28)',
                                    background: 'rgba(255,255,255,0.14)',
                                    fontSize: '0.78rem', fontWeight: 700, color: '#FFFFFF',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}
                            >
                                <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                                {refreshing ? 'Actualizando...' : 'Actualizar mi panel'}
                            </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.72rem', color: '#A7F3D0', fontWeight: 700 }}>
                                🖥️ Multi-ventana activa en esta PC
                            </span>
                            {copilot?.minutosActivoHoy > 0 && (
                                <span style={{ fontSize: '0.73rem', color: '#DBEAFE', fontWeight: 600 }}>
                                    ⏱️ Tiempo activo hoy: <strong>{copilot.minutosActivoHoy} min</strong>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Buscador instantáneo en el Inicio */}
                <div style={{
                    marginTop: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '9px 14px',
                    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)',
                }}>
                    <Search size={17} color="#2563EB" style={{ flexShrink: 0 }} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="¿Qué necesitás hacer hoy? Buscá un módulo, herramienta o gestión (ej: Facturación, Turnos Online, Nomenclador, Deudas, Simon IA)..."
                        style={{
                            border: 'none',
                            outline: 'none',
                            width: '100%',
                            fontSize: '0.84rem',
                            fontWeight: 500,
                            color: '#0F172A',
                            background: 'transparent',
                        }}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            style={{
                                border: 'none', background: '#F1F5F9', color: '#475569',
                                borderRadius: '6px', padding: '4px 8px', fontSize: '0.72rem',
                                fontWeight: 700, cursor: 'pointer',
                            }}
                        >
                            Limpiar
                        </button>
                    )}
                </div>
            </div>

            {/* ═══════ 2. COPILOTO PERSONAL DE CONTINUIDAD Y PACIENTES / ACTIVIDAD DEL USUARIO ═══════ */}
            <div style={{
                background: 'var(--neutral-0)',
                borderRadius: '16px',
                border: '1.5px solid #BFDBFE',
                padding: '18px 20px',
                marginBottom: '18px',
                boxShadow: '0 4px 16px rgba(37, 99, 235, 0.06)',
            }}>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: '10px', marginBottom: '14px',
                    paddingBottom: '12px', borderBottom: '1px solid var(--neutral-100)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '34px', height: '34px', borderRadius: '10px',
                            background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Compass size={18} color="#2563EB" />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--neutral-800)' }}>
                                Tu Copiloto Personal de Actividad y Continuidad
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', fontWeight: 500 }}>
                                Retomá rápidamente donde dejaste, revisá tus módulos más frecuentes y verificá tus últimas gestiones
                            </div>
                        </div>
                    </div>

                    {copilot?.misPacientes?.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{
                                padding: '4px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                                background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0',
                            }}>
                                ✓ {copilot.alDiaCount} al día
                            </span>
                            {copilot.pendientesCount > 0 && (
                                <span style={{
                                    padding: '4px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                                    background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A',
                                }}>
                                    ⏳ {copilot.pendientesCount} con seguimiento pendiente
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {loading ? (
                    <div style={{ fontSize: '0.82rem', color: '#64748B', padding: '12px 0' }}>
                        Cargando tu actividad reciente...
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                        gap: '16px',
                    }}>
                        {/* Columna izquierda: Último apartado consultado + Módulos frecuentes */}
                        <div style={{
                            background: copilot?.consultaInsight?.status === 'extracted' ? '#F0FDF4' : '#F8FAFC',
                            border: `1px solid ${copilot?.consultaInsight?.status === 'extracted' ? '#BBF7D0' : '#E2E8F0'}`,
                            borderRadius: '12px',
                            padding: '14px 16px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '12px',
                        }}>
                            {copilot?.consultaInsight ? (
                                <>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
                                                color: copilot.consultaInsight.status === 'extracted' ? '#15803D' : '#1E4078',
                                                display: 'flex', alignItems: 'center', gap: '5px',
                                            }}>
                                                {copilot.consultaInsight.status === 'extracted' ? (
                                                    <><FileCheck size={14} /> Información extraída con éxito</>
                                                ) : (
                                                    <><History size={14} /> Último apartado que estuviste consultando</>
                                                )}
                                            </span>
                                            <span style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', fontWeight: 600 }}>
                                                {formatTimeAgo(copilot.consultaInsight.timestamp)}
                                            </span>
                                        </div>

                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--neutral-800)', marginBottom: '4px' }}>
                                            {copilot.consultaInsight.title}
                                        </div>
                                        <p style={{ fontSize: '0.78rem', color: 'var(--neutral-600)', margin: 0, lineHeight: 1.45 }}>
                                            {copilot.consultaInsight.description}
                                        </p>

                                        {copilot.modulosFrecuentes?.length > 0 && (
                                            <div style={{ marginTop: '12px' }}>
                                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>
                                                    ⚡ Tus módulos más utilizados recientemente:
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {copilot.modulosFrecuentes.map(mf => (
                                                        <button
                                                            key={mf.module_id}
                                                            type="button"
                                                            onClick={() => onNavigate?.(mf.module_id)}
                                                            style={{
                                                                fontSize: '0.71rem', fontWeight: 700, padding: '4px 10px',
                                                                borderRadius: '7px', border: '1px solid #CBD5E1',
                                                                background: '#FFFFFF', color: '#1E3A8A', cursor: 'pointer',
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            }}
                                                        >
                                                            {mf.module_label} <span style={{ color: '#64748B', fontWeight: 600 }}>({mf.visitas})</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {copilot.consultaInsight.module_id && (
                                        <button
                                            type="button"
                                            onClick={() => onNavigate?.(copilot.consultaInsight.module_id)}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                padding: '9px 14px', borderRadius: '9px', border: 'none',
                                                background: '#1E4078', color: '#FFFFFF',
                                                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                                alignSelf: 'flex-start',
                                            }}
                                        >
                                            Retomar {copilot.consultaInsight.module_label} <ArrowRight size={14} />
                                        </button>
                                    )}
                                </>
                            ) : (
                                <div>
                                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#1E3A8A', marginBottom: '4px' }}>
                                        ¡Todo listo para comenzar tu jornada!
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: '#475569', margin: 0, lineHeight: 1.45 }}>
                                        A medida que navegues por los módulos, acá vas a poder retomar con 1 clic el último apartado consultado y ver tus accesos más frecuentes.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Columna derecha: Pacientes gestionados por el usuario o Bitácora personal */}
                        {copilot?.misPacientes?.length > 0 ? (
                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '12px',
                                padding: '12px 14px',
                            }}>
                                <div style={{
                                    fontSize: '0.74rem', fontWeight: 800, color: '#334155',
                                    textTransform: 'uppercase', marginBottom: '8px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                }}>
                                    <span>🩺 Últimos pacientes que estuviste viendo — ¿Quedaron al día?</span>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, textTransform: 'none' }}>
                                        Clic para abrir
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '215px', overflowY: 'auto' }}>
                                    {copilot.misPacientes.map(p => (
                                        <div
                                            key={p.id}
                                            onClick={() => onNavigate?.(p.modulo)}
                                            style={{
                                                background: '#FFFFFF',
                                                borderRadius: '10px',
                                                padding: '9px 12px',
                                                border: `1px solid ${p.alDia ? '#DCFCE7' : '#FDE68A'}`,
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                justifyContent: 'space-between',
                                                gap: '10px',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s',
                                            }}
                                            onMouseOver={e => { e.currentTarget.style.borderColor = '#93C5FD'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                                            onMouseOut={e => { e.currentTarget.style.borderColor = p.alDia ? '#DCFCE7' : '#FDE68A'; e.currentTarget.style.transform = 'translateX(0)'; }}
                                        >
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                                                        {p.paciente}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.67rem', fontWeight: 700, padding: '1px 6px',
                                                        borderRadius: '4px', background: '#F1F5F9', color: '#475569',
                                                    }}>
                                                        {p.identificador} · {p.moduloLabel}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: '3px', lineHeight: 1.35 }}>
                                                    {p.estadoTexto}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                                                <span style={{
                                                    fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px',
                                                    borderRadius: '999px',
                                                    background: p.alDia ? '#DCFCE7' : '#FEF3C7',
                                                    color: p.alDia ? '#15803D' : '#B45309',
                                                }}>
                                                    {p.badgeLabel}
                                                </span>
                                                <span style={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                                                    {formatTimeAgo(p.fechaAccion)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '12px',
                                padding: '12px 14px',
                            }}>
                                <div style={{
                                    fontSize: '0.74rem', fontWeight: 800, color: '#334155',
                                    textTransform: 'uppercase', marginBottom: '8px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                }}>
                                    <span>📋 Tu Bitácora Personal de Actividad Reciente</span>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, textTransform: 'none' }}>
                                        Últimos registros de tu usuario
                                    </span>
                                </div>

                                {copilot?.misAcciones?.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '195px', overflowY: 'auto' }}>
                                        {copilot.misAcciones.slice(0, 5).map(acc => (
                                            <div
                                                key={acc.id}
                                                onClick={() => acc.modulo && onNavigate?.(acc.modulo)}
                                                style={{
                                                    background: '#FFFFFF',
                                                    borderRadius: '8px',
                                                    padding: '8px 11px',
                                                    border: '1px solid #E2E8F0',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '10px',
                                                    cursor: acc.modulo ? 'pointer' : 'default',
                                                }}
                                            >
                                                <div style={{ fontSize: '0.76rem', color: '#1E293B', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    • {acc.label}
                                                </div>
                                                <span style={{ fontSize: '0.67rem', color: '#64748B', flexShrink: 0, fontWeight: 600 }}>
                                                    {formatTimeAgo(acc.created_at)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '0.76rem', color: '#64748B', padding: '10px 4px' }}>
                                        Sin eventos recientes registrados todavía en esta sesión.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ═══════ 3. MIS ESPACIOS DE TRABAJO Y ACCESOS RÁPIDOS POR ÁREA ═══════ */}
            <div style={{ marginBottom: '18px' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: '12px', flexWrap: 'wrap', gap: '8px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Layers size={18} color="#1E4078" />
                        <h2 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                            Mis Espacios de Trabajo y Herramientas Operativas
                        </h2>
                    </div>
                    <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>
                        Hacé clic en cualquier módulo o submódulo para ir directo
                    </span>
                </div>

                {visibleWorkspaces.length === 0 ? (
                    <div style={{
                        background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                        padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '0.84rem',
                    }}>
                        No se encontraron módulos que coincidan con “{searchQuery}”.
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(265px, 1fr))',
                        gap: '14px',
                    }}>
                        {visibleWorkspaces.map(ws => {
                            const IconComp = ws.icon;
                            return (
                                <div
                                    key={ws.id}
                                    style={{
                                        background: '#FFFFFF',
                                        borderRadius: '14px',
                                        border: `1.5px solid ${ws.border}`,
                                        padding: '16px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                                        transition: 'all 0.18s ease',
                                    }}
                                    onMouseOver={e => {
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(30, 64, 120, 0.09)';
                                    }}
                                    onMouseOut={e => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 2px 10px rgba(15, 23, 42, 0.04)';
                                    }}
                                >
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                                            <div style={{
                                                width: '38px', height: '38px', borderRadius: '10px',
                                                background: ws.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                border: `1px solid ${ws.border}`,
                                            }}>
                                                <IconComp size={19} color={ws.color} />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => onNavigate?.(ws.actions[0].id)}
                                                style={{
                                                    border: 'none', background: ws.bg, color: ws.color,
                                                    borderRadius: '999px', padding: '4px 10px',
                                                    fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer',
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                }}
                                            >
                                                Abrir <ArrowRight size={12} />
                                            </button>
                                        </div>

                                        <div
                                            onClick={() => onNavigate?.(ws.actions[0].id)}
                                            style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', cursor: 'pointer', marginBottom: '4px' }}
                                        >
                                            {ws.title}
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: '#64748B', lineHeight: 1.4 }}>
                                            {ws.subtitle}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
                                        {ws.actions.map(act => {
                                            const SubIcon = act.icon;
                                            return (
                                                <button
                                                    key={act.id}
                                                    type="button"
                                                    onClick={() => onNavigate?.(act.id)}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                        padding: '5px 9px', borderRadius: '8px',
                                                        border: '1px solid #E2E8F0', background: '#F8FAFC',
                                                        color: '#1E293B', fontSize: '0.71rem', fontWeight: 700,
                                                        cursor: 'pointer', transition: 'all 0.15s',
                                                    }}
                                                    onMouseOver={e => {
                                                        e.currentTarget.style.background = ws.bg;
                                                        e.currentTarget.style.borderColor = ws.border;
                                                        e.currentTarget.style.color = ws.color;
                                                    }}
                                                    onMouseOut={e => {
                                                        e.currentTarget.style.background = '#F8FAFC';
                                                        e.currentTarget.style.borderColor = '#E2E8F0';
                                                        e.currentTarget.style.color = '#1E293B';
                                                    }}
                                                >
                                                    <SubIcon size={12} color={ws.color} />
                                                    {act.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ═══════ 4. HERRAMIENTAS PERSONALES DEL USUARIO: CHECKLIST DEL DÍA + NOTAS RÁPIDAS + CENTRO DE AYUDA ═══════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
                gap: '16px',
            }}>
                {/* Mis Pendientes y Recordatorios Rápidos del Turno */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '16px 18px',
                    boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <CheckCircle2 size={17} color="#059669" />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                                    Mis Pendientes Rápidos del Día
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                    Anotá tareas cortas o NHC a revisar hoy (se guardan en tu PC)
                                </div>
                            </div>
                        </div>
                        <span style={{
                            fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px',
                            borderRadius: '999px', background: '#F1F5F9', color: '#475569',
                        }}>
                            {quickTasks.filter(t => !t.done).length} pendientes
                        </span>
                    </div>

                    <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '6px' }}>
                        <input
                            type="text"
                            value={newTaskText}
                            onChange={e => setNewTaskText(e.target.value)}
                            placeholder="Ej: Llamar a NHC 304130 / Controlar alta piso 2..."
                            style={{
                                flex: 1, padding: '7px 10px', borderRadius: '8px',
                                border: '1px solid #CBD5E1', fontSize: '0.78rem', outline: 'none',
                            }}
                        />
                        <button
                            type="submit"
                            style={{
                                padding: '7px 12px', borderRadius: '8px', border: 'none',
                                background: '#1E4078', color: '#FFFFFF', fontSize: '0.75rem',
                                fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                            }}
                        >
                            <Plus size={14} /> Agregar
                        </button>
                    </form>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '165px', overflowY: 'auto' }}>
                        {quickTasks.length === 0 ? (
                            <div style={{ fontSize: '0.75rem', color: '#94A3B8', textAlign: 'center', padding: '14px 0' }}>
                                ¡No tenés pendientes anotados! Agregá uno arriba cuando lo necesites.
                            </div>
                        ) : (
                            quickTasks.map(task => (
                                <div
                                    key={task.id}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        gap: '8px', padding: '7px 10px', borderRadius: '8px',
                                        background: task.done ? '#F8FAFC' : '#FFFFFF',
                                        border: '1px solid #E2E8F0',
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => toggleTask(task.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            border: 'none', background: 'none', cursor: 'pointer',
                                            textAlign: 'left', flex: 1, padding: 0,
                                        }}
                                    >
                                        {task.done ? (
                                            <CheckSquare size={16} color="#10B981" style={{ flexShrink: 0 }} />
                                        ) : (
                                            <Square size={16} color="#64748B" style={{ flexShrink: 0 }} />
                                        )}
                                        <span style={{
                                            fontSize: '0.77rem',
                                            fontWeight: 600,
                                            color: task.done ? '#94A3B8' : '#1E293B',
                                            textDecoration: task.done ? 'line-through' : 'none',
                                        }}>
                                            {task.text}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => deleteTask(task.id)}
                                        title="Eliminar pendiente"
                                        style={{
                                            border: 'none', background: 'none', color: '#94A3B8',
                                            cursor: 'pointer', padding: '2px',
                                        }}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Bloc de Notas Rápidas del Usuario */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '16px 18px',
                    boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <StickyNote size={17} color="#D97706" />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                                    Bloc de Notas Rápidas de tu Guardia / Turno
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                    Apuntes libres (teléfonos, NHC, observaciones) con guardado automático
                                </div>
                            </div>
                        </div>
                        {quickNote && (
                            <button
                                type="button"
                                onClick={() => setQuickNote('')}
                                style={{
                                    border: 'none', background: '#FEF3C7', color: '#B45309',
                                    borderRadius: '6px', padding: '3px 8px', fontSize: '0.68rem',
                                    fontWeight: 700, cursor: 'pointer',
                                }}
                            >
                                Limpiar nota
                            </button>
                        )}
                    </div>

                    <textarea
                        value={quickNote}
                        onChange={e => setQuickNote(e.target.value)}
                        placeholder="Escribí acá cualquier dato rápido que necesites tener a mano mientras cambiás de módulo o ventana..."
                        style={{
                            width: '100%',
                            minHeight: '155px',
                            resize: 'vertical',
                            borderRadius: '10px',
                            border: '1px solid #FDE68A',
                            background: '#FFFDF5',
                            padding: '10px 12px',
                            fontSize: '0.79rem',
                            color: '#1E293B',
                            lineHeight: 1.5,
                            outline: 'none',
                            fontFamily: 'inherit',
                        }}
                    />
                </div>

                {/* Centro de Ayuda Rápida y Consejos Operativos */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '16px 18px',
                    boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '10px',
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <HelpCircle size={17} color="#2563EB" />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                                    Centro de Ayuda y Recursos Rápidos
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                    Asistencia inmediata, manuales y configuración de tu cuenta
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                            <button
                                type="button"
                                onClick={() => onNavigate?.('beto')}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '9px 12px', borderRadius: '10px', border: '1px solid #DBEAFE',
                                    background: '#F8FAFC', cursor: 'pointer', textAlign: 'left',
                                }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 700, color: '#1E3A8A' }}>
                                    <Brain size={15} color="#2563EB" /> Consultar a Simon IA (Normas y Dudas)
                                </span>
                                <ChevronRight size={14} color="#64748B" />
                            </button>

                            <button
                                type="button"
                                onClick={() => onNavigate?.('manual')}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0',
                                    background: '#F8FAFC', cursor: 'pointer', textAlign: 'left',
                                }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                                    <BookOpen size={15} color="#0D9488" /> Manual de Procedimientos Paso a Paso
                                </span>
                                <ChevronRight size={14} color="#64748B" />
                            </button>

                            {canSeeModule('nomenclador') && (
                                <button
                                    type="button"
                                    onClick={() => onNavigate?.('nomenclador')}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0',
                                        background: '#F8FAFC', cursor: 'pointer', textAlign: 'left',
                                    }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                                        <Search size={15} color="#0284C7" /> Buscador de Códigos del Nomenclador
                                    </span>
                                    <ChevronRight size={14} color="#64748B" />
                                </button>
                            )}

                            {onOpenProfile && (
                                <button
                                    type="button"
                                    onClick={onOpenProfile}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0',
                                        background: '#F8FAFC', cursor: 'pointer', textAlign: 'left',
                                    }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                                        <UserCheck size={15} color="#4F46E5" /> Mi Perfil, Contraseña y Seguridad 2FA
                                    </span>
                                    <ChevronRight size={14} color="#64748B" />
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => window.open(window.location.href, '_blank')}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '9px 12px', borderRadius: '10px', border: '1px solid #D1FAE5',
                                    background: '#ECFDF5', cursor: 'pointer', textAlign: 'left',
                                }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 700, color: '#065F46' }}>
                                    <ExternalLink size={15} color="#059669" /> Abrir otra ventana en esta misma PC
                                </span>
                                <ChevronRight size={14} color="#059669" />
                            </button>
                        </div>
                    </div>

                    <div style={{
                        fontSize: '0.72rem', color: '#64748B', background: '#F8FAFC',
                        padding: '8px 10px', borderRadius: '8px', border: '1px solid #F1F5F9',
                    }}>
                        💡 <strong>Tip:</strong> Presioná <kbd style={{ background: '#fff', padding: '1px 5px', borderRadius: '4px', border: '1px solid #CBD5E1', fontWeight: 700 }}>Ctrl</kbd> + <kbd style={{ background: '#fff', padding: '1px 5px', borderRadius: '4px', border: '1px solid #CBD5E1', fontWeight: 700 }}>K</kbd> en cualquier momento para saltar de un módulo a otro sin usar el mouse.
                    </div>
                </div>
            </div>
        </div>
    );
}
