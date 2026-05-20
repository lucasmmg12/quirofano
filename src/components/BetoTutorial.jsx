/**
 * BetoTutorial — #19 Interactive step-by-step guided tutorials
 * Beto guides the user through system features with highlighted elements
 */
import { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, CheckCircle, Sparkles, BookOpen } from 'lucide-react';

const TUTORIALS = {
    cirugias: {
        title: 'Carga y Control de Cirugías',
        steps: [
            { target: null, title: '🏥 Bienvenido al Control de Cirugías', text: 'Te voy a mostrar cómo gestionar las cirugías del quirófano paso a paso.', position: 'center' },
            { target: null, title: '📤 Paso 1: Importar Excel', text: 'Hacé clic en "Importar Excel" para cargar la planilla de cirugías desde el sistema hospitalario. El sistema detecta automáticamente duplicados.', position: 'center' },
            { target: null, title: '📊 Paso 2: Revisar la Tabla', text: 'Las cirugías se agrupan por fecha. Cada día tiene un contador y un indicador de urgencia. Tocá una fecha para expandirla.', position: 'center' },
            { target: null, title: '🔄 Paso 3: Gestionar Estados', text: 'Cada cirugía tiene un estado (Lila → Notificado → Doc. Recibida → Autorizada → Confirmada). Hacé clic en el badge de estado para cambiarlo.', position: 'center' },
            { target: null, title: '💬 Paso 4: Comunicación', text: 'Usá el botón de WhatsApp 💬 para enviar mensajes directos a los pacientes. Los mensajes se guardan en el historial.', position: 'center' },
            { target: null, title: '✅ ¡Listo!', text: 'Ya sabés lo básico del control de cirugías. Podés preguntarme cualquier duda en el chat.', position: 'center' },
        ]
    },
    deudas: {
        title: 'Gestión de Deudas',
        steps: [
            { target: null, title: '💰 Bienvenido a Deudas', text: 'Acá gestionás el seguimiento de cobros pendientes de pacientes.', position: 'center' },
            { target: null, title: '📤 Paso 1: Importar desde SALUS', text: 'Hacé clic en "Importar Excel" y cargá el archivo exportado desde SALUS con las deudas. El sistema agrupa por factura automáticamente.', position: 'center' },
            { target: null, title: '🏷️ Paso 2: Categorizar', text: 'Categorizá cada deudor: Sin gestionar → En gestión → Comprometido → Incobrable. Esto te ayuda a priorizar.', position: 'center' },
            { target: null, title: '💬 Paso 3: Contactar', text: 'Usá el chat de WhatsApp integrado para enviar recordatorios de pago. Los mensajes se trackean automáticamente.', position: 'center' },
            { target: null, title: '📊 Paso 4: Métricas', text: 'Revisá las métricas para ver tu tasa de contactabilidad, respuesta y los Top 10 deudores.', position: 'center' },
            { target: null, title: '✅ ¡Listo!', text: 'Ya conocés el flujo de gestión de deudas. ¡A cobrar!', position: 'center' },
        ]
    },
    pedidos: {
        title: 'Emisión de Pedidos Médicos',
        steps: [
            { target: null, title: '📝 Bienvenido a Pedidos', text: 'Desde acá podés crear, imprimir y enviar pedidos médicos de forma rápida.', position: 'center' },
            { target: null, title: '👤 Paso 1: Datos del Paciente', text: 'Completá nombre, obra social, afiliado, diagnóstico y médico del paciente.', position: 'center' },
            { target: null, title: '🔍 Paso 2: Buscar Prácticas', text: 'Usá el buscador para encontrar prácticas por nombre o código. Hacé clic en "Agregar" para sumarlas al carrito.', position: 'center' },
            { target: null, title: '🖨️ Paso 3: Imprimir o Enviar', text: 'Imprimí el pedido completo o individual, o envialo por WhatsApp directamente al paciente.', position: 'center' },
            { target: null, title: '✅ ¡Listo!', text: 'Cada pedido se guarda automáticamente en el historial. ¡Simple y rápido!', position: 'center' },
        ]
    },
    mensajeria: {
        title: 'Chat WhatsApp',
        steps: [
            { target: null, title: '💬 Bienvenido a Mensajería', text: 'Este es el centro de comunicación bidireccional con pacientes vía WhatsApp.', position: 'center' },
            { target: null, title: '📋 Paso 1: Seleccionar Conversación', text: 'En el panel izquierdo verás todas las conversaciones activas. Las que tienen badge rojo tienen mensajes sin leer.', position: 'center' },
            { target: null, title: '✍️ Paso 2: Escribir Mensajes', text: 'Escribí tu mensaje y enviá. También podés usar atajos rápidos con "/" para mensajes frecuentes.', position: 'center' },
            { target: null, title: '📎 Paso 3: Plantillas', text: 'Accedé a "Plantillas WhatsApp" desde el sidebar para crear mensajes reutilizables con variables dinámicas.', position: 'center' },
            { target: null, title: '✅ ¡Listo!', text: 'Las notificaciones de mensajes nuevos llegan en tiempo real. ¡Comunicación fluida!', position: 'center' },
        ]
    },
    auditoria_historias: {
        title: 'Auditoría de Historias Clínicas',
        steps: [
            { target: null, title: '🔍 Auditoría de Historias Clínicas', text: 'Te mostraré cómo verificar la consistencia de las historias clínicas ingresadas paso a paso.', position: 'center' },
            { target: null, title: '📤 Paso 1: Importar Historias desde Excel', text: 'Arrastrá o seleccioná la planilla de historias clínicas. El sistema remueve columnas auxiliares vacías como las que empiezan con "__EMPTY".', position: 'center' },
            { target: null, title: '🗺️ Paso 2: Configurar Mapeo de Columnas', text: 'El mapeador automático detectará las columnas clave como Paciente, Evolución y Fecha de Alta. Podés cambiarlas si el sistema se equivoca.', position: 'center' },
            { target: null, title: '📊 Paso 3: Tarjetas Bento y Filtros', text: 'Las tarjetas de arriba muestran el estado del lote. La tarjeta ámbar "Sin Fecha de Alta" te permite ver pacientes activos de forma inmediata.', position: 'center' },
            { target: null, title: '🎨 Paso 4: Celdas Resaltadas', text: 'Si falta la fecha de alta en una admisión, verás la celda pintada en naranja con la advertencia "⚠ Sin Alta" para auditarla rápidamente.', position: 'center' },
            { target: null, title: '📥 Paso 5: Exportar y PDF', text: 'Podés descargar el reporte en PDF clínico o exportar un Excel con las columnas de auditoría agregadas al principio.', position: 'center' },
            { target: null, title: '✅ ¡Listo!', text: 'Ya conocés las funciones principales de auditoría de historias clínicas. ¡A auditar!', position: 'center' },
        ]
    }
};

