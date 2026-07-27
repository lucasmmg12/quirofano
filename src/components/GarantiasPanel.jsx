import { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Search, FileText, ShoppingCart, RefreshCw, Archive, 
    Trash2, AlertTriangle, Scale, History, Printer, Shield, ChevronDown 
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import PrintGarantias from './PrintGarantias';
import { 
    fetchGarantias, toggleCarritoRendicion, emitirRendicion, 
    cambiarEstadoGarantia, fetchHistorialGarantia 
} from '../services/garantiasService';

export default function GarantiasPanel({ addToast, currentUser }) {
    const [garantias, setGarantias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEstado, setFilterEstado] = useState('Todas');
    const [filterUbicacion, setFilterUbicacion] = useState('Todas');
    
    // Historial Modal
    const [showHistorial, setShowHistorial] = useState(false);
    const [selectedHistorial, setSelectedHistorial] = useState([]);
    const [historialLoading, setHistorialLoading] = useState(false);
    
    // Impresión
    const printRef = useRef();
    const [rendicionData, setRendicionData] = useState(null);

    // Initial load
    const loadData = async () => {
        setLoading(true);
        try {
            const data = await fetchGarantias();
            setGarantias(data);
        } catch (error) {
            console.error(error);
            addToast('Error al cargar garantías', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const cartItems = useMemo(() => garantias.filter(g => g.en_carrito_rendicion), [garantias]);
    
    const filteredGarantias = useMemo(() => {
        return garantias.filter(g => {
            const matchSearch = (
                (g.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (g.dni || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (g.obra_social || '').toLowerCase().includes(searchTerm.toLowerCase())
            );
            const matchEstado = filterEstado === 'Todas' || g.garantia_estado === filterEstado;
            const matchUbicacion = filterUbicacion === 'Todas' || g.garantia_ubicacion === filterUbicacion;
            return matchSearch && matchEstado && matchUbicacion;
        });
    }, [garantias, searchTerm, filterEstado, filterUbicacion]);

    // Actions
    const handleToggleCart = async (surgeryId, currentCartState) => {
        try {
            await toggleCarritoRendicion(surgeryId, !currentCartState, currentUser?.nombre || currentUser?.usuario);
            // Optimistic update
            setGarantias(prev => prev.map(g => g.id === surgeryId ? { ...g, en_carrito_rendicion: !currentCartState } : g));
            addToast(!currentCartState ? 'Garantía agregada al carrito' : 'Garantía quitada del carrito', 'success');
        } catch (error) {
            addToast('Error al actualizar carrito', 'error');
        }
    };

    const handleChangeEstado = async (surgeryId, nuevoEstado) => {
        if (!window.confirm(`¿Seguro que deseas cambiar el estado a "${nuevoEstado}"?`)) return;
        try {
            await cambiarEstadoGarantia(surgeryId, { garantia_estado: nuevoEstado }, currentUser?.nombre || currentUser?.usuario, 'Cambio de Estado');
            setGarantias(prev => prev.map(g => g.id === surgeryId ? { ...g, garantia_estado: nuevoEstado } : g));
            addToast('Estado actualizado correctamente', 'success');
        } catch (error) {
            addToast('Error al actualizar estado', 'error');
        }
    };

    const handleViewHistory = async (surgeryId) => {
        setShowHistorial(true);
        setHistorialLoading(true);
        try {
            const history = await fetchHistorialGarantia(surgeryId);
            setSelectedHistorial(history);
        } catch (error) {
            addToast('Error al cargar historial', 'error');
        } finally {
            setHistorialLoading(false);
        }
    };

    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: 'Rendicion_Garantias',
        onAfterPrint: () => {
            setRendicionData(null);
            loadData(); // Recargar para actualizar los estados a "Administración"
        }
    });

    const handleEmitirRendicion = async () => {
        if (cartItems.length === 0) return;
        if (!window.confirm(`Estás por emitir una rendición con ${cartItems.length} garantías que se transferirán a Administración. ¿Continuar?`)) return;
        
        try {
            const rendicion = await emitirRendicion(cartItems.map(g => g.id), currentUser?.nombre || currentUser?.usuario, currentUser?.nombre || currentUser?.usuario);
            addToast('Rendición emitida correctamente', 'success');
            setRendicionData({ info: rendicion, items: cartItems });
            setTimeout(() => {
                handlePrint();
            }, 500);
        } catch (error) {
            console.error(error);
            addToast('Error al emitir rendición', 'error');
        }
    };

    return (
        <div className="animate-fade-in" style={{ padding: '24px' }}>
            {/* Cabecera */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--neutral-800)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Shield style={{ color: 'var(--primary-600)' }} />
                        Gestión de Garantías (Pagarés)
                    </h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--neutral-500)', fontSize: '0.9rem' }}>
                        Trazabilidad física y administrativa de los documentos de compromiso de pago.
                    </p>
                </div>
                
                {/* Carrito Resumen */}
                {cartItems.length > 0 && (
                    <div style={{ 
                        background: 'var(--primary-50)', border: '1px solid var(--primary-200)',
                        padding: '12px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px' 
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-700)', fontWeight: 600 }}>
                            <ShoppingCart size={20} />
                            {cartItems.length} en carrito
                        </div>
                        <button 
                            onClick={handleEmitirRendicion}
                            style={{
                                background: 'var(--primary-600)', color: 'white', border: 'none',
                                padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            <Printer size={16} /> Emitir Rendición
                        </button>
                    </div>
                )}
            </div>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid var(--neutral-200)' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--neutral-400)' }} />
                    <input 
                        type="text" 
                        placeholder="Buscar por nombre, DNI u Obra Social..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '8px', border: '1px solid var(--neutral-300)' }}
                    />
                </div>
                <select 
                    value={filterUbicacion} 
                    onChange={e => setFilterUbicacion(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--neutral-300)' }}
                >
                    <option value="Todas">Todas las ubicaciones</option>
                    <option value="Recepción">Recepción</option>
                    <option value="Administración">Administración</option>
                </select>
                <select 
                    value={filterEstado} 
                    onChange={e => setFilterEstado(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--neutral-300)' }}
                >
                    <option value="Todas">Todos los estados</option>
                    <option value="Activa">Activa</option>
                    <option value="Archivada">Archivada</option>
                    <option value="Separada para Deuda">Separada para Deuda</option>
                    <option value="Gestión Judicial">Gestión Judicial</option>
                    <option value="Destruida">Destruida</option>
                </select>
                <button 
                    onClick={loadData}
                    style={{ padding: '8px', background: 'var(--neutral-100)', border: '1px solid var(--neutral-300)', borderRadius: '8px', cursor: 'pointer' }}
                    title="Actualizar datos"
                >
                    <RefreshCw size={18} color="var(--neutral-600)" />
                </button>
            </div>

            {/* Tabla */}
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid var(--neutral-200)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ background: 'var(--neutral-50)', borderBottom: '1px solid var(--neutral-200)' }}>
                            <th style={{ padding: '12px', textAlign: 'left', color: 'var(--neutral-500)', fontWeight: 600 }}>Paciente / Internación</th>
                            <th style={{ padding: '12px', textAlign: 'left', color: 'var(--neutral-500)', fontWeight: 600 }}>Obra Social</th>
                            <th style={{ padding: '12px', textAlign: 'left', color: 'var(--neutral-500)', fontWeight: 600 }}>Ubicación</th>
                            <th style={{ padding: '12px', textAlign: 'left', color: 'var(--neutral-500)', fontWeight: 600 }}>Estado Administrativo</th>
                            <th style={{ padding: '12px', textAlign: 'right', color: 'var(--neutral-500)', fontWeight: 600 }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-400)' }}>Cargando...</td></tr>
                        ) : filteredGarantias.length === 0 ? (
                            <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-400)' }}>No se encontraron garantías que coincidan con los filtros.</td></tr>
                        ) : (
                            filteredGarantias.map(g => (
                                <tr key={g.id} style={{ borderBottom: '1px solid var(--neutral-100)', background: g.en_carrito_rendicion ? 'var(--primary-50)' : 'transparent' }}>
                                    <td style={{ padding: '12px' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--neutral-800)' }}>{g.nombre}</div>
                                        <div style={{ color: 'var(--neutral-500)', fontSize: '0.75rem' }}>DNI: {g.dni} | Ingreso: {g.fecha_cirugia ? new Date(g.fecha_cirugia + 'T12:00:00').toLocaleDateString('es-AR') : '-'}</div>
                                    </td>
                                    <td style={{ padding: '12px', color: 'var(--neutral-600)' }}>{g.obra_social}</td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{ 
                                            padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                                            background: g.garantia_ubicacion === 'Administración' ? '#dbeafe' : '#f3f4f6',
                                            color: g.garantia_ubicacion === 'Administración' ? '#1e40af' : '#4b5563'
                                        }}>
                                            {g.garantia_ubicacion || 'Recepción'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{ 
                                            padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                                            background: 
                                                g.garantia_estado === 'Activa' ? '#dcfce7' : 
                                                g.garantia_estado === 'Archivada' ? '#f3f4f6' : 
                                                g.garantia_estado === 'Gestión Judicial' ? '#fef08a' : 
                                                g.garantia_estado === 'Destruida' ? '#fee2e2' : '#fef9c3',
                                            color: 
                                                g.garantia_estado === 'Activa' ? '#166534' : 
                                                g.garantia_estado === 'Archivada' ? '#374151' : 
                                                g.garantia_estado === 'Gestión Judicial' ? '#854d0e' : 
                                                g.garantia_estado === 'Destruida' ? '#991b1b' : '#854d0e'
                                        }}>
                                            {g.garantia_estado || 'Activa'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button 
                                                onClick={() => handleViewHistory(g.id)}
                                                title="Ver Historial"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)' }}
                                            >
                                                <History size={18} />
                                            </button>
                                            
                                            {/* Selector rápido de estado */}
                                            <select
                                                value=""
                                                onChange={(e) => handleChangeEstado(g.id, e.target.value)}
                                                style={{ border: '1px solid var(--neutral-200)', borderRadius: '4px', padding: '2px', fontSize: '0.75rem', background: 'transparent' }}
                                            >
                                                <option value="" disabled>Cambiar Estado...</option>
                                                <option value="Activa">Activa</option>
                                                <option value="Archivada">Archivada</option>
                                                <option value="Separada para Deuda">Separada para Deuda</option>
                                                <option value="Gestión Judicial">Gestión Judicial</option>
                                                <option value="Destruida">Destruida</option>
                                            </select>

                                            {/* Botón Carrito */}
                                            {g.garantia_ubicacion === 'Recepción' && (
                                                <button 
                                                    onClick={() => handleToggleCart(g.id, g.en_carrito_rendicion)}
                                                    style={{ 
                                                        background: g.en_carrito_rendicion ? 'var(--primary-600)' : 'transparent',
                                                        border: `1px solid ${g.en_carrito_rendicion ? 'var(--primary-600)' : 'var(--neutral-300)'}`,
                                                        color: g.en_carrito_rendicion ? 'white' : 'var(--neutral-600)',
                                                        borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                                                        display: 'flex', alignItems: 'center', gap: '4px'
                                                    }}
                                                >
                                                    {g.en_carrito_rendicion ? 'En Carrito' : 'A Rendir'}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal Historial */}
            {showHistorial && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: 'white', borderRadius: '12px', width: '500px', maxWidth: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid var(--neutral-200)', display: 'flex', justifyContent: 'space-between' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <History size={20} /> Historial de Garantía
                            </h3>
                            <button onClick={() => setShowHistorial(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                            {historialLoading ? (
                                <p>Cargando historial...</p>
                            ) : selectedHistorial.length === 0 ? (
                                <p style={{ color: 'var(--neutral-500)', textAlign: 'center' }}>No hay movimientos registrados.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {selectedHistorial.map((h, i) => (
                                        <div key={i} style={{ padding: '12px', background: 'var(--neutral-50)', borderRadius: '8px', borderLeft: '4px solid var(--primary-400)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <strong style={{ fontSize: '0.85rem' }}>{h.tipo_movimiento}</strong>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--neutral-500)' }}>
                                                    {new Date(h.fecha_movimiento).toLocaleString('es-AR')}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--neutral-600)' }}>
                                                <div><strong>Usuario:</strong> {h.usuario}</div>
                                                <div><strong>Estado:</strong> {h.estado_vigente}</div>
                                                <div><strong>Ubicación:</strong> {h.origen} &rarr; {h.destino}</div>
                                                {h.observaciones && <div style={{ marginTop: '4px', fontStyle: 'italic' }}>"{h.observaciones}"</div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Print Component (Hidden) */}
            <PrintGarantias 
                ref={printRef} 
                items={rendicionData?.items || []} 
                rendicionInfo={rendicionData?.info} 
            />
        </div>
    );
}
