import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Search, ShoppingCart, CheckCircle, PlusCircle, Trash2, Printer, 
    ArrowLeft, Calendar, User, FileText, Activity 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useReactToPrint } from 'react-to-print';
import PrintGarantias from './PrintGarantias';
import { toggleCarritoRendicion, emitirRendicion } from '../services/garantiasService';
import { Shield } from 'lucide-react';

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
                    id, paciente, id_paciente, cliente, fecha_ingreso, especialidad, numero_admision,
                    garantia_estado, garantia_ubicacion, en_carrito_rendicion
                `)
                .gte('fecha_ingreso', thirtyDaysAgo.toISOString().split('T')[0])
                .order('fecha_ingreso', { ascending: false });

            if (error) throw error;
            setAdmisiones((data || []).map(a => ({ ...a, dni: a.id_paciente })));
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
        <div style={{ minHeight: '100vh', background: 'var(--bg-main, #f0f4f8)', fontFamily: "'Inter', sans-serif" }}>
            {/* Header Público con estética del sistema */}
            <div style={{ 
                background: 'white', padding: '16px 24px', borderBottom: '1px solid var(--neutral-200)', 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                position: 'sticky', top: 0, zIndex: 10,
                boxShadow: 'var(--shadow-sm)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'var(--primary-100)', color: 'var(--primary-700)', padding: '8px', borderRadius: '8px' }}>
                        <Shield size={24} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--neutral-800)', fontWeight: 700 }}>
                            Portal Recepción
                        </h1>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--neutral-500)' }}>Gestión de Pagarés y Rendiciones</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <button 
                        onClick={() => setActiveTab('pendientes')}
                        style={{ 
                            background: activeTab === 'pendientes' ? 'var(--primary-100)' : 'transparent',
                            color: activeTab === 'pendientes' ? 'var(--primary-700)' : 'var(--neutral-500)',
                            border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <FileText size={18} /> Admisiones
                    </button>
                    <button 
                        onClick={() => setActiveTab('carrito')}
                        style={{ 
                            background: activeTab === 'carrito' ? 'var(--primary-100)' : 'transparent',
                            color: activeTab === 'carrito' ? 'var(--primary-700)' : 'var(--neutral-500)',
                            border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <ShoppingCart size={18} /> Carrito Rendición
                        {cartItems.length > 0 && (
                            <span style={{ background: 'var(--danger-500)', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
                                {cartItems.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
                {activeTab === 'pendientes' ? (
                    <div>
                        <div style={{ marginBottom: '24px', background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid var(--neutral-200)', display: 'flex', gap: '16px', boxShadow: 'var(--shadow-sm)' }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <Search size={20} style={{ position: 'absolute', left: '16px', top: '12px', color: 'var(--neutral-400)' }} />
                                <input 
                                    type="text"
                                    placeholder="Buscar paciente, DNI o número de admisión..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    style={{ 
                                        width: '100%', padding: '12px 16px 12px 44px', 
                                        borderRadius: '8px', border: '1px solid var(--neutral-300)',
                                        fontSize: '0.95rem', outline: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        {loading ? (
                            <p style={{ textAlign: 'center', color: 'var(--neutral-500)', padding: '40px' }}>Cargando admisiones recientes...</p>
                        ) : (
                            <div style={{ display: 'grid', gap: '12px' }}>
                                {filteredAdmisiones.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '12px', border: '1px dashed var(--neutral-300)' }}>
                                        <p style={{ color: 'var(--neutral-500)', margin: 0 }}>No hay admisiones que coincidan con la búsqueda.</p>
                                    </div>
                                ) : (
                                    filteredAdmisiones.map(adm => (
                                        <div key={adm.id} style={{ 
                                            background: adm.en_carrito_rendicion ? 'var(--success-50)' : 'white', 
                                            border: `1px solid ${adm.en_carrito_rendicion ? 'var(--success-300)' : 'var(--neutral-200)'}`, 
                                            padding: '16px', borderRadius: '12px',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            boxShadow: 'var(--shadow-sm)', transition: 'all 0.2s'
                                        }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--neutral-800)' }}>{adm.paciente}</h3>
                                                    <span style={{ fontSize: '0.75rem', background: 'var(--neutral-100)', color: 'var(--neutral-600)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                                        {adm.numero_admision}
                                                    </span>
                                                </div>
                                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--neutral-500)', display: 'flex', gap: '16px' }}>
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
                                                            background: 'white', color: 'var(--primary-600)', border: '1px solid var(--primary-300)',
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
                                                            background: 'var(--danger-50)', color: 'var(--danger-600)', border: '1px solid var(--danger-300)',
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
                                                            background: 'var(--primary-600)', color: 'white', border: 'none',
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
                        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid var(--neutral-200)', boxShadow: 'var(--shadow-sm)' }}>
                            <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--neutral-800)' }}>
                                <ShoppingCart size={24} color="var(--primary-600)"/> Carrito de Rendición
                            </h2>
                            
                            {cartItems.length === 0 ? (
                                <p style={{ color: 'var(--neutral-500)', textAlign: 'center', padding: '40px 0' }}>El carrito está vacío. Buscá admisiones y envialas al carrito para generar la rendición.</p>
                            ) : (
                                <div>
                                    <div style={{ background: 'var(--neutral-50)', borderRadius: '8px', border: '1px solid var(--neutral-200)', padding: '16px', marginBottom: '24px' }}>
                                        <h4 style={{ margin: '0 0 12px 0', color: 'var(--neutral-700)' }}>Garantías a rendir ({cartItems.length})</h4>
                                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '8px' }}>
                                            {cartItems.map(c => (
                                                <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--neutral-200)' }}>
                                                    <span><strong style={{color: 'var(--neutral-800)'}}>{c.paciente}</strong> <span style={{color: 'var(--neutral-500)', fontSize: '0.85rem'}}>— {c.cliente}</span></span>
                                                    <button onClick={() => handleToggleCart(c.id, false)} style={{ background: 'none', border: 'none', color: 'var(--danger-500)', cursor: 'pointer' }}><Trash2 size={16}/></button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    
                                    {!showRendicionForm ? (
                                        <button 
                                            onClick={() => setShowRendicionForm(true)}
                                            style={{ background: 'var(--success-500)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 600, width: '100%', cursor: 'pointer', fontSize: '1rem', boxShadow: 'var(--shadow-sm)' }}
                                        >
                                            Generar Hoja de Rendición
                                        </button>
                                    ) : (
                                        <div style={{ display: 'grid', gap: '16px', background: 'var(--primary-50)', padding: '20px', borderRadius: '12px', border: '1px solid var(--primary-200)' }}>
                                            <h4 style={{ margin: 0, color: 'var(--primary-800)' }}>Datos de Entrega</h4>
                                            <input type="text" placeholder="Entregado por (Tu nombre)" value={entrega} onChange={e => setEntrega(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--primary-300)', outline: 'none' }} />
                                            <input type="text" placeholder="Recibido por (Nombre en Administración)" value={recibe} onChange={e => setRecibe(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--primary-300)', outline: 'none' }} />
                                            <textarea placeholder="Notas u observaciones (opcional)" value={notas} onChange={e => setNotas(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--primary-300)', minHeight: '80px', outline: 'none', resize: 'vertical' }} />
                                            
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <button onClick={() => setShowRendicionForm(false)} style={{ flex: 1, background: 'white', color: 'var(--neutral-600)', border: '1px solid var(--neutral-300)', padding: '12px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
                                                    Cancelar
                                                </button>
                                                <button onClick={handleEmitirRendicion} style={{ flex: 2, background: 'var(--primary-600)', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: 'var(--shadow-sm)' }}>
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
