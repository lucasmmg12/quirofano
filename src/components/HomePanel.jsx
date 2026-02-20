import { useState } from 'react';
import {
    Home, ClipboardList, History, BookOpen, Stethoscope, Settings,
    FileText, Upload, MessageSquare, Search, Printer, Send,
    ChevronDown, ChevronRight, CheckCircle2, AlertTriangle,
    Phone, Calendar, Shield, Zap, Users, ArrowRight, Info,
    MousePointerClick, Eye, RefreshCw,
} from 'lucide-react';

const GUIDE_SECTIONS = [
    {
        id: 'pedidos',
        title: 'Emisión de Pedidos',
        icon: FileText,
        color: '#3B82F6',
        bg: '#EFF6FF',
        description: 'Creá, imprimí y enviá pedidos médicos de forma rápida y organizada.',
        subsections: [
            {
                title: '📝 Nuevo Pedido',
                icon: ClipboardList,
                steps: [
                    { icon: Users, text: 'Completá los datos del paciente: nombre, obra social, afiliado, diagnóstico y médico.' },
                    { icon: Search, text: 'Buscá prácticas en el nomenclador usando el buscador inteligente. Podés buscar por nombre o código.' },
                    { icon: MousePointerClick, text: 'Hacé clic en "Agregar" para sumar prácticas al carrito. Podés modificar cantidad y lateralidad.' },
                    { icon: Printer, text: 'Imprimí el pedido completo o individual con un clic.' },
                    { icon: Send, text: 'Enviá el pedido por WhatsApp directamente al paciente o al médico.' },
                ],
                tips: [
                    'Podés agregar múltiples prácticas en un solo pedido.',
                    'El sistema recuerda los datos mientras no cierres la página.',
                    'Cada pedido impreso o enviado se guarda automáticamente en el historial.',
                ],
            },
            {
                title: '📋 Historial',
                icon: History,
                steps: [
                    { icon: Eye, text: 'Consultá todos los pedidos generados, ordenados por fecha.' },
                    { icon: Info, text: 'Cada registro muestra paciente, obra social, prácticas incluidas, fecha y estado (impreso/enviado).' },
                ],
                tips: [
                    'El historial se actualiza automáticamente cada vez que generás un pedido.',
                ],
            },
            {
                title: '📖 Nomenclador',
                icon: BookOpen,
                steps: [
                    { icon: Search, text: 'Explorá el nomenclador completo de prácticas médicas.' },
                    { icon: Info, text: 'Filtrá por categoría, código o nombre para encontrar rápidamente lo que necesitás.' },
                ],
                tips: [
                    'El nomenclador es la base de datos de referencia. Las prácticas que agregás al pedido salen de acá.',
                ],
            },
        ],
    },
    {
        id: 'cirugias',
        title: 'Control de Cirugías',
        icon: Stethoscope,
        color: '#10B981',
        bg: '#ECFDF5',
        description: 'Gestioná las cirugías programadas, controlá estados y mantené comunicación con los pacientes.',
        subsections: [
            {
                title: '📤 Carga desde Excel',
                icon: Upload,
                steps: [
                    { icon: Upload, text: 'Arrastrá o seleccioná un archivo Excel (.xlsx) con la planilla de cirugías.' },
                    { icon: Eye, text: 'El sistema muestra una vista previa con los registros detectados y resalta errores.' },
                    { icon: AlertTriangle, text: 'Los teléfonos inválidos se marcan en rojo para que los corrijas antes de confirmar.' },
                    { icon: CheckCircle2, text: 'Confirmá la carga. El sistema inserta los nuevos y actualiza los existentes automáticamente.' },
                ],
                tips: [
                    'Las filas que empiezan con "BLOQUE" se descartan automáticamente.',
                    'Si un paciente ya existe (mismo DNI + fecha), se actualizan sus datos en vez de duplicar.',
                    'El código de área se aplica automáticamente a los teléfonos que no lo tengan.',
                ],
            },
            {
                title: '📊 Tabla de Cirugías',
                icon: Calendar,
                steps: [
                    { icon: Eye, text: 'Las cirugías se agrupan por fecha. Cada día muestra un contador de cirugías y un indicador de urgencia.' },
                    { icon: MousePointerClick, text: 'Tocá el encabezado del día para expandir y ver las cirugías de esa fecha.' },
                    { icon: MousePointerClick, text: 'Tocá una fila para ver los detalles expandidos del paciente.' },
                    { icon: Zap, text: 'El indicador de color a la izquierda muestra la urgencia: 🟢 tranquilo, 🟡 próximo, 🔴 crítico.' },
                ],
                tips: [
                    'Usá las pestañas "Próximas" e "Historial" para alternar entre cirugías futuras y pasadas.',
                    'El buscador filtra por nombre, DNI, teléfono, médico u obra social.',
                    'Los días se muestran colapsados por defecto para mejor rendimiento.',
                ],
            },
            {
                title: '🔄 Gestión de Estado',
                icon: RefreshCw,
                steps: [
                    { icon: MousePointerClick, text: 'Hacé clic en el badge de estado (ej: "Lila", "Notificado") para abrir el menú de cambio.' },
                    { icon: CheckCircle2, text: 'Seleccioná el nuevo estado. El sistema registra automáticamente quién y cuándo hizo el cambio.' },
                    { icon: MessageSquare, text: 'Algunos cambios de estado envían notificaciones automáticas por WhatsApp al paciente.' },
                ],
                tips: [
                    'Los estados siguen un flujo: Lila → Notificado → Doc. Recibida → Autorizada → Confirmada.',
                    'Podés saltar estados haciendo cambio manual desde el dropdown.',
                ],
            },
            {
                title: '💬 Chat WhatsApp',
                icon: MessageSquare,
                steps: [
                    { icon: Phone, text: 'Cada paciente con teléfono registrado tiene el botón de chat (💬) en su fila.' },
                    { icon: MessageSquare, text: 'Abrí el chat para ver el historial de mensajes y enviar mensajes personalizados.' },
                    { icon: Send, text: 'Escribí el mensaje y presioná enviar. El mensaje llega directo al WhatsApp del paciente.' },
                ],
                tips: [
                    'Los mensajes enviados y recibidos se guardan en el historial.',
                    'El badge rojo indica mensajes sin leer.',
                ],
            },
        ],
    },
    {
        id: 'config',
        title: 'Configuración',
        icon: Settings,
        color: '#8B5CF6',
        bg: '#F5F3FF',
        description: 'Configurá las credenciales de WhatsApp/BuilderBot y los parámetros generales del sistema.',
        subsections: [
            {
                title: '⚙️ Ajustes del Sistema',
                icon: Settings,
                steps: [
                    { icon: Shield, text: 'Configurá el API Key y Project ID de BuilderBot para habilitar el envío de WhatsApp.' },
                    { icon: Phone, text: 'Definí el número de WhatsApp del sanatorio y el código de área por defecto.' },
                    { icon: Zap, text: 'Usá el botón "Probar Conexión" para verificar que las credenciales funcionen correctamente.' },
                ],
                tips: [
                    'Los campos sensibles (API Key) se muestran ocultos por seguridad. Usá el ícono 👁️ para revelarlos.',
                    'Después de cambiar credenciales, es recomendable probar la conexión antes de usar el sistema.',
                ],
            },
        ],
    },
];

