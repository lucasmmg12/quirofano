import React, { useState, useEffect, useRef } from 'react';
import { 
    Search, Paperclip, Send, Lock, Tag, User, 
    Calendar, CheckCircle2, ChevronDown, Check, Star, 
    Phone, Mail, MapPin, Building, Bot, Shield, ExternalLink,
    Filter, Archive, UserCheck, MoreVertical, Eye, AlertTriangle,
    Unlock, ArrowRightLeft, Clock, MessageSquare, AlertCircle,
    Power, Sparkles, Stethoscope, DollarSign, CreditCard,
    Edit3, Save, X, History, Activity, FileCheck, RefreshCw,
    Zap, CalendarCheck, PlusCircle, ShieldCheck, BarChart3, Volume2, VolumeX,
    GripVertical
} from 'lucide-react';
import { 
    CONTACT_CENTER_AGENTS, getAgentById, isChatLockedForUser, 
    MASTER_ADMINS, toggleBotActive, fetchDoctorParameters,
    saveCrmPatientCard, lookupPatientFromSalus, resetBotWorkflow,
    analyzeMedicalOrderImage, generateChatAiSummary,
    FINAL_ATTENTION_MESSAGE, isClosedOrArchived
} from '../../services/contactCenterService';
import { fetchPacienteDetalle } from '../../services/pacienteUnificadoService';
import { 
    getContactCenterQuickReplies, 
    findQuickReplyByShortcut, 
    filterQuickReplies, 
    syncQuickRepliesFromDb 
} from '../../data/contactCenterQuickReplies';

