import React, { useState } from 'react';
import { 
    Send, Search, Info, CheckCircle2, Phone, MessageSquare, 
    AlertCircle, ShieldCheck, CheckCheck, Sparkles, FileText, 
    Lock, Calendar, UserCheck
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { sendWhatsAppMessage, normalizeArgentinePhone } from '../../services/builderbotApi';

// Plantillas Oficiales Pre-Aprobadas para Meta WhatsApp Business (HSM)
export const OFFICIAL_WHATSAPP_TEMPLATES = [
    {
        id: 'contacto_inicial_asistencia',
        name: 'contacto_inicial_asistencia',
        title: 'Contacto Inicial y Asistencia',
        category: 'Atención General',
        description: 'Apertura estándar para responder solicitudes o contactar pacientes por primera vez.',
        badge: 'General',
        color: '#0284C7',
        templateText: 'Hola {{nombre}}, nos comunicamos de Sanatorio Argentino en respuesta a tu consulta. ¿En qué podemos ayudarte hoy?'
    },
    {
        id: 'solicitud_datos_orden',
        name: 'solicitud_datos_orden',
        title: 'Solicitud de DNI y Orden Médica',
        category: 'Documentación',
        description: 'Solicita al paciente su documento y orden médica para avanzar con la autorización.',
        badge: 'Documentación',
        color: '#7C3AED',
        templateText: 'Hola {{nombre}}, te escribimos de Sanatorio Argentino 👋. Para poder gestionar tu solicitud médica, por favor envíanos tu número de DNI y una foto clara de tu orden médica. ¡Muchas gracias!'
    },
    {
        id: 'coordinacion_turnos_online',
        name: 'coordinacion_turnos_online',
        title: 'Coordinación de Turnos Online',
        category: 'Turnos',
        description: 'Coordinación de citas y turnos solicitados a través del portal web.',
        badge: 'Turnos Web',
        color: '#059669',
        templateText: 'Hola {{nombre}}, desde el Contact Center de Sanatorio Argentino queremos coordinar tus turnos solicitados. Por favor respóndenos este mensaje para confirmar la fecha y horario que te resulte más conveniente.'
    },
    {
        id: 'confirmacion_turno_programado',
        name: 'confirmacion_turno_programado',
        title: 'Confirmación de Turno Programado',
        category: 'Confirmaciones',
        description: 'Recordatorio previo para asegurar la asistencia del paciente a su consulta.',
        badge: 'Recordatorio',
        color: '#D97706',
        templateText: 'Hola {{nombre}}, te recordamos tu consulta médica programada en Sanatorio Argentino. Por favor respondé "CONFIRMO" para asegurar tu lugar o avísanos si necesitás reprogramarla.'
    },
    {
        id: 'derivacion_citologia',
        name: 'derivacion_citologia',
        title: 'Derivación a Citología / PAP',
        category: 'Derivaciones',
        description: 'Canal directo para turnos o consultas específicas del servicio de citología.',
        badge: 'Citología',
        color: '#E11D48',
        templateText: 'Hola {{nombre}}, te escribimos de Sanatorio Argentino. Por tu consulta realizada, te informamos que debés comunicarte con Citología al 2644552540 de Lunes a Viernes de 08:00 a 13:00 hs. Saludos cordiales.'
    },
    {
        id: 'indicaciones_estudio_lab',
        name: 'indicaciones_estudio_lab',
        title: 'Indicaciones Previas de Estudio',
        category: 'Estudios',
        description: 'Pautas de preparación y ayuno previo para laboratorio o diagnóstico por imágenes.',
        badge: 'Preparación',
        color: '#2563EB',
        templateText: 'Hola {{nombre}}, nos comunicamos de Sanatorio Argentino para recordarte que para tu próximo estudio médico debés concurrir con 8 hs de ayuno previo y la orden médica autorizada.'
    }
];

export default function ContactCenterNuevaConversacion({ activeAgent, onCreateChat, onNavigateTab }) {
    // Canal exclusivo WhatsApp
    const canal = 'WhatsApp';
    const [numeroEnvio, setNumeroEnvio] = useState('5492645825637');
    const [nombreCliente, setNombreCliente] = useState('');
    const [numeroWhatsApp, setNumeroWhatsApp] = useState('');
    const [departamento, setDepartamento] = useState('Atención al cliente');
    const [usuarioAsignado, setUsuarioAsignado] = useState(activeAgent?.name || 'Daniela Aguilera');
    
    // Plantilla seleccionada (Obligatoria: NO texto libre)
    const [selectedTemplateId, setSelectedTemplateId] = useState(OFFICIAL_WHATSAPP_TEMPLATES[0].id);
    
    // Búsqueda de contacto existente
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    
    // Estado de envío
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const currentTemplate = OFFICIAL_WHATSAPP_TEMPLATES.find(t => t.id === selectedTemplateId) || OFFICIAL_WHATSAPP_TEMPLATES[0];

    // Resolver variables en la plantilla dinámicamente
    const resolvedTemplateMessage = currentTemplate.templateText.replace(
        /\{\{nombre\}\}/g, 
        nombreCliente.trim() || 'Estimado/a Paciente'
    );

    // Buscar contacto existente en Supabase (Pacientes o Turnos Online)
    const handleSearchExisting = async (e) => {
        if (e) e.preventDefault();
        const q = searchQuery.trim();
        if (!q || q.length < 2) return;

        setSearching(true);
        setSearchResults([]);
        try {
            // 1. Buscar en turnos online
            const { data: turnos, error: tErr } = await supabase
                .from('contact_center_turnos_online')
                .select('paciente_nombre, telefono, dni, email, obra_social')
                .or(`paciente_nombre.ilike.%${q}%,dni.ilike.%${q}%,telefono.ilike.%${q}%`)
                .limit(5);

            if (!tErr && turnos && turnos.length > 0) {
                setSearchResults(turnos.map(t => ({
                    nombre: t.paciente_nombre,
                    telefono: t.telefono,
                    dni: t.dni,
                    obraSocial: t.obra_social,
                    source: 'Turnos Online'
                })));
                setSearching(false);
                return;
            }

            // 2. Buscar en tabla patients
            const { data: patients, error: pErr } = await supabase
                .from('patients')
                .select('nombre, afiliado, obra_social')
                .ilike('nombre', `%${q}%`)
                .limit(5);

            if (!pErr && patients && patients.length > 0) {
                setSearchResults(patients.map(p => ({
                    nombre: p.nombre,
                    telefono: '',
                    dni: p.afiliado || '',
                    obraSocial: p.obra_social || '',
                    source: 'Padrón Sanatorio'
                })));
            }
        } catch (err) {
            console.warn('Error en búsqueda de paciente:', err);
        } finally {
            setSearching(false);
        }
    };

    const handleSelectFoundPatient = (p) => {
        setNombreCliente(p.nombre || '');
        if (p.telefono) setNumeroWhatsApp(p.telefono);
        setSearchResults([]);
        setSearchQuery('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!nombreCliente.trim() || !numeroWhatsApp.trim()) {
            setErrorMsg('Por favor completa el nombre del paciente y su número de WhatsApp.');
            return;
        }

        const normalizedPhone = normalizeArgentinePhone(numeroWhatsApp);
        if (normalizedPhone.length < 11) {
            setErrorMsg('El número de WhatsApp no parece ser válido. Ingrésalo con código de área (ej: 2645438114).');
            return;
        }

        setSubmitting(true);

        const now = new Date();
        const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const finalMessage = resolvedTemplateMessage;

        const newChat = {
            id: '3CM' + Math.floor(100 + Math.random() * 900),
            contactName: nombreCliente.trim(),
            phone: normalizedPhone,
            channel: 'WHATSAPP',
            channelNumber: numeroEnvio,
            status: usuarioAsignado === 'Sin asignar' ? 'sin_asignar' : 'asignada',
            unread: false,
            lastMessage: finalMessage,
            timeAgo: 'hace un momento',
            department: departamento,
            assignedTo: usuarioAsignado === 'Sin asignar' ? null : (activeAgent?.id || 'daniela'),
            assignedToName: usuarioAsignado === 'Sin asignar' ? null : usuarioAsignado,
            assignedAt: usuarioAsignado === 'Sin asignar' ? null : now.toISOString(),
            lastResponder: usuarioAsignado,
            lastResponderRole: 'agent',
            chatbot: '#plantilla-hsm',
            avatarColor: currentTemplate.color || '#0284C7',
            tags: ['Saliente', 'Plantilla Meta', departamento],
            customFields: {
                dni: '—',
                turnosDiaHora: 'A convenir',
                pedidoMedicoFoto: 'Pendiente',
                pacienteNombre: nombreCliente.trim(),
                pacienteContacto: normalizedPhone,
                obraSocial: 'A relevar',
                plantillaEnviada: currentTemplate.title
            },
            messages: [
                {
                    id: 'init-sys',
                    sender: 'system',
                    text: `Conversación iniciada por ${usuarioAsignado} usando Plantilla Oficial Meta: "${currentTemplate.title}"`,
                    timestamp: timeStr
                },
                {
                    id: 'init-tpl-msg',
                    sender: 'agent',
                    senderName: usuarioAsignado,
                    senderAgentId: activeAgent?.id || 'daniela',
                    agentRole: 'Atención al Paciente',
                    tagColor: '#0284C7',
                    type: 'template',
                    templateName: currentTemplate.name,
                    text: finalMessage,
                    timestamp: timeStr
                }
            ]
        };

        // 1. Despachar mensaje de WhatsApp oficial
        try {
            // Guardar en Supabase whatsapp_messages con aislamiento estricto de línea
            await supabase.from('whatsapp_messages').insert({
                phone: normalizedPhone,
                direction: 'outgoing',
                content: finalMessage,
                media_type: 'template',
                sender_name: usuarioAsignado,
                is_read: true,
                line_id: 'contact_center', // Exclusivo línea Contact Center
                raw_payload: {
                    template: currentTemplate.name,
                    category: currentTemplate.category,
                    assignedTo: usuarioAsignado,
                    line: 'contact_center',
                    department
                }
            });

            // Actualizar o crear en contact_center_conversations
            await supabase.from('contact_center_conversations').upsert({
                phone: normalizedPhone,
                contact_name: nombreCliente.trim(),
                last_message_text: finalMessage,
                last_message_at: now.toISOString(),
                assigned_agent_id: usuarioAsignado === 'Sin asignar' ? null : (activeAgent?.id || 'daniela'),
                assigned_agent_name: usuarioAsignado === 'Sin asignar' ? null : usuarioAsignado,
                bot_active: false, // Desactivar bot para que la agente mantenga el control
                custom_fields: newChat.customFields,
                updated_at: now.toISOString()
            }, { onConflict: 'phone' });

            // Enviar vía API de WhatsApp (BuilderBot) con línea contact_center
            await sendWhatsAppMessage({
                content: finalMessage,
                number: normalizedPhone,
                lineId: 'contact_center'
            }).catch(e => {
                console.warn('Aviso al despachar API WhatsApp:', e.message);
            });

        } catch (err) {
            console.warn('Aviso en persistencia de plantilla:', err);
        }

        if (onCreateChat) {
            onCreateChat(newChat);
        }

        setSubmitted(true);
        setSubmitting(false);

        setTimeout(() => {
            if (onNavigateTab) {
                onNavigateTab('conversaciones');
            }
        }, 1200);
    };

    return (
        <div style={{ maxWidth: '880px', margin: '0 auto', width: '100%' }}>
            {/* Encabezado AsisteClick */}
            <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '6px' }}>
                    Conversaciones / <span style={{ color: '#0284C7', fontWeight: 600 }}>Crear nueva conversación</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#0F172A' }}>
                        Iniciar Conversación con Paciente
                    </h1>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        background: '#DCFCE7', color: '#15803D',
                        padding: '4px 10px', borderRadius: '999px',
                        fontSize: '0.75rem', fontWeight: 700
                    }}>
                        <ShieldCheck size={14} /> Exclusivo WhatsApp Business
                    </span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '0.86rem', color: '#64748B', lineHeight: 1.5 }}>
                    Iniciá vos la conversación con un paciente exclusivamente por <b>WhatsApp Oficial</b>. Conforme a las políticas de Meta, todo primer contacto saliente debe enviarse obligatoriamente mediante una <b>Plantilla Aprobada (HSM)</b>.
                </p>
            </div>

            {/* Banner Informativo de Políticas de Meta WhatsApp */}
            <div style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '10px',
                padding: '12px 18px',
                marginBottom: '22px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: '#166534',
                fontSize: '0.82rem'
            }}>
                <Lock size={18} color="#15803D" style={{ flexShrink: 0 }} />
                <div>
                    <b>Regla de Ventana de 24 hs:</b> No es posible redactar texto libre en el mensaje de apertura. Debes seleccionar una plantilla autorizada. Una vez que el paciente responda, la ventana de 24 horas quedará abierta y podrás responderle libremente desde la consola.
                </div>
            </div>

            {submitted ? (
                <div style={{ background: '#FFFFFF', padding: '40px', borderRadius: '14px', border: '1px solid #E2E8F0', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                    <CheckCircle2 size={52} color="#10B981" style={{ margin: '0 auto 14px' }} />
                    <h3 style={{ margin: '0 0 6px', color: '#0F172A', fontSize: '1.2rem', fontWeight: 800 }}>
                        Plantilla WhatsApp Enviada con Éxito
                    </h3>
                    <p style={{ margin: '0 0 16px', color: '#64748B', fontSize: '0.88rem' }}>
                        La plantilla <b>"{currentTemplate.title}"</b> fue enviada a <b>{nombreCliente}</b> (+{normalizeArgentinePhone(numeroWhatsApp)}).
                    </p>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#0284C7', fontSize: '0.82rem', fontWeight: 600 }}>
                        <Sparkles size={16} /> Redirigiendo a la bandeja de chat en vivo...
                    </div>
                </div>
            ) : (
                <form onSubmit={handleSubmit} style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '26px 30px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    
                    {errorMsg && (
                        <div style={{
                            marginBottom: '20px', padding: '12px 16px',
                            background: '#FEF2F2', border: '1px solid #FCA5A5',
                            borderRadius: '8px', color: '#B91C1C', fontSize: '0.82rem',
                            display: 'flex', alignItems: 'center', gap: '10px'
                        }}>
                            <AlertCircle size={18} style={{ flexShrink: 0 }} />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {/* Buscador de Contacto Existente */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '8px' }}>
                            BUSCAR CONTACTO EN PADRÓN O TURNOS ONLINE <span style={{ fontWeight: 400, color: '#94A3B8' }}>(opcional)</span>
                        </label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 12px' }}>
                                <Search size={16} color="#94A3B8" />
                                <input 
                                    type="text"
                                    placeholder="Nombre, DNI o teléfono del paciente..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearchExisting(e); }}
                                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', width: '100%', color: '#1E293B' }}
                                />
                            </div>
                            <button 
                                type="button" 
                                onClick={handleSearchExisting}
                                disabled={searching}
                                style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F1F5F9', color: '#475569', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
                            >
                                {searching ? 'Buscando...' : 'Buscar'}
                            </button>
                        </div>

                        {/* Resultados de búsqueda rápida */}
                        {searchResults.length > 0 && (
                            <div style={{ marginTop: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                <div style={{ padding: '6px 12px', background: '#F1F5F9', fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                                    PACIENTES ENCONTRADOS (Clic para autocompletar):
                                </div>
                                {searchResults.map((p, idx) => (
                                    <div 
                                        key={idx}
                                        onClick={() => handleSelectFoundPatient(p)}
                                        style={{
                                            padding: '8px 12px', display: 'flex', justifyContent: 'space-between',
                                            alignItems: 'center', borderBottom: '1px solid #E2E8F0',
                                            cursor: 'pointer', fontSize: '0.82rem'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#EFF6FF'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div>
                                            <b style={{ color: '#0F172A' }}>{p.nombre}</b>
                                            {p.dni && <span style={{ color: '#64748B', marginLeft: '8px' }}>DNI: {p.dni}</span>}
                                            {p.obraSocial && <span style={{ color: '#0284C7', marginLeft: '8px' }}>• {p.obraSocial}</span>}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontWeight: 600 }}>
                                            <UserCheck size={14} /> {p.telefono || 'Sin tel.'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ height: '1px', background: '#F1F5F9', margin: '20px 0' }} />

                    {/* Datos de la Conversación */}
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '14px' }}>
                            DATOS DE LA CONVERSACIÓN
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            {/* Canal exclusivo WhatsApp */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                    Canal de contacto
                                </label>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '10px 12px', borderRadius: '8px', border: '1px solid #BBF7D0',
                                    background: '#F0FDF4', color: '#166534', fontSize: '0.85rem', fontWeight: 700
                                }}>
                                    <MessageSquare size={16} color="#16A34A" /> WhatsApp Oficial (Línea Meta)
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                    Número de envío (Emisor Oficial)
                                </label>
                                <select 
                                    value={numeroEnvio}
                                    onChange={(e) => setNumeroEnvio(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.85rem', outline: 'none' }}
                                >
                                    <option value="5492645825637">5492645825637 (Línea Oficial Contact Center)</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                    Nombre del cliente / paciente <span style={{ color: '#DC2626' }}>*</span>
                                </label>
                                <input 
                                    type="text"
                                    placeholder="Ej. Lucas Marinero"
                                    value={nombreCliente}
                                    onChange={(e) => setNombreCliente(e.target.value)}
                                    required
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#0F172A', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                    Número de WhatsApp del Paciente <span style={{ color: '#DC2626' }}>*</span>
                                </label>
                                <input 
                                    type="text"
                                    placeholder="Ej. 2645438114 o +5492645438114"
                                    value={numeroWhatsApp}
                                    onChange={(e) => setNumeroWhatsApp(e.target.value)}
                                    required
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#0F172A', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>
                    </div>

                    <div style={{ height: '1px', background: '#F1F5F9', margin: '20px 0' }} />

                    {/* Asignación */}
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '14px' }}>
                            ASIGNACIÓN DEL CHAT
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                    Departamento asignado
                                </label>
                                <select 
                                    value={departamento}
                                    onChange={(e) => setDepartamento(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.85rem', outline: 'none' }}
                                >
                                    <option value="Atención al cliente">Atención al cliente</option>
                                    <option value="Ginecología y Obstetricia">Ginecología y Obstetricia</option>
                                    <option value="Laboratorio y Diagnóstico">Laboratorio y Diagnóstico</option>
                                    <option value="Facturación y Altas">Facturación y Altas</option>
                                    <option value="Gobernanza Médica">Gobernanza Médica</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                    Agente responsable asignado
                                </label>
                                <select 
                                    value={usuarioAsignado}
                                    onChange={(e) => setUsuarioAsignado(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.85rem', outline: 'none' }}
                                >
                                    <option value="Daniela Aguilera">Daniela Aguilera (Atención al Paciente)</option>
                                    <option value="Sofia Morales">Sofia Morales (Atención al Paciente)</option>
                                    <option value="Virginia Quiroga">Virginia Quiroga (Atención al Paciente)</option>
                                    <option value="Erica Leal">Erica Leal (Atención al Paciente)</option>
                                    <option value="Lucas Marinero">Lucas Marinero (Supervisor)</option>
                                    <option value="Sin asignar">Sin asignar (A cola general)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div style={{ height: '1px', background: '#F1F5F9', margin: '20px 0' }} />

                    {/* SELECCIÓN OBLIGATORIA DE PLANTILLA (NO TEXTO LIBRE) */}
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                                PLANTILLA OFICIAL DE APERTURA WHATSAPP <span style={{ color: '#DC2626' }}>* (OBLIGATORIA)</span>
                            </label>
                            <span style={{
                                fontSize: '0.72rem', fontWeight: 700, color: '#64748B',
                                background: '#F1F5F9', padding: '3px 8px', borderRadius: '6px'
                            }}>
                                🔒 Texto libre no permitido en apertura
                            </span>
                        </div>
                        <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: '#64748B' }}>
                            Selecciona una de las plantillas autorizadas. La variable de nombre se completará automáticamente con los datos del paciente:
                        </p>

                        {/* Tarjetas de Selección de Plantilla */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                            {OFFICIAL_WHATSAPP_TEMPLATES.map((tpl) => {
                                const isSelected = selectedTemplateId === tpl.id;
                                return (
                                    <div
                                        key={tpl.id}
                                        onClick={() => setSelectedTemplateId(tpl.id)}
                                        style={{
                                            padding: '12px',
                                            borderRadius: '10px',
                                            border: isSelected ? '2px solid #0284C7' : '1px solid #E2E8F0',
                                            background: isSelected ? '#F0F9FF' : '#FFFFFF',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            boxShadow: isSelected ? '0 2px 6px rgba(2,132,199,0.15)' : 'none',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <span style={{
                                                    fontSize: '0.68rem', fontWeight: 800,
                                                    background: isSelected ? '#0284C7' : '#F1F5F9',
                                                    color: isSelected ? '#FFFFFF' : '#475569',
                                                    padding: '2px 6px', borderRadius: '4px'
                                                }}>
                                                    {tpl.badge}
                                                </span>
                                                {isSelected && <CheckCircle2 size={16} color="#0284C7" />}
                                            </div>
                                            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                                                {tpl.title}
                                            </div>
                                            <div style={{ fontSize: '0.74rem', color: '#64748B', lineHeight: 1.35 }}>
                                                {tpl.description}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Vista Previa de la Burbuja de WhatsApp */}
                        <div style={{
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '12px',
                            padding: '16px',
                            backgroundImage: 'radial-gradient(#E2E8F0 1px, transparent 1px)',
                            backgroundSize: '16px 16px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>
                                    <FileText size={14} color="#0284C7" />
                                    PREVISUALIZACIÓN DEL MENSAJE WHATSAPP (A enviar al paciente)
                                </div>
                                <span style={{
                                    fontSize: '0.7rem', color: '#059669', background: '#DCFCE7',
                                    padding: '2px 8px', borderRadius: '999px', fontWeight: 700
                                }}>
                                    Plantilla Meta Verificada ✓
                                </span>
                            </div>

                            {/* Burbuja Verde WhatsApp Saliente */}
                            <div style={{
                                maxWidth: '85%',
                                marginLeft: 'auto',
                                background: '#DCF8C6',
                                borderRadius: '10px 10px 0 10px',
                                padding: '12px 14px',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                color: '#111827',
                                fontSize: '0.88rem',
                                lineHeight: 1.45,
                                position: 'relative'
                            }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span>Sanatorio Argentino Oficial</span>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 400 }}>• ({currentTemplate.title})</span>
                                </div>
                                <div>
                                    {resolvedTemplateMessage}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '0.68rem', color: '#65676B' }}>
                                    <span>Ahora</span>
                                    <CheckCheck size={14} color="#0284C7" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                        <button 
                            type="button" 
                            onClick={() => onNavigateTab('conversaciones')}
                            style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#64748B', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            disabled={submitting}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                background: submitting ? '#94A3B8' : '#10B981', color: '#FFFFFF', border: 'none',
                                padding: '10px 24px', borderRadius: '8px', fontWeight: 700,
                                fontSize: '0.85rem', cursor: submitting ? 'not-allowed' : 'pointer',
                                boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Send size={15} /> {submitting ? 'Enviando Plantilla...' : 'Enviar Plantilla WhatsApp'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
