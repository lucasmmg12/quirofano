import React, { useState, useEffect } from 'react';
import { 
    MessageSquare, CalendarCheck, PlusCircle, ShieldCheck, 
    Headphones, RefreshCw, Layers, CheckCircle2, Lock, Sparkles 
} from 'lucide-react';
import ContactCenterMiSemana from './ContactCenterMiSemana';
import ContactCenterChatConsole from './ContactCenterChatConsole';
import ContactCenterNuevaConversacion from './ContactCenterNuevaConversacion';
import ContactCenterPermisosTab from './ContactCenterPermisosTab';
import { 
    INITIAL_CHATS, fetchAllowedUsers, updateAllowedUsers, 
    canUserAccessContactCenter, MASTER_ADMINS 
} from '../../services/contactCenterService';

export default function ContactCenterPanel({ currentUser, addToast }) {
    const [activeSubTab, setActiveSubTab] = useState('mi_semana');
    const [chats, setChats] = useState(INITIAL_CHATS);
    const [activeChatId, setActiveChatId] = useState('3CMI20');
    const [allowedUsers, setAllowedUsers] = useState(['lmarinero']);
    const [savingPermisos, setSavingPermisos] = useState(false);

    const isLMarinero = MASTER_ADMINS.includes((currentUser?.usuario || '').toLowerCase().trim().split('@')[0]);

    // Cargar permisos al montar
    useEffect(() => {
        fetchAllowedUsers().then(users => {
            if (Array.isArray(users)) {
                setAllowedUsers(users);
            }
        });
    }, []);

    // Manejar envío de mensaje en la consola de chat
    const handleSendMessage = (chatId, text, isNote = false) => {
        setChats(prev => prev.map(c => {
            if (c.id !== chatId) return c;
            const newMsg = {
                id: 'm_' + Date.now(),
                sender: isNote ? 'note' : 'agent',
                senderName: currentUser?.nombre || 'Daniela Calivar',
                agentRole: 'Sanatorio Argentino',
                type: 'text',
                text,
                isNote,
                timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
            };
            return {
                ...c,
                lastMessage: text,
                timeAgo: 'hace unos segundos',
                messages: [...(c.messages || []), newMsg]
            };
        }));
        if (addToast) {
            addToast(isNote ? 'Nota privada agregada' : 'Mensaje enviado por WhatsApp', 'success');
        }
    };

    // Crear nueva conversación
    const handleCreateChat = (newChat) => {
        setChats(prev => [newChat, ...prev]);
        setActiveChatId(newChat.id);
        if (addToast) {
            addToast(`Conversación creada con ${newChat.contactName}`, 'success');
        }
    };

    // Asignar chat a un operador
    const handleAssignChat = (chatId, operatorName) => {
        setChats(prev => prev.map(c => {
            if (c.id !== chatId) return c;
            return {
                ...c,
                status: 'abierto',
                assignedTo: operatorName,
                messages: [
                    ...(c.messages || []),
                    {
                        id: 'sys_' + Date.now(),
                        sender: 'system',
                        text: `${operatorName} se asignó la conversación`,
                        timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                    }
                ]
            };
        }));
        if (addToast) {
            addToast(`Chat #${chatId} asignado a ${operatorName}`, 'success');
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

    // Navegar y abrir chat específico desde Mi Semana
    const handleSelectChatFromSummary = (chatId) => {
        setActiveChatId(chatId);
        setActiveSubTab('conversaciones');
    };

    return (
        <div className="content no-print" style={{ padding: '24px', background: '#F8FAFC', minHeight: 'calc(100vh - 70px)' }}>
            {/* Header del Módulo Contact Center */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                marginBottom: '20px',
                paddingBottom: '16px',
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
                                ASISTECLICK INTEGRATION • DEMO
                            </span>
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                            Atención al Paciente, Derivación por WhatsApp y Gestión Multicanal de Sanatorio Argentino
                        </p>
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
                            {chats.filter(c => c.status === 'sin_asignar').length}
                        </span>
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
                            Permisos y Accesos
                        </button>
                    )}
                </div>
            </div>

            {/* Vistas del Módulo */}
            {activeSubTab === 'mi_semana' && (
                <ContactCenterMiSemana 
                    chats={chats}
                    onSelectChat={handleSelectChatFromSummary}
                    onNavigateTab={setActiveSubTab}
                />
            )}

            {activeSubTab === 'conversaciones' && (
                <ContactCenterChatConsole 
                    chats={chats}
                    activeChatId={activeChatId}
                    onSelectChat={setActiveChatId}
                    onSendMessage={handleSendMessage}
                    onAssignChat={handleAssignChat}
                />
            )}

            {activeSubTab === 'nueva_conversacion' && (
                <ContactCenterNuevaConversacion 
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