export default function BetoTutorial({ isOpen, onClose, tutorialId, onNavigate }) {
    const [step, setStep] = useState(0);
    const tutorial = TUTORIALS[tutorialId];

    useEffect(() => { if (isOpen) setStep(0); }, [isOpen, tutorialId]);

    const handleKey = useCallback((e) => {
        if (!isOpen) return;
        if (e.key === 'ArrowRight') setStep(p => Math.min(p + 1, (tutorial?.steps.length || 1) - 1));
        else if (e.key === 'ArrowLeft') setStep(p => Math.max(p - 1, 0));
        else if (e.key === 'Escape') onClose();
    }, [isOpen, tutorial, onClose]);

    useEffect(() => { window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey); }, [handleKey]);

    if (!isOpen || !tutorial) return null;

    const s = tutorial.steps[step];
    const isLast = step === tutorial.steps.length - 1;
    const pct = ((step + 1) / tutorial.steps.length) * 100;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter',sans-serif", animation: 'beto-fade-in .2s' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ width: 480, background: '#fff', borderRadius: 20, boxShadow: '0 25px 50px rgba(0,0,0,.3)', overflow: 'hidden', animation: 'beto-slide-up .25s' }}>
                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg,#4F46E5,#6366F1)', padding: '20px 24px', color: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem', fontWeight: 600, opacity: .8 }}>
                            <BookOpen size={14} /> Tutorial guiado
                        </div>
                        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{tutorial.title}</h3>
                    {/* Progress */}
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.2)' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: '#fff', borderRadius: 2, transition: 'width .3s' }} />
                        </div>
                        <span style={{ fontSize: '.68rem', fontWeight: 600, opacity: .8 }}>{step + 1}/{tutorial.steps.length}</span>
                    </div>
                </div>
                {/* Step Content */}
                <div key={step} style={{ padding: '28px 24px', animation: 'beto-fade-in .3s' }}>
                    <h4 style={{ margin: '0 0 10px', fontSize: '1.05rem', fontWeight: 700, color: '#1E293B' }}>{s.title}</h4>
                    <p style={{ margin: 0, fontSize: '.88rem', color: '#64748B', lineHeight: 1.6 }}>{s.text}</p>
                </div>
                {/* Step dots */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '0 24px 16px' }}>
                    {tutorial.steps.map((_, i) => (
                        <button key={i} onClick={() => setStep(i)} style={{ width: i === step ? 24 : 8, height: 8, borderRadius: 4, border: 'none', cursor: 'pointer', background: i === step ? '#6366F1' : i < step ? '#A5B4FC' : '#E2E8F0', transition: 'all .2s' }} />
                    ))}
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid #F1F5F9' }}>
                    <button disabled={step === 0} onClick={() => setStep(p => p - 1)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: step === 0 ? '#CBD5E1' : '#334155', fontSize: '.82rem', fontWeight: 600, cursor: step === 0 ? 'default' : 'pointer' }}><ChevronLeft size={14} /> Anterior</button>
                    {isLast ? (
                        <button onClick={() => { onClose(); onNavigate?.(tutorialId); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', fontSize: '.82rem', fontWeight: 700, cursor: 'pointer' }}><CheckCircle size={14} /> Ir al módulo</button>
                    ) : (
                        <button onClick={() => setStep(p => p + 1)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#4F46E5', color: '#fff', fontSize: '.82rem', fontWeight: 700, cursor: 'pointer' }}>Siguiente <ChevronRight size={14} /></button>
                    )}
                </div>
            </div>
        </div>
    );
}

export { TUTORIALS };
