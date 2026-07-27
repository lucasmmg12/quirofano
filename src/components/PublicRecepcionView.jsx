import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Search, ShoppingCart, CheckCircle, PlusCircle, Trash2, Printer, 
    ArrowLeft, Calendar, User, FileText, Activity 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useReactToPrint } from 'react-to-print';
import PrintGarantias from './PrintGarantias';
import { toggleCarritoRendicion, emitirRendicion } from '../services/garantiasService';

export default function PublicRecepcionView() {
    const [admisiones, setAdmisiones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('pendientes'); // pendientes, carrito
    
    // Rendición
    const [entrega, setEntrega] = useState('');
    const [recibe, setRecibe] = useState('');
    const [notas, setNotas] = useState('');
    const [showRendicionForm, setShowRendicionForm] = useState(false);
    
    // Print
    const printRef = useRef();
    const [rendicionData, setRendicionData] = useState(null);

    const loadData = async () => {
        setLoading(true);
        try {
            // Buscamos admisiones recientes (últimos 30 días por si acaso) o activas
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const { data, error } = await supabase
                .from('altas_administrativas')
                .select(`
                    id, paciente, dni, cliente, fecha_ingreso, especialidad, numero_admision,
                    garantia_estado, garantia_ubicacion, en_carrito_rendicion
                `)
                .gte('fecha_ingreso', thirtyDaysAgo.toISOString().split('T')[0])
                .order('fecha_ingreso', { ascending: false });

            if (error) throw error;
            setAdmisiones(data || []);
        } catch (error) {
            console.error("Error al cargar admisiones:", error);
            alert("Error al cargar los datos");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const cartItems = useMemo(() => admisiones.filter(a => a.en_carrito_rendicion), [admisiones]);
    
    const filteredAdmisiones = useMemo(() => {
        return admisiones.filter(a => {
            // Solo mostramos las que NO han sido pasadas a Administración
            if (a.garantia_ubicacion === 'Administración') return false;
            
            const matchSearch = (
                (a.paciente || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (a.numero_admision || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (a.dni || '').toLowerCase().includes(searchTerm.toLowerCase())
            );
            return matchSearch;
        });
    }, [admisiones, searchTerm]);

    const handleRegistrarGarantia = async (id) => {
        try {
            const { error } = await supabase
                .from('altas_administrativas')
                .update({
                    garantia_estado: 'Pendiente',
                    garantia_ubicacion: 'Recepción'
                })
                .eq('id', id);
            
            if (error) throw error;
            setAdmisiones(prev => prev.map(a => a.id === id ? { ...a, garantia_estado: 'Pendiente', garantia_ubicacion: 'Recepción' } : a));
        } catch (error) {
            console.error("Error:", error);
            alert("No se pudo registrar la garantía");
        }
    };

    const handleToggleCart = async (id, inCart) => {
        try {
            await toggleCarritoRendicion(id, inCart, 'Recepción');
            setAdmisiones(prev => prev.map(a => a.id === id ? { ...a, en_carrito_rendicion: inCart } : a));
        } catch (error) {
            console.error(error);
            alert("Error al actualizar carrito");
        }
    };

    const handleEmitirRendicion = async () => {
        if (!entrega || !recibe) return alert("Completá quién entrega y quién recibe");
        
        try {
            const ids = cartItems.map(c => c.id);
            const data = { entrega, recibe, notas, firma_entrega: null, firma_recibe: null };
            await emitirRendicion(ids, data, 'Recepción');
            
            setRendicionData({
                codigo: `REN-${Date.now().toString().slice(-6)}`,
                fecha: new Date(),
                entrega, recibe, notas,
                garantias: cartItems
            });
            
            setEntrega('');
            setRecibe('');
            setNotas('');
            setShowRendicionForm(false);
            
            // Recargar datos
            await loadData();
            
            // Trigger print
            setTimeout(() => {
                handlePrint();
            }, 500);
            
        } catch (error) {
            console.error(error);
            alert("Error al emitir rendición");
        }
    };

    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: 'Rendicion_Garantias',
    });

    return (
        <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: "'Inter', sans-serif" }}>
            {/* Header Público */}
            <div style={{ background: 'white', padding: '16px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: '#3B82F6', color: 'white', padding: '8px', borderRadius: '8px' }}>
                        <Activity size={24} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.2rem', color: '#1E293B' }}>Portal Recepción</h1>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>Gestión de Garantías Físicas</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <button 
                        onClick={() => setActiveTab('pendientes')}
                        style={{ 
                            background: activeTab === 'pendientes' ? '#EEF2FF' : 'transparent',
                            color: activeTab === 'pendientes' ? '#4F46E5' : '#64748B',
                            border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                        }}
                    >
                        <FileText size={18} /> Admisiones
                    </button>
                    <button 
                        onClick={() => setActiveTab('carrito')}
                        style={{ 
                            background: activeTab === 'carrito' ? '#EEF2FF' : 'transparent',
                            color: activeTab === 'carrito' ? '#4F46E5' : '#64748B',
                            border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                        }}
                    >
                        <ShoppingCart size={18} /> Carrito Rendición
                        {cartItems.length > 0 && (
                            <span style={{ background: '#EF4444', color: 'white', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>
                                {cartItems.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
                {activeTab === 'pendientes' ? (
                    <div>
                        <div style={{ marginBottom: '20px', position: 'relative' }}>
                            <Search size={20} style={{ position: 'absolute', left: '16px', top: '14px', color: '#94A3B8' }} />
                            <input 
                                type="text"
                                placeholder="Buscar paciente, DNI o número de admisión..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{ 
                                    width: '100%', padding: '14px 16px 14px 44px', 
                                    borderRadius: '12px', border: '1px solid #CBD5E1',
                                    fontSize: '1rem', outline: 'none',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}
                            />
                        </div>

                        {loading ? (
                            <p style={{ textAlign: 'center', color: '#64748B', padding: '40px' }}>Cargando admisiones recientes...</p>
                        ) : (
                            <div style={{ display: 'grid', gap: '12px' }}>
                                {filteredAdmisiones.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '12px', border: '1px dashed #CBD5E1' }}>
                                        <p style={{ color: '#64748B', margin: 0 }}>No hay admisiones que coincidan con la búsqueda.</p>
                                    </div>
                                ) : (
                                    filteredAdmisiones.map(adm => (
                                        <div key={adm.id} style={{ 
                                            background: adm.en_carrito_rendicion ? '#F0FDF4' : 'white', 
                                            border: `1px solid ${adm.en_carrito_rendicion ? '#BBF7D0' : '#E2E8F0'}`, 
                                            padding: '16px', borderRadius: '12px',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                        }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1E293B' }}>{adm.paciente}</h3>
                                                    <span style={{ fontSize: '0.75rem', background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '12px' }}>
                                                        {adm.numero_admision}
                                                    </span>
                                                </div>
                                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', display: 'flex', gap: '16px' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><User size={14}/> DNI: {adm.dni || '-'}</span>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14}/> Ingreso: {adm.fecha_ingreso ? new Date(adm.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-AR') : '-'}</span>
                                                    <span>OS: {adm.cliente}</span>
                                                </p>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                {!adm.garantia_estado ? (
                                                    <button 
                                                        onClick={() => handleRegistrarGarantia(adm.id)}
                                                        style={{ 
                                                            background: 'white', color: '#3B82F6', border: '1px solid #BFDBFE',
                                                            padding: '8px 16px', borderRadius: '8px', fontWeight: 600,
                                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                                        }}
                                                    >
                                                        <PlusCircle size={16} /> Tengo el Pagaré
                                                    </button>
                                                ) : adm.en_carrito_rendicion ? (
                                                    <button 
                                                        onClick={() => handleToggleCart(adm.id, false)}
                                                        style={{ 
                                                            background: '#FEE2E2', color: '#DC2626', border: 'none',
                                                            padding: '8px 16px', borderRadius: '8px', fontWeight: 600,
                                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                                        }}
                                                    >
                                                        <Trash2 size={16} /> Quitar de carrito
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={() => handleToggleCart(adm.id, true)}
                                                        style={{ 
                                                            background: '#4F46E5', color: 'white', border: 'none',
                                                            padding: '8px 16px', borderRadius: '8px', fontWeight: 600,
                                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                                        }}
                                                    >
                                                        <ShoppingCart size={16} /> Enviar al Carrito
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div>
                        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #E2E8F0' }}>
                            <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#1E293B' }}>
                                <ShoppingCart size={24} color="#4F46E5"/> Carrito de Rendición
                            </h2>
                            
                            {cartItems.length === 0 ? (
                                <p style={{ color: '#64748B', textAlign: 'center', padding: '40px 0' }}>El carrito está vacío. Buscá admisiones y envialas al carrito para generar la rendición.</p>
                            ) : (
                                <div>
                                    <div style={{ background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '16px', marginBottom: '24px' }}>
                                        <h4 style={{ margin: '0 0 12px 0', color: '#334155' }}>Garantías a rendir ({cartItems.length})</h4>
                                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '8px' }}>
                                            {cartItems.map(c => (
                                                <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #E2E8F0' }}>
                                                    <span><strong style={{color: '#0F172A'}}>{c.paciente}</strong> <span style={{color: '#64748B', fontSize: '0.85rem'}}>— {c.cliente}</span></span>
                                                    <button onClick={() => handleToggleCart(c.id, false)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}><Trash2 size={16}/></button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    
                                    {!showRendicionForm ? (
                                        <button 
                                            onClick={() => setShowRendicionForm(true)}
                                            style={{ background: '#10B981', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 600, width: '100%', cursor: 'pointer', fontSize: '1rem' }}
                                        >
                                            Generar Hoja de Rendición
                                        </button>
                                    ) : (
                                        <div style={{ display: 'grid', gap: '16px', background: '#EFF6FF', padding: '20px', borderRadius: '12px', border: '1px solid #BFDBFE' }}>
                                            <h4 style={{ margin: 0, color: '#1E40AF' }}>Datos de Entrega</h4>
                                            <input type="text" placeholder="Entregado por (Tu nombre)" value={entrega} onChange={e => setEntrega(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #93C5FD' }} />
                                            <input type="text" placeholder="Recibido por (Nombre en Administración)" value={recibe} onChange={e => setRecibe(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #93C5FD' }} />
                                            <textarea placeholder="Notas u observaciones (opcional)" value={notas} onChange={e => setNotas(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #93C5FD', minHeight: '80px' }} />
                                            
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <button onClick={() => setShowRendicionForm(false)} style={{ flex: 1, background: 'white', color: '#475569', border: '1px solid #CBD5E1', padding: '12px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
                                                    Cancelar
                                                </button>
                                                <button onClick={handleEmitirRendicion} style={{ flex: 2, background: '#3B82F6', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                    <Printer size={18} /> Confirmar e Imprimir Rendición
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            
            {/* Oculto para impresión */}
            <div style={{ display: 'none' }}>
                <PrintGarantias ref={printRef} data={rendicionData} />
            </div>
        </div>
    );
}
