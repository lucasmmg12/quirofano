/**
 * RecepcionView - Vista de solo lectura para Recepcion
 * Accesible sin login en /recepcion
 * Muestra cirugias del dia con observaciones del equipo de administracion
 * Diseno: Opcion B - Card con Acento Lateral + Glassmorphism
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Search, RefreshCw, Calendar, User, Clock,
    MessageSquare, ChevronDown, ChevronUp, Stethoscope,
    FileText, HelpCircle, X, ArrowRight, ArrowLeft, Info,
    AlertTriangle, Phone, Eye,
} from 'lucide-react';
import { SkeletonCardGrid } from './SkeletonLoader';
import { supabase } from '../lib/supabase';

// WhatsApp icon SVG inline
const WhatsAppIcon = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);

const DATE_TABS = [
    { key: 'hoy', label: 'Hoy' },
    { key: 'manana', label: 'Mañana' },
    { key: 'proximos', label: 'Próximos 3 días' },
    { key: 'todos', label: 'Todos' },
];

const STATUS_LABELS = {
    lila: { label: 'Pendiente', color: '#8B5CF6', bg: '#F5F3FF' },
    amarillo: { label: 'En revisión', color: '#D97706', bg: '#FFFBEB' },
    verde: { label: 'Autorizado', color: '#16A34A', bg: '#F0FDF4' },
    azul: { label: 'Confirmado', color: '#2563EB', bg: '#EFF6FF' },
    rojo: { label: 'Problema', color: '#DC2626', bg: '#FEF2F2' },
    precaucion: { label: 'Precaución', color: '#EA580C', bg: '#FFF7ED' },
    fertilidad: { label: 'Fertilidad', color: '#A855F7', bg: '#FAF5FF' },
};

export default function RecepcionView() {
    const [surgeries, setSurgeries] = useState([]);
    const [comments, setComments] = useState({});
    const [patients, setPatients] = useState({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateTab, setDateTab] = useState('hoy');
    const [expandedCards, setExpandedCards] = useState(new Set());
    const [lastRefresh, setLastRefresh] = useState(new Date());

    // === Tutorial state ===
    const [showTutorial, setShowTutorial] = useState(() => {
        return !localStorage.getItem('recepcion_tutorial_seen');
    });
    const [tutorialStep, setTutorialStep] = useState(0);

    const TUTORIAL_STEPS = [
        {
            icon: <Info size={28} />,
            title: '¿Qué es esta pantalla?',
            color: '#1565C0',
            content: [
                'Esta es la vista de **Recepción de Quirófanos** del Sanatorio Argentino.',
                'Aquí se muestran todas las **cirugías programadas** con las observaciones que deja el equipo de administración.',
                'Es una vista de **solo lectura** — no requiere usuario ni contraseña.',
                'Su objetivo es que el personal de recepción pueda consultar rápidamente los datos del paciente y las indicaciones del equipo administrativo antes de la intervención.',
            ],
        },
        {
            icon: <Calendar size={28} />,
            title: 'Filtro por Fecha',
            color: '#7C3AED',
            content: [
                '**Hoy**: Muestra únicamente las cirugías programadas para el día de hoy.',
                '**Mañana**: Cirugías programadas para el día siguiente.',
                '**Próximos 3 días**: Vista extendida de los próximos 3 días calendario.',
                '**Todos**: Muestra desde 7 días atrás hasta 14 días adelante.',
                'Al cambiar de pestaña, la lista se actualiza automáticamente.',
            ],
        },
        {
            icon: <Search size={28} />,
            title: 'Buscador',
            color: '#0891B2',
            content: [
                'Podés buscar por **nombre del paciente**, **DNI**, **teléfono**, **ID paciente**, **médico** u **obra social**.',
                'La búsqueda es instantánea y filtra las tarjetas en tiempo real.',
                'El contador a la derecha (ej: "12 cirugías") se actualiza mostrando cuántos resultados coinciden.',
            ],
        },
        {
            icon: <User size={28} />,
            title: 'Tarjeta de Cirugía',
            color: '#059669',
            content: [
                'Cada tarjeta representa **una cirugía programada** para un paciente.',
                '**Nombre del paciente**: En negrita, encabezando la tarjeta.',
                '**Badge de estado**: Indica el estado del proceso administrativo (Pendiente, En revisión, Autorizado, Confirmado, Problema, Precaución).',
                '**Datos del paciente**: ID Paciente, DNI, Fecha de Cirugía, Médico, Obra Social, y Edad/Sexo.',
                'Hacé clic en cualquier parte de la tarjeta para **expandir/colapsar** los detalles.',
            ],
        },
        {
            icon: <Eye size={28} />,
            title: 'Barra de Color Lateral',
            color: '#1565C0',
            content: [
                'Cada tarjeta tiene una **barra de color en el borde izquierdo** que indica visualmente su situación:',
                '🔵 **Azul**: Cirugía normal, sin observaciones pendientes.',
                '🟡 **Ámbar/Amarillo**: La cirugía tiene **observaciones del equipo administrativo** que deben leerse.',
                '🔴 **Rojo**: La cirugía está **suspendida**. El nombre aparecerá tachado y la tarjeta semi-transparente.',
            ],
        },
        {
            icon: <Phone size={28} />,
            title: 'Botón de WhatsApp',
            color: '#16A34A',
            content: [
                'A la derecha de cada tarjeta hay un **botón verde con el número de teléfono** del paciente.',
                'Al hacer clic, se abre **WhatsApp Web** directamente con ese número, listo para enviar un mensaje.',
                'Si el paciente no tiene teléfono registrado, aparecerá "Sin tel." en gris.',
            ],
        },
        {
            icon: <MessageSquare size={28} />,
            title: 'Observaciones e Instrucciones',
            color: '#D97706',
            content: [
                'Al expandir una tarjeta, se muestran tres secciones posibles:',
                '📋 **Procedimiento**: El tipo de cirugía/módulo programado (ej: "(CX) CESAREA").',
                '💬 **Observaciones**: Comentarios internos del equipo de administración. Cada uno muestra quién lo escribió, cuándo, y el contenido del mensaje. Las tarjetas con observaciones se **expanden automáticamente**.',
                '📄 **Instrucciones de Quirófano**: Indicaciones específicas cargadas desde el sistema SALUS para esa intervención.',
            ],
        },
        {
            icon: <RefreshCw size={28} />,
            title: 'Actualización de Datos',
            color: '#6366F1',
            content: [
                'Los datos **NO se actualizan automáticamente**. Debés presionar el botón **"Actualizar"** en la esquina superior derecha.',
                'El badge verde junto al botón muestra la **hora de la última actualización** (ej: "14:30:15").',
                'Se recomienda actualizar al inicio del turno y antes de cada cirugía para tener la información más reciente.',
                'Los datos provienen del sistema SALUS y de las observaciones cargadas por el equipo administrativo en el panel de Cirugías.',
            ],
        },
    ];

    const closeTutorial = () => {
        setShowTutorial(false);
        setTutorialStep(0);
        localStorage.setItem('recepcion_tutorial_seen', '1');
    };

    const renderMarkdown = (text) => {
        return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    };

    // === Date range helpers ===
    const getDateRange = useCallback((tab) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const from = new Date(today);
        const to = new Date(today);

        switch (tab) {
            case 'hoy':
                to.setHours(23, 59, 59, 999);
                break;
            case 'manana':
                from.setDate(from.getDate() + 1);
                to.setDate(to.getDate() + 1);
                to.setHours(23, 59, 59, 999);
                break;
            case 'proximos':
                to.setDate(to.getDate() + 3);
                to.setHours(23, 59, 59, 999);
                break;
            case 'todos':
                from.setDate(from.getDate() - 7);
                to.setDate(to.getDate() + 14);
                to.setHours(23, 59, 59, 999);
                break;
            default:
                to.setHours(23, 59, 59, 999);
        }
        return {
            from: from.toISOString().split('T')[0],
            to: to.toISOString().split('T')[0],
        };
    }, []);

    // === Load data ===
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const { from, to } = getDateRange(dateTab);

            const { data: surgData, error: surgError } = await supabase
                .from('surgeries')
                .select('*')
                .eq('excluido', false)
                .gte('fecha_cirugia', from)
                .lte('fecha_cirugia', to)
                .order('fecha_cirugia', { ascending: true });

            if (surgError) throw surgError;
            setSurgeries(surgData || []);

            if (surgData?.length > 0) {
                // Get unique patient IDs from current surgeries
                const patientIds = [...new Set(surgData.map(s => s.id_paciente).filter(Boolean))];

                // Fetch comments directly by id_paciente (nueva columna)
                // Esto es mucho más simple y resistente a re-importaciones
                let allComments = [];
                if (patientIds.length > 0) {
                    const batchSize = 100;
                    for (let i = 0; i < patientIds.length; i += batchSize) {
                        const batch = patientIds.slice(i, i + batchSize);
                        const { data: commBatch } = await supabase
                            .from('surgery_comments')
                            .select('*')
                            .in('id_paciente', batch)
                            .order('created_at', { ascending: false });
                        if (commBatch) allComments = allComments.concat(commBatch);
                    }
                }

                // Group comments by id_paciente
                const grouped = {};
                allComments.forEach(c => {
                    const patId = c.id_paciente;
                    if (patId) {
                        if (!grouped[patId]) grouped[patId] = [];
                        grouped[patId].push(c);
                    }
                });
                setComments(grouped);

                // Fetch patient data (edad, sexo)
                if (patientIds.length > 0) {
                    const { data: patData } = await supabase
                        .from('hospital_pacientes')
                        .select('id_paciente, dni, edad, sexo')
                        .in('id_paciente', patientIds.map(Number));

                    const patMap = {};
                    (patData || []).forEach(p => {
                        patMap[String(p.id_paciente)] = p;
                    });
                    setPatients(patMap);
                }

                // Auto-expand cards that have comments (keyed by id_paciente now)
                const withComments = new Set();
                surgData.forEach(s => {
                    if (s.id_paciente && grouped[s.id_paciente]?.length > 0) {
                        withComments.add(s.id);
                    }
                });
                setExpandedCards(withComments);
            } else {
                setComments({});
                setPatients({});
            }

            setLastRefresh(new Date());
        } catch (err) {
            console.error('Error loading reception data:', err);
        } finally {
            setLoading(false);
        }
    }, [dateTab, getDateRange]);

    useEffect(() => {
        loadData();
        // NO auto-refresh - manual only
    }, [loadData]);

    // === Filtered list ===
    const filtered = useMemo(() => {
        if (!searchQuery.trim()) return surgeries;
        const q = searchQuery.toLowerCase();
        return surgeries.filter(s =>
            s.nombre?.toLowerCase().includes(q) ||
            s.dni?.toLowerCase().includes(q) ||
            s.telefono?.includes(q) ||
            s.id_paciente?.includes(q) ||
            s.medico?.toLowerCase().includes(q) ||
            s.obra_social?.toLowerCase().includes(q)
        );
    }, [surgeries, searchQuery]);

    // === Helpers ===
    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const formatCommentTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        if (d.toDateString() === today.toDateString()) return `Hoy ${time}`;
        if (d.toDateString() === yesterday.toDateString()) return `Ayer ${time}`;
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ` ${time}`;
    };

    const getWhatsAppLink = (phone) => {
        if (!phone) return null;
        let clean = phone.replace(/\D/g, '');
        if (!clean.startsWith('549')) {
            if (clean.startsWith('54')) clean = '549' + clean.slice(2);
            else clean = '549' + clean;
        }
        return `https://wa.me/${clean}`;
    };

    const toggleCard = (id) => {
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const isSuspended = (s) => s.ausente === '1';

    const todayLabel = new Date().toLocaleDateString('es-AR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    return (
        <div style={{
            minHeight: '100vh',
            background: '#E8EFF7',
            backgroundImage: 'url(/SANARG2021_fondo.webp)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed',
            fontFamily: "'Inter', -apple-system, sans-serif",
            position: 'relative',
        }}>
            {/* Background overlay */}
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(241, 245, 249, 0.88)',
                backdropFilter: 'blur(2px)',
                zIndex: 0,
            }} />

            {/* === HEADER === */}
            <header style={{
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderBottom: '1px solid rgba(255,255,255,0.3)',
                padding: '10px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img
                        src="/logosanatorio.png"
                        alt="Sanatorio Argentino"
                        style={{
                            width: '40px', height: '40px',
                            borderRadius: '10px',
                            objectFit: 'contain',
                        }}
                    />
                    <div>
                        <h1 style={{
                            margin: 0, fontSize: '1.15rem', fontWeight: 700,
                            color: '#0F2B46', letterSpacing: '-0.3px',
                        }}>
                            Recepción <span style={{ color: '#1565C0', fontWeight: 800 }}>Quirófanos</span>
                        </h1>
                        <span style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'capitalize' }}>
                            {todayLabel}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                        fontSize: '0.7rem', color: '#64748B',
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '4px 10px', borderRadius: '20px',
                        background: 'rgba(34, 197, 94, 0.08)',
                        border: '1px solid rgba(34, 197, 94, 0.2)',
                    }}>
                        {lastRefresh.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <button
                        onClick={() => loadData()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '7px 14px', borderRadius: '10px',
                            border: '1px solid rgba(21, 101, 192, 0.2)',
                            background: 'rgba(21, 101, 192, 0.06)',
                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                            color: '#1565C0', transition: 'all 0.2s',
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(21, 101, 192, 0.12)'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'rgba(21, 101, 192, 0.06)'; }}
                    >
                        <RefreshCw size={13} /> Actualizar
                    </button>
                    <button
                        onClick={() => { setShowTutorial(true); setTutorialStep(0); }}
                        title="Ver tutorial de ayuda"
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '34px', height: '34px', borderRadius: '10px',
                            border: '1px solid rgba(99, 102, 241, 0.2)',
                            background: 'rgba(99, 102, 241, 0.06)',
                            cursor: 'pointer', color: '#6366F1',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.06)'; }}
                    >
                        <HelpCircle size={16} />
                    </button>
                </div>
            </header>

            {/* === TOOLBAR === */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 24px',
                background: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(255,255,255,0.3)',
                flexWrap: 'wrap',
                position: 'relative',
                zIndex: 50,
            }}>
                {/* Date tabs */}
                <div style={{
                    display: 'flex', gap: '3px',
                    background: 'rgba(241, 245, 249, 0.8)', borderRadius: '12px', padding: '3px',
                    border: '1px solid rgba(226, 232, 240, 0.5)',
                }}>
                    {DATE_TABS.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setDateTab(tab.key)}
                            style={{
                                padding: '7px 16px', borderRadius: '10px',
                                border: 'none', cursor: 'pointer',
                                fontSize: '0.76rem', fontWeight: 600,
                                background: dateTab === tab.key ? '#fff' : 'transparent',
                                color: dateTab === tab.key ? '#1565C0' : '#64748B',
                                boxShadow: dateTab === tab.key ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                                transition: 'all 0.2s',
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                    <Search size={14} style={{
                        position: 'absolute', left: '12px', top: '50%',
                        transform: 'translateY(-50%)', color: '#94A3B8',
                    }} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, DNI, teléfono, obra social..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%', padding: '8px 12px 8px 34px',
                            borderRadius: '10px',
                            border: '1px solid rgba(226, 232, 240, 0.5)',
                            background: 'rgba(248, 250, 252, 0.8)',
                            fontSize: '0.8rem', color: '#1E293B',
                            outline: 'none', transition: 'all 0.2s',
                        }}
                    />
                </div>

                {/* Count */}
                <span style={{
                    fontSize: '0.76rem', fontWeight: 700, color: '#1565C0',
                    padding: '5px 14px',
                    background: 'rgba(21, 101, 192, 0.07)',
                    borderRadius: '10px',
                    border: '1px solid rgba(21, 101, 192, 0.12)',
                }}>
                    {filtered.length} cirugía{filtered.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* === CONTENT === */}
            <div style={{
                padding: '16px 24px',
                maxWidth: '1200px',
                margin: '0 auto',
                position: 'relative',
                zIndex: 10,
            }}>
                {loading ? (
                    <SkeletonCardGrid cards={6} />
                ) : filtered.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '80px 24px', color: '#94A3B8',
                    }}>
                        <Calendar size={48} strokeWidth={1.2} style={{ margin: '0 auto 16px' }} />
                        <h3 style={{ margin: '0 0 8px', color: '#64748B', fontWeight: 600 }}>
                            No hay cirugías programadas
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.85rem' }}>
                            {searchQuery ? 'No se encontraron resultados para tu búsqueda.' : 'No hay cirugías para el período seleccionado.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {filtered.map(surgery => {
                            const suspended = isSuspended(surgery);
                            const surgComments = comments[surgery.id_paciente] || [];
                            const hasComments = surgComments.length > 0;
                            const isExpanded = expandedCards.has(surgery.id);
                            const patientData = patients[surgery.id_paciente] || {};
                            const statusCfg = STATUS_LABELS[surgery.status] || STATUS_LABELS.lila;
                            const waLink = getWhatsAppLink(surgery.telefono);

                            // LEFT ACCENT COLOR: blue=normal, red=suspended, amber=has observations
                            const accentColor = suspended ? '#DC2626'
                                : hasComments ? '#F59E0B'
                                    : '#1565C0';

                            return (
                                <div
                                    key={surgery.id}
                                    className="recepcion-card"
                                    style={{
                                        display: 'flex',
                                        background: suspended
                                            ? 'rgba(254, 242, 242, 0.85)'
                                            : 'rgba(255, 255, 255, 0.75)',
                                        backdropFilter: 'blur(12px)',
                                        WebkitBackdropFilter: 'blur(12px)',
                                        borderRadius: '16px',
                                        border: '1px solid rgba(255,255,255,0.4)',
                                        overflow: 'hidden',
                                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                        opacity: suspended ? 0.85 : 1,
                                        boxShadow: '0 2px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.02)',
                                    }}
                                >
                                    {/* === LEFT ACCENT BAR === */}
                                    <div style={{
                                        width: '5px',
                                        minHeight: '100%',
                                        background: `linear-gradient(180deg, ${accentColor}, ${accentColor}CC)`,
                                        borderRadius: '16px 0 0 16px',
                                        flexShrink: 0,
                                    }} />

                                    {/* === CARD BODY === */}
                                    <div style={{ flex: 1, minWidth: 0 }}>

                                        {/* --- TOP: Name + Status + WhatsApp --- */}
                                        <div
                                            onClick={() => toggleCard(surgery.id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '14px 16px 10px',
                                                cursor: 'pointer',
                                                gap: '12px',
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseOver={e => { e.currentTarget.style.background = 'rgba(21, 101, 192, 0.03)'; }}
                                            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
                                                <span style={{
                                                    fontWeight: 700, fontSize: '0.95rem',
                                                    color: suspended ? '#B91C1C' : '#0D3B66',
                                                    textDecoration: suspended ? 'line-through' : 'none',
                                                    letterSpacing: '-0.3px',
                                                }}>
                                                    {surgery.nombre}
                                                </span>
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: '20px',
                                                    fontSize: '0.65rem', fontWeight: 700,
                                                    background: suspended ? 'rgba(220, 38, 38, 0.1)' : `${statusCfg.color}14`,
                                                    color: suspended ? '#DC2626' : statusCfg.color,
                                                    border: `1px solid ${suspended ? 'rgba(220,38,38,0.2)' : statusCfg.color + '25'}`,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.04em',
                                                }}>
                                                    {suspended ? '⛔ SUSPENDIDA' : statusCfg.label}
                                                </span>
                                                {hasComments && (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        padding: '3px 10px', borderRadius: '20px',
                                                        background: 'rgba(245, 158, 11, 0.1)',
                                                        color: '#B45309',
                                                        fontSize: '0.65rem', fontWeight: 700,
                                                        border: '1px solid rgba(245, 158, 11, 0.2)',
                                                    }}>
                                                        <MessageSquare size={10} /> {surgComments.length} obs.
                                                    </span>
                                                )}
                                            </div>

                                            {/* Right: WhatsApp + expand */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                {waLink ? (
                                                    <a
                                                        href={waLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={e => e.stopPropagation()}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                            padding: '7px 14px', borderRadius: '12px',
                                                            background: 'rgba(37, 211, 102, 0.12)',
                                                            color: '#15803D',
                                                            fontSize: '0.73rem', fontWeight: 700,
                                                            textDecoration: 'none',
                                                            transition: 'all 0.2s',
                                                            border: '1px solid rgba(37, 211, 102, 0.2)',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                        onMouseOver={e => {
                                                            e.currentTarget.style.background = '#25D366';
                                                            e.currentTarget.style.color = '#fff';
                                                            e.currentTarget.style.transform = 'scale(1.03)';
                                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,211,102,0.3)';
                                                        }}
                                                        onMouseOut={e => {
                                                            e.currentTarget.style.background = 'rgba(37, 211, 102, 0.12)';
                                                            e.currentTarget.style.color = '#15803D';
                                                            e.currentTarget.style.transform = 'scale(1)';
                                                            e.currentTarget.style.boxShadow = 'none';
                                                        }}
                                                    >
                                                        <WhatsAppIcon size={14} />
                                                        {surgery.telefono}
                                                    </a>
                                                ) : (
                                                    <span style={{
                                                        fontSize: '0.7rem', color: '#94A3B8',
                                                        padding: '6px 10px',
                                                        background: 'rgba(241,245,249,0.6)',
                                                        borderRadius: '8px',
                                                        border: '1px solid rgba(226,232,240,0.3)',
                                                    }}>
                                                        Sin tel.
                                                    </span>
                                                )}
                                                <div style={{
                                                    width: '28px', height: '28px', borderRadius: '8px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: 'rgba(21, 101, 192, 0.06)',
                                                    transition: 'all 0.2s',
                                                }}>
                                                    {isExpanded
                                                        ? <ChevronUp size={15} style={{ color: '#1565C0' }} />
                                                        : <ChevronDown size={15} style={{ color: '#64748B' }} />
                                                    }
                                                </div>
                                            </div>
                                        </div>

                                        {/* --- DETAILS GRID (2 columns) --- */}
                                        <div
                                            onClick={() => toggleCard(surgery.id)}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                                gap: '0',
                                                padding: '0 16px 12px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {[
                                                { icon: <User size={12} />, label: 'ID Paciente', value: surgery.id_paciente || '—' },
                                                { icon: <FileText size={12} />, label: 'DNI', value: surgery.dni || patientData.dni || '—' },
                                                { icon: <Calendar size={12} />, label: 'Cirugía', value: formatDate(surgery.fecha_cirugia) },
                                                { icon: <Stethoscope size={12} />, label: 'Médico', value: surgery.medico || '—' },
                                                { icon: null, label: 'Obra Social', value: surgery.obra_social || '—', isBadge: true },
                                                { icon: null, label: 'Edad / Sexo', value: `${patientData.edad || '—'} años · ${patientData.sexo || '—'}` },
                                            ].map((item, idx) => (
                                                <div key={idx} style={{
                                                    padding: '6px 8px',
                                                    borderRadius: '8px',
                                                    background: 'rgba(241, 245, 249, 0.4)',
                                                    margin: '2px',
                                                }}>
                                                    <div style={{
                                                        fontSize: '0.62rem', fontWeight: 600,
                                                        color: '#94A3B8', textTransform: 'uppercase',
                                                        letterSpacing: '0.06em',
                                                        marginBottom: '2px',
                                                        display: 'flex', alignItems: 'center', gap: '3px',
                                                    }}>
                                                        {item.icon} {item.label}
                                                    </div>
                                                    {item.isBadge ? (
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '1px 8px', borderRadius: '6px',
                                                            background: 'rgba(21, 101, 192, 0.08)',
                                                            color: '#1565C0',
                                                            fontSize: '0.74rem', fontWeight: 700,
                                                            border: '1px solid rgba(21, 101, 192, 0.12)',
                                                        }}>
                                                            {item.value}
                                                        </span>
                                                    ) : (
                                                        <div style={{
                                                            fontSize: '0.78rem', fontWeight: 600,
                                                            color: '#0D3B66',
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                        }}>
                                                            {item.value}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {/* --- EXPANDED: Procedure + Observations --- */}
                                        {isExpanded && (
                                            <div style={{
                                                borderTop: '1px solid rgba(226,232,240,0.4)',
                                            }}>
                                                {/* Procedure */}
                                                {surgery.modulo && (
                                                    <div style={{
                                                        padding: '10px 16px',
                                                        fontSize: '0.78rem',
                                                        color: '#475569',
                                                        background: 'rgba(241, 245, 249, 0.5)',
                                                        borderBottom: '1px solid rgba(226,232,240,0.3)',
                                                        display: 'flex', alignItems: 'flex-start', gap: '6px',
                                                    }}>
                                                        <span style={{
                                                            fontWeight: 700, color: '#1565C0',
                                                            fontSize: '0.7rem', textTransform: 'uppercase',
                                                            letterSpacing: '0.04em',
                                                            whiteSpace: 'nowrap',
                                                            marginTop: '1px',
                                                        }}>
                                                            Procedimiento
                                                        </span>
                                                        <span style={{ color: '#0D3B66', fontWeight: 500 }}>
                                                            {surgery.modulo}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Observations - amber glass */}
                                                <div style={{
                                                    padding: '12px 16px',
                                                    background: hasComments
                                                        ? 'rgba(254, 243, 199, 0.45)'
                                                        : 'rgba(241, 245, 249, 0.3)',
                                                    backdropFilter: 'blur(6px)',
                                                }}>
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: '6px',
                                                        marginBottom: hasComments ? '10px' : '0',
                                                        fontSize: '0.68rem', fontWeight: 700,
                                                        color: hasComments ? '#92400E' : '#94A3B8',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.06em',
                                                    }}>
                                                        <MessageSquare size={12} />
                                                        Observaciones {!hasComments && (
                                                            <span style={{ fontWeight: 400, textTransform: 'none', fontStyle: 'italic' }}>
                                                                — Sin observaciones registradas
                                                            </span>
                                                        )}
                                                    </div>

                                                    {hasComments && (
                                                        <div style={{
                                                            display: 'flex', flexDirection: 'column', gap: '8px',
                                                        }}>
                                                            {surgComments.map(c => (
                                                                <div
                                                                    key={c.id}
                                                                    style={{
                                                                        padding: '10px 14px',
                                                                        background: 'rgba(255, 255, 255, 0.75)',
                                                                        backdropFilter: 'blur(8px)',
                                                                        borderRadius: '12px',
                                                                        border: '1px solid rgba(253, 230, 138, 0.5)',
                                                                        fontSize: '0.82rem',
                                                                        color: '#1E293B',
                                                                        lineHeight: 1.6,
                                                                        boxShadow: '0 1px 4px rgba(245, 158, 11, 0.06)',
                                                                        position: 'relative',
                                                                    }}
                                                                >
                                                                    {/* Chat bubble pointer */}
                                                                    <div style={{
                                                                        position: 'absolute', left: '-6px', top: '12px',
                                                                        width: '12px', height: '12px',
                                                                        background: 'rgba(255, 255, 255, 0.75)',
                                                                        border: '1px solid rgba(253, 230, 138, 0.5)',
                                                                        borderRight: 'none', borderTop: 'none',
                                                                        transform: 'rotate(45deg)',
                                                                    }} />
                                                                    <div style={{
                                                                        display: 'flex', alignItems: 'center',
                                                                        justifyContent: 'space-between',
                                                                        marginBottom: '6px',
                                                                    }}>
                                                                        <span style={{
                                                                            fontSize: '0.7rem', fontWeight: 700,
                                                                            color: '#B45309',
                                                                            display: 'flex', alignItems: 'center', gap: '4px',
                                                                        }}>
                                                                            <div style={{
                                                                                width: '18px', height: '18px', borderRadius: '50%',
                                                                                background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                fontSize: '0.55rem', fontWeight: 800, color: '#fff',
                                                                            }}>
                                                                                {c.user_name?.charAt(0)?.toUpperCase() || '?'}
                                                                            </div>
                                                                            {c.user_name}
                                                                        </span>
                                                                        <span style={{
                                                                            fontSize: '0.65rem', color: '#94A3B8',
                                                                            fontWeight: 500,
                                                                        }}>
                                                                            <Clock size={10} style={{ marginRight: '3px', verticalAlign: '-1px' }} />
                                                                            {formatCommentTime(c.created_at)}
                                                                        </span>
                                                                    </div>
                                                                    <div style={{ paddingLeft: '22px' }}>
                                                                        {c.comment}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Instrucciones de Quirófano - teal/blue glass */}
                                                {surgery.instrucciones && (
                                                    <div style={{
                                                        padding: '12px 16px',
                                                        background: 'rgba(204, 251, 241, 0.45)',
                                                        backdropFilter: 'blur(6px)',
                                                        borderTop: '1px solid rgba(226,232,240,0.3)',
                                                    }}>
                                                        <div style={{
                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                            marginBottom: '10px',
                                                            fontSize: '0.68rem', fontWeight: 700,
                                                            color: '#0F766E',
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.06em',
                                                        }}>
                                                            <FileText size={12} />
                                                            Instrucciones de Quirófano
                                                        </div>
                                                        <div style={{
                                                            padding: '10px 14px',
                                                            background: 'rgba(255, 255, 255, 0.75)',
                                                            backdropFilter: 'blur(8px)',
                                                            borderRadius: '12px',
                                                            border: '1px solid rgba(94, 234, 212, 0.5)',
                                                            fontSize: '0.82rem',
                                                            color: '#134E4A',
                                                            lineHeight: 1.6,
                                                            fontWeight: 500,
                                                            boxShadow: '0 1px 4px rgba(20, 184, 166, 0.06)',
                                                            whiteSpace: 'pre-wrap',
                                                        }}>
                                                            {surgery.instrucciones}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* === CSS Animations === */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .recepcion-card:hover {
                    box-shadow: 0 8px 32px rgba(21, 101, 192, 0.1), 0 2px 8px rgba(0,0,0,0.04) !important;
                    transform: translateY(-2px);
                }
                .recepcion-card {
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
                }
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(21, 101, 192, 0.15); border-radius: 3px; }
                ::-webkit-scrollbar-thumb:hover { background: rgba(21, 101, 192, 0.3); }
            `}</style>

            {/* === TUTORIAL MODAL === */}
            {showTutorial && (
                <div
                    className="tutorial-overlay"
                    onClick={(e) => { if (e.target === e.currentTarget) closeTutorial(); }}
                >
                    <div className="tutorial-modal">
                        {/* Close button */}
                        <button
                            className="tutorial-close"
                            onClick={closeTutorial}
                            title="Cerrar tutorial"
                        >
                            <X size={18} />
                        </button>

                        {/* Step indicator */}
                        <div className="tutorial-steps-bar">
                            {TUTORIAL_STEPS.map((_, idx) => (
                                <button
                                    key={idx}
                                    className={`tutorial-step-dot${idx === tutorialStep ? ' active' : ''}${idx < tutorialStep ? ' completed' : ''}`}
                                    onClick={() => setTutorialStep(idx)}
                                    style={{
                                        '--dot-color': idx === tutorialStep
                                            ? TUTORIAL_STEPS[tutorialStep].color
                                            : idx < tutorialStep ? '#94A3B8' : '#E2E8F0',
                                    }}
                                />
                            ))}
                        </div>

                        {/* Icon + Title */}
                        <div className="tutorial-header" style={{ color: TUTORIAL_STEPS[tutorialStep].color }}>
                            <div className="tutorial-icon" style={{ background: `${TUTORIAL_STEPS[tutorialStep].color}12`, color: TUTORIAL_STEPS[tutorialStep].color }}>
                                {TUTORIAL_STEPS[tutorialStep].icon}
                            </div>
                            <div>
                                <span className="tutorial-step-label">Paso {tutorialStep + 1} de {TUTORIAL_STEPS.length}</span>
                                <h2 className="tutorial-title">{TUTORIAL_STEPS[tutorialStep].title}</h2>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="tutorial-content">
                            {TUTORIAL_STEPS[tutorialStep].content.map((line, idx) => (
                                <div
                                    key={idx}
                                    className="tutorial-line"
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(line) }}
                                />
                            ))}
                        </div>

                        {/* Navigation */}
                        <div className="tutorial-nav">
                            <button
                                className="tutorial-btn tutorial-btn--secondary"
                                onClick={() => setTutorialStep(s => Math.max(0, s - 1))}
                                disabled={tutorialStep === 0}
                            >
                                <ArrowLeft size={14} /> Anterior
                            </button>
                            <span className="tutorial-counter">{tutorialStep + 1} / {TUTORIAL_STEPS.length}</span>
                            {tutorialStep < TUTORIAL_STEPS.length - 1 ? (
                                <button
                                    className="tutorial-btn tutorial-btn--primary"
                                    onClick={() => setTutorialStep(s => s + 1)}
                                    style={{ background: TUTORIAL_STEPS[tutorialStep].color }}
                                >
                                    Siguiente <ArrowRight size={14} />
                                </button>
                            ) : (
                                <button
                                    className="tutorial-btn tutorial-btn--primary"
                                    onClick={closeTutorial}
                                    style={{ background: '#16A34A' }}
                                >
                                    ¡Entendido! ✓
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Tutorial CSS */}
            <style>{`
                .tutorial-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(15, 23, 42, 0.6);
                    backdrop-filter: blur(6px);
                    -webkit-backdrop-filter: blur(6px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    animation: tutorialFadeIn 0.25s ease;
                    padding: 20px;
                }
                @keyframes tutorialFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .tutorial-modal {
                    background: #fff;
                    border-radius: 20px;
                    width: 100%;
                    max-width: 560px;
                    box-shadow: 0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04);
                    position: relative;
                    overflow: hidden;
                    animation: tutorialSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes tutorialSlideUp {
                    from { transform: translateY(30px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .tutorial-close {
                    position: absolute;
                    top: 16px; right: 16px;
                    width: 32px; height: 32px;
                    border-radius: 8px;
                    border: none;
                    background: rgba(241,245,249,0.8);
                    color: #64748B;
                    cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.15s;
                    z-index: 2;
                }
                .tutorial-close:hover {
                    background: #F1F5F9;
                    color: #1E293B;
                }
                .tutorial-steps-bar {
                    display: flex;
                    gap: 6px;
                    padding: 20px 24px 0;
                    justify-content: center;
                }
                .tutorial-step-dot {
                    width: 32px; height: 4px;
                    border-radius: 2px;
                    border: none;
                    background: var(--dot-color, #E2E8F0);
                    cursor: pointer;
                    transition: all 0.25s;
                    padding: 0;
                }
                .tutorial-step-dot.active {
                    width: 48px;
                }
                .tutorial-step-dot.completed {
                    opacity: 0.5;
                }
                .tutorial-header {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 20px 24px 0;
                }
                .tutorial-icon {
                    width: 52px; height: 52px;
                    border-radius: 14px;
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0;
                }
                .tutorial-step-label {
                    font-size: 0.7rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    opacity: 0.7;
                }
                .tutorial-title {
                    margin: 2px 0 0;
                    font-size: 1.25rem;
                    font-weight: 800;
                    color: #0F2B46;
                    letter-spacing: -0.3px;
                }
                .tutorial-content {
                    padding: 16px 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    max-height: 320px;
                    overflow-y: auto;
                }
                .tutorial-line {
                    font-size: 0.88rem;
                    line-height: 1.65;
                    color: #334155;
                    padding: 8px 12px;
                    background: #F8FAFC;
                    border-radius: 10px;
                    border-left: 3px solid #E2E8F0;
                }
                .tutorial-line strong {
                    color: #0F2B46;
                    font-weight: 700;
                }
                .tutorial-nav {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px 24px;
                    border-top: 1px solid #F1F5F9;
                    background: #FAFBFC;
                    border-radius: 0 0 20px 20px;
                }
                .tutorial-counter {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: #94A3B8;
                }
                .tutorial-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 9px 18px;
                    border-radius: 10px;
                    border: none;
                    font-size: 0.82rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.15s;
                    font-family: inherit;
                }
                .tutorial-btn--secondary {
                    background: #F1F5F9;
                    color: #64748B;
                }
                .tutorial-btn--secondary:hover:not(:disabled) {
                    background: #E2E8F0;
                    color: #334155;
                }
                .tutorial-btn--secondary:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                .tutorial-btn--primary {
                    background: #1565C0;
                    color: #fff;
                    box-shadow: 0 2px 8px rgba(21,101,192,0.25);
                }
                .tutorial-btn--primary:hover {
                    filter: brightness(1.1);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(21,101,192,0.3);
                }
            `}</style>
        </div>

    );
}
