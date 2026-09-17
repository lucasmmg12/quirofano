import React, { useState } from 'react';
import { Send, Search, Info, CheckCircle2, Phone, MessageSquare, AlertCircle } from 'lucide-react';

export default function ContactCenterNuevaConversacion({ onCreateChat, onNavigateTab }) {
    const [canal, setCanal] = useState('WhatsApp');
    const [numeroEnvio, setNumeroEnvio] = useState('5492645825637');
    const [nombreCliente, setNombreCliente] = useState('');
    const [numeroWhatsApp, setNumeroWhatsApp] = useState('');
    const [departamento, setDepartamento] = useState('Atención al cliente');
    const [usuarioAsignado, setUsuarioAsignado] = useState('Daniela');
    const [initialMessage, setInitialMessage] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!nombreCliente.trim() || !numeroWhatsApp.trim()) {
            alert('Por favor completa el nombre del paciente y su número de WhatsApp.');
            return;
        }

        const newChat = {
            id: '3CM' + Math.floor(100 + Math.random() * 900),
            contactName: nombreCliente.trim(),
            phone: numeroWhatsApp.replace(/\D/g, ''),
            channel: 'WHATSAPP',
            channelNumber: numeroEnvio,
            status: 'sin_asignar',
            unread: false,
            lastMessage: initialMessage || 'Conversación saliente iniciada',
            timeAgo: 'hace un momento',
            department: departamento,
            assignedTo: usuarioAsignado === 'Sin asignar' ? null : usuarioAsignado,
            chatbot: '#iniciado-manual',
            avatarColor: '#1E40AF',
            tags: ['Saliente', departamento],
            customFields: {
                dni: '—',
                turnosDiaHora: 'A convenir',
                pedidoMedicoFoto: 'Pendiente',
                pacienteNombre: nombreCliente.trim(),
                pacienteContacto: numeroWhatsApp,
                obraSocial: 'A relevar'
            },
            messages: [
                {
                    id: 'init-sys',
                    sender: 'system',
                    text: `Conversación creada manualmente por Sanatorio Argentino (${departamento})`,
                    timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                }
            ]
        };

        if (initialMessage.trim()) {
            newChat.messages.push({
                id: 'init-msg',
                sender: 'agent',
                senderName: usuarioAsignado,
                agentRole: 'Sanatorio Argentino',
                type: 'text',
                text: initialMessage.trim(),
                timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
            });
        }

        onCreateChat(newChat);
        setSubmitted(true);
        setTimeout(() => {
            onNavigateTab('conversaciones');
        }, 1000);
    };

    return (
        <div style={{ maxWidth: '860px', margin: '0 auto', width: '100%' }}>
            {/* Encabezado AsisteClick */}
            <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '6px' }}>
                    Conversaciones / <span style={{ color: '#0284C7', fontWeight: 600 }}>Crear nueva conversación</span>
                </div>
                <h1 style={{ margin: '0 0 8px', fontSize: '1.45rem', fontWeight: 800, color: '#0F172A' }}>
                    Iniciar Conversación con Paciente
                </h1>
                <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748B', lineHeight: 1.5 }}>
                    Iniciá vos la conversación con un paciente por WhatsApp, eMail o Telegram. Buscá un contacto existente para autocompletar sus datos, o cargalos manualmente.
                </p>
            </div>

            {/* Banner de Aviso de Perfil */}
            <div style={{
                background: '#FEF9C3',
                border: '1px solid #FEF08A',
                borderRadius: '10px',
                padding: '14px 18px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: '#854D0E',
                fontSize: '0.82rem'
            }}>
                <Info size={18} color="#CA8A04" style={{ flexShrink: 0 }} />
                <div>
                    <b>Modo Operador:</b> Podrás crear nuevas conversaciones y enviar el primer mensaje al paciente directamente conectado a la línea oficial de Sanatorio Argentino.
                </div>
            </div>

            {submitted ? (
                <div style={{ background: '#FFFFFF', padding: '40px', borderRadius: '14px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                    <CheckCircle2 size={48} color="#10B981" style={{ margin: '0 auto 14px' }} />
                    <h3 style={{ margin: '0 0 6px', color: '#0F172A' }}>Conversación Creada con Éxito</h3>
                    <p style={{ margin: 0, color: '#64748B', fontSize: '0.85rem' }}>Redirigiendo a la bandeja de chat multicanal...</p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '26px 30px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                    {/* Buscador de Contacto Existente */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '8px' }}>
                            BUSCAR CONTACTO EXISTENTE <span style={{ fontWeight: 400, color: '#94A3B8' }}>(opcional)</span>
                        </label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 12px' }}>
                                <Search size={16} color="#94A3B8" />
                                <input 
                                    type="text"
                                    placeholder="Nombre, teléfono o email del paciente..."
                                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', width: '100%', color: '#1E293B' }}
                                />
                            </div>
                            <button type="button" style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F1F5F9', color: '#475569', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
                                Buscar
                            </button>
                        </div>
                    </div>

                    <div style={{ height: '1px', background: '#F1F5F9', margin: '20px 0' }} />

                    {/* Datos de la Conversación */}
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '14px' }}>
                            DATOS DE LA CONVERSACIÓN
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                    Canal de contacto
                                </label>
                                <select 
                                    value={canal}
                                    onChange={(e) => setCanal(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.85rem', outline: 'none' }}
                                >
                                    <option value="WhatsApp">WhatsApp</option>
                                    <option value="Telegram">Telegram</option>
                                    <option value="Email">Email Asistencial</option>
                                </select>
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
                                    <option value="5492645825637">5492645825637 (Sanatorio Argentino Central)</option>
                                    <option value="5492645000001">5492645000001 (Línea Maternidad)</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                    Nombre del cliente / paciente <span style={{ color: '#DC2626' }}>*</span>
                                </label>
                                <input 
                                    type="text"
                                    placeholder="Ingresa el nombre del contacto"
                                    value={nombreCliente}
                                    onChange={(e) => setNombreCliente(e.target.value)}
                                    required
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#0F172A', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                    Número de WhatsApp <span style={{ color: '#DC2626' }}>*</span>
                                </label>
                                <input 
                                    type="text"
                                    placeholder="Teléfono con código de país y área, ej. +549264..."
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
                            ASIGNACIÓN
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
                                    Usuario asignado
                                </label>
                                <select 
                                    value={usuarioAsignado}
                                    onChange={(e) => setUsuarioAsignado(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontSize: '0.85rem', outline: 'none' }}
                                >
                                    <option value="Daniela">Daniela Calivar (Operadora)</option>
                                    <option value="Sanatorio Argentino">Sanatorio Argentino (Bot / Asistente)</option>
                                    <option value="Lucas Marinero">Lucas Marinero (Administrador)</option>
                                    <option value="Sin asignar">Sin asignar (A cola general)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Mensaje Inicial */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                            Mensaje inicial de apertura (opcional)
                        </label>
                        <textarea 
                            rows={3}
                            placeholder="Hola! Te escribimos desde Sanatorio Argentino respecto a tu solicitud..."
                            value={initialMessage}
                            onChange={(e) => setInitialMessage(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#0F172A', fontSize: '0.85rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* Botón de Acción */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button 
                            type="button" 
                            onClick={() => onNavigateTab('conversaciones')}
                            style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#64748B', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                background: '#10B981', color: '#FFFFFF', border: 'none',
                                padding: '10px 22px', borderRadius: '8px', fontWeight: 700,
                                fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'
                            }}
                        >
                            <Send size={15} /> Crear conversación
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
