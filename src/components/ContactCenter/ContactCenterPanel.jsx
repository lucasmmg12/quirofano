import React, { useState, useEffect } from 'react';
import { 
    MessageSquare, CalendarCheck, PlusCircle, ShieldCheck, 
    Headphones, RefreshCw, Layers, CheckCircle2, Lock, Sparkles,
    User, ChevronDown, AlertTriangle
} from 'lucide-react';
import ContactCenterMiSemana from './ContactCenterMiSemana';
import ContactCenterChatConsole from './ContactCenterChatConsole';
import ContactCenterNuevaConversacion from './ContactCenterNuevaConversacion';
import ContactCenterPermisosTab from './ContactCenterPermisosTab';
import ContactCenterTurnosOnlineTab from './ContactCenterTurnosOnlineTab';
import { 
    INITIAL_CHATS, fetchAllowedUsers, updateAllowedUsers, 
    canUserAccessContactCenter, MASTER_ADMINS,
    CONTACT_CENTER_AGENTS, getAgentById, fetchLiveAndDemoChats,
    sendContactCenterMessage, assignChatExclusively, unassignChat,
    transferChatToAgent
} from '../../services/contactCenterService';
import { supabase } from '../../lib/supabase';

export default function ContactCenterPanel({ currentUser, addToast, initialTab = 'conversaciones' }) {
    const [activeSubTab, setActiveSubTab] = useState(initialTab);

    useEffect(() => {
        if (initialTab) {
            setActiveSubTab(initialTab);
        }
    }, [initialTab]);
    const [chats, setChats] = useState(INITIAL_CHATS);
    const [activeChatId, setActiveChatId] = useState('3CMI20');
    const [allowedUsers, setAllowedUsers] = useState(['lmarinero', 'daniela', 'sofia', 'virginia', 'erica']);
    const [savingPermisos, setSavingPermisos] = useState(false);
    const [loadingLive, setLoadingLive] = useState(false);

    // Agente activo: por defecto Daniela, o match con el usuario logueado
    const initialAgent = CONTACT_CENTER_AGENTS.find(a => a.id === (currentUser?.usuario || '').toLowerCase()) || CONTACT_CENTER_AGENTS[0];
    const [activeAgent, setActiveAgent] = useState(initialAgent);

    const isLMarinero = MASTER_ADMINS.includes((currentUser?.usuario || '').toLowerCase().trim().split('@')[0]);

    // 1. Cargar permisos y sincronizar mensajes en vivo
    const reloadChats = async () => {
        setLoadingLive(true);
        try {
            const loaded = await fetchLiveAndDemoChats(chats);
            setChats(loaded);
        } catch (err) {
            console.warn('Error cargando chats:', err);
        } finally {
            setLoadingLive(false);
        }
    };

    useEffect(() => {
        fetchAllowedUsers().then(users => {
            if (Array.isArray(users)) {
                setAllowedUsers(users);
            }
        });

        reloadChats();

        // 2. Suscripción en Tiempo Real a whatsapp_messages (Supabase Realtime)
        const channel = supabase
            .channel('contact-center-live-stream')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'whatsapp_messages'
            }, (payload) => {
                console.log('[contact-center] ⚡ Evento Realtime entrante:', payload.new);
                reloadChats();
                if (addToast && payload.new?.direction === 'incoming') {
                    addToast(`Nuevo mensaje de WhatsApp recibido (${payload.new.phone})`, 'info');
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Manejar envío de mensaje en la consola de chat
    const handleSendMessage = async (chatId, text, isNote = false) => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const { newMsg, updatedChat } = await sendContactCenterMessage({
                chat: targetChat,
                text,
                isNote,
                activeAgent,
                currentUser
            });

            setChats(prev => prev.map(c => c.id === chatId ? updatedChat : c));

            if (addToast) {
                addToast(
                    isNote 
                        ? `Nota interna registrada por ${activeAgent.name}` 
                        : `Mensaje WhatsApp enviado por ${activeAgent.name}`, 
                    'success'
                );
            }
        } catch (err) {
            console.error(err);
            if (addToast) addToast(err.message || 'Error al enviar', 'error');
        }
    };

    // Crear nueva conversación
    const handleCreateChat = (newChat) => {
        setChats(prev => [newChat, ...prev]);
        setActiveChatId(newChat.id);
        if (addToast) {
            addToast(`Conversación iniciada con ${newChat.contactName}`, 'success');
        }
    };

    // Asignar chat exclusivamente a una agente (bloqueo contra colisión)
    const handleAssignChat = (chatId, targetAgentId = activeAgent.id) => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const targetAgent = getAgentById(targetAgentId);
            const updated = assignChatExclusively(targetChat, targetAgent, currentUser);
            setChats(prev => prev.map(c => c.id === chatId ? updated : c));
            if (addToast) {
                addToast(`Conversación asignada exclusivamente a ${targetAgent.name}`, 'success');
            }
        } catch (err) {
            if (addToast) addToast(err.message, 'error');
        }
    };

    // Liberar conversación a la cola general
    const handleUnassignChat = (chatId) => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const updated = unassignChat(targetChat, activeAgent, currentUser);
            setChats(prev => prev.map(c => c.id === chatId ? updated : c));
            if (addToast) {
                addToast(`Conversación liberada a "Sin Asignar"`, 'info');
            }
        } catch (err) {
            if (addToast) addToast(err.message, 'error');
        }
    };

    // Transferir chat a otra agente
    const handleTransferChat = (chatId, toAgentId) => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const toAgent = getAgentById(toAgentId);
            const updated = transferChatToAgent(targetChat, activeAgent, toAgent, currentUser);
            setChats(prev => prev.map(c => c.id === chatId ? updated : c));
            if (addToast) {
                addToast(`Conversación transferida a ${toAgent.name}`, 'success');
            }
        } catch (err) {
            if (addToast) addToast(err.message, 'error');
        }
    };

    // Cambiar permisos de un usuario (solo lmarinero)
    const handleToggleUser = async (username) => {
        if (!isLMarinero) return;
        setSavingPermisos(true);
        try {
            let updated;
            if (allowedUsers.includes(username)) {
                updated = allowedUsers.filter(u => u !== username);
            } else {
                updated = [...allowedUsers, username];
            }
            const clean = await updateAllowedUsers(updated, currentUser?.usuario || 'lmarinero');
            setAllowedUsers(clean);
            if (addToast) {
                addToast(`Permisos de @${username} actualizados`, 'success');
            }
        } catch (err) {
            console.error(err);
            if (addToast) addToast('Error al actualizar permisos', 'error');
        } finally {
            setSavingPermisos(false);
        }
    };

    const handleSelectChatFromSummary = (chatId) => {
        setActiveChatId(chatId);
        setActiveSubTab('conversaciones');
    };

    const handleOpenChatWithPhone = (phone) => {
        if (!phone) return;
        const cleanPhone = phone.replace(/\D/g, '');
        const existing = chats.find(c => {
            const p = (c.contactPhone || c.phone || '').replace(/\D/g, '');
            return p.includes(cleanPhone) || cleanPhone.includes(p);
        });

        if (existing) {
            setActiveChatId(existing.id);
            setActiveSubTab('conversaciones');
        } else {
            setActiveSubTab('nueva_conversacion');
        }
    };

    return (
        <div className="content no-print" style={{ padding: '20px 24px', background: '#F8FAFC', minHeight: 'calc(100vh - 70px)' }}>
            {/* Header del Módulo Contact Center (Oculto cuando se ve Turnos Online) */}
            {activeSubTab !== 'turnos_online' && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '16px',
                    marginBottom: '18px',
                    paddingBottom: '14px',
                    borderBottom: '1px solid #E2E8F0'
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #0F2942 0%, #0284C7 100%)',
                        color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 10px rgba(2, 132, 199, 0.25)'
                    }}>
                        <Headphones size={24} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0F172A' }}>
                                Contact Center
                            </h1>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                                MULTI-AGENTE EN VIVO
                            </span>
                            {loadingLive && (
                                <RefreshCw size={14} className="spin" color="#0284C7" />
                            )}
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                            Consola Multicanal de Sanatorio Argentino • 4 Agentes con Asignación Exclusiva
                        </p>
                    </div>
                </div>

                {/* SELECTOR DE AGENTE ACTIVA (Daniela, Sofia, Virginia, Erica o Supervisor) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px',
                        padding: '4px 8px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B' }}>
                            Atendiendo como:
                        </span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {CONTACT_CENTER_AGENTS.map(agent => {
                                const isCurrent = activeAgent.id === agent.id;
                                return (
                                    <button
                                        key={agent.id}
                                        onClick={() => setActiveAgent(agent)}
                                        title={`Cambiar a ${agent.fullName} (${agent.role})`}
                                        style={{
                                            padding: '4px 10px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 700,
                                            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                                            background: isCurrent ? agent.color : '#F1F5F9',
                                            color: isCurrent ? '#FFFFFF' : '#475569',
                                            boxShadow: isCurrent ? `0 2px 5px ${agent.color}40` : 'none',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <div style={{
                                            width: '16px', height: '16px', borderRadius: '50%',
                                            background: isCurrent ? '#FFFFFF' : agent.color,
                                            color: isCurrent ? agent.color : '#FFFFFF',
                                            fontSize: '0.62rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {agent.avatar}
                                        </div>
                                        {agent.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Pestañas de Navegación del Módulo */}
                    <div style={{
                        display: 'flex',
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        padding: '4px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                        <button
                            onClick={() => setActiveSubTab('conversaciones')}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: activeSubTab === 'conversaciones' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'conversaciones' ? '#FFFFFF' : '#64748B',
                                transition: 'all 0.15s'
                            }}
                        >
                            <MessageSquare size={16} />
                            Conversaciones
                            <span style={{
                                background: activeSubTab === 'conversaciones' ? '#0284C7' : '#EFF6FF',
                                color: activeSubTab === 'conversaciones' ? '#FFFFFF' : '#1E40AF',
                                fontSize: '0.68rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 800
                            }}>
                                {chats.filter(c => !c.assignedTo).length}
                            </span>
                        </button>

                        <button
                            onClick={() => setActiveSubTab('mi_semana')}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: activeSubTab === 'mi_semana' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'mi_semana' ? '#FFFFFF' : '#64748B',
                                transition: 'all 0.15s'
                            }}
                        >
                            <CalendarCheck size={16} />
                            Mi Semana
                        </button>

                        <button
                            onClick={() => setActiveSubTab('nueva_conversacion')}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: activeSubTab === 'nueva_conversacion' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'nueva_conversacion' ? '#FFFFFF' : '#64748B',
                                transition: 'all 0.15s'
                            }}
                        >
                            <PlusCircle size={16} />
                            Crear Conversación
                        </button>

                        {/* Nueva Pestaña: Turnos Online Duplicados */}
                        <button
                            onClick={() => setActiveSubTab('turnos_online')}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: activeSubTab === 'turnos_online' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'turnos_online' ? '#FFFFFF' : '#DC2626',
                                transition: 'all 0.15s'
                            }}
                        >
                            <AlertTriangle size={16} />
                            Turnos Online
                            <span style={{
                                background: activeSubTab === 'turnos_online' ? '#DC2626' : '#FEE2E2',
                                color: activeSubTab === 'turnos_online' ? '#FFFFFF' : '#DC2626',
                                fontSize: '0.68rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 800
                            }}>
                                Alertas
                            </span>
                        </button>

                        {/* Pestaña de Permisos (Visible EXCLUSIVAMENTE para lmarinero) */}
                        {isLMarinero && (
                            <button
                                onClick={() => setActiveSubTab('permisos')}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: 'none',
                                    fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    background: activeSubTab === 'permisos' ? '#1E40AF' : 'transparent',
                                    color: activeSubTab === 'permisos' ? '#FFFFFF' : '#1E40AF',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <ShieldCheck size={16} />
                                Permisos
                            </button>
                        )}
                    </div>
                </div>
            </div>
            )}

            {/* Vistas del Módulo */}
            {activeSubTab === 'turnos_online' && (
                <ContactCenterTurnosOnlineTab 
                    activeAgent={activeAgent}
                    currentUser={currentUser}
                    addToast={addToast}
                    onOpenChatWithPhone={handleOpenChatWithPhone}
                    onBackToConsole={() => setActiveSubTab('conversaciones')}
                />
            )}

            {activeSubTab === 'conversaciones' && (
                <ContactCenterChatConsole 
                    chats={chats}
                    activeChatId={activeChatId}
                    activeAgent={activeAgent}
                    currentUser={currentUser}
                    onSelectChat={setActiveChatId}
                    onSendMessage={handleSendMessage}
                    onAssignChat={handleAssignChat}
                    onUnassignChat={handleUnassignChat}
                    onTransferChat={handleTransferChat}
                />
            )}

            {activeSubTab === 'mi_semana' && (
                <ContactCenterMiSemana 
                    chats={chats}
                    activeAgent={activeAgent}
                    onSelectChat={handleSelectChatFromSummary}
                    onNavigateTab={setActiveSubTab}
                />
            )}

            {activeSubTab === 'nueva_conversacion' && (
                <ContactCenterNuevaConversacion 
                    activeAgent={activeAgent}
                    onCreateChat={handleCreateChat}
                    onNavigateTab={setActiveSubTab}
                />
            )}

            {activeSubTab === 'permisos' && isLMarinero && (
                <ContactCenterPermisosTab 
                    allowedUsers={allowedUsers}
                    onToggleUser={handleToggleUser}
                    saving={savingPermisos}
                />
            )}
        </div>
    );
}
