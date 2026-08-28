import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Sidebar from './components/Sidebar.jsx';
import PatientHeader from './components/PatientHeader.jsx';
import PracticeSearch from './components/PracticeSearch.jsx';
import Cart from './components/Cart.jsx';
import PrintTemplate from './components/PrintTemplate.jsx';
import PrintTemplateInternacion from './components/PrintTemplateInternacion.jsx';
import InternacionSearch from './components/InternacionSearch.jsx';
import WhatsAppModal from './components/WhatsAppModal.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import ChangePasswordModal from './components/ChangePasswordModal.jsx';
import { getTodayISO } from './utils/searchUtils';
import { sendWhatsAppMessage, formatOrderForWhatsApp } from './services/builderbotApi';
import { createOrder, markOrderPrinted, markOrderSent, fetchOrderHistory } from './services/dataService';
import { getCurrentUser, logout as authLogout } from './services/authService';
import { logAction } from './services/auditService';
import { subscribeToAllIncoming, fetchUnreadCounts } from './services/chatService';
import { Clock, Printer, Send, CheckCircle, LogOut, KeyRound, ChevronDown, ChevronRight, RotateCcw, Moon, Sun, Menu, X, AlertCircle, Info, Home as HomeIcon } from 'lucide-react';
import SnowBackground from './components/SnowBackground';
import SurgeryPanel from './components/SurgeryPanel.jsx';
import ConfigPanel from './components/ConfigPanel.jsx';
import HomePanel from './components/HomePanel.jsx';
import NomencladorView from './components/NomencladorView.jsx';
import TemplateManager from './components/TemplateManager.jsx';
import MessagingPanel from './components/MessagingPanel.jsx';
import PedidosMarcela from './components/PedidosMarcela.jsx';
import WhatsAppLineStatus from './components/WhatsAppLineStatus.jsx';
import MetricsPanel from './components/MetricsPanel.jsx';
import TurnoAdminPanel from './components/TurnoAdminPanel.jsx';
import PublicRecepcionView from './components/PublicRecepcionView.jsx';
import DeudasPanel from './components/DeudasPanel.jsx';
import AltasPanel from './components/AltasPanel.jsx';
import FacturacionPanel from './components/FacturacionPanel.jsx';
import TxtProvinciaPanel from './components/TxtProvinciaPanel.jsx';
import AsignacionPanel from './components/AsignacionPanel.jsx';
import ConsultasPanel from './components/ConsultasPanel.jsx';
import AuditoriaHistoriasPanel from './components/AuditoriaHistoriasPanel.jsx';
import AuditoriaPDFPanel from './components/AuditoriaPDFPanel.jsx';
import BetoPanel from './components/BetoPanel.jsx';
import AsociacionesEntregaPanel from './components/AsociacionesEntregaPanel.jsx';
import LaboratoriosPanel from './components/LaboratoriosPanel.jsx';
import PublicLabView from './components/PublicLabView.jsx';
import LabPortal from './components/LabPortal.jsx';
import IdleHomerOverlay from './components/IdleHomerOverlay.jsx';
import BetoWidget from './components/BetoWidget.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import BetoAnalyticsPanel from './components/BetoAnalyticsPanel.jsx';
import ManualProcedimientos from './components/ManualProcedimientos.jsx';
import HelpButton from './components/HelpButton.jsx';
import SystemOutageReporter from './components/SystemOutageReporter.jsx';
import SystemAlertBanner from './components/SystemAlertBanner.jsx';
import DocumentosPanel from './components/DocumentosPanel.jsx';
import PacientesPanel from './components/PacientesPanel.jsx';
import WelcomeOnboarding from './components/WelcomeOnboarding.jsx';
import UserActivityPanel from './components/UserActivityPanel.jsx';
import ModuleOnboarding from './components/ModuleOnboarding.jsx';
import FrojoCelebration from './components/FrojoCelebration.jsx';
import ActivosPanel from './components/ActivosPanel.jsx';
import EquipoAuditoriaView from './components/EquipoAuditoriaView.jsx';
import GobernanzaPanel from './components/GobernanzaPanel.jsx';
import LiquidacionesPanel from './components/LiquidacionesPanel.jsx';
import PublicRecordView from './components/PublicShare/PublicRecordView.jsx';
import { startSession, endSession, trackModuleChange } from './lib/activityTracker';
import { supabase } from './lib/supabase';
import './App.css';

function AppRoot() {
    const path = window.location.pathname;
    const isPublicLab = path.startsWith('/publico/laboratorio/');

    const [currentUser, setCurrentUser] = useState(() => getCurrentUser());

    const handleLogin = useCallback((user) => {
        setCurrentUser(user);
        // Start activity tracking session
        startSession(user);
    }, []);

    const handleLogout = useCallback(async () => {
        await logAction('logout', { usuario: currentUser?.usuario });
        await endSession();
        authLogout();
        setCurrentUser(null);
    }, [currentUser]);

    // Public route for guarantees
    if (path === '/recepcion/garantias') {
        return <PublicRecepcionView />;
    }

    // Public route for Equipment CMMS QR audit
    if (path.startsWith('/recepcion/equipo/')) {
        const equipoId = path.split('/recepcion/equipo/')[1];
        return <EquipoAuditoriaView equipoId={equipoId} />;
    }

    // Public route for Share Record View (Sider AI style)
    if (path.startsWith('/share/')) {
        return <PublicRecordView />;
    }

    // Lab Portal routes (authenticated) — /lab/aguero, /lab/cedap, /lab/cuyo
    const labMatch = path.match(/^\/lab\/(aguero|cedap|cuyo)\/?$/);
    if (labMatch) {
        return <LabPortal labSlug={labMatch[1]} />;
    }

    // Legacy public lab routes — redirect to new authenticated portal
    if (isPublicLab) {
        try {
            const hash = path.split('/publico/laboratorio/')[1];
            const labName = decodeURIComponent(atob(hash));
            // Map old labName to new slug
            const slugMap = {
                'LDA - Dra. Aguero o Dra Rios': 'aguero',
                'LAB. CEDAP': 'cedap',
                'LAB.INST.PATOLOG.CUYO': 'cuyo',
            };
            const slug = slugMap[labName];
            if (slug) {
                window.location.replace(`/lab/${slug}`);
                return null;
            }
            return <div style={{ padding: '40px', textAlign: 'center' }}>Enlace público inválido.</div>;
        } catch (e) {
            return <div style={{ padding: '40px', textAlign: 'center' }}>Enlace público inválido.</div>;
        }
    }

    if (!currentUser) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    return <App currentUser={currentUser} onLogout={handleLogout} />;
}


