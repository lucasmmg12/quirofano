import { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Search, FileText, RefreshCw, Archive, 
    Trash2, AlertTriangle, Scale, History, Printer, Shield, ChevronDown, Link, Check
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import PrintGarantias from './PrintGarantias';
import { 
    fetchGarantias, toggleCarritoRendicion, emitirRendicion, 
    cambiarEstadoGarantia, fetchHistorialGarantia 
} from '../services/garantiasService';

export default function GarantiasPanel({ addToast, currentUser, garantiasData = null, onRefresh = null }) {
    const [garantias, setGarantias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEstado, setFilterEstado] = useState('Todas');
    const [filterUbicacion, setFilterUbicacion] = useState('Todas');
    const [copied, setCopied] = useState(false);
    
    // Historial Modal
    const [showHistorial, setShowHistorial] = useState(false);
    const [selectedHistorial, setSelectedHistorial] = useState([]);
    const [historialLoading, setHistorialLoading] = useState(false);
    
    // Historial Modal
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
        if (garantiasData) {
            setGarantias(garantiasData);
            setLoading(false);
        } else {
            loadData();
        }
    }, [garantiasData]);

    const copyLink = () => {
        const url = `${window.location.origin}/recepcion/garantias`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        addToast('Link copiado al portapapeles', 'success');
    };
    
    const filteredGarantias = useMemo(() => {
        return garantias.filter(g => {
            const matchSearch = (
                (g.paciente || g.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (g.dni || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (g.cliente || g.obra_social || '').toLowerCase().includes(searchTerm.toLowerCase())
            );
            const matchEstado = filterEstado === 'Todas' || g.garantia_estado === filterEstado;
            const matchUbicacion = filterUbicacion === 'Todas' || g.garantia_ubicacion === filterUbicacion;
            return matchSearch && matchEstado && matchUbicacion;
        });
    }, [garantias, searchTerm, filterEstado, filterUbicacion]);

    // Actions

    const handleChangeEstado = async (surgeryId, nuevoEstado) => {
        if (!window.confirm(`¿Seguro que deseas cambiar el estado a "${nuevoEstado}"?`)) return;
        try {
            await cambiarEstadoGarantia(surgeryId, { garantia_estado: nuevoEstado }, currentUser?.nombre || currentUser?.usuario, 'Cambio de Estado');
            setGarantias(prev => prev.map(g => g.id === surgeryId ? { ...g, garantia_estado: nuevoEstado } : g));
            addToast('Estado actualizado correctamente', 'success');
            if (onRefresh) onRefresh();
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

    return (
        <div style={{ minHeight: '100%', background: '#F8FAFC', padding: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--neutral-800)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Shield color="var(--primary-600)" />
                        Gestión de Garantías
                    </h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--neutral-500)', fontSize: '0.9rem' }}>
                        Supervisión y trazabilidad de pagarés físicos
                    </p>
                </div>
                
                <button 
                    onClick={copyLink}
                    style={{
                        background: 'white', color: copied ? '#10B981' : '#4F46E5', border: `1px solid ${copied ? '#34D399' : '#C7D2FE'}`,
                        padding: '8px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        transition: 'all 0.2s'
                    }}
                >
                    {copied ? <Check size={18} /> : <Link size={18} />}
                    {copied ? '¡Copiado!' : 'Copiar Link para Recepción'}
                </button>
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
                    <option value="Entregado a Paciente">Entregado a Paciente</option>
                    <option value="Destruida">Destruida</option>
                </select>
                <button 
                    onClick={() => { if (onRefresh) onRefresh(); else loadData(); }}
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
                                        <div style={{ fontWeight: 600, color: 'var(--neutral-800)' }}>{g.paciente}</div>
                                        <div style={{ color: 'var(--neutral-500)', fontSize: '0.75rem' }}>DNI: {g.dni} | Ingreso: {g.fecha_ingreso ? new Date(g.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-AR') : '-'}</div>
                                    </td>
                                    <td style={{ padding: '12px', color: 'var(--neutral-600)' }}>{g.cliente}</td>
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
                                                g.garantia_estado === 'Destruida' ? '#fee2e2' : 
                                                g.garantia_estado === 'Entregado a Paciente' ? '#dbeafe' : '#fef9c3',
                                            color: 
                                                g.garantia_estado === 'Activa' ? '#166534' : 
                                                g.garantia_estado === 'Archivada' ? '#374151' : 
                                                g.garantia_estado === 'Gestión Judicial' ? '#854d0e' : 
                                                g.garantia_estado === 'Destruida' ? '#991b1b' : 
                                                g.garantia_estado === 'Entregado a Paciente' ? '#1e40af' : '#854d0e'
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
                                                <option value="Entregado a Paciente">Entregado a Paciente</option>
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

        </div>
    );
}
