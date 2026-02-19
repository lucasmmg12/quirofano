import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Sidebar from './components/Sidebar.jsx';
import PatientHeader from './components/PatientHeader.jsx';
import PracticeSearch from './components/PracticeSearch.jsx';
import Cart from './components/Cart.jsx';
import PrintTemplate from './components/PrintTemplate.jsx';
import WhatsAppModal from './components/WhatsAppModal.jsx';
import { getTodayISO } from './utils/searchUtils';
import { sendWhatsAppMessage, formatOrderForWhatsApp } from './services/builderbotApi';
import { createOrder, markOrderPrinted, markOrderSent, fetchOrderHistory } from './services/dataService';
import { Clock, Printer, Send, CheckCircle } from 'lucide-react';
import SurgeryPanel from './components/SurgeryPanel.jsx';
import NomencladorView from './components/NomencladorView.jsx';
import './App.css';

function App() {
    // Sidebar
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [activeView, setActiveView] = useState('pedidos');

    // Patient data
    const [patientData, setPatientData] = useState({
        nombre: '',
        obraSocial: '',
        afiliado: '',
        diagnostico: '',
        tratamiento: '',
        fecha: getTodayISO(),
        medico: '',
    });

    // Cart items
    const [cartItems, setCartItems] = useState([]);

    // Print
    const printRef = useRef(null);
    const [printItems, setPrintItems] = useState(null); // null = all, object = single

    // WhatsApp Modal
    const [showWhatsApp, setShowWhatsApp] = useState(false);

    // Toast notifications
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info') => {
        const id = uuidv4();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3500);
    }, []);

    // === CART OPERATIONS ===
    const handleAddToCart = useCallback((practice) => {
        setCartItems(prev => {
            // Check if already in cart
            const existing = prev.find(item => item.code === practice.code);
            if (existing) {
                addToast(`"${practice.name}" ya está en el carrito — cantidad incrementada`, 'info');
                return prev.map(item =>
                    item.code === practice.code
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }

            addToast(`Agregado: ${practice.name}`, 'success');
            return [...prev, {
                id: uuidv4(),
                code: practice.code,
                name: practice.name,
                displayName: practice.name,
                category: practice.category,
                quantity: 1,
                date: patientData.fecha,
                customField: practice.customField || null,
                customLabel: practice.customLabel || null,
                customValue: '',
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

    useEffect(() => {
        if (activeView === 'historial') {
            setHistorialLoading(true);
            fetchOrderHistory(50)
                .then(data => setOrderHistory(data || []))
                .catch(e => { console.error(e); addToast('Error al cargar historial', 'error'); })
                .finally(() => setHistorialLoading(false));
        }
    }, [activeView, addToast]);

    return (
        <div className="app">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(prev => !prev)}
                activeView={activeView}
                onViewChange={setActiveView}
            />

            <main className={`main ${sidebarCollapsed ? 'main--expanded' : ''}`}>
                {/* Top Bar */}
                <header className="topbar no-print">
                    <div className="topbar__left">
                        <h1 className="topbar__title">Optimizador de Pedidos Médicos</h1>
                        <span className="topbar__subtitle">Sistema de generación rápida</span>
                    </div>
                    <div className="topbar__right">
                        <span className="topbar__date">
                            {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                    </div>
                </header>

                {/* Content */}
                {activeView === 'pedidos' && (
                    <div className="content no-print">
                        <PatientHeader
                            patientData={patientData}
                            setPatientData={setPatientData}
                        />

                        <PracticeSearch onAddToCart={handleAddToCart} />

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
                                                <th className="cart__th">Paciente</th>
                                                <th className="cart__th">OS</th>
                                                <th className="cart__th">Prácticas</th>
                                                <th className="cart__th">Fecha</th>
                                                <th className="cart__th">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orderHistory.map(order => (
                                                <tr key={order.id} className="cart__row">
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
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeView === 'cirugias' && (
                    <SurgeryPanel addToast={addToast} />
                )}

                {activeView === 'nomenclador' && (
                    <NomencladorView onAddToCart={handleAddToCart} />
                )}

                {activeView === 'config' && (
                    <div className="content no-print">
                        <div className="placeholder-view animate-fade-in">
                            <h2>Configuración</h2>
                            <p>Próximamente — Ajustes del sistema, datos del sanatorio, médicos frecuentes.</p>
                        </div>
                    </div>
                )}
            </main>

            {/* Print Template (hidden on screen, visible on print) */}
            <PrintTemplate
                ref={printRef}
                patientData={patientData}
                items={cartItems}
                singleItem={printItems}
            />

            {/* WhatsApp Modal */}
            <WhatsAppModal
                isOpen={showWhatsApp}
                onClose={() => setShowWhatsApp(false)}
                onSend={handleSendWhatsApp}
                patientData={patientData}
                items={cartItems}
            />

            {/* Toast Notifications */}
            {toasts.length > 0 && (
                <div className="toast-container">
                    {toasts.map(toast => (
                        <div key={toast.id} className={`toast toast--${toast.type}`}>
                            <span className="toast__message">{toast.message}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default App;