// View labels for breadcrumbs
const VIEW_LABELS = {
    inicio: 'Inicio',
    pedidos: 'Pedidos',
    mensajeria: 'Mensajería',
    cirugias: 'Control de Cirugías',
    nomenclador: 'Nomenclador',
    config: 'Configuración',
    templates: 'Plantillas WhatsApp',
    wa_status: 'Estado WhatsApp',
    metricas: 'Métricas',
    turnos: 'Cola de Turnos',
    deudas: 'Deudas',
    altas: 'Altas Administrativas',
    facturacion: 'Control de Facturación',
    asignacion: 'Asignación',
    consultas: 'Consultas',
    auditoria_historias: 'Auditoría de Historias',
    beto: 'Simon IA',
    beto_rules: 'Gestión de Reglas',
    asociaciones_entrega: 'Asociaciones Entrega',
    laboratorios: 'Laboratorios',
    pedidos_marcela: 'Pedidos Especiales',
    beto_analytics: 'Beto Analytics',
    manual: 'Manual del Sistema',
    documentos: 'Documentos',
    pacientes: 'Pacientes',
    actividad_usuarios: 'Actividad de Usuarios',
    activos: 'Gestión de Activos',
    liquidaciones: 'Liquidaciones Médicas',
};

function App({ currentUser, onLogout }) {
    // Sidebar — persist active view across refreshes
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');
    // #4 Command Palette
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const betoWidgetRef = useRef(null);
    const [showFrojoCelebration, setShowFrojoCelebration] = useState(() => {
        if (currentUser?.usuario !== 'frojo') return false;
        if (Date.now() > new Date('2026-07-25T00:00:00-03:00').getTime()) return false;
        return true;
    });
    // Beto widget open state (controlled from sidebar avatar)
    const [betoWidgetOpen, setBetoWidgetOpen] = useState(false);
    const [activeView, setActiveViewRaw] = useState(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const paramView = urlParams.get('view');
        if (paramView && VIEW_LABELS[paramView]) return paramView;
        const hashView = window.location.hash.replace('#', '');
        if (hashView && VIEW_LABELS[hashView]) return hashView;
        return localStorage.getItem('active_view') || 'inicio';
    });
    // Dark mode
    const [darkMode, setDarkMode] = useState(() => localStorage.getItem('dark_mode') === 'true');
    // View transition key — bumps on view change to trigger CSS animation
    const [viewKey, setViewKey] = useState(0);
    // Mobile sidebar
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    // Module preferences (onboarding)
    const [selectedModules, setSelectedModules] = useState(null); // null = loading/all
    const [needsModuleOnboarding, setNeedsModuleOnboarding] = useState(false); // flag: needs onboarding after welcome
    const [showModuleOnboarding, setShowModuleOnboarding] = useState(false);
    const [showModuleReconfig, setShowModuleReconfig] = useState(false);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
        localStorage.setItem('dark_mode', darkMode);
    }, [darkMode]);

    // Start activity tracking + fetch module preferences on mount
    useEffect(() => {
        if (currentUser) {
            const initActivity = async () => {
                await startSession(currentUser);
                // Track initial module
                const initialView = localStorage.getItem('active_view') || 'inicio';
                trackModuleChange(initialView, VIEW_LABELS[initialView] || initialView);
            };
            initActivity();
            
            // Fetch module preferences
            supabase.from('user_module_preferences')
                .select('selected_modules, completed_onboarding')
                .eq('user_id', currentUser.id)
                .maybeSingle()
                .then(({ data }) => {
                    if (data?.completed_onboarding) {
                        setSelectedModules(data.selected_modules || null);
                    } else {
                        // No preferences yet — defer to after WelcomeOnboarding closes
                        const alreadyShownWelcome = sessionStorage.getItem('admqui_onboarding_shown');
                        if (alreadyShownWelcome) {
                            // Welcome already dismissed this session → show module onboarding now
                            setShowModuleOnboarding(true);
                        } else {
                            // Welcome will show first → set flag for after it closes
                            setNeedsModuleOnboarding(true);
                        }
                    }
                })
                .catch(err => console.warn('[App] module prefs fetch error:', err));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setActiveView = useCallback((view) => {
        setActiveViewRaw(view);
        setViewKey(k => k + 1);
        setMobileMenuOpen(false);
        localStorage.setItem('active_view', view);
        // Track module navigation
        trackModuleChange(view, VIEW_LABELS[view] || view);
        // Audit log click
        logAction('Clic', { modulo: view, label: VIEW_LABELS[view] || view });
    }, []);

    // Enforce module access control on activeView
    useEffect(() => {
        if (!selectedModules || selectedModules.length === 0) return;
        const ALWAYS_VISIBLE = ['inicio'];
        let isVisible = true;

        if (selectedModules.length === 1 && selectedModules[0] !== 'config') {
            isVisible = selectedModules.includes(activeView);
        } else {
            if (['config', 'manual', 'actividad_usuarios', 'beto', 'simon', 'beto_rules', 'beto_analytics', 'gobernanza'].includes(activeView)) isVisible = true;
            else if (ALWAYS_VISIBLE.includes(activeView)) isVisible = true;
            else isVisible = selectedModules.includes(activeView);
        }

        if (activeView === 'activos' && !['lmarinero', 'soribarale'].includes(currentUser?.usuario)) {
            isVisible = false;
        }

        if (!isVisible) {
            const firstAvailable = selectedModules[0] || 'inicio';
            setActiveView(firstAvailable);
        }
    }, [selectedModules, activeView, currentUser, setActiveView]);


    // Patient data
    const [patientData, setPatientData] = useState({
        nombre: '',
        obraSocial: '',
        afiliado: '',
        diagnostico: '',
        tratamiento: '',
        cirugia: '',
        fecha: getTodayISO(),
        medico: '',
    });

    // Cart items (unified — holds both prácticas and internación items)
    const [cartItems, setCartItems] = useState([]);

    // Print
    const printRef = useRef(null);
    const printInternacionRef = useRef(null);
    const [printItems, setPrintItems] = useState(null); // null = all, object = single

    // WhatsApp Modal
    const [showWhatsApp, setShowWhatsApp] = useState(false);

    // Change Password Modal
    const [showChangePassword, setShowChangePassword] = useState(false);

    // Toast notifications
    const [toasts, setToasts] = useState([]);

    // July 1st Meme Modal
    const [showJulioMeme, setShowJulioMeme] = useState(false);

    useEffect(() => {
        const today = new Date();
        // Activo desde "ahora" hasta el 2 de Julio de 2026 inclusive
        const endLimit = new Date('2026-07-02T23:59:59');
        
        if (today <= endLimit) {
            if (!sessionStorage.getItem('julio_meme_shown')) {
                setShowJulioMeme(true);
            }
        }
    }, []);

    const closeJulioMeme = () => {
        sessionStorage.setItem('julio_meme_shown', 'true');
        setShowJulioMeme(false);
    };

    // === GLOBAL UNREAD MESSAGE COUNT (persists across all views) ===
    const [globalUnreadCount, setGlobalUnreadCount] = useState(0);

    const addToast = useCallback((message, type = 'info') => {
        const id = uuidv4();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3500);
    }, []);

    // === GLOBAL NOTIFICATION SOUND (WhatsApp style) ===
    const playNotificationSound = useCallback(() => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.value = 880;
            gain1.gain.setValueAtTime(0.15, ctx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.15);
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.value = 1175;
            gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.12);
            gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(ctx.currentTime + 0.12);
            osc2.stop(ctx.currentTime + 0.3);
            setTimeout(() => ctx.close(), 500);
        } catch (e) { /* Audio not available */ }
    }, []);

    // Ref to track activeView inside realtime callback without re-subscribing
    const activeViewRef = useRef(activeView);
    useEffect(() => { activeViewRef.current = activeView; }, [activeView]);

    // === GLOBAL REALTIME SUBSCRIPTION — works from ANY view ===
    // Dependencies: only stable refs, so the channel stays open permanently
    useEffect(() => {
        // Load initial unread count
        fetchUnreadCounts().then(counts => {
            const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
            setGlobalUnreadCount(total);
        }).catch(console.error);

        // Subscribe to ALL incoming messages globally
        const unsub = subscribeToAllIncoming((newMsg) => {
            if (newMsg.direction === 'incoming') {
                playNotificationSound();
                setGlobalUnreadCount(prev => prev + 1);
                // Show toast notification when NOT on messaging view
                if (activeViewRef.current !== 'mensajeria') {
                    const senderName = newMsg.sender_name || newMsg.phone;
                    const preview = (newMsg.content || '📎 Media').substring(0, 40);
                    addToast(`💬 ${senderName}: ${preview}`, 'info');
                }
            }
        });

        return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playNotificationSound, addToast]);

    // Reset unread count when entering messaging view
    useEffect(() => {
        if (activeView === 'mensajeria') {
            // Refresh unread count when leaving messaging (it may have been marked as read)
            return () => {
                fetchUnreadCounts().then(counts => {
                    const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
                    setGlobalUnreadCount(total);
                }).catch(console.error);
            };
        }
    }, [activeView]);

    // #4 — Ctrl+K listener for Command Palette
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setCommandPaletteOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // === CART OPERATIONS (unified: prácticas + internación) ===
    const handleAddToCart = useCallback((practice) => {
        setCartItems(prev => {
            // For internación items, use encabezado as uniqueness key to allow same code with different headers
            // For practices with customField (e.g. Interconsulta with specialty), always add as new line
            const hasCustomField = !!practice.customField;
            const matchKey = practice.isInternacion
                ? (item => item.code === practice.code && item.encabezado === practice.encabezado)
                : (item => item.code === practice.code && !item.isInternacion && !item.customField);

            const existing = !hasCustomField ? prev.find(matchKey) : null;
            if (existing) {
                addToast(`"${practice.name}" ya está en el carrito — cantidad incrementada`, 'info');
                return prev.map(item =>
                    matchKey(item) ? { ...item, quantity: item.quantity + 1 } : item
                );
            }

            addToast(`Agregado: ${practice.encabezado || practice.name}`, 'success');
            return [...prev, {
                id: uuidv4(),
                code: practice.code,
                name: practice.name,
                displayName: practice.encabezado || practice.name,
                category: practice.category,
                quantity: 1,
                date: patientData.fecha,
                customField: practice.customField || null,
                customLabel: practice.customLabel || null,
                customValue: '',
                // Internación-specific fields
                encabezado: practice.encabezado || null,
                isInternacion: practice.isInternacion || false,
            }];
        });
    }, [patientData.fecha, addToast]);

    const handleUpdateItem = useCallback((id, field, value) => {
        setCartItems(prev => prev.map(item => {
            if (item.id !== id) return item;

            const updated = { ...item, [field]: value };

            // Update displayName for custom fields
            if (field === 'customValue' && item.customField) {
                if (item.customField === 'specialty') {
                    updated.displayName = `Interconsulta de ${value}`;
                } else if (item.customField === 'days') {
                    updated.displayName = `Solicito autorización de prórroga por ${value} días desde fecha indicada`;
                } else if (item.customField === 'roman') {
                    updated.displayName = `Solicito autorización de complejidad de anestesia ${value}`;
                } else if (item.customField === 'text') {
                    updated.displayName = value ? `${item.name} - ${value.toUpperCase()}` : item.name;
                }
            }

            return updated;
        }));
    }, []);

    const handleRemoveItem = useCallback((id) => {
        setCartItems(prev => prev.filter(item => item.id !== id));
        addToast('Práctica eliminada del carrito', 'info');
    }, [addToast]);

    const handleClearCart = useCallback(() => {
        if (cartItems.length === 0) return;
        if (window.confirm(`¿Eliminar ${cartItems.length} práctica(s) del carrito?`)) {
            setCartItems([]);
            addToast('Carrito limpiado', 'info');
        }
    }, [cartItems.length, addToast]);

    // === PRINT OPERATIONS ===
    // Separate items by type for dual-template rendering
    const practiceItems = cartItems.filter(i => !i.isInternacion);
    const internacionItems = cartItems.filter(i => i.isInternacion);

    const handlePrint = useCallback(async (singleItem = null) => {
        setPrintItems(singleItem);
        // Save order to Supabase
        try {
            const itemsToSave = singleItem ? [singleItem] : cartItems;
            const order = await createOrder(patientData, itemsToSave);
            await markOrderPrinted(order.id);
            addToast('Pedido guardado en historial', 'success');
        } catch (e) {
            console.warn('No se pudo guardar en DB, imprimiendo igual:', e);
        }
        setTimeout(() => window.print(), 100);
    }, [patientData, cartItems, addToast]);

    const handlePrintAll = useCallback(() => {
        if (cartItems.length === 0) {
            addToast('El carrito está vacío', 'error');
            return;
        }
        handlePrint(null);
    }, [cartItems.length, handlePrint, addToast]);

    const handlePrintSingle = useCallback((item) => {
        handlePrint(item);
    }, [handlePrint]);

    // === WHATSAPP ===
    const handleSendWhatsApp = useCallback(async (phoneNumber) => {
        try {
            const content = formatOrderForWhatsApp(patientData, cartItems);
            await sendWhatsAppMessage({ content, number: phoneNumber });
            // Save to Supabase
            try {
                const order = await createOrder(patientData, cartItems);
                await markOrderSent(order.id, phoneNumber);
            } catch (e) {
                console.warn('No se pudo guardar en DB:', e);
            }
            addToast('Pedido enviado por WhatsApp exitosamente', 'success');
        } catch (error) {
            addToast('Error al enviar por WhatsApp: ' + error.message, 'error');
            throw error;
        }
    }, [patientData, cartItems, addToast]);


    // === HISTORIAL ===
    const [orderHistory, setOrderHistory] = useState([]);
    const [historialLoading, setHistorialLoading] = useState(false);
    const [expandedOrders, setExpandedOrders] = useState({});
    const [historialPrintData, setHistorialPrintData] = useState(null); // { patientData, items }
    const printHistorialRef = useRef(null);

    useEffect(() => {
        if (activeView === 'historial') {
            setHistorialLoading(true);
            fetchOrderHistory(50)
                .then(data => setOrderHistory(data || []))
                .catch(e => { console.error(e); addToast('Error al cargar historial', 'error'); })
                .finally(() => setHistorialLoading(false));
        }
    }, [activeView, addToast]);

    const toggleOrderExpand = useCallback((orderId) => {
        setExpandedOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
    }, []);

    const handleReprintOrder = useCallback((order, singleItem = null) => {
        const pd = {
            nombre: order.nombre_paciente || '',
            obraSocial: order.obra_social || '',
            afiliado: order.afiliado || '',
            diagnostico: order.diagnostico || '',
            tratamiento: order.tratamiento || '',
            fecha: order.fecha || '',
            medico: order.medico || '',
        };

        const mapItem = (oi) => ({
            id: oi.id,
            code: oi.code,
            name: oi.name,
            displayName: oi.display_name || oi.name,
            category: oi.category,
            quantity: oi.quantity || 1,
            date: oi.fecha || order.fecha,
            customField: oi.custom_field,
            customValue: oi.custom_value,
            isInternacion: oi.category === 'internacion',
            encabezado: oi.display_name || oi.name,
        });

        if (singleItem) {
            setHistorialPrintData({ patientData: pd, items: null, singleItem: mapItem(singleItem) });
        } else {
            const items = (order.order_items || []).sort((a, b) => (a.position || 0) - (b.position || 0)).map(mapItem);
            setHistorialPrintData({ patientData: pd, items, singleItem: null });
        }

        setTimeout(() => window.print(), 150);
        addToast('Reimprimiendo pedido...', 'info');
    }, [addToast]);

    // Clear historial print data after printing so the normal PrintTemplate is restored
    useEffect(() => {
        const clearAfterPrint = () => setHistorialPrintData(null);
        window.addEventListener('afterprint', clearAfterPrint);
        return () => window.removeEventListener('afterprint', clearAfterPrint);
    }, []);

    return (
        <div className="app">
            {/* Mobile Sidebar Backdrop */}
            {mobileMenuOpen && <div className="sidebar--mobile-backdrop" onClick={() => setMobileMenuOpen(false)} />}

            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(prev => { const next = !prev; localStorage.setItem('sidebar_collapsed', next); return next; })}
                activeView={activeView}
                onViewChange={setActiveView}
                unreadMessageCount={globalUnreadCount}
                className={mobileMenuOpen ? 'sidebar--mobile-open' : ''}
                onOpenBeto={() => setBetoWidgetOpen(true)}
                currentUser={currentUser}
                selectedModules={selectedModules}
            />

            <main className={`main ${sidebarCollapsed ? 'main--expanded' : ''}`}>
                {/* Top Bar */}
                <header className="topbar no-print" style={{ flexShrink: 0 }}>
                    {/* Background video */}
                    <div className="topbar__video-bg">
                        <video
                            src="/Blue_drop_moving_left_right_202606091400.mp4"
                            autoPlay
                            loop
                            muted
                            playsInline
                        />
                    </div>
                    {/* Mobile hamburger */}
                    <button
                        className="topbar__mobile-menu"
                        onClick={() => setMobileMenuOpen(true)}
                        style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', background: 'var(--neutral-50)', border: '1px solid var(--neutral-200)', cursor: 'pointer', color: 'var(--neutral-600)', marginRight: '8px' }}
                    >
                        <Menu size={18} />
                    </button>
                    <div className="topbar__left">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <h1 className="topbar__title topbar__title--wave">
                                {'Administración'.split('').map((char, i) => (
                                    <span key={`a-${i}`} className="topbar__wave-letter topbar__title-accent" style={{ animationDelay: `${i * 0.08}s` }}>{char === ' ' ? '\u00A0' : char}</span>
                                ))}
                                <span className="topbar__wave-letter" style={{ animationDelay: `${14 * 0.08}s` }}>&nbsp;</span>
                                {'Sanatorio Argentino'.split('').map((char, i) => (
                                    <span key={`s-${i}`} className="topbar__wave-letter" style={{ animationDelay: `${(15 + i) * 0.08}s` }}>{char === ' ' ? '\u00A0' : char}</span>
                                ))}
                            </h1>
                            {activeView !== 'inicio' && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--neutral-400)', fontWeight: 500 }}>
                                    <ChevronRight size={14} />
                                    <span style={{ color: 'var(--primary-500)', fontWeight: 600 }}>{VIEW_LABELS[activeView] || activeView}</span>
                                    <HelpButton moduleId={activeView} />
                                </span>
                            )}
                        </div>
                        <span className="topbar__subtitle">Sistema de gestión integral</span>
                    </div>
                    {/* WhatsApp Line Status — centered in topbar */}
                    {(activeView === 'mensajeria' || activeView === 'cirugias' || activeView === 'deudas') && (
                        <WhatsAppLineStatus />
                    )}
                    <div className="topbar__right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <SystemOutageReporter currentUser={currentUser} addToast={addToast} />
                        {/* Dark Mode Toggle */}
                        <button
                            onClick={() => setDarkMode(d => !d)}
                            title={darkMode ? 'Modo claro' : 'Modo oscuro'}
                            style={{
                                width: '34px', height: '34px', borderRadius: '10px',
                                background: darkMode ? '#1E293B' : 'var(--neutral-50)',
                                border: `1px solid ${darkMode ? '#334155' : 'var(--neutral-200)'}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: darkMode ? '#FBBF24' : 'var(--neutral-500)',
                                transition: 'all 0.2s',
                            }}
                        >
                            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                        </button>
                        <span className="topbar__date">
                            {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                        {/* User Badge + Logout */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '4px 4px 4px 12px',
                            background: 'var(--neutral-50)',
                            borderRadius: '20px',
                            border: '1px solid var(--neutral-200)',
                        }}>
                            <span style={{
                                fontSize: '0.78rem', fontWeight: 600,
                                color: 'var(--neutral-600)',
                            }}>
                                {currentUser.nombre?.includes('@')
                                    ? currentUser.nombre.split('@')[0].replace(/^\w/, c => c.toUpperCase())
                                    : currentUser.nombre}
                            </span>
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.65rem', fontWeight: 800, color: '#fff',
                            }}>
                                {currentUser.iniciales}
                            </div>
                            <button
                                onClick={() => setShowChangePassword(true)}
                                title="Cambiar contraseña"
                                style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    background: 'none', border: '1px solid var(--neutral-200)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', color: 'var(--neutral-400)',
                                    transition: 'all 0.2s',
                                }}
                                onMouseOver={e => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.color = '#4F46E5'; e.currentTarget.style.borderColor = '#A5B4FC'; }}
                                onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--neutral-400)'; e.currentTarget.style.borderColor = 'var(--neutral-200)'; }}
                            >
                                <KeyRound size={13} />
                            </button>
                            <button
                                onClick={onLogout}
                                title="Cerrar sesión"
                                style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    background: 'none', border: '1px solid var(--neutral-200)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', color: 'var(--neutral-400)',
                                    transition: 'all 0.2s',
                                }}
                                onMouseOver={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.borderColor = '#FCA5A5'; }}
                                onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--neutral-400)'; e.currentTarget.style.borderColor = 'var(--neutral-200)'; }}
                            >
                                <LogOut size={13} />
                            </button>
                        </div>
                    </div>
                </header>
                <SystemAlertBanner />

                {/* Content */}
                {activeView === 'inicio' && (
                    <HomePanel key={viewKey} onNavigate={setActiveView} />
                )}

                {activeView === 'mensajeria' && (
                    <MessagingPanel addToast={addToast} currentUser={currentUser} />
                )}

                {activeView === 'pedidos' && (
                    <div className="content no-print">
                        <PatientHeader
                            patientData={patientData}
                            setPatientData={setPatientData}
                        />

                        {/* === Internación Search (encabezados institucionales) === */}
                        <InternacionSearch onAddToCart={handleAddToCart} />

                        {/* === Práctica Search (nomenclador general) === */}
                        <PracticeSearch onAddToCart={handleAddToCart} />

                        {/* === Carrito Unificado === */}
                        <Cart
                            items={cartItems}
                            onUpdateItem={handleUpdateItem}
                            onRemoveItem={handleRemoveItem}
                            onClearCart={handleClearCart}
                            onPrintAll={handlePrintAll}
                            onPrintSingle={handlePrintSingle}
                            onSendWhatsApp={() => {
                                if (cartItems.length === 0) {
                                    addToast('El carrito está vacío', 'error');
                                    return;
                                }
                                setShowWhatsApp(true);
                            }}
                        />
                    </div>
                )}

                {activeView === 'activos' && (
                    <ActivosPanel currentUser={currentUser} addToast={addToast} />
                )}

                {activeView === 'historial' && (
                    <div className="content no-print">
                        <div className="cart animate-fade-in">
                            <div className="cart__header">
                                <div className="cart__title-group">
                                    <div className="cart__icon-badge"><Clock size={18} /></div>
                                    <h3 className="cart__title">Historial de Pedidos</h3>
                                    <span className="cart__badge">{orderHistory.length} pedido{orderHistory.length !== 1 ? 's' : ''}</span>
                                </div>
                            </div>
                            {historialLoading ? (
                                <div className="cart__empty-state"><p>Cargando...</p></div>
                            ) : orderHistory.length === 0 ? (
                                <div className="cart__empty-state">
                                    <Clock size={48} strokeWidth={1.2} />
                                    <h3>Sin pedidos registrados</h3>
                                    <p>Los pedidos impresos o enviados aparecerán aquí.</p>
                                </div>
                            ) : (
                                <div className="cart__table-wrapper">
                                    <table className="cart__table">
                                        <thead>
                                            <tr>
                                                <th className="cart__th" style={{ width: '36px' }}></th>
                                                <th className="cart__th">Paciente</th>
                                                <th className="cart__th">OS</th>
                                                <th className="cart__th">Prácticas</th>
                                                <th className="cart__th">Fecha</th>
                                                <th className="cart__th">Estado</th>
                                                <th className="cart__th" style={{ width: '100px', textAlign: 'center' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orderHistory.map(order => (
                                                <>
                                                    <tr key={order.id} className="cart__row" style={{ cursor: 'pointer' }} onClick={() => toggleOrderExpand(order.id)}>
                                                        <td className="cart__td" style={{ textAlign: 'center', padding: '0 4px' }}>
                                                            {expandedOrders[order.id]
                                                                ? <ChevronDown size={16} style={{ color: 'var(--primary-500)', transition: 'transform 0.2s' }} />
                                                                : <ChevronRight size={16} style={{ color: 'var(--neutral-400)', transition: 'transform 0.2s' }} />
                                                            }
                                                        </td>
                                                        <td className="cart__td" style={{ fontWeight: 600 }}>{order.nombre_paciente}</td>
                                                        <td className="cart__td">{order.obra_social || '—'}</td>
                                                        <td className="cart__td">
                                                            {order.order_items?.length || 0} práctica{(order.order_items?.length || 0) !== 1 ? 's' : ''}
                                                        </td>
                                                        <td className="cart__td">
                                                            {new Date(order.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                        </td>
                                                        <td className="cart__td">
                                                            <span className={`patient-header__status patient-header__status--complete`} style={
                                                                order.status === 'sent' ? { background: '#dcfce7', color: '#16a34a' } :
                                                                    order.status === 'printed' ? { background: '#dbeafe', color: '#2563eb' } :
                                                                        { background: '#f1f5f9', color: '#64748b' }
                                                            }>
                                                                {order.status === 'sent' ? '✓ Enviado' : order.status === 'printed' ? '🖨 Impreso' : '● Creado'}
                                                            </span>
                                                        </td>
                                                        <td className="cart__td" style={{ textAlign: 'center' }}>
                                                            <button
                                                                className="cart__action-btn cart__action-btn--print"
                                                                onClick={(e) => { e.stopPropagation(); handleReprintOrder(order); }}
                                                                title="Reimprimir pedido completo"
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                    padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600,
                                                                    borderRadius: '6px', border: '1px solid #93C5FD',
                                                                    background: '#EFF6FF', color: '#2563EB',
                                                                    cursor: 'pointer', transition: 'all 0.2s',
                                                                }}
                                                                onMouseOver={e => { e.currentTarget.style.background = '#DBEAFE'; e.currentTarget.style.borderColor = '#60A5FA'; }}
                                                                onMouseOut={e => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.borderColor = '#93C5FD'; }}
                                                            >
                                                                <RotateCcw size={13} />
                                                                Reimprimir
                                                            </button>
                                                        </td>
                                                    </tr>
                                                    {/* Expanded detail rows */}
                                                    {expandedOrders[order.id] && order.order_items && order.order_items.length > 0 && (
                                                        <tr key={`${order.id}-detail`} className="animate-fade-in">
                                                            <td colSpan={7} style={{ padding: 0, border: 'none' }}>
                                                                <div style={{
                                                                    background: 'var(--neutral-50, #F8FAFC)',
                                                                    borderLeft: '3px solid var(--primary-400, #60A5FA)',
                                                                    margin: '0 8px 8px 24px',
                                                                    borderRadius: '0 8px 8px 0',
                                                                    padding: '8px 0',
                                                                }}>
                                                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                                        <thead>
                                                                            <tr>
                                                                                <th style={{ padding: '4px 12px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Código</th>
                                                                                <th style={{ padding: '4px 12px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Práctica</th>
                                                                                <th style={{ padding: '4px 12px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Cant.</th>
                                                                                <th style={{ padding: '4px 12px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', width: '80px' }}></th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {[...order.order_items].sort((a, b) => (a.position || 0) - (b.position || 0)).map((oi) => (
                                                                                <tr key={oi.id} style={{ borderTop: '1px solid var(--neutral-100, #F1F5F9)' }}>
                                                                                    <td style={{ padding: '6px 12px' }}>
                                                                                        <span className="cart__code-chip">{oi.code}</span>
                                                                                    </td>
                                                                                    <td style={{ padding: '6px 12px', fontSize: '0.82rem', color: 'var(--neutral-700)' }}>
                                                                                        {oi.display_name || oi.name}
                                                                                    </td>
                                                                                    <td style={{ padding: '6px 12px', textAlign: 'center', fontSize: '0.82rem', fontWeight: 600 }}>
                                                                                        {oi.quantity || 1}
                                                                                    </td>
                                                                                    <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                                                                                        <button
                                                                                            className="cart__action-btn cart__action-btn--print"
                                                                                            onClick={() => handleReprintOrder(order, oi)}
                                                                                            title={`Reimprimir: ${oi.display_name || oi.name}`}
                                                                                            style={{ padding: '3px 6px', cursor: 'pointer' }}
                                                                                        >
                                                                                            <Printer size={14} />
                                                                                        </button>
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeView === 'pedidos_marcela' && (
                    <PedidosMarcela addToast={addToast} />
                )}

                {activeView === 'cirugias' && (
                    <SurgeryPanel addToast={addToast} currentUser={currentUser} />
                )}

                {activeView === 'nomenclador' && (
                    <NomencladorView onAddToCart={handleAddToCart} />
                )}



                {activeView === 'turnos' && (
                    <TurnoAdminPanel addToast={addToast} currentUser={currentUser} />
                )}

                {activeView === 'deudas' && (
                    <DeudasPanel addToast={addToast} currentUser={currentUser} />
                )}

                {activeView === 'consultas' && (
                    <ConsultasPanel addToast={addToast} currentUser={currentUser} />
                )}

                {activeView === 'liquidaciones' && (
                    <LiquidacionesPanel addToast={addToast} currentUser={currentUser} />
                )}

                {activeView === 'documentos' && (
                    <DocumentosPanel addToast={addToast} currentUser={currentUser} />
                )}

                {activeView === 'pacientes' && (
                    <PacientesPanel addToast={addToast} currentUser={currentUser} />
                )}

                {activeView === 'altas' && (
                    <AltasPanel addToast={addToast} currentUser={currentUser} />
                )}



                {activeView === 'facturacion' && (
                    <FacturacionPanel addToast={addToast} currentUser={currentUser} />
                )}

                {activeView === 'asignaciones' && (
                    <AsignacionPanel addToast={addToast} currentUser={currentUser} />
                )}

                {activeView === 'auditoria_historias' && (
                    <AuditoriaHistoriasPanel addToast={addToast} currentUser={currentUser} />
                )}

                {activeView === 'auditoria_pdf' && (
                    <AuditoriaPDFPanel addToast={addToast} currentUser={currentUser} />
                )}

                {(activeView === 'beto' || activeView === 'beto_rules' || activeView === 'beto_analytics') && (
                    <BetoPanel activeView={activeView} addToast={addToast} />
                )}

                {activeView === 'config' && (
                    <ConfigPanel addToast={addToast} onReconfigModules={() => setShowModuleReconfig(true)} currentUser={currentUser} />
                )}

                {activeView === 'metricas' && (
                    <MetricsPanel addToast={addToast} />
                )}

                {activeView === 'asociaciones_entrega' && (
                    <AsociacionesEntregaPanel addToast={addToast} currentUser={currentUser} />
                )}

                {activeView === 'laboratorios' && (
                    <LaboratoriosPanel addToast={addToast} currentUser={currentUser} />
                )}

                {activeView === 'plantillas' && (
                    <div className="content no-print">
                        <TemplateManager addToast={addToast} />
                    </div>
                )}

                {activeView === 'manual' && (
                    <ManualProcedimientos />
                )}

                {activeView === 'actividad_usuarios' && (
                    <UserActivityPanel />
                )}

                {activeView === 'gobernanza' && (
                    <GobernanzaPanel currentUser={currentUser} />
                )}
            </main>

            {/* Print Templates (hidden on screen, visible on print) */}
            {/* When printing from historial, use historial data; otherwise use current cart */}
            {historialPrintData ? (
                <>
                    {/* Historial reprint — práctica items */}
                    <PrintTemplate
                        ref={printHistorialRef}
                        patientData={historialPrintData.patientData}
                        items={(historialPrintData.items || []).filter(i => !i.isInternacion)}
                        singleItem={historialPrintData.singleItem && !historialPrintData.singleItem.isInternacion ? historialPrintData.singleItem : null}
                    />
                    {/* Historial reprint — internación items */}
                    <PrintTemplateInternacion
                        ref={printInternacionRef}
                        patientData={historialPrintData.patientData}
                        items={(historialPrintData.items || []).filter(i => i.isInternacion)}
                        singleItem={historialPrintData.singleItem && historialPrintData.singleItem.isInternacion ? historialPrintData.singleItem : null}
                    />
                </>
            ) : (
                <>
                    {/* Normal print — práctica items */}
                    <PrintTemplate
                        ref={printRef}
                        patientData={patientData}
                        items={printItems ? [] : practiceItems}
                        singleItem={printItems && !printItems.isInternacion ? printItems : null}
                    />
                    {/* Normal print — internación items */}
                    <PrintTemplateInternacion
                        ref={printInternacionRef}
                        patientData={patientData}
                        items={printItems ? [] : internacionItems}
                        singleItem={printItems && printItems.isInternacion ? printItems : null}
                    />
                </>
            )}

            {/* WhatsApp Modal */}
            <WhatsAppModal
                isOpen={showWhatsApp}
                onClose={() => setShowWhatsApp(false)}
                onSend={handleSendWhatsApp}
                patientData={patientData}
                items={cartItems}
            />

            {/* Change Password Modal */}
            <ChangePasswordModal
                isOpen={showChangePassword}
                onClose={() => setShowChangePassword(false)}
                currentUser={currentUser}
                addToast={addToast}
            />

            {/* Toast Notifications (Enhanced) */}
            {toasts.length > 0 && (
                <div className="toast-container">
                    {toasts.map(toast => (
                        <div key={toast.id} className={`toast toast--${toast.type}`}>
                            <div className="toast__icon">
                                {toast.type === 'success' && <CheckCircle size={16} />}
                                {toast.type === 'error' && <AlertCircle size={16} />}
                                {toast.type === 'info' && <Info size={16} />}
                            </div>
                            <span className="toast__message">{toast.message}</span>
                            <div className="toast__progress" />
                        </div>
                    ))}
                </div>
            )}

            {/* Beto — AI Assistant Widget (FAB hidden, opened from sidebar) */}
            <BetoWidget
                currentUser={currentUser}
                currentModule={activeView}
                onNavigate={(mod) => setActiveView(mod)}
                hideFab={true}
                externalOpen={betoWidgetOpen}
                onExternalClose={() => setBetoWidgetOpen(false)}
            />

            {/* #4 — Command Palette (Ctrl+K) */}
            <CommandPalette
                isOpen={commandPaletteOpen}
                onClose={() => setCommandPaletteOpen(false)}
                onNavigate={(mod) => { setActiveView(mod); setCommandPaletteOpen(false); }}
                onBetoQuery={(query) => {
                    // Open Beto and send the query
                    const betoFab = document.getElementById('beto-fab');
                    if (betoFab) betoFab.click();
                    // Small delay to let Beto open, then type the query
                    setTimeout(() => {
                        const betoInput = document.querySelector('#beto-chat-panel textarea');
                        if (betoInput) {
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                            nativeInputValueSetter.call(betoInput, query);
                            betoInput.dispatchEvent(new Event('input', { bubbles: true }));
                            // Trigger send
                            setTimeout(() => {
                                const sendBtn = document.querySelector('#beto-chat-panel button:last-child');
                                if (sendBtn) sendBtn.click();
                            }, 200);
                        }
                    }, 2500);
                }}
            />

            {/* Easter egg: Homer idle overlay — solo para frojo */}
            {currentUser?.usuario === 'frojo' && <IdleHomerOverlay />}

            {/* Welcome Onboarding — post-login, once per session */}
            <WelcomeOnboarding
                currentUser={currentUser}
                onOpenBeto={() => setBetoWidgetOpen(true)}
                onClose={() => {
                    // After welcome closes, show module onboarding if needed
                    if (needsModuleOnboarding) {
                        setTimeout(() => setShowModuleOnboarding(true), 500);
                        setNeedsModuleOnboarding(false);
                    }
                }}
            />

            {/* Module Onboarding — first-time module selection */}
            {showModuleOnboarding && (
                <ModuleOnboarding
                    currentUser={currentUser}
                    onComplete={(modules) => {
                        setShowModuleOnboarding(false);
                        if (modules) setSelectedModules(modules);
                    }}
                />
            )}

            {/* Module Reconfiguration — from ConfigPanel */}
            {showModuleReconfig && (
                <ModuleOnboarding
                    currentUser={{ ...currentUser, _modulePrefs: selectedModules }}
                    isReconfig
                    onComplete={(modules) => {
                        setShowModuleReconfig(false);
                        if (modules) setSelectedModules(modules);
                    }}
                />
            )}

            {/* July 1st Meme Modal */}
            {showJulioMeme && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)', zIndex: 999999,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden'
                }}>
                    <SnowBackground />
                    <div style={{
                        position: 'relative',
                        background: 'white', padding: '24px', borderRadius: '16px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
                        maxWidth: '90%', maxHeight: '90vh', boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                        zIndex: 1
                    }}>
                        <h2 style={{ margin: 0, color: '#1e293b', fontSize: '24px' }}>¡Bienvenido Julio!</h2>
                        <img 
                            src="/julio.jpg" 
                            alt="Julio Meme" 
                            style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '8px' }} 
                        />
                        <button 
                            onClick={closeJulioMeme}
                            style={{
                                padding: '12px 32px', background: '#3b82f6', color: 'white', 
                                border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
                                fontSize: '16px', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                            }}
                            onMouseOver={e => e.target.style.transform = 'translateY(-2px)'}
                            onMouseOut={e => e.target.style.transform = 'none'}
                        >
                            Empezar a trabajar
                        </button>
                    </div>
                </div>
            )}

            {showFrojoCelebration && (
                <FrojoCelebration onClose={() => setShowFrojoCelebration(false)} />
            )}
        </div>
    );
}

export default AppRoot;
