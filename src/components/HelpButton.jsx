import { useState, useEffect, useCallback } from 'react';
import { HelpCircle, X, ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';

// ─── Help content per module ───
const HELP_CONTENT = {
    altas: {
        title: 'Control de Altas',
        icon: '📋',
        slides: [
            {
                img: '/help/altas_overview.png',
                title: 'Vista General',
                desc: 'La tabla muestra todos los pacientes dados de alta. Podés filtrar por fecha, estado, obra social y buscar por nombre o Nro de admisión.',
            },
            {
                title: '🔄 Estados del Alta',
                desc: '• **Vacío**: Sin procesar aún\n• **Procesada**: Ficha completa, lista para facturación\n• **Facturada**: Ya fue facturada en SALUS (automático)\n• **Devuelta FAC**: Facturación devolvió la ficha por errores\n\nLos estados "Facturada" y "Devuelta FAC" se asignan automáticamente.',
            },
            {
                title: '📦 Traspaso a Facturación',
                desc: '1. Seleccioná las fichas con los checkboxes\n2. Hacé click en **"Traspasar a Facturación"**\n3. Confirmá en el diálogo\n4. Se genera un **remito PDF** automáticamente\n5. Las fichas aparecen en el módulo de Facturación',
            },
            {
                title: '💡 Tips',
                desc: '• Usá **Ctrl+K** para buscar rápidamente\n• Los estados en **rojo** requieren atención inmediata\n• Podés exportar la tabla a Excel con el botón de descarga\n• Si una ficha fue devuelta, corregí los datos y volvé a traspasar',
            },
        ],
    },
    facturacion: {
        title: 'Facturación Internada',
        icon: '🧾',
        slides: [
            {
                img: '/help/facturacion_overview.png',
                title: 'Vista General',
                desc: 'El panel muestra los KPIs de facturación arriba y la tabla de fichas abajo. Cada ficha tiene estado, responsable asignado y acciones disponibles.',
            },
            {
                title: '📊 KPIs',
                desc: '• **Total Fichas**: Cantidad total recibidas de Control de Altas\n• **Pendientes**: Fichas sin asignar responsable\n• **En Proceso**: Fichas con responsable asignado, en trabajo\n• **Facturadas**: Fichas completadas en SALUS',
            },
            {
                title: '🔙 Devolver Fichas',
                desc: '1. Seleccioná la ficha con errores\n2. Click en botón **"Devolver"**\n3. Escribí el motivo de devolución\n4. La ficha vuelve a Control de Altas con estado "Devuelta FAC"\n5. El responsable de Altas verá la devolución y el motivo',
            },
            {
                title: '👤 Asignación de Responsable',
                desc: 'Hacé click en la celda de **Responsable** para asignar quién procesará cada ficha. El responsable verá sus fichas asignadas en su bandeja personal.',
            },
        ],
    },
    cirugias: {
        title: 'Control de Cirugías',
        icon: '🏥',
        slides: [
            {
                img: '/help/cirugias_overview.png',
                title: 'Vista General',
                desc: 'La tabla muestra todas las cirugías programadas. Podés filtrar por fecha, quirófano, cirujano y estado de confirmación.',
            },
            {
                title: '✅ Confirmar Cirugías',
                desc: '• Click en el estado para cambiar entre **Pendiente → Confirmada → Suspendida**\n• Las cirugías confirmadas se muestran en verde\n• Las suspendidas aparecen tachadas en rojo\n• Podés agregar notas a cada cirugía',
            },
            {
                title: '📱 Envío por WhatsApp',
                desc: '1. Seleccioná una o más cirugías\n2. Click en el botón **WhatsApp**\n3. Elegí la plantilla (confirmación, recordatorio, etc.)\n4. Se envía automáticamente al paciente\n5. El estado del envío queda registrado',
            },
            {
                title: '📈 Métricas',
                desc: 'Accedé al submódulo **Métricas** desde el sidebar para ver:\n• Cirugías por mes/especialidad\n• Tasa de cancelación\n• Quirófanos más utilizados\n• Comparativas mensuales',
            },
        ],
    },
    deudas: {
        title: 'Gestión de Deudas',
        icon: '💰',
        slides: [
            {
                img: '/help/deudas_overview.png',
                title: 'Vista General',
                desc: 'Panel de seguimiento de deudas de pacientes. Muestra montos pendientes, estado de contacto y herramientas de comunicación.',
            },
            {
                title: '📞 Contactar Pacientes',
                desc: '• Click en el ícono de **WhatsApp** para enviar mensaje directo\n• Usá las **plantillas predefinidas** para agilizar\n• Cada contacto queda registrado con fecha y hora\n• El estado cambia a "Contactado" automáticamente',
            },
            {
                title: '📥 Exportar a Excel',
                desc: 'Usá el botón de **exportar** para descargar la tabla completa en formato Excel. Útil para auditorías y reportes mensuales de cobranza.',
            },
        ],
    },
    pedidos: {
        title: 'Emisión de Pedidos',
        icon: '📝',
        slides: [
            {
                img: '/help/pedidos_overview.png',
                title: 'Vista General',
                desc: 'Formulario de creación de pedidos médicos. Completá los datos del paciente arriba, buscá prácticas del nomenclador y agregalas al carrito.',
            },
            {
                title: '🔍 Buscar Prácticas',
                desc: '1. Escribí el nombre o código de la práctica\n2. Los resultados aparecen instantáneamente\n3. Click en **"Agregar"** para sumar al carrito\n4. Podés buscar también en la sección de **Internación**',
            },
            {
                title: '🛒 Carrito y Acciones',
                desc: '• **Imprimir**: Genera el pedido en formato oficial para firma\n• **WhatsApp**: Envía el pedido al celular del médico/paciente\n• **Cantidad**: Ajustá la cantidad de cada práctica\n• **Eliminar**: Quitá prácticas del carrito con el ícono X',
            },
            {
                title: '📂 Historial',
                desc: 'Todos los pedidos impresos o enviados se guardan automáticamente. Accedé desde **Historial** en el menú lateral para reimprimir o consultar pedidos anteriores.',
            },
        ],
    },
    mensajeria: {
        title: 'Mensajería WhatsApp',
        icon: '💬',
        slides: [
            {
                img: '/help/mensajeria_overview.png',
                title: 'Vista General',
                desc: 'Chat bidireccional con pacientes vía WhatsApp. Panel izquierdo muestra conversaciones, panel derecho el chat activo.',
            },
            {
                title: '📨 Enviar Mensajes',
                desc: '• Escribí el mensaje y enviá con Enter o el botón\n• Usá **plantillas** para mensajes frecuentes\n• Las plantillas permiten variables como {nombre}, {fecha}\n• Los mensajes se envían desde el número institucional',
            },
            {
                title: '🔔 Notificaciones',
                desc: '• Los mensajes nuevos muestran un **badge** en el sidebar\n• Se reproduce un sonido de notificación\n• Un toast aparece aunque estés en otro módulo\n• Los mensajes no leídos se marcan con indicador azul',
            },
        ],
    },
    turnos: {
        title: 'Cola de Turnos',
        icon: '🎫',
        slides: [
            {
                img: '/help/turnos_overview.png',
                title: 'Vista General',
                desc: 'Sistema de gestión de cola de espera. Muestra pacientes por estado: En Espera, En Atención, Atendidos. Incluye tiempos de espera.',
            },
            {
                title: '⏱️ Gestión de Turnos',
                desc: '• **Llamar paciente**: Mové al siguiente de la cola\n• **En atención**: El paciente está siendo atendido\n• **Finalizar**: Marcá como atendido\n• El tiempo de espera se calcula automáticamente',
            },
            {
                title: '📊 Estadísticas',
                desc: '• Tiempo promedio de espera en tiempo real\n• Pacientes atendidos por hora/día\n• Picos de demanda por franja horaria\n• Todo exportable para reportes',
            },
        ],
    },
    auditoria_historias: {
        title: 'Auditoría de H.C.',
        icon: '📑',
        slides: [
            {
                img: '/help/auditoria_overview.png',
                title: 'Vista General',
                desc: 'Pipeline de auditoría de historias clínicas. Verificá que cada historia tenga evolución, alta médica y epicrisis completas.',
            },
            {
                title: '✔️ Criterios de Auditoría',
                desc: '• **Evolución diaria**: ¿Tiene registros de evolución?\n• **Alta médica**: ¿Fue firmada por el médico?\n• **Epicrisis**: ¿Está completa y firmada?\n• **Fecha de alta**: ¿Coincide con el sistema?',
            },
            {
                title: '📋 Flujo de Trabajo',
                desc: '1. Las fichas entran como **Sin Revisar**\n2. Movelas a **En Revisión** al comenzar\n3. Marcá como **Aprobado** o **Rechazado**\n4. Las rechazadas generan una alerta al área correspondiente',
            },
        ],
    },
    asignaciones: {
        title: 'Asignaciones',
        icon: '👥',
        slides: [
            {
                title: '👥 Panel de Asignaciones',
                desc: 'Gestioná qué responsable trabaja con cada ficha o conjunto de fichas. Distribuí la carga de trabajo equitativamente entre el equipo.',
            },
            {
                title: '⚙️ Cómo Asignar',
                desc: '1. Seleccioná las fichas que querés asignar\n2. Elegí el responsable del dropdown\n3. Confirmá la asignación\n4. El responsable verá las fichas en su bandeja',
            },
        ],
    },
    documentos: {
        title: 'Documentos',
        icon: '📁',
        slides: [
            {
                title: '📁 Gestión Documental',
                desc: 'Subí, organizá y buscá documentos del sanatorio. Los archivos se almacenan de forma segura y están disponibles para todo el equipo autorizado.',
            },
            {
                title: '📤 Subir Documentos',
                desc: '• Arrastrá archivos o usá el botón de subir\n• Los formatos soportados son PDF, Word, Excel e imágenes\n• Cada documento se etiqueta automáticamente con fecha y usuario',
            },
        ],
    },
    consultas: {
        title: 'Consultas Guardia',
        icon: '🚑',
        slides: [
            {
                title: '🚑 Consultas de Guardia',
                desc: 'Visualizá las consultas del servicio de guardia en tiempo real. Los datos se sincronizan automáticamente desde el sistema SALUS.',
            },
        ],
    },
    pacientes: {
        title: 'Pacientes',
        icon: '👤',
        slides: [
            {
                title: '👤 Base de Pacientes',
                desc: 'Consultá la información de pacientes del sanatorio. Buscá por nombre, DNI o número de historia clínica.',
            },
        ],
    },
};

// ─── Markdown-like renderer (basic) ───
function renderDesc(text) {
    return text.split('\n').map((line, i) => {
        // Bold
        let html = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Bullet points
        if (html.startsWith('• ')) {
            return <li key={i} style={{ marginLeft: '16px', fontSize: '0.82rem', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: html.replace('• ', '') }} />;
        }
        // Numbered
        const numMatch = html.match(/^(\d+)\.\s/);
        if (numMatch) {
            return <li key={i} style={{ marginLeft: '16px', fontSize: '0.82rem', lineHeight: 1.6, listStyleType: 'decimal' }} dangerouslySetInnerHTML={{ __html: html.replace(/^\d+\.\s/, '') }} />;
        }
        return <p key={i} style={{ margin: '4px 0', fontSize: '0.82rem', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: html }} />;
    });
}

export default function HelpButton({ moduleId }) {
    const [isOpen, setIsOpen] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);
    const content = HELP_CONTENT[moduleId];

    // Reset slide when module changes
    useEffect(() => { setCurrentSlide(0); }, [moduleId]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => {
            if (e.key === 'Escape') setIsOpen(false);
            if (e.key === 'ArrowRight') setCurrentSlide(prev => Math.min(prev + 1, (content?.slides?.length || 1) - 1));
            if (e.key === 'ArrowLeft') setCurrentSlide(prev => Math.max(prev - 1, 0));
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, content]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        setCurrentSlide(0);
    }, []);

    if (!content) return null;

    const slide = content.slides[currentSlide];
    const totalSlides = content.slides.length;

    return (
        <>
            {/* Help Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="help-btn"
                title={`Ayuda: ${content.title}`}
                style={{
                    width: '26px', height: '26px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #EEF2FF, #E0E7FF)',
                    border: '1px solid #C7D2FE',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: '#4F46E5',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                }}
                onMouseOver={e => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #4F46E5, #6366F1)';
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow = '0 0 12px rgba(79,70,229,0.4)';
                }}
                onMouseOut={e => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #EEF2FF, #E0E7FF)';
                    e.currentTarget.style.color = '#4F46E5';
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = 'none';
                }}
            >
                <HelpCircle size={14} strokeWidth={2.5} />
            </button>

            {/* Modal Overlay */}
            {isOpen && (
                <div
                    className="help-modal-overlay"
                    onClick={handleClose}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 10000,
                        background: 'rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: 'help-fade-in 0.2s ease',
                    }}
                >
                    {/* Modal */}
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: '90%', maxWidth: '680px',
                            background: '#fff',
                            borderRadius: '16px',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)',
                            overflow: 'hidden',
                            animation: 'help-slide-up 0.3s ease',
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #818CF8 100%)',
                            padding: '20px 24px',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '1.4rem' }}>{content.icon}</span>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                                        {content.title}
                                    </h2>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)' }}>
                                        Guía de uso — Paso {currentSlide + 1} de {totalSlides}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                style={{
                                    background: 'rgba(255,255,255,0.15)', border: 'none',
                                    borderRadius: '8px', padding: '6px', cursor: 'pointer',
                                    color: '#fff', display: 'flex',
                                    transition: 'background 0.2s',
                                }}
                                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                                onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Slide Content */}
                        <div style={{ padding: '24px', minHeight: '300px' }}>
                            {/* Image */}
                            {slide.img && (
                                <div style={{
                                    marginBottom: '16px', borderRadius: '10px',
                                    overflow: 'hidden', border: '1px solid #E5E7EB',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                                }}>
                                    <img
                                        src={slide.img}
                                        alt={slide.title}
                                        style={{
                                            width: '100%', height: 'auto',
                                            maxHeight: '280px', objectFit: 'cover',
                                            display: 'block',
                                        }}
                                    />
                                </div>
                            )}

                            {/* Title */}
                            <h3 style={{
                                margin: '0 0 10px', fontSize: '1rem', fontWeight: 700,
                                color: '#1E293B',
                                display: 'flex', alignItems: 'center', gap: '8px',
                            }}>
                                {!slide.img && <Lightbulb size={18} style={{ color: '#F59E0B' }} />}
                                {slide.title}
                            </h3>

                            {/* Description */}
                            <div style={{ color: '#475569' }}>
                                {renderDesc(slide.desc)}
                            </div>
                        </div>

                        {/* Footer: Navigation */}
                        <div style={{
                            padding: '12px 24px 16px',
                            borderTop: '1px solid #F1F5F9',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <button
                                onClick={() => setCurrentSlide(prev => Math.max(prev - 1, 0))}
                                disabled={currentSlide === 0}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                    padding: '8px 14px', borderRadius: '8px',
                                    border: '1px solid #E5E7EB',
                                    background: currentSlide === 0 ? '#F9FAFB' : '#fff',
                                    color: currentSlide === 0 ? '#D1D5DB' : '#374151',
                                    cursor: currentSlide === 0 ? 'not-allowed' : 'pointer',
                                    fontSize: '0.82rem', fontWeight: 600,
                                    transition: 'all 0.2s',
                                }}
                            >
                                <ChevronLeft size={16} /> Anterior
                            </button>

                            {/* Dots */}
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {content.slides.map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentSlide(idx)}
                                        style={{
                                            width: idx === currentSlide ? '20px' : '8px',
                                            height: '8px',
                                            borderRadius: '4px',
                                            border: 'none',
                                            background: idx === currentSlide
                                                ? 'linear-gradient(135deg, #4F46E5, #6366F1)'
                                                : '#E5E7EB',
                                            cursor: 'pointer',
                                            transition: 'all 0.3s ease',
                                        }}
                                    />
                                ))}
                            </div>

                            <button
                                onClick={() => {
                                    if (currentSlide === totalSlides - 1) {
                                        handleClose();
                                    } else {
                                        setCurrentSlide(prev => prev + 1);
                                    }
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                    padding: '8px 14px', borderRadius: '8px',
                                    border: 'none',
                                    background: currentSlide === totalSlides - 1
                                        ? 'linear-gradient(135deg, #10B981, #059669)'
                                        : 'linear-gradient(135deg, #4F46E5, #6366F1)',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '0.82rem', fontWeight: 600,
                                    transition: 'all 0.2s',
                                    boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
                                }}
                            >
                                {currentSlide === totalSlides - 1 ? 'Entendido ✓' : <>Siguiente <ChevronRight size={16} /></>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