export default function ContactCenterChatConsole({ 
    chats = [], 
    activeChatId, 
    activeAgent = CONTACT_CENTER_AGENTS[0],
    currentUser,
    onSelectChat, 
    onSendMessage, 
    onAssignChat,
    onUnassignChat,
    onTransferChat,
    onCloseChat,
    activeSubTab = 'conversaciones',
    onNavigateTab,
    onSwitchAgent,
    soundEnabled = true,
    onToggleSound,
    onReloadChats,
    loadingLive = false,
    isLMarinero = false
}) {
    // Panel de Información Resizable (con límites min 260px, max 550px)
    const consoleContainerRef = useRef(null);
    const [rightPanelWidth, setRightPanelWidth] = useState(() => {
        const saved = localStorage.getItem('cc_right_panel_width');
        const parsed = saved ? parseInt(saved, 10) : 340;
        return isNaN(parsed) ? 340 : Math.min(Math.max(parsed, 260), 550);
    });
    const [isDraggingRight, setIsDraggingRight] = useState(false);

    const handleMouseDownRight = (e) => {
        e.preventDefault();
        setIsDraggingRight(true);
    };

    useEffect(() => {
        if (!isDraggingRight) return;

        const handleMouseMove = (e) => {
            if (consoleContainerRef.current) {
                const rect = consoleContainerRef.current.getBoundingClientRect();
                const calculatedWidth = rect.right - e.clientX;
                const boundedWidth = Math.min(Math.max(calculatedWidth, 260), 550);
                setRightPanelWidth(boundedWidth);
            }
        };

        const handleMouseUp = () => {
            setIsDraggingRight(false);
            setRightPanelWidth(current => {
                localStorage.setItem('cc_right_panel_width', current.toString());
                return current;
            });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingRight]);
    const [filterTab, setFilterTab] = useState('sin_asignar');
    const [searchTerm, setSearchTerm] = useState('');
    const [messageInput, setMessageInput] = useState('');
    const [isPrivateNote, setIsPrivateNote] = useState(false);
    const [activeDetailTab, setActiveDetailTab] = useState('info'); // 'info', 'historial', 'prestadores'
    const [transferMenuOpen, setTransferMenuOpen] = useState(false);
    const [botActive, setBotActive] = useState(true);
    const [doctorQuery, setDoctorQuery] = useState('');
    const [doctorResults, setDoctorResults] = useState([]);
    const [isSearchingDoctor, setIsSearchingDoctor] = useState(false);
    const [analyzingMsgId, setAnalyzingMsgId] = useState(null);
    const [, setForceUpdate] = useState(0);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Estados Atajos y Respuestas Rápidas (Exclusivo Contact Center)
    const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
    const [quickRepliesModalOpen, setQuickRepliesModalOpen] = useState(false);
    const [quickReplyFilter, setQuickReplyFilter] = useState('');
    const [selectedQuickReplyIndex, setSelectedQuickReplyIndex] = useState(0);
    const [quickRepliesList, setQuickRepliesList] = useState(() => getContactCenterQuickReplies());

    // Estados CRM: Edición de Ficha y Búsqueda en Padrón SALUS
    const [isEditingCrm, setIsEditingCrm] = useState(false);
    const [crmForm, setCrmForm] = useState({
        dni: '',
        pacienteNombre: '',
        obraSocial: '',
        fechaNacimiento: '',
        email: '',
        departamento: '',
        motivoConsulta: '',
        notas: ''
    });
    const [isSavingCrm, setIsSavingCrm] = useState(false);
    const [isSearchingSalus, setIsSearchingSalus] = useState(false);

    // Estados Historial Clínico 360°
    const [patientHistory, setPatientHistory] = useState(null);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Modal de Cierre / Finalización de Atención
    const [closeModalOpen, setCloseModalOpen] = useState(false);
    const [resolutionReason, setResolutionReason] = useState('Turno Coordinado');
    const [isClosingChat, setIsClosingChat] = useState(false);

    // Modal Institucional de Reinicio de Bot y Notificaciones Toast
    const [resetBotModalOpen, setResetBotModalOpen] = useState(false);
    const [isResettingBot, setIsResettingBot] = useState(false);
    const [systemToast, setSystemToast] = useState(null);

    const showToast = (message, type = 'success') => {
        setSystemToast({ message, type });
        setTimeout(() => {
            setSystemToast(null);
        }, 4500);
    };

    // Estados Resumen IA del Paciente y Prestador
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [aiSummaryData, setAiSummaryData] = useState(null);

    const isSupervisor = MASTER_ADMINS.includes((currentUser?.usuario || '').toLowerCase().trim());
    const selectedChat = chats.find(c => c.id === activeChatId) || chats[0] || {};

    // Sincronizar formulario CRM y Resumen IA cuando cambia el chat activo
    useEffect(() => {
        if (selectedChat) {
            const initialDni = selectedChat.customFields?.dni && selectedChat.customFields?.dni !== 'A verificar' ? selectedChat.customFields?.dni : '';
            setCrmForm({
                dni: initialDni,
                pacienteNombre: selectedChat.customFields?.pacienteNombre || selectedChat.contactName || '',
                obraSocial: selectedChat.customFields?.obraSocial && selectedChat.customFields?.obraSocial !== 'A consultar' ? selectedChat.customFields?.obraSocial : '',
                fechaNacimiento: selectedChat.customFields?.fechaNacimiento && selectedChat.customFields?.fechaNacimiento !== 'No informada' ? selectedChat.customFields?.fechaNacimiento : '',
                email: selectedChat.customFields?.email && selectedChat.customFields?.email !== 'No informado' ? selectedChat.customFields?.email : '',
                departamento: selectedChat.customFields?.departamento || 'San Juan',
                motivoConsulta: selectedChat.customFields?.motivoConsulta || selectedChat.customFields?.turnosDiaHora || '',
                notas: selectedChat.customFields?.notas || ''
            });
            setIsEditingCrm(false);
            setAiSummaryData(selectedChat.aiSummary || null);

            // Si no tiene DNI mapeado o faltan datos esenciales (fecha de nacimiento, email), resolver en background con SALUS
            const currentFechaNac = selectedChat.customFields?.fechaNacimiento;
            const currentEmail = selectedChat.customFields?.email;
            const needsLookup = !initialDni || !currentFechaNac || currentFechaNac === 'No informada' || !currentEmail || currentEmail === 'No informado';

            if (needsLookup && (initialDni || selectedChat.phone)) {
                lookupPatientFromSalus(initialDni || selectedChat.phone).then(found => {
                    if (found) {
                        const birth = found.fecha_nacimiento || '';
                        const formattedBirth = birth.includes('/') ? birth : (birth.includes('-') ? `${birth.split('-')[2]}/${birth.split('-')[1]}/${birth.split('-')[0]}` : birth);

                        setCrmForm(prev => ({
                            ...prev,
                            dni: prev.dni || found.dni || '',
                            pacienteNombre: prev.pacienteNombre && prev.pacienteNombre !== 'Paciente' ? prev.pacienteNombre : found.nombre,
                            obraSocial: prev.obraSocial && prev.obraSocial !== 'A consultar' ? prev.obraSocial : (found.coseguro || ''),
                            fechaNacimiento: prev.fechaNacimiento && prev.fechaNacimiento !== 'No informada' ? prev.fechaNacimiento : formattedBirth,
                            email: prev.email && prev.email !== 'No informado' ? prev.email : (found.email || ''),
                            departamento: prev.departamento || found.centro || 'San Juan'
                        }));
                        if (selectedChat.customFields) {
                            if (found.dni) selectedChat.customFields.dni = found.dni;
                            if (found.nhc) selectedChat.customFields.nhc = found.nhc;
                            if (found.nombre) selectedChat.customFields.pacienteNombre = found.nombre;
                            if (found.coseguro) selectedChat.customFields.obraSocial = found.coseguro;
                            if (formattedBirth) selectedChat.customFields.fechaNacimiento = formattedBirth;
                            if (found.email) selectedChat.customFields.email = found.email;
                            selectedChat.customFields.esPacienteExistente = true;
                        }
                    }
                }).catch(() => {});
            }
        }
    }, [selectedChat?.id, selectedChat?.phone, selectedChat?.aiSummary]);

    // Sincronizar catálogo institucional de respuestas rápidas de Contact Center
    useEffect(() => {
        syncQuickRepliesFromDb().then(list => {
            if (list && list.length > 0) setQuickRepliesList(list);
        }).catch(() => {});
    }, []);

    const handleRunAiSummary = async () => {
        if (!selectedChat?.phone) return;
        try {
            setIsGeneratingSummary(true);
            const summary = await generateChatAiSummary(selectedChat.phone);
            if (summary) {
                setAiSummaryData(summary);
                selectedChat.aiSummary = summary;
                // Autocompletar datos del paciente en el formulario si están vacíos
                if (summary.datos_paciente) {
                    setCrmForm(prev => ({
                        ...prev,
                        dni: prev.dni || summary.datos_paciente.dni || '',
                        pacienteNombre: prev.pacienteNombre || summary.datos_paciente.nombre_completo || '',
                        obraSocial: prev.obraSocial || summary.datos_paciente.obra_social || '',
                        fechaNacimiento: prev.fechaNacimiento || summary.datos_paciente.fecha_nacimiento || '',
                        departamento: prev.departamento || summary.datos_paciente.departamento || 'San Juan'
                    }));
                }
            }
        } catch (err) {
            alert('Error al generar resumen IA: ' + (err.message || 'Error'));
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    // Cargar Historial 360° y Turnos Próximos del paciente
    useEffect(() => {
        const dniToSearch = (crmForm.dni || selectedChat?.customFields?.dni || '').replace(/\D/g, '');
        const phoneToSearch = selectedChat?.phone || '';
        const nhcToSearch = selectedChat?.customFields?.nhc || '';

        if (dniToSearch.length >= 6 || phoneToSearch.length >= 6 || nhcToSearch) {
            setLoadingHistory(true);
            fetchPacienteDetalle({ 
                dni: dniToSearch || null, 
                nhc: nhcToSearch || null, 
                telefono: phoneToSearch || null, 
                nombre: crmForm.pacienteNombre || selectedChat?.contactName 
            })
                .then(det => {
                    setPatientHistory(det);
                    // Si encontramos NHC o DNI en el historial y no estaban en crmForm, enriquecer ficha
                    if (det?.nhc && !crmForm.dni && det.dni) {
                        setCrmForm(prev => ({ ...prev, dni: det.dni }));
                    }
                })
                .catch(err => console.warn('Error al cargar historial 360:', err))
                .finally(() => setLoadingHistory(false));
        } else {
            setPatientHistory(null);
        }
    }, [crmForm.dni, selectedChat?.id, selectedChat?.phone, selectedChat?.customFields?.nhc]);

    // Búsqueda en Padrón SALUS (admite DNI, NHC o Teléfono)
    const handleLookupSalus = async () => {
        const queryToSearch = (crmForm.dni || selectedChat?.phone || '').trim();
        if (!queryToSearch || queryToSearch.length < 4) {
            alert('Ingresa al menos 5 dígitos del DNI o selecciona una conversación con teléfono para buscar en SALUS');
            return;
        }
        setIsSearchingSalus(true);
        try {
            const found = await lookupPatientFromSalus(queryToSearch);
            if (found) {
                setCrmForm(prev => ({
                    ...prev,
                    dni: found.dni || prev.dni,
                    pacienteNombre: found.nombre || prev.pacienteNombre,
                    obraSocial: found.coseguro || prev.obraSocial,
                    email: found.email || prev.email,
                    departamento: found.centro || prev.departamento,
                    notas: (prev.notas ? prev.notas + '\n' : '') + `[Padrón SALUS] NHC: ${found.nhc || 'N/A'} - Centro: ${found.centro || 'Sanatorio Argentino'}`
                }));

                if (selectedChat?.customFields) {
                    selectedChat.customFields.dni = found.dni || selectedChat.customFields.dni;
                    selectedChat.customFields.nhc = found.nhc || selectedChat.customFields.nhc;
                    selectedChat.customFields.pacienteNombre = found.nombre || selectedChat.customFields.pacienteNombre;
                    selectedChat.customFields.obraSocial = found.coseguro || selectedChat.customFields.obraSocial;
                    selectedChat.customFields.esPacienteExistente = true;
                }
            } else {
                alert('No se encontró paciente en el Padrón de SALUS con los datos provistos (' + queryToSearch + ').');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearchingSalus(false);
        }
    };

    // Guardar Ficha CRM
    const handleSaveCrm = async (e) => {
        e?.preventDefault();
        if (!selectedChat?.phone) return;
        setIsSavingCrm(true);
        try {
            await saveCrmPatientCard({
                phone: selectedChat.phone,
                dni: crmForm.dni,
                nombreCompleto: crmForm.pacienteNombre,
                obraSocial: crmForm.obraSocial,
                fechaNacimiento: crmForm.fechaNacimiento,
                email: crmForm.email,
                departamento: crmForm.departamento,
                motivoConsulta: crmForm.motivoConsulta,
                notas: crmForm.notas
            });

            if (selectedChat.customFields) {
                selectedChat.customFields.dni = crmForm.dni;
                selectedChat.customFields.pacienteNombre = crmForm.pacienteNombre;
                selectedChat.customFields.obraSocial = crmForm.obraSocial;
                selectedChat.customFields.fechaNacimiento = crmForm.fechaNacimiento;
                selectedChat.customFields.email = crmForm.email;
                selectedChat.customFields.departamento = crmForm.departamento;
                selectedChat.customFields.motivoConsulta = crmForm.motivoConsulta;
                selectedChat.customFields.notas = crmForm.notas;
                selectedChat.contactName = crmForm.pacienteNombre || selectedChat.contactName;
            }
            setIsEditingCrm(false);
        } catch (err) {
            console.error('Error guardando CRM:', err);
            alert('Error al guardar datos CRM: ' + err.message);
        } finally {
            setIsSavingCrm(false);
        }
    };

    // Confirmar Cierre / Finalización
    const handleConfirmClose = async () => {
        if (!selectedChat?.id || !onCloseChat) return;
        setIsClosingChat(true);
        try {
            await onCloseChat(selectedChat.id, resolutionReason);
            setCloseModalOpen(false);
        } catch (err) {
            console.error('Error cerrando:', err);
        } finally {
            setIsClosingChat(false);
        }
    };

    // Sincronizar estado del bot al cambiar de chat
    useEffect(() => {
        if (selectedChat) {
            setBotActive(selectedChat.botActive !== false && !selectedChat.assignedTo);
        }
    }, [selectedChat?.id, selectedChat?.botActive, selectedChat?.assignedTo]);

    // Auto-scroll al final del chat para ver siempre el último mensaje y el compositor
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [selectedChat?.messages?.length, selectedChat?.id]);

    // Búsqueda de médicos en SALUS
    useEffect(() => {
        if (!doctorQuery || doctorQuery.trim().length < 2) {
            setDoctorResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsSearchingDoctor(true);
            try {
                const results = await fetchDoctorParameters(doctorQuery.trim());
                setDoctorResults(results);
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearchingDoctor(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [doctorQuery]);

    const handleToggleBot = async () => {
        const newState = !botActive;
        setBotActive(newState);
        if (selectedChat?.phone) {
            await toggleBotActive(selectedChat.phone, newState);
            if (newState && onUnassignChat) {
                onUnassignChat(selectedChat.id);
            }
        }
    };

    const handleOpenResetBotModal = () => {
        if (!selectedChat?.phone) return;
        setResetBotModalOpen(true);
    };

    const handleConfirmResetBot = async () => {
        if (!selectedChat?.phone) return;
        try {
            setIsResettingBot(true);
            setBotActive(true);
            await resetBotWorkflow(selectedChat.phone);
            if (onUnassignChat) onUnassignChat(selectedChat.id);
            setResetBotModalOpen(false);
            showToast(`Flujo del bot reiniciado para ${selectedChat.contactName}. El bot volverá a responder desde el inicio cuando el paciente escriba.`, 'success');
        } catch (err) {
            console.error('Error al reiniciar bot:', err);
            showToast('Error al reiniciar el flujo: ' + (err.message || 'Error'), 'error');
        } finally {
            setIsResettingBot(false);
        }
    };

    // Determinar bloqueo para el chat seleccionado
    const isLocked = isChatLockedForUser(selectedChat, activeAgent.id, currentUser);
    const myAliases = [activeAgent.id, activeAgent.username, activeAgent.legacyId].filter(Boolean).map(a => a.toLowerCase());
    const isAssignedToMe = selectedChat.assignedTo && (
        myAliases.includes(selectedChat.assignedTo.toLowerCase()) ||
        (selectedChat.assignedToName || '').toLowerCase().includes(activeAgent.name.toLowerCase())
    );
    const isUnassigned = !selectedChat.assignedTo || selectedChat.status === 'sin_asignar';
    const assignedAgentObj = selectedChat.assignedTo ? getAgentById(selectedChat.assignedTo) : null;

    // Filtrar chats según pestaña activa
    const filteredChats = chats.filter(chat => {
        const chatAssigned = (chat.assignedTo || '').toLowerCase();
        const isMine = chatAssigned && (
            myAliases.includes(chatAssigned) ||
            (chat.assignedToName || '').toLowerCase().includes(activeAgent.name.toLowerCase())
        );
        const closed = isClosedOrArchived(chat.status);

        if (filterTab === 'sin_asignar') return (!chat.assignedTo || chat.status === 'sin_asignar') && !closed;
        if (filterTab === 'asignadas_mi') return isMine && !closed;
        if (filterTab === 'asignadas_otros') return chatAssigned && !isMine && !closed;
        if (filterTab === 'finalizados' || filterTab === 'archivadas' || filterTab === 'cerrados') return closed;
        if (filterTab === 'todos') return true;
        return !closed;
    }).filter(chat => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (chat.contactName || '').toLowerCase().includes(q) 
            || (chat.phone || '').includes(q)
            || (chat.id || '').toLowerCase().includes(q) 
            || (chat.lastMessage || '').toLowerCase().includes(q)
            || (chat.customFields?.dni || '').toLowerCase().includes(q)
            || (chat.customFields?.pacienteNombre || '').toLowerCase().includes(q)
            || (chat.customFields?.obraSocial || '').toLowerCase().includes(q);
    });

    const sendDirectMessage = (text, isNote = false) => {
        if (!text || !text.trim()) return;
        if (isLocked) {
            alert(`Esta conversación está asignada exclusivamente a ${assignedAgentObj?.name || 'otra agente'}.`);
            return;
        }
        if (isUnassigned && !isSupervisor && onAssignChat) {
            onAssignChat(selectedChat.id, activeAgent.id);
        }
        onSendMessage(selectedChat.id, text.trim(), isNote);
        setMessageInput('');
        setQuickRepliesOpen(false);
        setQuickRepliesModalOpen(false);
    };

    const handleSend = (e) => {
        e?.preventDefault?.();
        if (!messageInput.trim()) return;

        let textToSend = messageInput.trim();
        // Si el usuario escribió un atajo (ej: /dan o /bosi), resolverlo de inmediato
        if (textToSend.startsWith('/')) {
            const found = findQuickReplyByShortcut(textToSend);
            if (found) {
                textToSend = found.content;
            }
        }

        sendDirectMessage(textToSend, isPrivateNote);
    };

    const handleInputChange = (e) => {
        const val = e.target.value;
        setMessageInput(val);

        if (val.startsWith('/')) {
            const query = val.slice(1);
            setQuickReplyFilter(query);
            setQuickRepliesOpen(true);
            setSelectedQuickReplyIndex(0);
        } else {
            setQuickRepliesOpen(false);
        }
    };

    const handleInputKeyDown = (e) => {
        if (!quickRepliesOpen) {
            if (e.key === 'Enter' && !e.shiftKey) {
                handleSend(e);
            }
            return;
        }

        const currentMatches = filterQuickReplies(quickReplyFilter);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedQuickReplyIndex(prev => (prev + 1) % Math.max(1, currentMatches.length));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedQuickReplyIndex(prev => (prev - 1 + Math.max(1, currentMatches.length)) % Math.max(1, currentMatches.length));
        } else if (e.key === 'Escape') {
            setQuickRepliesOpen(false);
        } else if (e.key === 'Tab') {
            // Tab autocompleta el texto en el input para poder editarlo
            e.preventDefault();
            const targetItem = currentMatches[selectedQuickReplyIndex] || currentMatches[0];
            if (targetItem) {
                setMessageInput(targetItem.content);
                setQuickRepliesOpen(false);
            }
        } else if (e.key === 'Enter' && !e.shiftKey) {
            // Enter envía inmediatamente el atajo
            e.preventDefault();
            const matchedByDirectCmd = findQuickReplyByShortcut(messageInput);
            const targetItem = matchedByDirectCmd || currentMatches[selectedQuickReplyIndex] || currentMatches[0];

            if (targetItem) {
                sendDirectMessage(targetItem.content, isPrivateNote);
            } else {
                handleSend(e);
            }
        }
    };

    return (
        <div 
            ref={consoleContainerRef}
            style={{
                display: 'grid',
                gridTemplateColumns: `330px 1fr 6px ${rightPanelWidth}px`,
                height: 'calc(100vh - 78px)',
                maxHeight: 'calc(100vh - 78px)',
                minHeight: '480px',
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                userSelect: isDraggingRight ? 'none' : 'auto'
            }}
        >
            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* COLUMNA 1: SIDEBAR DE CONTACT CENTER (MÓDULOS + AGENTES + FILTROS) */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, borderRight: '1px solid #E2E8F0', background: '#FFFFFF' }}>

                {/* 1. NAVEGACIÓN DEL MÓDULO (IMAGEN 2) Y SELECTOR DE AGENTES */}
                <div style={{
                    padding: '8px 8px 6px',
                    borderBottom: '1px solid #F1F5F9',
                    background: '#F8FAFC',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                }}>
                    {/* Fila 1: Pestañas de Navegación del Módulo */}
                    <div style={{
                        display: 'flex',
                        gap: '2px',
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        padding: '2px',
                        overflowX: 'auto'
                    }}>
                        <button
                            type="button"
                            onClick={() => onNavigateTab?.('conversaciones')}
                            title="Conversaciones"
                            style={{
                                flex: 1, padding: '5px 4px', borderRadius: '6px', border: 'none',
                                fontSize: '0.71rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                                background: (!activeSubTab || activeSubTab === 'conversaciones') ? '#0F2942' : 'transparent',
                                color: (!activeSubTab || activeSubTab === 'conversaciones') ? '#FFFFFF' : '#64748B'
                            }}
                        >
                            <MessageSquare size={12} />
                            <span>Chats</span>
                            <span style={{
                                background: (!activeSubTab || activeSubTab === 'conversaciones') ? '#0284C7' : '#EFF6FF',
                                color: (!activeSubTab || activeSubTab === 'conversaciones') ? '#FFFFFF' : '#1E40AF',
                                fontSize: '0.62rem', padding: '0 4px', borderRadius: '8px', fontWeight: 800
                            }}>
                                {chats.filter(c => !c.assignedTo).length}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => onNavigateTab?.('mi_semana')}
                            title="Mi Semana"
                            style={{
                                flex: 1, padding: '5px 4px', borderRadius: '6px', border: 'none',
                                fontSize: '0.71rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                                background: activeSubTab === 'mi_semana' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'mi_semana' ? '#FFFFFF' : '#64748B'
                            }}
                        >
                            <CalendarCheck size={12} />
                            <span>Semana</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => onNavigateTab?.('nueva_conversacion')}
                            title="Crear Conversación"
                            style={{
                                padding: '5px 6px', borderRadius: '6px', border: 'none',
                                fontSize: '0.71rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                                background: activeSubTab === 'nueva_conversacion' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'nueva_conversacion' ? '#FFFFFF' : '#64748B'
                            }}
                        >
                            <PlusCircle size={12} />
                            <span>+</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => onNavigateTab?.('turnos_online')}
                            title="Turnos Online"
                            style={{
                                flex: 1, padding: '5px 4px', borderRadius: '6px', border: 'none',
                                fontSize: '0.71rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                                background: activeSubTab === 'turnos_online' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'turnos_online' ? '#FFFFFF' : '#DC2626'
                            }}
                        >
                            <AlertTriangle size={12} />
                            <span>Turnos</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => onNavigateTab?.('metricas')}
                            title="Métricas y Control de Costos"
                            style={{
                                flex: 1, padding: '5px 4px', borderRadius: '6px', border: 'none',
                                fontSize: '0.71rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                                background: activeSubTab === 'metricas' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'metricas' ? '#FFFFFF' : '#0284C7'
                            }}
                        >
                            <BarChart3 size={12} />
                            <span>Métricas</span>
                        </button>

                        {isLMarinero && (
                            <button
                                type="button"
                                onClick={() => onNavigateTab?.('permisos')}
                                title="Permisos"
                                style={{
                                    padding: '5px 6px', borderRadius: '6px', border: 'none',
                                    fontSize: '0.71rem', fontWeight: 700, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: activeSubTab === 'permisos' ? '#1E40AF' : 'transparent',
                                    color: activeSubTab === 'permisos' ? '#FFFFFF' : '#1E40AF'
                                }}
                            >
                                <ShieldCheck size={12} />
                            </button>
                        )}
                    </div>

                    {/* Fila 2: Selector de Agentes ("Atendiendo como:") + Sonido + Sync */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '4px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto' }}>
                            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#64748B', whiteSpace: 'nowrap' }}>
                                Atendiendo:
                            </span>
                            <div style={{ display: 'flex', gap: '3px' }}>
                                {CONTACT_CENTER_AGENTS.map(agent => {
                                    const isCurrent = activeAgent.id === agent.id || activeAgent.username === agent.username;
                                    const assignedCount = chats.filter(c => {
                                        if (c.status === 'archivado') return false;
                                        const assigned = (c.assignedTo || '').toLowerCase();
                                        if (!assigned) return false;
                                        return (
                                            assigned === agent.id.toLowerCase() ||
                                            (agent.username && assigned === agent.username.toLowerCase()) ||
                                            (agent.legacyId && assigned === agent.legacyId.toLowerCase()) ||
                                            (c.assignedToName || '').toLowerCase().includes(agent.name.toLowerCase())
                                        );
                                    }).length;
                                    const canSwitch = isLMarinero;

                                    return (
                                        <button
                                            key={agent.id}
                                            type="button"
                                            onClick={() => {
                                                if (canSwitch) {
                                                    onSwitchAgent?.(agent);
                                                }
                                            }}
                                            title={`${agent.fullName} (${assignedCount} asignados)`}
                                            style={{
                                                padding: '2px 5px',
                                                borderRadius: '5px',
                                                border: 'none',
                                                cursor: canSwitch ? 'pointer' : 'default',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '3px',
                                                background: isCurrent ? agent.color : '#F1F5F9',
                                                color: isCurrent ? '#FFFFFF' : '#475569',
                                                fontSize: '0.67rem',
                                                fontWeight: 700,
                                                boxShadow: isCurrent ? `0 1px 4px ${agent.color}40` : 'none',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            <span style={{
                                                width: '14px', height: '14px', borderRadius: '50%',
                                                background: isCurrent ? '#FFFFFF' : agent.color,
                                                color: isCurrent ? agent.color : '#FFFFFF',
                                                fontSize: '0.56rem', fontWeight: 900,
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {agent.avatar}
                                            </span>
                                            <span>{agent.name.split(' ')[0]}</span>
                                            {assignedCount > 0 && (
                                                <span style={{
                                                    background: isCurrent ? 'rgba(255,255,255,0.3)' : '#E2E8F0',
                                                    color: isCurrent ? '#FFFFFF' : '#0F172A',
                                                    padding: '0 4px', borderRadius: '8px', fontSize: '0.6rem', fontWeight: 800
                                                }}>
                                                    {assignedCount}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Sonido y Sync */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                            <button
                                type="button"
                                onClick={onToggleSound}
                                title={soundEnabled ? 'Silenciar avisos sonoros' : 'Activar sonido de nuevos mensajes'}
                                style={{
                                    padding: '3px 5px', borderRadius: '5px', border: '1px solid #CBD5E1',
                                    background: soundEnabled ? '#F0FDF4' : '#FFFFFF',
                                    color: soundEnabled ? '#16A34A' : '#94A3B8',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center'
                                }}
                            >
                                {soundEnabled ? <Volume2 size={11} /> : <VolumeX size={11} />}
                            </button>
                            <button
                                type="button"
                                onClick={onReloadChats}
                                disabled={loadingLive}
                                title="Forzar sincronización inmediata"
                                style={{
                                    padding: '3px 5px', borderRadius: '5px', border: '1px solid #CBD5E1',
                                    background: '#FFFFFF', color: '#0284C7',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center'
                                }}
                            >
                                <RefreshCw size={11} className={loadingLive ? 'spin' : ''} />
                            </button>
                        </div>
                    </div>
                </div>
                {/* Pestañas de Filtros Superiores AsisteClick */}
                <div style={{ display: 'flex', gap: '4px', padding: '10px 8px', borderBottom: '1px solid #F1F5F9', overflowX: 'auto', background: '#FAFAFA' }}>
                    <button 
                        onClick={() => {
                            setFilterTab('sin_asignar');
                            const first = chats.find(c => (!c.assignedTo || c.status === 'sin_asignar') && !isClosedOrArchived(c.status));
                            if (first && onSelectChat) onSelectChat(first.id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'sin_asignar' ? '#0284C7' : '#FFFFFF',
                            color: filterTab === 'sin_asignar' ? '#FFFFFF' : '#475569',
                            boxShadow: filterTab === 'sin_asignar' ? '0 2px 4px rgba(2,132,199,0.25)' : 'none'
                        }}
                    >
                        Sin asignar ({chats.filter(c => (!c.assignedTo || c.status === 'sin_asignar') && !isClosedOrArchived(c.status)).length})
                    </button>
                    <button 
                        onClick={() => {
                            setFilterTab('asignadas_mi');
                            const first = chats.find(c => {
                                const a = (c.assignedTo || '').toLowerCase();
                                return (myAliases.includes(a) || (c.assignedToName || '').toLowerCase().includes(activeAgent.name.toLowerCase())) && !isClosedOrArchived(c.status);
                            });
                            if (first && onSelectChat) onSelectChat(first.id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'asignadas_mi' ? '#0284C7' : '#FFFFFF',
                            color: filterTab === 'asignadas_mi' ? '#FFFFFF' : '#475569'
                        }}
                    >
                        Mis chats ({chats.filter(c => {
                            const a = (c.assignedTo || '').toLowerCase();
                            return (myAliases.includes(a) || (c.assignedToName || '').toLowerCase().includes(activeAgent.name.toLowerCase())) && !isClosedOrArchived(c.status);
                        }).length})
                    </button>
                    <button 
                        onClick={() => {
                            setFilterTab('asignadas_otros');
                            const first = chats.find(c => {
                                const a = (c.assignedTo || '').toLowerCase();
                                return a && !myAliases.includes(a) && !(c.assignedToName || '').toLowerCase().includes(activeAgent.name.toLowerCase()) && !isClosedOrArchived(c.status);
                            });
                            if (first && onSelectChat) onSelectChat(first.id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'asignadas_otros' ? '#0284C7' : '#FFFFFF',
                            color: filterTab === 'asignadas_otros' ? '#FFFFFF' : '#475569'
                        }}
                    >
                        Otras ({chats.filter(c => {
                            const a = (c.assignedTo || '').toLowerCase();
                            return a && !myAliases.includes(a) && !(c.assignedToName || '').toLowerCase().includes(activeAgent.name.toLowerCase()) && !isClosedOrArchived(c.status);
                        }).length})
                    </button>
                    <button 
                        onClick={() => {
                            setFilterTab('finalizados');
                            const first = chats.find(c => isClosedOrArchived(c.status));
                            if (first && onSelectChat) onSelectChat(first.id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'finalizados' ? '#059669' : '#FFFFFF',
                            color: filterTab === 'finalizados' ? '#FFFFFF' : '#475569',
                            boxShadow: filterTab === 'finalizados' ? '0 2px 4px rgba(5,150,105,0.25)' : 'none',
                            display: 'flex', alignItems: 'center', gap: '3px'
                        }}
                    >
                        <Archive size={11} /> Finalizados ({chats.filter(c => isClosedOrArchived(c.status)).length})
                    </button>
                    <button 
                        onClick={() => {
                            setFilterTab('todos');
                            if (chats.length > 0 && onSelectChat) onSelectChat(chats[0].id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'todos' ? '#0284C7' : '#FFFFFF',
                            color: filterTab === 'todos' ? '#FFFFFF' : '#475569'
                        }}
                    >
                        Todos ({chats.length})
                    </button>
                </div>

                {/* Buscador de chat */}
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 10px' }}>
                        <Search size={14} color="#94A3B8" />
                        <input 
                            type="text"
                            placeholder="Buscar por paciente, teléfono o DNI..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.78rem', color: '#1E293B', width: '100%' }}
                        />
                    </div>
                </div>

                {/* Lista de Chats con Tags de Asignación y Último en Responder */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {filteredChats.map(chat => {
                        const isSelected = chat.id === selectedChat.id;
                        const assignedAgent = chat.assignedTo ? getAgentById(chat.assignedTo) : null;
                        const chatIsLocked = isChatLockedForUser(chat, activeAgent.id, currentUser);
                        const chatIsMine = chat.assignedTo && chat.assignedTo.toLowerCase() === activeAgent.id.toLowerCase();

                        return (
                            <div 
                                key={chat.id}
                                onClick={() => onSelectChat(chat.id)}
                                style={{
                                    padding: '12px 14px',
                                    borderBottom: '1px solid #F1F5F9',
                                    cursor: 'pointer',
                                    background: isSelected ? '#EFF6FF' : '#FFFFFF',
                                    borderLeft: isSelected ? '4px solid #1E40AF' : '4px solid transparent',
                                    transition: 'background 0.15s',
                                    position: 'relative'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '28px', height: '28px', borderRadius: '50%',
                                            background: chat.avatarColor || '#1E40AF', color: '#FFF',
                                            fontSize: '0.7rem', fontWeight: 800, display: 'flex',
                                            alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {(chat.contactName || 'P').substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isSelected ? '#1E40AF' : '#0F172A' }}>
                                                {chat.contactName}
                                            </span>
                                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                +{chat.phone}
                                            </div>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                                        {chat.timeAgo}
                                    </span>
                                </div>

                                {/* TAGS DE TRAZABILIDAD: ASIGNADO Y LOCK */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', margin: '6px 0 4px' }}>
                                    {isClosedOrArchived(chat.status) ? (
                                        <span style={{
                                            fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                            background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0',
                                            display: 'flex', alignItems: 'center', gap: '3px'
                                        }}>
                                            <CheckCircle2 size={10} color="#047857" /> Finalizado {chat.resolutionReason ? `• ${chat.resolutionReason}` : ''}
                                        </span>
                                    ) : assignedAgent ? (
                                        <span style={{
                                            fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                            background: chatIsMine ? '#DCFCE7' : '#F1F5F9',
                                            color: chatIsMine ? '#15803D' : '#334155',
                                            border: `1px solid ${chatIsMine ? '#86EFAC' : '#CBD5E1'}`,
                                            display: 'flex', alignItems: 'center', gap: '3px'
                                        }}>
                                            <User size={10} />
                                            {assignedAgent.name} {chatIsMine ? '(Tú)' : ''}
                                        </span>
                                    ) : (
                                        <span style={{
                                            fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                            background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D'
                                        }}>
                                            ⚠️ Sin asignar
                                        </span>
                                    )}

                                    {/* Tag de Bloqueo Exclusivo */}
                                    {chatIsLocked && !isClosedOrArchived(chat.status) && (
                                        <span style={{
                                            fontSize: '0.64rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                            background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5',
                                            display: 'flex', alignItems: 'center', gap: '2px'
                                        }}>
                                            <Lock size={9} /> Bloqueada
                                        </span>
                                    )}

                                    {/* Tag: Último en responder */}
                                    {chat.lastResponder && (
                                        <span style={{
                                            fontSize: '0.64rem', fontWeight: 700, padding: '1px 6px', borderRadius: '6px',
                                            background: chat.lastResponderRole === 'agent' ? '#EFF6FF' : '#FFF1F2',
                                            color: chat.lastResponderRole === 'agent' ? '#1E40AF' : '#E11D48',
                                            border: '1px solid #E2E8F0',
                                            display: 'flex', alignItems: 'center', gap: '3px'
                                        }}>
                                            {chat.lastResponderRole === 'agent' ? 'Resp: ' + chat.lastResponder : '🔴 Escribió Paciente'}
                                        </span>
                                    )}
                                </div>

                                <div style={{ fontSize: '0.76rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {chat.lastMessage}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* COLUMNA 2: VISOR DE CHAT Y COMPOSITOR                            */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', background: '#F8FAFC' }}>
                {/* Barra Superior del Chat con Control de Asignación Exclusiva */}
                <div style={{
                    padding: '12px 20px',
                    flexShrink: 0,
                    background: '#FFFFFF',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        {/* Nombre del paciente y datos */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0284C7' }}>
                                    {selectedChat.contactName}
                                </span>

                                {/* CONDICIÓN PADRÓN */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B' }}>CONDICIÓN PADRÓN</span>
                                    <span style={{
                                        fontSize: '0.68rem', fontWeight: 800,
                                        padding: '2px 8px', borderRadius: '4px',
                                        background: selectedChat.customFields?.esPacienteExistente ? '#ECFDF5' : '#EFF6FF',
                                        color: selectedChat.customFields?.esPacienteExistente ? '#047857' : '#1D4ED8',
                                        border: '1px solid', borderColor: selectedChat.customFields?.esPacienteExistente ? '#A7F3D0' : '#BFDBFE'
                                    }}>
                                        {selectedChat.customFields?.esPacienteExistente ? '✓ Paciente Registrado' : '+ Nuevo Paciente'}
                                    </span>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                                <span>Tel: {selectedChat.phone}</span>
                                <span>•</span>
                                <span>
                                    Última respuesta: <strong style={{ color: selectedChat.lastResponderRole === 'agent' ? '#1E40AF' : '#E11D48' }}>
                                        {selectedChat.lastResponder || 'Paciente'}
                                    </strong>
                                </span>
                            </div>
                        </div>

                        {/* WIDGET: CHATBOT ACTIVO (TRIAGE) */}
                        <div style={{
                            padding: '6px 12px', borderRadius: '10px',
                            background: botActive ? '#F0FDF4' : '#FFFBEB',
                            border: '1px solid', borderColor: botActive ? '#BBF7D0' : '#FDE68A',
                            display: 'flex', flexDirection: 'column', gap: '4px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', fontWeight: 800, color: botActive ? '#15803D' : '#B45309' }}>
                                    <Bot size={14} />
                                    {botActive ? 'CHATBOT ACTIVO (TRIAGE)' : 'CHATBOT SILENCIADO'}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <button
                                        type="button"
                                        onClick={handleToggleBot}
                                        style={{
                                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700,
                                            border: 'none', cursor: 'pointer',
                                            background: botActive ? '#DC2626' : '#16A34A',
                                            color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '4px',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                        }}
                                    >
                                        <Power size={11} />
                                        {botActive ? 'Silenciar Bot' : 'Reanudar Bot'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleOpenResetBotModal}
                                        title="Reiniciar flujo del bot para que vuelva al saludo inicial de triage"
                                        style={{
                                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700,
                                            border: '1px solid #CBD5E1', cursor: 'pointer',
                                            background: '#FFFFFF', color: '#0284C7', display: 'flex', alignItems: 'center', gap: '4px'
                                        }}
                                    >
                                        <RefreshCw size={11} />
                                        Reiniciar
                                    </button>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.66rem', color: botActive ? '#166534' : '#92400E', lineHeight: 1.25 }}>
                                {botActive 
                                    ? 'El bot responde preguntas de triage ahorrando mensajes. Se silencia al asignar una agente.'
                                    : 'El bot no responderá para permitir atención humana exclusiva.'}
                            </div>
                        </div>
                    </div>

                    {/* BOTONES DE ASIGNACIÓN / BLOQUEO EXCLUSIVO */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                        {isClosedOrArchived(selectedChat.status) ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 14px', borderRadius: '8px',
                                    background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857',
                                    fontSize: '0.74rem', fontWeight: 800
                                }}>
                                    <CheckCircle2 size={13} color="#047857" />
                                    Conversación Finalizada {selectedChat.resolutionReason ? `(${selectedChat.resolutionReason})` : ''}
                                </div>
                                <button
                                    onClick={() => onAssignChat && onAssignChat(selectedChat.id, activeAgent.id)}
                                    title="Reabrir esta conversación para continuar atendiendo al paciente"
                                    style={{
                                        padding: '6px 12px', borderRadius: '8px', border: '1px solid #0284C7',
                                        background: '#F0F9FF', color: '#0284C7', fontWeight: 700, fontSize: '0.72rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    <RefreshCw size={12} /> Reabrir Atención
                                </button>
                            </div>
                        ) : isUnassigned ? (
                            <button 
                                onClick={() => onAssignChat && onAssignChat(selectedChat.id, activeAgent.id)}
                                style={{
                                    padding: '7px 14px', borderRadius: '8px', border: 'none',
                                    background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                    color: '#FFFFFF', fontWeight: 700, fontSize: '0.76rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                                }}
                            >
                                <UserCheck size={14} /> Asignarme esta conversación
                            </button>
                        ) : null}

                        {/* CASO 2: ASIGNADA A MÍ -> PUEDO LIBERAR O TRANSFERIR (Solo si NO está cerrado) */}
                        {!isClosedOrArchived(selectedChat.status) && isAssignedToMe && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                    fontSize: '0.72rem', fontWeight: 800, padding: '5px 10px', borderRadius: '8px',
                                    background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC',
                                    display: 'flex', alignItems: 'center', gap: '4px'
                                }}>
                                    <CheckCircle2 size={13} /> Asignada a ti ({activeAgent.name})
                                </span>

                                <button
                                    onClick={() => onUnassignChat && onUnassignChat(selectedChat.id)}
                                    title="Liberar chat a la cola general"
                                    style={{
                                        padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1',
                                        background: '#FFFFFF', color: '#475569', fontWeight: 600, fontSize: '0.72rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    <Unlock size={12} /> Liberar
                                </button>

                                <button
                                    onClick={() => setTransferMenuOpen(!transferMenuOpen)}
                                    title="Transferir a otra agente"
                                    style={{
                                        padding: '6px 10px', borderRadius: '6px', border: '1px solid #0284C7',
                                        background: '#F0F9FF', color: '#0284C7', fontWeight: 700, fontSize: '0.72rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    <ArrowRightLeft size={12} /> Transferir <ChevronDown size={12} />
                                </button>

                                <button
                                    onClick={() => setCloseModalOpen(true)}
                                    title="Finalizar atención y archivar conversación"
                                    style={{
                                        padding: '6px 12px', borderRadius: '6px', border: 'none',
                                        background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                                        color: '#FFFFFF', fontWeight: 700, fontSize: '0.72rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                        boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)'
                                    }}
                                >
                                    <CheckCircle2 size={12} /> Finalizar Atención
                                </button>
                            </div>
                        )}

                        {/* CASO 3: ASIGNADA A OTRA AGENTE -> BLOQUEO ESTRICTO (Solo si NO está cerrado) */}
                        {!isClosedOrArchived(selectedChat.status) && !isUnassigned && !isAssignedToMe && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 12px', borderRadius: '8px',
                                    background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B',
                                    fontSize: '0.74rem', fontWeight: 800
                                }}>
                                    <Lock size={13} />
                                    Asignada a {assignedAgentObj?.name || selectedChat.assignedTo} (Bloqueada)
                                </div>

                                {/* Solo supervisor lmarinero puede forzar reasignación */}
                                {isSupervisor && (
                                    <button
                                        onClick={() => setTransferMenuOpen(!transferMenuOpen)}
                                        style={{
                                            padding: '6px 10px', borderRadius: '6px', border: '1px solid #DC2626',
                                            background: '#FFFFFF', color: '#DC2626', fontWeight: 700, fontSize: '0.72rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Supervisión: Reasignar
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Menú de Transferencia entre las 4 agentes */}
                        {transferMenuOpen && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: '6px',
                                background: '#FFFFFF', borderRadius: '10px', border: '1px solid #CBD5E1',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.12)', width: '220px', zIndex: 50,
                                padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px'
                            }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', padding: '6px 8px', textTransform: 'uppercase' }}>
                                    Transferir conversación a:
                                </div>
                                {CONTACT_CENTER_AGENTS.filter(a => a.id !== (selectedChat.assignedTo || '').toLowerCase()).map(targetAgent => (
                                    <button
                                        key={targetAgent.id}
                                        onClick={() => {
                                            onTransferChat(selectedChat.id, targetAgent.id);
                                            setTransferMenuOpen(false);
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '8px 10px', borderRadius: '6px', border: 'none',
                                            background: 'transparent', cursor: 'pointer', textAlign: 'left',
                                            width: '100%', transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#F1F5F9'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div style={{
                                            width: '22px', height: '22px', borderRadius: '50%',
                                            background: targetAgent.color, color: '#FFF',
                                            fontSize: '0.68rem', fontWeight: 800, display: 'flex',
                                            alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {targetAgent.avatar}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>
                                                {targetAgent.fullName}
                                            </div>
                                            <div style={{ fontSize: '0.66rem', color: '#64748B' }}>
                                                {targetAgent.role}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Área de Mensajes con Estilo AsisteClick + Tags de Autoría */}
                <div style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    backgroundImage: 'radial-gradient(#E2E8F0 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                }}>
                    {selectedChat.messages?.map(msg => {
                        if (msg.sender === 'system') {
                            return (
                                <div key={msg.id} style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                                    <span style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0',
                                        color: '#475569', fontSize: '0.72rem', fontWeight: 600, padding: '4px 14px',
                                        borderRadius: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                        display: 'flex', alignItems: 'center', gap: '6px'
                                    }}>
                                        <Clock size={12} color="#94A3B8" />
                                        {msg.text}
                                    </span>
                                </div>
                            );
                        }

                        const isPatient = msg.sender === 'patient';
                        const isNote = msg.isNote;
                        const agentObj = !isPatient ? getAgentById(msg.senderAgentId || msg.senderName) : null;

                        return (
                            <div 
                                key={msg.id}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: isPatient ? 'flex-start' : 'flex-end',
                                    maxWidth: '82%',
                                    alignSelf: isPatient ? 'flex-start' : 'flex-end'
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '8px',
                                    flexDirection: isPatient ? 'row' : 'row-reverse'
                                }}>
                                    {/* Avatar circular con color de la agente o del paciente */}
                                    <div style={{
                                        width: '28px', height: '28px', borderRadius: '50%',
                                        background: isPatient 
                                            ? (selectedChat.avatarColor || '#E11D48') 
                                            : (isNote ? '#EA580C' : (agentObj?.color || '#0284C7')),
                                        color: '#FFFFFF', fontSize: '0.72rem', fontWeight: 800,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        {isPatient ? selectedChat.contactName.charAt(0) : (isNote ? '🔒' : (agentObj?.avatar || 'A'))}
                                    </div>

                                    {/* Burbuja de Mensaje con Tag de Autoría */}
                                    <div style={{
                                        background: isNote ? '#FFF7ED' : (isPatient ? '#DCFCE7' : '#FFFFFF'),
                                        border: isNote ? '1px solid #FED7AA' : '1px solid #E2E8F0',
                                        padding: '10px 14px',
                                        borderRadius: isPatient ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                                        color: '#1E293B',
                                        fontSize: '0.86rem',
                                        lineHeight: 1.45
                                    }}>
                                        {/* TAG DE AUTORÍA CLARO */}
                                        {!isPatient && (
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                marginBottom: '6px', paddingBottom: '4px',
                                                borderBottom: isNote ? '1px dashed #FDBA74' : '1px solid #F1F5F9'
                                            }}>
                                                <span style={{
                                                    fontSize: '0.68rem', fontWeight: 800,
                                                    color: isNote ? '#C2410C' : (agentObj?.color || '#0284C7'),
                                                    background: isNote ? '#FFEDD5' : '#F8FAFC',
                                                    padding: '1px 6px', borderRadius: '4px', border: '1px solid #E2E8F0'
                                                }}>
                                                    {isNote ? `🔒 NOTA INTERNA • ${msg.senderName}` : `👤 ${msg.senderName} (${agentObj?.role || 'Agente'})`}
                                                </span>
                                            </div>
                                        )}

                                        {msg.type === 'image' && (
                                            <div style={{ marginBottom: '8px', maxWidth: '340px' }}>
                                                <div 
                                                    style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0', cursor: 'pointer' }}
                                                    onClick={() => msg.mediaUrl && window.open(msg.mediaUrl, '_blank')}
                                                    title="Click para ver imagen completa"
                                                >
                                                    <img src={msg.mediaUrl} alt={msg.caption || 'Foto de Orden'} style={{ width: '100%', maxHeight: '220px', objectFit: 'contain', background: '#0F172A' }} />
                                                    {msg.caption && (
                                                        <div style={{ padding: '6px 10px', background: '#F8FAFC', fontSize: '0.75rem', color: '#64748B' }}>
                                                            📄 {msg.caption}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Tarjeta de Análisis Clínico IA de la Orden Médica (Exclusivo para el Operador) */}
                                                {msg.orderAnalysis ? (
                                                    <div style={{
                                                        marginTop: '6px',
                                                        padding: '10px 12px',
                                                        background: '#F0FDF4',
                                                        border: '1.5px solid #86EFAC',
                                                        borderRadius: '8px',
                                                        fontSize: '0.78rem',
                                                        color: '#0F172A',
                                                        lineHeight: 1.5,
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                                        textAlign: 'left'
                                                    }}>
                                                        <div style={{
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                            marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid #BBF7D0'
                                                        }}>
                                                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                🩺 DATOS DE LA ORDEN (IA)
                                                            </span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const textToCopy = msg.orderAnalysis.raw_summary || 
`Estudio a autorizar: ${msg.orderAnalysis.estudio || 'No especificado'}
Solicitante: ${msg.orderAnalysis.solicitante || 'No especificado'}
Matricula: ${msg.orderAnalysis.matricula || 'No especificada'}
Diagnostico: ${msg.orderAnalysis.diagnostico || 'No especificado'}
Fecha de solicitud: ${msg.orderAnalysis.fecha_solicitud || 'No especificada'}`;
                                                                    navigator.clipboard.writeText(textToCopy);
                                                                    alert('Ficha copiada al portapapeles');
                                                                }}
                                                                style={{
                                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                                    fontSize: '0.68rem', color: '#15803D', fontWeight: 700, padding: 0
                                                                }}
                                                                title="Copiar datos de la orden"
                                                            >
                                                                📋 Copiar
                                                            </button>
                                                        </div>
                                                        <div style={{ display: 'grid', gap: '3px' }}>
                                                            <div><span style={{ fontWeight: 700, color: '#1E293B' }}>Estudio a autorizar:</span> {msg.orderAnalysis.estudio || 'No especificado'}</div>
                                                            <div><span style={{ fontWeight: 700, color: '#1E293B' }}>Solicitante:</span> {msg.orderAnalysis.solicitante || 'No especificado'}</div>
                                                            <div><span style={{ fontWeight: 700, color: '#1E293B' }}>Matricula:</span> {msg.orderAnalysis.matricula || 'No especificada'}</div>
                                                            <div><span style={{ fontWeight: 700, color: '#1E293B' }}>Diagnostico:</span> {msg.orderAnalysis.diagnostico || 'No especificado'}</div>
                                                            <div><span style={{ fontWeight: 700, color: '#1E293B' }}>Fecha de solicitud:</span> {msg.orderAnalysis.fecha_solicitud || 'No especificada'}</div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ marginTop: '6px', textAlign: 'left' }}>
                                                        <button
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                try {
                                                                    setAnalyzingMsgId(msg.id);
                                                                    const analysis = await analyzeMedicalOrderImage(msg.mediaUrl, msg.realId, selectedChat?.phone);
                                                                    if (analysis) {
                                                                        msg.orderAnalysis = analysis;
                                                                        setForceUpdate(k => k + 1);
                                                                    }
                                                                } catch (err) {
                                                                    alert('No se pudo analizar la imagen: ' + (err.message || 'Error'));
                                                                } finally {
                                                                    setAnalyzingMsgId(null);
                                                                }
                                                            }}
                                                            disabled={analyzingMsgId === msg.id}
                                                            style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                                padding: '4px 10px', borderRadius: '6px',
                                                                background: '#F1F5F9', border: '1px solid #CBD5E1',
                                                                fontSize: '0.72rem', fontWeight: 700, color: '#334155',
                                                                cursor: analyzingMsgId === msg.id ? 'wait' : 'pointer'
                                                            }}
                                                        >
                                                            {analyzingMsgId === msg.id ? (
                                                                <>⏳ Analizando orden con IA...</>
                                                            ) : (
                                                                <>🔍 Analizar orden médica con IA</>
                                                            )}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div style={{ whiteSpace: 'pre-line' }}>
                                            {msg.text}
                                        </div>

                                        <div style={{
                                            fontSize: '0.68rem', color: '#94A3B8', marginTop: '6px',
                                            textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px'
                                        }}>
                                            {msg.timestamp} {!isPatient && !isNote && <Check size={12} color="#059669" />}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* COMPOSITOR DE MENSAJE: CON CONTROL DE BLOQUEO (SIEMPRE VISIBLE) */}
                <div style={{ flexShrink: 0, padding: '12px 18px', background: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}>
                    {/* Alerta si está bloqueado */}
                    {isLocked ? (
                        <div style={{
                            padding: '12px 16px', borderRadius: '10px',
                            background: '#FEF2F2', border: '1.5px solid #F87171', color: '#991B1B',
                            display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.84rem', fontWeight: 600
                        }}>
                            <Lock size={18} color="#DC2626" />
                            <div>
                                Conversación asignada exclusivamente a <strong>{assignedAgentObj?.name || selectedChat.assignedTo}</strong>.
                                <div style={{ fontSize: '0.75rem', fontWeight: 400, color: '#B91C1C', marginTop: '2px' }}>
                                    Mientras ella la tenga asignada, nadie más puede responder ni asociársela para evitar colisiones con el paciente.
                                </div>
                            </div>
                        </div>
                    ) : isClosedOrArchived(selectedChat.status) ? (
                        <div style={{
                            marginBottom: '10px', padding: '8px 14px', borderRadius: '8px',
                            background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                                <CheckCircle2 size={15} color="#047857" /> 
                                Conversación finalizada {selectedChat.resolutionReason ? `• Motivo: ${selectedChat.resolutionReason}` : ''}. Puedes reabrirla para enviar un nuevo mensaje.
                            </div>
                            <button
                                type="button"
                                onClick={() => onAssignChat && onAssignChat(selectedChat.id, activeAgent.id)}
                                style={{
                                    padding: '4px 10px', borderRadius: '6px', border: 'none',
                                    background: '#059669', color: '#FFFFFF', fontSize: '0.74rem', fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Reabrir chat
                            </button>
                        </div>
                    ) : isUnassigned ? (
                        /* Alerta si no está asignado: sugerir asignarse */
                        <div style={{
                            marginBottom: '10px', padding: '8px 12px', borderRadius: '8px',
                            background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                                <AlertCircle size={15} /> Conversación libre en cola general.
                            </div>
                            <button
                                type="button"
                                onClick={() => onAssignChat && onAssignChat(selectedChat.id, activeAgent.id)}
                                style={{
                                    padding: '4px 10px', borderRadius: '6px', border: 'none',
                                    background: '#D97706', color: '#FFFFFF', fontSize: '0.74rem', fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Asignarme para responder
                            </button>
                        </div>
                    ) : null}

                    {/* Formulario de redacción (solo habilitado si NO está bloqueado) */}
                    <form onSubmit={handleSend} style={{ opacity: isLocked ? 0.4 : 1, pointerEvents: isLocked ? 'none' : 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsPrivateNote(!isPrivateNote)}
                                    style={{
                                        padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                                        border: '1px solid', borderColor: isPrivateNote ? '#EA580C' : '#E2E8F0',
                                        background: isPrivateNote ? '#FFF7ED' : '#FFFFFF',
                                        color: isPrivateNote ? '#EA580C' : '#64748B', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    {isPrivateNote ? <Lock size={12} /> : <MessageSquare size={12} />}
                                    {isPrivateNote ? 'Nota Interna' : 'WhatsApp Público'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setQuickReplyFilter('');
                                        setQuickRepliesModalOpen(true);
                                    }}
                                    title="Abrir catálogo completo de respuestas rápidas (o tipea / en el chat)"
                                    style={{
                                        padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                                        border: '1px solid #BAE6FD', background: '#F0F9FF', color: '#0284C7',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                        boxShadow: '0 1px 2px rgba(2, 132, 199, 0.08)'
                                    }}
                                >
                                    <Zap size={12} /> Respuestas rápidas (/)
                                </button>
                            </div>

                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                                Respondiendo como: <strong style={{ color: activeAgent.color }}>{activeAgent.name} ({activeAgent.role})</strong>
                            </span>
                        </div>

                        <div style={{ position: 'relative' }}>
                            {/* POPOVER FLOTANTE CONTEXTUAL DE ATAJOS RÁPIDOS CON TECLADO */}
                            {quickRepliesOpen && (
                                <div style={{
                                    position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '8px',
                                    background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '12px',
                                    boxShadow: '0 -6px 20px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden'
                                }}>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 12px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
                                        fontSize: '0.7rem', fontWeight: 700, color: '#475569'
                                    }}>
                                        <span>⚡ ATAJOS RÁPIDOS (Enter: Enviar • Tab: Editar • Esc: Cerrar)</span>
                                        <span style={{ background: '#E2E8F0', padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>
                                            {filterQuickReplies(quickReplyFilter).length} resultados
                                        </span>
                                    </div>
                                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                                        {filterQuickReplies(quickReplyFilter).length === 0 ? (
                                            <div style={{ padding: '14px', fontSize: '0.76rem', color: '#94A3B8', textAlign: 'center' }}>
                                                No hay atajos que coincidan con "<strong>/{quickReplyFilter}</strong>".
                                            </div>
                                        ) : (
                                            filterQuickReplies(quickReplyFilter).map((qr, idx) => {
                                                const isSel = idx === selectedQuickReplyIndex;
                                                return (
                                                    <div 
                                                        key={qr.id}
                                                        onClick={() => sendDirectMessage(qr.content, isPrivateNote)}
                                                        style={{
                                                            padding: '8px 12px', cursor: 'pointer',
                                                            background: isSel ? '#F0F9FF' : '#FFFFFF',
                                                            borderLeft: isSel ? '3px solid #0284C7' : '3px solid transparent',
                                                            borderBottom: '1px solid #F1F5F9',
                                                            display: 'flex', flexDirection: 'column', gap: '2px',
                                                            transition: 'background 0.1s ease'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#0284C7' }}>
                                                                /{qr.shortcut} <span style={{ color: '#0F172A', fontWeight: 700 }}>• {qr.title}</span>
                                                            </span>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setMessageInput(qr.content);
                                                                        setQuickRepliesOpen(false);
                                                                        inputRef.current?.focus();
                                                                    }}
                                                                    style={{
                                                                        padding: '2px 8px', fontSize: '0.65rem', fontWeight: 600,
                                                                        border: '1px solid #CBD5E1', borderRadius: '4px',
                                                                        background: '#FFFFFF', color: '#475569', cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    Editar
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        sendDirectMessage(qr.content, isPrivateNote);
                                                                    }}
                                                                    style={{
                                                                        padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700,
                                                                        border: 'none', borderRadius: '4px',
                                                                        background: '#0284C7', color: '#FFFFFF', cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    Enviar ↵
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div style={{
                                                            fontSize: '0.72rem', color: '#64748B', lineHeight: 1.3,
                                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                                        }}>
                                                            {qr.content}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}

                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                background: isPrivateNote ? '#FFF7ED' : '#F8FAFC',
                                border: isPrivateNote ? '1.5px solid #F97316' : '1px solid #E2E8F0',
                                borderRadius: '12px', padding: '8px 12px'
                            }}>
                                <input 
                                    ref={inputRef}
                                    type="text"
                                    disabled={isLocked}
                                    placeholder={isPrivateNote 
                                        ? `Escribe una nota interna que solo verá el equipo (o / para atajos)...` 
                                        : `Escribe respuesta a ${selectedChat.contactName} (o / para atajos rápidos)...`}
                                    value={messageInput}
                                    onChange={handleInputChange}
                                    onKeyDown={handleInputKeyDown}
                                    style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.88rem', color: '#1E293B' }}
                                />

                                <button 
                                    type="submit"
                                    disabled={isLocked}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        background: isPrivateNote ? '#EA580C' : '#0284C7',
                                        color: '#FFFFFF', border: 'none', padding: '8px 16px',
                                        borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem', cursor: isLocked ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {isPrivateNote ? <Lock size={14} /> : <Send size={14} />}
                                    {isPrivateNote ? 'Guardar Nota' : 'Enviar WhatsApp'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* SEPARADOR RESIZABLE ENTRE CHAT Y PANEL DE INFORMACIÓN             */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div
                onMouseDown={handleMouseDownRight}
                onDoubleClick={() => {
                    setRightPanelWidth(340);
                    localStorage.setItem('cc_right_panel_width', '340');
                }}
                style={{
                    width: '6px',
                    height: '100%',
                    cursor: 'col-resize',
                    background: isDraggingRight ? '#0284C7' : '#F8FAFC',
                    borderLeft: '1px solid #E2E8F0',
                    borderRight: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    userSelect: 'none',
                    transition: 'background 0.15s ease',
                    zIndex: 10
                }}
                title="Arrastrar para ajustar el ancho de la información del paciente (260px - 550px) • Doble clic para restablecer"
            >
                <div style={{
                    width: '2px',
                    height: '32px',
                    borderRadius: '2px',
                    background: isDraggingRight ? '#FFFFFF' : '#CBD5E1'
                }} />
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* COLUMNA 3: FICHA CRM, HISTORIAL 360° Y PARÁMETROS SALUS (AJUSTABLE) */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                width: `${rightPanelWidth}px`,
                minWidth: '260px',
                maxWidth: '550px',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 0,
                background: '#FFFFFF',
                overflowY: 'auto'
            }}>
                <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                    <button 
                        onClick={() => setActiveDetailTab('info')}
                        style={{
                            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                            fontWeight: 700, fontSize: '0.76rem',
                            color: activeDetailTab === 'info' ? '#0284C7' : '#64748B',
                            borderBottom: activeDetailTab === 'info' ? '2px solid #0284C7' : '2px solid transparent',
                            cursor: 'pointer'
                        }}
                    >
                        Ficha CRM
                    </button>
                    <button 
                        onClick={() => setActiveDetailTab('historial')}
                        style={{
                            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                            fontWeight: 700, fontSize: '0.76rem',
                            color: activeDetailTab === 'historial' ? '#0284C7' : '#64748B',
                            borderBottom: activeDetailTab === 'historial' ? '2px solid #0284C7' : '2px solid transparent',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                        }}
                    >
                        <History size={13} />
                        Historial
                    </button>
                    <button 
                        onClick={() => setActiveDetailTab('prestadores')}
                        style={{
                            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                            fontWeight: 700, fontSize: '0.76rem',
                            color: activeDetailTab === 'prestadores' ? '#0284C7' : '#64748B',
                            borderBottom: activeDetailTab === 'prestadores' ? '2px solid #0284C7' : '2px solid transparent',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                        }}
                    >
                        <Stethoscope size={13} />
                        Prestadores
                    </button>
                </div>

                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* TAB 1: FICHA CRM DEL PACIENTE */}
                    {activeDetailTab === 'info' && (
                        <>
                            {/* WIDGET PRINCIPAL: RESUMEN INTELIGENTE IA (OPENAI) & PRESTADOR DETECTADO */}
                            <div style={{
                                background: '#F8FAFC',
                                border: '1.5px solid #E2E8F0',
                                borderRadius: '12px',
                                padding: '14px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 800, color: '#4F46E5' }}>
                                        <Sparkles size={16} color="#6366F1" />
                                        RESUMEN IA DE LA CONSULTA
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRunAiSummary}
                                        disabled={isGeneratingSummary}
                                        title="Analizar historial completo de la conversación con IA"
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            padding: '4px 8px', borderRadius: '6px',
                                            border: '1px solid #C7D2FE', background: '#EEF2FF',
                                            color: '#4338CA', fontSize: '0.7rem', fontWeight: 700,
                                            cursor: isGeneratingSummary ? 'wait' : 'pointer'
                                        }}
                                    >
                                        <RefreshCw size={11} className={isGeneratingSummary ? 'animate-spin' : ''} />
                                        {isGeneratingSummary ? 'Analizando...' : (aiSummaryData ? 'Actualizar IA' : 'Generar')}
                                    </button>
                                </div>

                                {aiSummaryData ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {/* 1. QUÉ NECESITA EL PACIENTE */}
                                        <div style={{
                                            background: '#FFFFFF', padding: '10px', borderRadius: '8px',
                                            border: '1px solid #E2E8F0', borderLeft: '3px solid #6366F1'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                                                    ¿Qué necesita el paciente?
                                                </span>
                                                {aiSummaryData.tipo_tramite && (
                                                    <span style={{
                                                        fontSize: '0.65rem', fontWeight: 700, background: '#E0E7FF',
                                                        color: '#3730A3', padding: '1px 6px', borderRadius: '4px'
                                                    }}>
                                                        {aiSummaryData.tipo_tramite}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#1E293B', lineHeight: 1.45, fontWeight: 600 }}>
                                                {aiSummaryData.resumen_solicitud || 'El paciente no ha especificado aún su solicitud.'}
                                            </div>
                                        </div>

                                        {/* 2. DATOS DETECTADOS POR LA IA */}
                                        {aiSummaryData.datos_paciente && (
                                            <div style={{
                                                background: '#FFFFFF', padding: '10px', borderRadius: '8px',
                                                border: '1px solid #E2E8F0'
                                            }}>
                                                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>
                                                    Datos Aportados por el Paciente
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.74rem' }}>
                                                    <div>
                                                        <span style={{ color: '#64748B', fontSize: '0.68rem', display: 'block' }}>DNI</span>
                                                        <strong>{aiSummaryData.datos_paciente.dni || '—'}</strong>
                                                    </div>
                                                    <div>
                                                        <span style={{ color: '#64748B', fontSize: '0.68rem', display: 'block' }}>Obra Social</span>
                                                        <strong>{aiSummaryData.datos_paciente.obra_social || '—'}</strong>
                                                    </div>
                                                    <div>
                                                        <span style={{ color: '#64748B', fontSize: '0.68rem', display: 'block' }}>Nacimiento</span>
                                                        <strong>{aiSummaryData.datos_paciente.fecha_nacimiento || '—'}</strong>
                                                    </div>
                                                    <div>
                                                        <span style={{ color: '#64748B', fontSize: '0.68rem', display: 'block' }}>Dpto / Localidad</span>
                                                        <strong>{aiSummaryData.datos_paciente.departamento || '—'}</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* 3. DOCTOR DETECTADO & PARÁMETROS DE ATENCIÓN */}
                                        {aiSummaryData.prestador_matched ? (
                                            <div style={{
                                                background: '#F0FDF4', padding: '10px', borderRadius: '8px',
                                                border: '1.5px solid #86EFAC'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#15803D', textTransform: 'uppercase' }}>
                                                        👨‍⚕️ Prestador Detectado
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setActiveDetailTab('prestadores');
                                                            setDoctorQuery(aiSummaryData.prestador_matched.profesional_nombre);
                                                        }}
                                                        style={{
                                                            background: 'none', border: 'none', color: '#166534',
                                                            fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer', padding: 0,
                                                            textDecoration: 'underline'
                                                        }}
                                                    >
                                                        Ver en Prestadores ↗
                                                    </button>
                                                </div>

                                                <div style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0F172A' }}>
                                                    {aiSummaryData.prestador_matched.profesional_nombre}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: '#0284C7', fontWeight: 600 }}>
                                                    {aiSummaryData.prestador_matched.especialidad || 'Consulta Médica'}
                                                </div>
                                                {aiSummaryData.prestador_matched.consultorio_actual && (
                                                    <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700, marginTop: '2px' }}>
                                                        📍 {aiSummaryData.prestador_matched.consultorio_actual}
                                                    </div>
                                                )}

                                                {aiSummaryData.prestador_matched.condiciones_consulta && (
                                                    <div style={{
                                                        marginTop: '8px', padding: '8px', background: '#FFFFFF',
                                                        borderRadius: '6px', border: '1px solid #BBF7D0',
                                                        fontSize: '0.72rem', color: '#334155', lineHeight: 1.45,
                                                        whiteSpace: 'pre-line', maxHeight: '160px', overflowY: 'auto'
                                                    }}>
                                                        <div style={{ fontWeight: 800, color: '#166534', fontSize: '0.68rem', marginBottom: '4px' }}>
                                                            📋 CONDICIONES Y PARÁMETROS:
                                                        </div>
                                                        {aiSummaryData.prestador_matched.condiciones_consulta}
                                                    </div>
                                                )}
                                            </div>
                                        ) : aiSummaryData.doctor_detectado?.nombre_aproximado ? (
                                            <div style={{
                                                background: '#FFFBEB', padding: '10px', borderRadius: '8px',
                                                border: '1px solid #FDE68A', fontSize: '0.74rem'
                                            }}>
                                                <div style={{ fontWeight: 800, color: '#B45309', marginBottom: '2px' }}>
                                                    ⚠️ Doctor mencionado: {aiSummaryData.doctor_detectado.nombre_aproximado}
                                                </div>
                                                <div style={{ color: '#92400E', fontSize: '0.7rem' }}>
                                                    No se encontró coincidencia exacta en SALUS. Puedes buscarlo por nombre parcial en la pestaña "Prestadores".
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{
                                                padding: '8px 10px', background: '#FFFFFF', borderRadius: '6px',
                                                border: '1px solid #E2E8F0', fontSize: '0.7rem', color: '#64748B'
                                            }}>
                                                ℹ️ La IA no detectó un médico específico en la conversación. Puedes consultar la cartilla en la pestaña "Prestadores".
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{
                                        padding: '12px', background: '#FFFFFF', borderRadius: '8px',
                                        border: '1px dashed #CBD5E1', textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '0.76rem', color: '#475569', marginBottom: '8px' }}>
                                            Genera con IA un resumen ejecutivo de lo que necesita el paciente y detecta automáticamente los parámetros del médico consultado.
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleRunAiSummary}
                                            disabled={isGeneratingSummary}
                                            style={{
                                                padding: '6px 14px', borderRadius: '8px',
                                                background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
                                                color: '#FFFFFF', border: 'none', fontWeight: 700,
                                                fontSize: '0.76rem', cursor: isGeneratingSummary ? 'wait' : 'pointer',
                                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)'
                                            }}
                                        >
                                            <Sparkles size={13} />
                                            {isGeneratingSummary ? 'Analizando con IA...' : 'Generar Resumen con IA'}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* WIDGET: ESTADO DEL CHATBOT Y CONTROL DE SILENCIADO */}
                            <div style={{
                                padding: '12px 14px', borderRadius: '10px',
                                background: botActive ? '#F0FDF4' : '#FFFBEB',
                                border: '1px solid', borderColor: botActive ? '#BBF7D0' : '#FDE68A',
                                display: 'flex', flexDirection: 'column', gap: '8px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 800, color: botActive ? '#15803D' : '#B45309' }}>
                                        <Bot size={15} />
                                        {botActive ? 'CHATBOT ACTIVO (TRIAGE)' : 'CHATBOT SILENCIADO'}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <button
                                            type="button"
                                            onClick={handleToggleBot}
                                            style={{
                                                padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700,
                                                border: 'none', cursor: 'pointer',
                                                background: botActive ? '#DC2626' : '#16A34A',
                                                color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                        >
                                            <Power size={11} />
                                            {botActive ? 'Silenciar Bot' : 'Reanudar Bot'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleOpenResetBotModal}
                                            title="Reiniciar flujo del bot para que vuelva al saludo inicial de triage"
                                            style={{
                                                padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700,
                                                border: '1px solid #CBD5E1', cursor: 'pointer',
                                                background: '#FFFFFF', color: '#0284C7', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                        >
                                            <RefreshCw size={11} />
                                            Reiniciar
                                        </button>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.69rem', color: botActive ? '#166534' : '#92400E', lineHeight: 1.35 }}>
                                    {botActive 
                                        ? 'El bot responde preguntas de triage ahorrando mensajes. Se silencia al asignar una agente.'
                                        : 'El bot no responderá a este paciente para permitir atención humana exclusiva.'}
                                </div>
                            </div>

                            {/* CANALES Y ASIGNACIÓN */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B' }}>AGENTE ASIGNADA</span>
                                    {assignedAgentObj ? (
                                        <span style={{
                                            fontSize: '0.72rem', fontWeight: 800, color: assignedAgentObj.color,
                                            background: '#FFFFFF', padding: '2px 8px', borderRadius: '6px', border: '1px solid #E2E8F0'
                                        }}>
                                            {assignedAgentObj.fullName}
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#D97706' }}>
                                            En espera de agente
                                        </span>
                                    )}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B' }}>CONDICIÓN PADRÓN</span>
                                    <span style={{
                                        fontSize: '0.7rem', fontWeight: 800,
                                        padding: '1px 6px', borderRadius: '4px',
                                        background: selectedChat.customFields?.esPacienteExistente ? '#ECFDF5' : '#EFF6FF',
                                        color: selectedChat.customFields?.esPacienteExistente ? '#047857' : '#1D4ED8',
                                        border: '1px solid', borderColor: selectedChat.customFields?.esPacienteExistente ? '#A7F3D0' : '#BFDBFE'
                                    }}>
                                        {selectedChat.customFields?.esPacienteExistente ? '✓ Paciente Registrado' : '+ Nuevo Paciente'}
                                    </span>
                                </div>
                            </div>


                            {/* CABECERA DE LA FICHA DEL PACIENTE: DATOS EXCLUSIVOS SALUS */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Datos del Paciente
                                </span>
                                <span style={{
                                    fontSize: '0.66rem',
                                    fontWeight: 700,
                                    color: '#0369A1',
                                    background: '#F0F9FF',
                                    border: '1px solid #BAE6FD',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}>
                                    <Lock size={11} color="#0284C7" /> Exclusivo SALUS
                                </span>
                            </div>

                            {/* VISTA INSTITUCIONAL LIMPIA Y CLÍNICA DE LA FICHA DEL PACIENTE (SOLO LECTURA SALUS) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {/* ALERTA ACCESO RÁPIDO: TURNOS PRÓXIMOS & ONLINE DEL PACIENTE */}
                                    {patientHistory?.turnosProximos && patientHistory.turnosProximos.length > 0 && (
                                        <div style={{
                                            background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)',
                                            border: '1.5px solid #6EE7B7',
                                            borderRadius: '8px',
                                            padding: '8px 10px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '5px',
                                            boxShadow: '0 2px 5px rgba(5, 150, 105, 0.08)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#065F46', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span>📅 TIENE TURNOS PRÓXIMOS ({patientHistory.turnosProximos.length})</span>
                                                </div>
                                                <button 
                                                    onClick={() => setActiveDetailTab('historial')}
                                                    style={{
                                                        fontSize: '0.65rem', fontWeight: 700, color: '#047857', background: '#D1FAE5',
                                                        border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer'
                                                    }}
                                                >
                                                    Ver en Historial →
                                                </button>
                                            </div>
                                            {patientHistory.turnosProximos.slice(0, 2).map((tp, i) => (
                                                <div key={i} style={{ background: '#FFFFFF', border: '1px solid #A7F3D0', borderRadius: '6px', padding: '6px 8px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#047857' }}>
                                                            📅 {tp.fecha_visita} {tp.hora_visita ? `(${tp.hora_visita} hs)` : ''}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.62rem', fontWeight: 800, padding: '1px 5px', borderRadius: '4px',
                                                            background: tp.origen === 'online' ? '#EFF6FF' : '#F1F5F9',
                                                            color: tp.origen === 'online' ? '#1D4ED8' : '#475569'
                                                        }}>
                                                            {tp.origen === 'online' ? '🌐 ONLINE WEB' : '🏥 PRESENCIAL'}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: '#0F172A', fontWeight: 700, marginTop: '2px' }}>
                                                        👨‍⚕️ {tp.medico || 'Profesional Asignado'}
                                                    </div>
                                                    <div style={{ fontSize: '0.67rem', color: '#64748B' }}>
                                                        {tp.agenda || tp.tipo_visita} {tp.cliente ? `• ${tp.cliente}` : ''}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* DNI & NHC SALUS */}
                                    <div style={{ display: 'grid', gridTemplateColumns: selectedChat.customFields?.nhc ? '1fr 1fr' : '1fr', gap: '6px' }}>
                                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                            <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>DNI / IDENTIFICACIÓN</div>
                                            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>
                                                {crmForm.dni || selectedChat.customFields?.dni || 'A verificar'}
                                            </div>
                                        </div>
                                        {selectedChat.customFields?.nhc && (
                                            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '8px', padding: '8px 10px' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#0369A1', fontWeight: 700 }}>NHC (SALUS)</div>
                                                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0284C7' }}>
                                                    #{selectedChat.customFields.nhc}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* NOMBRE COMPLETO */}
                                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>NOMBRE COMPLETO</div>
                                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                                            {crmForm.pacienteNombre || selectedChat.customFields?.pacienteNombre || selectedChat.contactName || 'Paciente'}
                                        </div>
                                    </div>

                                    {/* OBRA SOCIAL */}
                                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>OBRA SOCIAL / PREPAGA</div>
                                        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0284C7' }}>
                                            {crmForm.obraSocial || selectedChat.customFields?.obraSocial || 'A consultar'}
                                        </div>
                                    </div>

                                    {/* FECHA DE NACIMIENTO */}
                                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>FECHA DE NACIMIENTO</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                                            {crmForm.fechaNacimiento || selectedChat.customFields?.fechaNacimiento || 'No informada'}
                                        </div>
                                    </div>

                                    {/* EMAIL */}
                                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>EMAIL</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', wordBreak: 'break-all' }}>
                                            {crmForm.email || selectedChat.customFields?.email || 'No informado'}
                                        </div>
                                    </div>

                                    {/* TELÉFONO DE CONTACTO */}
                                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>TELÉFONO DE CONTACTO</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                                            {selectedChat.customFields?.pacienteContacto || selectedChat.phone}
                                        </div>
                                    </div>

                                    {/* DEPARTAMENTO / SEDE */}
                                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>DEPARTAMENTO / SEDE HABITUAL</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <MapPin size={12} color="#0284C7" />
                                            {crmForm.departamento || selectedChat.customFields?.departamento || 'San Juan'}
                                        </div>
                                    </div>

                                    {/* MOTIVO DE CONSULTA */}
                                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>SOLICITUD / MOTIVO</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0F172A' }}>
                                            {crmForm.motivoConsulta || selectedChat.customFields?.motivoConsulta || 'Consulta general'}
                                        </div>
                                    </div>

                                    {/* NOTAS CRM */}
                                    {crmForm.notas && (
                                        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '8px 10px' }}>
                                            <div style={{ fontSize: '0.65rem', color: '#B45309', fontWeight: 700 }}>NOTAS CRM</div>
                                            <div style={{ fontSize: '0.78rem', color: '#78350F', whiteSpace: 'pre-line', marginTop: '2px' }}>
                                                {crmForm.notas}
                                            </div>
                                        </div>
                                    )}
                                </div>
                        </>
                    )}

                    {/* TAB 2: HISTORIAL CLÍNICO 360° */}
                    {activeDetailTab === 'historial' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                                    Historial
                                </div>
                                {selectedChat.customFields?.nhc && (
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0284C7', background: '#F0F9FF', padding: '2px 6px', borderRadius: '4px', border: '1px solid #BAE6FD' }}>
                                        NHC: {selectedChat.customFields.nhc}
                                    </span>
                                )}
                            </div>

                            {loadingHistory ? (
                                <div style={{ fontSize: '0.76rem', color: '#64748B', textAlign: 'center', padding: '20px' }}>
                                    Consultando registros en Sanatorio Argentino...
                                </div>
                            ) : patientHistory ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {/* Resumen KPI del Paciente */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <div style={{ background: '#F8FAFC', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>CONSULTAS / GUARDIA</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0284C7' }}>
                                                {patientHistory.consultas?.length || 0}
                                            </div>
                                        </div>
                                        <div style={{ background: '#F8FAFC', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>CIRUGÍAS</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669' }}>
                                                {patientHistory.cirugias?.length || 0}
                                            </div>
                                        </div>
                                        <div style={{ background: '#F8FAFC', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>INTERNACIONES</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#7C3AED' }}>
                                                {patientHistory.altas?.length || 0}
                                            </div>
                                        </div>
                                        <div style={{ background: '#F8FAFC', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>LABORATORIOS</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#D97706' }}>
                                                {patientHistory.laboratorios?.length || 0}
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECCIÓN 1: TURNOS PRÓXIMOS & CITAS ONLINE (ACCESO RÁPIDO) */}
                                    {patientHistory.turnosProximos && patientHistory.turnosProximos.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#065F46', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>📅 TURNOS PRÓXIMOS & CITAS ONLINE ({patientHistory.turnosProximos.length})</span>
                                            </div>
                                            {patientHistory.turnosProximos.map((tp, idx) => (
                                                <div key={idx} style={{
                                                    background: '#FFFFFF',
                                                    border: tp.origen === 'online' ? '1.5px solid #93C5FD' : '1.5px solid #6EE7B7',
                                                    borderRadius: '8px',
                                                    padding: '8px 10px',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                                                            📅 {tp.fecha_visita} {tp.hora_visita ? `• ${tp.hora_visita} hs` : ''}
                                                        </div>
                                                        <span style={{
                                                            fontSize: '0.64rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                                                            background: tp.origen === 'online' ? '#EFF6FF' : '#ECFDF5',
                                                            color: tp.origen === 'online' ? '#1D4ED8' : '#047857'
                                                        }}>
                                                            {tp.origen === 'online' ? '🌐 TURNO WEB ONLINE' : '🏥 PRESENCIAL'}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0284C7', marginTop: '3px' }}>
                                                        👨‍⚕️ {tp.medico || 'Profesional Asignado'}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '1px' }}>
                                                        Agenda: <strong>{tp.agenda || tp.tipo_visita}</strong>
                                                    </div>
                                                    {tp.cliente && (
                                                        <div style={{ fontSize: '0.66rem', color: '#64748B', marginTop: '3px', background: '#F8FAFC', padding: '2px 6px', borderRadius: '4px' }}>
                                                            Cobertura: <strong>{tp.cliente}</strong>
                                                        </div>
                                                    )}
                                                    {tp.motivo && (
                                                        <div style={{ fontSize: '0.68rem', color: '#78350F', background: '#FEF3C7', padding: '3px 6px', borderRadius: '4px', marginTop: '4px' }}>
                                                            💬 Motivo: {tp.motivo}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: '#F8FAFC',
                                            border: '1px solid #E2E8F0',
                                            borderRadius: '8px',
                                            padding: '8px 10px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}>
                                            <Calendar size={13} color="#64748B" />
                                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                                                📅 Turnos Próximos: <strong>Sin turnos pendientes agendados</strong>
                                            </span>
                                        </div>
                                    )}

                                    {/* SECCIÓN 2: CONSULTAS MÉDICAS, GUARDIA & EVOLUCIÓN CLÍNICA */}
                                    {patientHistory.consultas && patientHistory.consultas.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>🩺 CONSULTAS MÉDICAS & GUARDIA ({patientHistory.consultas.length})</span>
                                            </div>
                                            {patientHistory.consultas.slice(0, 10).map((con, idx) => (
                                                <div key={idx} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>
                                                            {con.visita_especialidad || con.agenda || 'Consulta Médica'}
                                                        </div>
                                                        <span style={{
                                                            fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px',
                                                            background: con.asistencia === 'Presente' ? '#ECFDF5' : '#F1F5F9',
                                                            color: con.asistencia === 'Presente' ? '#047857' : '#64748B'
                                                        }}>
                                                            {con.asistencia || 'Atendido'}
                                                        </span>
                                                    </div>
                                                    {con.medico && (
                                                        <div style={{ fontSize: '0.74rem', color: '#0369A1', fontWeight: 700, marginTop: '2px' }}>
                                                            👨‍⚕️ {con.medico}
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, marginTop: '1px' }}>
                                                        {con.agenda ? `${con.agenda} • ` : ''}{con.tipo_visita || 'Visita'} {con.centro ? `• ${con.centro}` : ''}
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '3px' }}>
                                                        📅 Fecha: <strong>{con.fecha_visita || 'S/F'}</strong> {con.hora_visita ? `(${con.hora_visita.slice(0, 5)} hs)` : ''}
                                                    </div>
                                                    {con.diagnostico && (
                                                        <div style={{
                                                            fontSize: '0.68rem', fontWeight: 700, color: '#1E40AF', background: '#EFF6FF',
                                                            border: '1px solid #BFDBFE', padding: '3px 6px', borderRadius: '4px', marginTop: '4px'
                                                        }}>
                                                            🏷️ Diagnóstico: {con.diagnostico}
                                                        </div>
                                                    )}
                                                    {con.motivo && (
                                                        <div style={{
                                                            marginTop: '6px', background: '#F8FAFC', border: '1px solid #CBD5E1',
                                                            borderRadius: '6px', padding: '6px 8px'
                                                        }}>
                                                            <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>📋 Síntomas / Formulario Médico</span>
                                                                {con.formulario && <span style={{ color: '#0284C7', fontWeight: 600 }}>({con.formulario})</span>}
                                                            </div>
                                                            <div style={{ fontSize: '0.72rem', color: '#1E293B', whiteSpace: 'pre-line', marginTop: '3px', lineHeight: 1.35 }}>
                                                                {con.motivo}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {con.cliente && (
                                                        <div style={{ fontSize: '0.66rem', color: '#475569', marginTop: '4px', background: '#F8FAFC', padding: '2px 6px', borderRadius: '4px' }}>
                                                            🏥 Cobertura: <strong>{con.cliente}</strong>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Listado de Cirugías Recientes */}
                                    {patientHistory.cirugias && patientHistory.cirugias.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0F172A' }}>
                                                🔪 CIRUGÍAS REGISTRADAS ({patientHistory.cirugias.length})
                                            </div>
                                            {patientHistory.cirugias.slice(0, 3).map((cir, idx) => (
                                                <div key={idx} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>
                                                        {cir.modulo || 'Procedimiento Quirúrgico'}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#0284C7', marginTop: '2px' }}>
                                                        Dr/a. {cir.medico || 'No especificado'} • {cir.fecha_cirugia || 'Fecha pendiente'}
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                                                        Estado: <strong>{cir.status || 'Programada'}</strong>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Listado de Admisiones */}
                                    {patientHistory.altas && patientHistory.altas.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0F172A' }}>
                                                🛏️ ESTANCIAS / INTERNACIONES ({patientHistory.altas.length})
                                            </div>
                                            {patientHistory.altas.slice(0, 3).map((adm, idx) => (
                                                <div key={idx} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>
                                                        {adm.especialidad || adm.servicio || 'Internación'}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                                                        Ingreso: {adm.fecha_ingreso ? new Date(adm.fecha_ingreso).toLocaleDateString('es-AR') : 'S/D'} 
                                                        {adm.fecha_alta ? ` • Alta: ${new Date(adm.fecha_alta).toLocaleDateString('es-AR')}` : ' (Activo)'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.74rem', color: '#64748B', background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0', lineHeight: 1.4 }}>
                                    💡 No se encontraron antecedentes para esta persona. Asegúrate de verificar y guardar el DNI del paciente en la pestaña <strong>Ficha CRM</strong> para consultar su historial completo en el Sanatorio.
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3: PARÁMETROS Y HONORARIOS DE MÉDICOS SALUS */}
                    {activeDetailTab === 'prestadores' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                                Consultar Parámetros de Prestador
                            </div>

                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    placeholder="Buscar por médico o especialidad..."
                                    value={doctorQuery}
                                    onChange={(e) => setDoctorQuery(e.target.value)}
                                    style={{
                                        width: '100%', padding: '8px 12px 8px 30px',
                                        borderRadius: '8px', border: '1px solid #CBD5E1',
                                        fontSize: '0.8rem', outline: 'none'
                                    }}
                                />
                                <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                            </div>

                            {isSearchingDoctor && (
                                <div style={{ fontSize: '0.72rem', color: '#64748B', textAlign: 'center', padding: '10px' }}>
                                    Buscando en SALUS...
                                </div>
                            )}

                            {doctorResults.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                                    {doctorResults.map((doc) => (
                                        <div key={doc.id} style={{
                                            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px'
                                        }}>
                                            <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0F172A' }}>
                                                {doc.profesional_nombre}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#0284C7', fontWeight: 600 }}>
                                                {doc.especialidad || 'Consulta Médica'}
                                            </div>

                                            {doc.consultorio_actual && (
                                                <div style={{ marginTop: '4px', fontSize: '0.72rem', fontWeight: 700, color: '#059669' }}>
                                                    📍 {doc.consultorio_actual}
                                                </div>
                                            )}

                                            {doc.condiciones_consulta && (
                                                <div style={{
                                                    marginTop: '6px', fontSize: '0.7rem', color: '#475569',
                                                    background: '#FFFFFF', padding: '6px 8px', borderRadius: '6px',
                                                    border: '1px solid #E2E8F0', whiteSpace: 'pre-line'
                                                }}>
                                                    {doc.condiciones_consulta}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : doctorQuery.length >= 2 && !isSearchingDoctor ? (
                                <div style={{ fontSize: '0.72rem', color: '#94A3B8', textAlign: 'center', padding: '14px' }}>
                                    No se encontraron prestadores con ese criterio.
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.72rem', color: '#64748B', background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    💡 Escribe el apellido del médico (ej: <em>Marquez</em>, <em>Gomez</em>, <em>Borrego</em>) para ver sus honorarios particulares, plus de coseguro, alias de Mercado Pago y consultorio activo.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL PARA FINALIZAR ATENCIÓN / CERRAR CONVERSACIÓN */}
            {closeModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF', borderRadius: '16px', maxWidth: '440px', width: '100%',
                        padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)', border: '1px solid #E2E8F0'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '1.05rem', color: '#0F172A' }}>
                                <CheckCircle2 size={20} color="#059669" />
                                Finalizar Atención
                            </div>
                            <button 
                                onClick={() => setCloseModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '0 0 14px 0', lineHeight: 1.45 }}>
                            Estás a punto de finalizar la conversación con <strong>{selectedChat.contactName}</strong>. 
                            Se enviará automáticamente el mensaje de despedida y encuesta de 5 estrellas al paciente, la conversación pasará a <strong>Archivadas</strong> y se reactivará el bot automático.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155' }}>MOTIVO DE RESOLUCIÓN</label>
                            <select
                                value={resolutionReason}
                                onChange={(e) => setResolutionReason(e.target.value)}
                                style={{
                                    padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                    fontSize: '0.84rem', outline: 'none', background: '#FFFFFF', color: '#0F172A'
                                }}
                            >
                                <option value="Turno Coordinado">✅ Turno Coordinado / Otorgado</option>
                                <option value="Consulta Informativa Resuelta">ℹ️ Consulta Informativa Resuelta</option>
                                <option value="Derivado a Guardia / Sector">🏥 Derivado a Guardia / Sector Específico</option>
                                <option value="Cancelación / Reprogramación Confirmada">🗓️ Cancelación / Reprogramación Confirmada</option>
                                <option value="Paciente No Responde">⏳ Paciente No Responde</option>
                                <option value="Otro / Aclaración en Nota">📝 Otro / Ver Notas Internas</option>
                            </select>
                        </div>

                        {/* PREVIEW DEL MENSAJE DE CIERRE OFICIAL */}
                        <div style={{
                            background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px',
                            padding: '10px 12px', marginBottom: '18px', textAlign: 'left'
                        }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#15803D', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span>⭐ Mensaje que recibirá el paciente vía WhatsApp:</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#166534', whiteSpace: 'pre-line', lineHeight: 1.35, fontStyle: 'italic' }}>
                                {FINAL_ATTENTION_MESSAGE}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setCloseModalOpen(false)}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                    background: '#FFFFFF', color: '#64748B', fontSize: '0.82rem', fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Volver
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmClose}
                                disabled={isClosingChat}
                                style={{
                                    padding: '8px 18px', borderRadius: '8px', border: 'none',
                                    background: '#059669', color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 700,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <CheckCircle2 size={15} /> {isClosingChat ? 'Finalizando y enviando...' : 'Finalizar y Enviar Cierre'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* MODAL RESPUESTAS RÁPIDAS (EXCLUSIVO CONTACT CENTER)               */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {quickRepliesModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
                    background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                }} onClick={() => setQuickRepliesModalOpen(false)}>
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#FFFFFF', width: '100%', maxWidth: '520px', maxHeight: '82vh',
                            borderRadius: '16px', boxShadow: '0 20px 45px rgba(0,0,0,0.2)',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #E2E8F0'
                        }}
                    >
                        {/* Cabecera idéntica a la imagen */}
                        <div style={{ padding: '24px 24px 12px 24px', textAlign: 'center', position: 'relative' }}>
                            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#334155', margin: 0 }}>
                                Respuestas rápidas
                            </h2>
                            <button
                                type="button"
                                onClick={() => setQuickRepliesModalOpen(false)}
                                style={{
                                    position: 'absolute', right: '16px', top: '16px', border: 'none',
                                    background: 'transparent', color: '#94A3B8', cursor: 'pointer', padding: '4px'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Campo de búsqueda con icono de lupa (verde azulado idéntico a imagen) */}
                        <div style={{ padding: '0 24px 16px 24px' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                border: '1.5px solid #0D9488', borderRadius: '6px',
                                padding: '8px 12px', background: '#FFFFFF'
                            }}>
                                <Search size={16} color="#0D9488" />
                                <input 
                                    type="text"
                                    autoFocus
                                    placeholder="Escribe para filtrar"
                                    value={quickReplyFilter}
                                    onChange={(e) => setQuickReplyFilter(e.target.value)}
                                    style={{
                                        flex: 1, border: 'none', outline: 'none', fontSize: '0.86rem', color: '#1E293B'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Lista scrolleable de respuestas rápidas */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            {filterQuickReplies(quickReplyFilter).map((qr) => (
                                <div key={qr.id} style={{
                                    display: 'flex', flexDirection: 'column', gap: '6px',
                                    paddingBottom: '14px', borderBottom: '1px solid #F1F5F9'
                                }}>
                                    <div>
                                        <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1E293B' }}>
                                            {qr.title.includes(':') ? qr.title : `${qr.title}:`}
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#0284C7', fontWeight: 700, marginLeft: '6px' }}>
                                            /{qr.shortcut}
                                        </span>
                                    </div>
                                    <p style={{
                                        margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.45, whiteSpace: 'pre-line'
                                    }}>
                                        {qr.content}
                                    </p>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMessageInput(qr.content);
                                                setQuickRepliesModalOpen(false);
                                                inputRef.current?.focus();
                                            }}
                                            style={{
                                                padding: '6px 14px', borderRadius: '6px', border: '1px solid #CBD5E1',
                                                background: '#FFFFFF', color: '#334155', fontSize: '0.76rem', fontWeight: 600,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Editar y enviar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => sendDirectMessage(qr.content, isPrivateNote)}
                                            style={{
                                                padding: '6px 14px', borderRadius: '6px', border: 'none',
                                                background: '#0284C7', color: '#FFFFFF', fontSize: '0.76rem', fontWeight: 700,
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                        >
                                            <Send size={12} /> Enviar directo
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL INSTITUCIONAL: REINICIAR FLUJO DEL CHATBOT (SISTEMA SANATORIO ARGENTINO) */}
            {resetBotModalOpen && selectedChat && (
                <div 
                    onClick={() => !isResettingBot && setResetBotModalOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.55)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px'
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#FFFFFF',
                            borderRadius: '14px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.05)',
                            border: '1px solid #E2E8F0',
                            width: '100%',
                            maxWidth: '460px',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px 20px',
                            borderBottom: '1px solid #F1F5F9',
                            background: '#F8FAFC'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '10px',
                                    background: '#EFF6FF',
                                    border: '1px solid #BFDBFE',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#0284C7'
                                }}>
                                    <RefreshCw size={18} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                                        Reiniciar Flujo del Chatbot
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                        Sanatorio Argentino • Contact Center
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={isResettingBot}
                                onClick={() => setResetBotModalOpen(false)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#94A3B8',
                                    cursor: isResettingBot ? 'not-allowed' : 'pointer',
                                    padding: '4px',
                                    borderRadius: '6px'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Tarjeta de Paciente */}
                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px'
                            }}>
                                <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                    Paciente Seleccionado
                                </span>
                                <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                                    {selectedChat.contactName}
                                </span>
                                <span style={{ fontSize: '0.74rem', color: '#0284C7', fontWeight: 600 }}>
                                    📞 {selectedChat.phone}
                                </span>
                            </div>

                            <p style={{ margin: 0, fontSize: '0.84rem', color: '#334155', lineHeight: 1.5 }}>
                                ¿Confirmas reiniciar el flujo automatizado? El bot volverá a responder desde el saludo inicial cuando el paciente escriba un nuevo mensaje.
                            </p>

                            {/* Callout informativo */}
                            <div style={{
                                background: '#F0F9FF',
                                border: '1px solid #BAE6FD',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '8px'
                            }}>
                                <Bot size={16} color="#0284C7" style={{ marginTop: '2px', flexShrink: 0 }} />
                                <div style={{ fontSize: '0.74rem', color: '#0369A1', lineHeight: 1.4 }}>
                                    La conversación pasará a atención automática por IA y se liberará de la bandeja del operador para atender intenciones desde cero.
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '10px',
                            padding: '14px 20px',
                            borderTop: '1px solid #F1F5F9',
                            background: '#F8FAFC'
                        }}>
                            <button
                                type="button"
                                disabled={isResettingBot}
                                onClick={() => setResetBotModalOpen(false)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    color: '#475569',
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    cursor: isResettingBot ? 'not-allowed' : 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={isResettingBot}
                                onClick={handleConfirmResetBot}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#0284C7',
                                    color: '#FFFFFF',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    cursor: isResettingBot ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                                }}
                            >
                                {isResettingBot ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        Reiniciando...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw size={14} />
                                        Reiniciar Bot
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* NOTIFICACIÓN TOAST DEL SISTEMA */}
            {systemToast && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    zIndex: 10000,
                    background: '#FFFFFF',
                    border: systemToast.type === 'error' ? '1.5px solid #FCA5A5' : '1.5px solid #6EE7B7',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    maxWidth: '420px'
                }}>
                    {systemToast.type === 'error' ? (
                        <AlertCircle size={20} color="#DC2626" style={{ flexShrink: 0 }} />
                    ) : (
                        <CheckCircle2 size={20} color="#059669" style={{ flexShrink: 0 }} />
                    )}
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0F172A', lineHeight: 1.4 }}>
                        {systemToast.message}
                    </div>
                    <button
                        type="button"
                        onClick={() => setSystemToast(null)}
                        style={{
                            border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer',
                            padding: '2px', marginLeft: 'auto'
                        }}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}