function GuideSubsection({ sub, sectionColor }) {
    const [open, setOpen] = useState(false);
    const Icon = sub.icon;
    return (
        <div style={{
            border: '1px solid var(--neutral-200, #E2E8F0)',
            borderRadius: '12px', overflow: 'hidden',
            transition: 'all 0.2s',
            boxShadow: open ? '0 2px 12px rgba(0,0,0,0.06)' : 'none',
        }}>
            <button
                onClick={() => setOpen(p => !p)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    width: '100%', padding: '14px 18px', border: 'none',
                    background: open ? sectionColor + '08' : '#fff',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.15s',
                }}
            >
                <ChevronRight size={14} style={{
                    transition: 'transform 0.2s', color: sectionColor,
                    transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                }} />
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--neutral-800, #1E293B)' }}>
                    {sub.title}
                </span>
            </button>

            {open && (
                <div className="animate-fade-in" style={{ padding: '0 18px 18px' }}>
                    {/* Steps */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                        {sub.steps.map((step, i) => {
                            const StepIcon = step.icon;
                            return (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                                    padding: '10px 14px', borderRadius: '10px',
                                    background: 'var(--neutral-50, #F8FAFC)',
                                }}>
                                    <div style={{
                                        width: '28px', height: '28px', borderRadius: '8px',
                                        background: sectionColor + '15', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}>
                                        <StepIcon size={14} style={{ color: sectionColor }} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            width: '20px', height: '20px', borderRadius: '50%',
                                            background: sectionColor, color: '#fff',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.65rem', fontWeight: 800, flexShrink: 0,
                                        }}>{i + 1}</span>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--neutral-700, #334155)', lineHeight: 1.5 }}>
                                            {step.text}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Tips */}
                    {sub.tips && sub.tips.length > 0 && (
                        <div style={{
                            marginTop: '14px', padding: '12px 14px',
                            background: '#FFFBEB', borderRadius: '10px',
                            borderLeft: '3px solid #F59E0B',
                        }}>
                            <p style={{ fontWeight: 700, fontSize: '0.78rem', color: '#B45309', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <AlertTriangle size={13} /> Tips
                            </p>
                            {sub.tips.map((tip, i) => (
                                <p key={i} style={{ fontSize: '0.8rem', color: '#92400E', marginBottom: i < sub.tips.length - 1 ? '4px' : 0, paddingLeft: '4px' }}>
                                    • {tip}
                                </p>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function GuideSection({ section }) {
    const [expanded, setExpanded] = useState(false);
    const Icon = section.icon;

    return (
        <div style={{
            background: '#fff', borderRadius: '16px',
            border: '1px solid var(--neutral-200, #E2E8F0)',
            overflow: 'hidden', transition: 'box-shadow 0.2s',
            boxShadow: expanded ? '0 4px 20px rgba(0,0,0,0.06)' : 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))',
        }}>
            {/* Header */}
            <button
                onClick={() => setExpanded(p => !p)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    width: '100%', padding: '20px 24px', border: 'none',
                    background: expanded ? section.bg : '#fff',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.2s',
                }}
            >
                <div style={{
                    width: '44px', height: '44px', borderRadius: '12px',
                    background: section.color + '15',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={22} style={{ color: section.color }} />
                </div>
                <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--neutral-800, #1E293B)', margin: 0 }}>
                        {section.title}
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--neutral-500, #64748B)', margin: '2px 0 0' }}>
                        {section.description}
                    </p>
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '4px 12px', borderRadius: '20px',
                    background: section.color + '10', color: section.color,
                    fontSize: '0.72rem', fontWeight: 600,
                }}>
                    {section.subsections.length} tema{section.subsections.length !== 1 ? 's' : ''}
                    <ChevronDown size={14} style={{
                        transition: 'transform 0.2s',
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }} />
                </div>
            </button>

            {/* Content */}
            {expanded && (
                <div className="animate-fade-in" style={{
                    padding: '0 24px 24px',
                    display: 'flex', flexDirection: 'column', gap: '10px',
                }}>
                    {section.subsections.map((sub, i) => (
                        <GuideSubsection key={i} sub={sub} sectionColor={section.color} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function HomePanel() {
    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';

    return (
        <div className="content no-print" style={{ maxWidth: '900px', margin: '0 auto' }}>
            {/* Welcome Card */}
            <div className="animate-fade-in" style={{
                background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 50%, #60A5FA 100%)',
                borderRadius: '20px', padding: '36px 40px', color: '#fff',
                marginBottom: '28px', position: 'relative', overflow: 'hidden',
            }}>
                {/* Decorative circles */}
                <div style={{
                    position: 'absolute', top: '-30px', right: '-30px',
                    width: '140px', height: '140px', borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)',
                }} />
                <div style={{
                    position: 'absolute', bottom: '-20px', right: '80px',
                    width: '80px', height: '80px', borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)',
                }} />

                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <Home size={28} style={{ opacity: 0.9 }} />
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
                            {saludo} 👋
                        </h1>
                    </div>
                    <p style={{ fontSize: '1rem', opacity: 0.9, marginBottom: '16px', maxWidth: '600px', lineHeight: 1.6 }}>
                        Bienvenido al <strong>Sistema de Administración</strong> del Sanatorio Argentino.
                        Desde acá podés gestionar pedidos médicos, controlar cirugías y comunicarte con los pacientes.
                    </p>
                    <div style={{
                        display: 'flex', gap: '12px', flexWrap: 'wrap',
                    }}>
                        {[
                            { icon: FileText, label: 'Pedidos', count: '3 módulos' },
                            { icon: Stethoscope, label: 'Cirugías', count: 'Control total' },
                            { icon: MessageSquare, label: 'WhatsApp', count: 'Integrado' },
                        ].map((item, i) => {
                            const Icon = item.icon;
                            return (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '8px 16px', borderRadius: '12px',
                                    background: 'rgba(255,255,255,0.15)',
                                    backdropFilter: 'blur(10px)',
                                    fontSize: '0.82rem', fontWeight: 600,
                                }}>
                                    <Icon size={16} />
                                    <span>{item.label}</span>
                                    <span style={{
                                        fontSize: '0.68rem', opacity: 0.7,
                                        padding: '2px 8px', background: 'rgba(255,255,255,0.15)',
                                        borderRadius: '8px',
                                    }}>{item.count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* User Guide */}
            <div style={{ marginBottom: '12px' }}>
                <h2 style={{
                    fontSize: '1.15rem', fontWeight: 800,
                    color: 'var(--neutral-800, #1E293B)',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    marginBottom: '4px',
                }}>
                    <BookOpen size={20} style={{ color: 'var(--primary-500, #3B82F6)' }} />
                    Guía del Usuario
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--neutral-500, #64748B)', marginBottom: '20px' }}>
                    Tocá cada sección para aprender cómo usar el sistema paso a paso.
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '40px' }}>
                {GUIDE_SECTIONS.map(section => (
                    <GuideSection key={section.id} section={section} />
                ))}
            </div>
        </div>
    );
}
