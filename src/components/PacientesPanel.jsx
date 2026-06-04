/**
 * PacientesPanel.jsx — Vista 360° de Pacientes
 * Listado paginado + ficha detalle consolidando 7+ tablas
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Users, Search, X, Plus, ChevronLeft, ChevronRight, Loader2,
    Stethoscope, DollarSign, ClipboardCheck, Activity, Microscope,
    FileText, Phone, Mail, User, Building2, Calendar, AlertCircle,
    CheckCircle, Edit3, Save, Hash, Heart,
} from 'lucide-react';
import {
    fetchPacientes, fetchPacienteDetalle, fetchPacienteStats,
    createPaciente, updatePaciente,
} from '../services/pacienteUnificadoService';

// ─── Helpers ───
function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function statusColor(status) {
    const map = {
        lila: { bg: '#F3E8FF', color: '#7C3AED', label: 'Pendiente' },
        amarillo: { bg: '#FFFBEB', color: '#D97706', label: 'En revisión' },
        verde: { bg: '#ECFDF5', color: '#059669', label: 'Autorizado' },
        azul: { bg: '#EFF6FF', color: '#2563EB', label: 'Confirmado' },
        rojo: { bg: '#FEF2F2', color: '#DC2626', label: 'Problema' },
    };
    return map[status] || { bg: '#F3F4F6', color: '#6B7280', label: status || '—' };
}

function categoriaBadge(cat) {
    const map = {
        sin_gestionar: { bg: '#F3F4F6', color: '#6B7280', label: 'Sin gestionar' },
        en_gestion: { bg: '#FEF3C7', color: '#D97706', label: 'En gestión' },
        comprometido: { bg: '#DBEAFE', color: '#2563EB', label: 'Comprometido' },
        incobrable: { bg: '#FEE2E2', color: '#DC2626', label: 'Incobrable' },
    };
    return map[cat] || { bg: '#F3F4F6', color: '#6B7280', label: cat || '—' };
}

// ─── MAIN COMPONENT ───
export default function PacientesPanel({ addToast, currentUser }) {
    const [view, setView] = useState('list'); // list | detail
    const [pacientes, setPacientes] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [selectedPaciente, setSelectedPaciente] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [detalleLoading, setDetalleLoading] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState({});
    const [saving, setSaving] = useState(false);
    const searchTimer = useRef(null);
    const PAGE_SIZE = 50;

    // ─── Load list ───
    const loadList = useCallback(async () => {
        setLoading(true);
        try {
            const [result, s] = await Promise.all([
                fetchPacientes({ page, pageSize: PAGE_SIZE, search }),
                fetchPacienteStats(),
            ]);
            setPacientes(result.data);
            setTotalCount(result.count);
            setStats(s);
        } catch (e) {
            console.error('[PacientesPanel]', e);
            addToast?.('Error al cargar pacientes', 'error');
        } finally {
            setLoading(false);
        }
    }, [page, search, addToast]);

    useEffect(() => { loadList(); }, [loadList]);

    // ─── Open detail ───
    const openDetail = useCallback(async (pac) => {
        setSelectedPaciente(pac);
        setView('detail');
        setDetalleLoading(true);
        setEditMode(false);
        try {
            const d = await fetchPacienteDetalle(pac);
            setDetalle(d);
        } catch (e) {
            console.error('[PacientesPanel] detalle error:', e);
            addToast?.('Error al cargar ficha', 'error');
        } finally {
            setDetalleLoading(false);
        }
    }, [addToast]);

    // ─── Search handler ───
    const handleSearch = (val) => {
        setSearch(val);
        setPage(0);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => loadList(), 400);
    };

    // ─── Save edits ───
    const handleSaveEdit = useCallback(async () => {
        if (!selectedPaciente) return;
        setSaving(true);
        try {
            const updated = await updatePaciente(selectedPaciente.id_paciente, editData);
            setSelectedPaciente({ ...selectedPaciente, ...updated });
            setEditMode(false);
            addToast?.('Paciente actualizado', 'success');
            loadList();
        } catch (e) {
            addToast?.('Error: ' + e.message, 'error');
        } finally {
            setSaving(false);
        }
    }, [selectedPaciente, editData, addToast, loadList]);

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    // ═══════ LIST VIEW ═══════
    if (view === 'list') {
        return (
            <div className="content no-print view-transition-enter" style={{ maxWidth: '1200px', margin: '0 auto' }}>

                {/* Stats */}
                {stats && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                        {[
                            { label: 'Total Pacientes', value: stats.totalPacientes.toLocaleString(), icon: Users, color: '#6366F1', bg: '#EEF2FF' },
                            { label: 'Con Teléfono', value: stats.conTelefono.toLocaleString(), icon: Phone, color: '#10B981', bg: '#ECFDF5' },
                            { label: 'Creados Manual', value: stats.manuales, icon: Edit3, color: '#F59E0B', bg: '#FFFBEB' },
                            { label: 'Con Deuda Activa', value: stats.conDeuda, icon: DollarSign, color: '#EF4444', bg: '#FEF2F2' },
                        ].map((s, i) => (
                            <div key={i} style={{
                                background: 'var(--neutral-0)', borderRadius: '16px',
                                border: '1px solid var(--neutral-200)', padding: '18px',
                                boxShadow: 'var(--shadow-sm)',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <s.icon size={18} style={{ color: s.color }} />
                                    </div>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--neutral-500)' }}>{s.label}</span>
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--neutral-800)', letterSpacing: '-0.02em' }}>
                                    {s.value}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 14px', borderRadius: '10px',
                        border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                        flex: '1 1 300px', minWidth: '200px',
                    }}>
                        <Search size={16} style={{ color: 'var(--neutral-400)', flexShrink: 0 }} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, DNI o NHC..."
                            value={search}
                            onChange={e => handleSearch(e.target.value)}
                            style={{
                                border: 'none', outline: 'none', background: 'transparent',
                                fontSize: '0.82rem', color: 'var(--neutral-700)', width: '100%', fontFamily: 'inherit',
                            }}
                        />
                        {search && (
                            <button onClick={() => handleSearch('')} style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--neutral-400)', display: 'flex', padding: 0,
                            }}>
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setShowCreateModal(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '9px 20px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                            border: 'none', color: '#fff', fontSize: '0.82rem', fontWeight: 700,
                            cursor: 'pointer', transition: 'all 0.2s',
                            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                        }}
                    >
                        <Plus size={16} />
                        Nuevo Paciente
                    </button>
                </div>

                {/* Table */}
                <div style={{
                    background: 'var(--neutral-0)', borderRadius: '16px',
                    border: '1px solid var(--neutral-200)', overflow: 'hidden',
                    boxShadow: 'var(--shadow-sm)',
                }}>
                    {loading ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--neutral-400)' }}>
                            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
                            <p style={{ marginTop: '8px', fontSize: '0.85rem' }}>Cargando pacientes...</p>
                        </div>
                    ) : pacientes.length === 0 ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--neutral-400)' }}>
                            <Users size={48} strokeWidth={1.2} style={{ marginBottom: '12px' }} />
                            <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>{search ? 'Sin resultados' : 'Sin pacientes'}</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--neutral-50)', borderBottom: '1px solid var(--neutral-200)' }}>
                                            {['Nombre', 'DNI', 'NHC', 'Edad', 'Sexo', 'Centro', 'Teléfono'].map(h => (
                                                <th key={h} style={{
                                                    padding: '10px 14px', textAlign: 'left', fontWeight: 700,
                                                    color: 'var(--neutral-500)', fontSize: '0.72rem', textTransform: 'uppercase',
                                                    letterSpacing: '0.04em', whiteSpace: 'nowrap',
                                                }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pacientes.map(p => (
                                            <tr
                                                key={p.id_paciente}
                                                onClick={() => openDetail(p)}
                                                style={{
                                                    borderBottom: '1px solid var(--neutral-100)',
                                                    cursor: 'pointer', transition: 'background 0.15s',
                                                }}
                                                onMouseOver={e => e.currentTarget.style.background = '#F8FAFF'}
                                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--neutral-800)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {p.nombre}
                                                        {p.manual && (
                                                            <span style={{
                                                                fontSize: '0.6rem', padding: '1px 6px', borderRadius: '4px',
                                                                background: '#FFFBEB', color: '#D97706', fontWeight: 700,
                                                            }}>MANUAL</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 14px', color: 'var(--neutral-600)', fontFamily: 'monospace', fontSize: '0.76rem' }}>{p.dni || '—'}</td>
                                                <td style={{ padding: '10px 14px', color: 'var(--neutral-500)' }}>{p.nhc || '—'}</td>
                                                <td style={{ padding: '10px 14px', color: 'var(--neutral-500)' }}>{p.edad || '—'}</td>
                                                <td style={{ padding: '10px 14px', color: 'var(--neutral-500)' }}>{p.sexo || '—'}</td>
                                                <td style={{ padding: '10px 14px', color: 'var(--neutral-500)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.centro || '—'}</td>
                                                <td style={{ padding: '10px 14px', color: p.telefono ? 'var(--neutral-600)' : 'var(--neutral-300)' }}>{p.telefono || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '12px 16px', borderTop: '1px solid var(--neutral-100)',
                                fontSize: '0.75rem', color: 'var(--neutral-500)',
                            }}>
                                <span>
                                    Mostrando {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount.toLocaleString()}
                                </span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        disabled={page === 0}
                                        onClick={() => setPage(p => p - 1)}
                                        style={{
                                            padding: '6px 10px', borderRadius: '6px',
                                            border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                                            cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1,
                                        }}
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontWeight: 700 }}>
                                        {page + 1} / {totalPages || 1}
                                    </span>
                                    <button
                                        disabled={page >= totalPages - 1}
                                        onClick={() => setPage(p => p + 1)}
                                        style={{
                                            padding: '6px 10px', borderRadius: '6px',
                                            border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                                            cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                                            opacity: page >= totalPages - 1 ? 0.4 : 1,
                                        }}
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Create Modal */}
                {showCreateModal && (
                    <CreatePacienteModal
                        onClose={() => setShowCreateModal(false)}
                        onCreated={() => { setShowCreateModal(false); loadList(); }}
                        addToast={addToast}
                    />
                )}
            </div>
        );
    }

    // ═══════ DETAIL VIEW (FICHA 360°) ═══════
    const pac = selectedPaciente;
    return (
        <div className="content no-print view-transition-enter" style={{ maxWidth: '1100px', margin: '0 auto' }}>

            {/* Back button */}
            <button
                onClick={() => { setView('list'); setSelectedPaciente(null); setDetalle(null); }}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: '10px',
                    border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                    fontSize: '0.82rem', fontWeight: 600, color: 'var(--neutral-600)',
                    cursor: 'pointer', marginBottom: '16px',
                }}
            >
                <ChevronLeft size={16} /> Volver al listado
            </button>

            {/* Patient header card */}
            <div style={{
                background: 'linear-gradient(135deg, #312E81 0%, #4F46E5 50%, #6366F1 100%)',
                borderRadius: '20px', padding: '28px', marginBottom: '20px',
                color: '#fff', position: 'relative', overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute', top: '-20px', right: '-20px',
                    width: '120px', height: '120px', borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)',
                }} />
                <div style={{
                    position: 'absolute', bottom: '-30px', right: '60px',
                    width: '80px', height: '80px', borderRadius: '50%',
                    background: 'rgba(255,255,255,0.03)',
                }} />

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', position: 'relative', zIndex: 1 }}>
                    <div style={{
                        width: '64px', height: '64px', borderRadius: '16px',
                        background: 'rgba(255,255,255,0.15)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <User size={28} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                            {pac?.nombre}
                        </h2>
                        <div style={{ display: 'flex', gap: '20px', marginTop: '10px', flexWrap: 'wrap', fontSize: '0.82rem', opacity: 0.9 }}>
                            {pac?.dni && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Hash size={14} /> DNI: {pac.dni}</span>}
                            {pac?.nhc && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><FileText size={14} /> NHC: {pac.nhc}</span>}
                            {pac?.edad && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Calendar size={14} /> Edad: {pac.edad}</span>}
                            {pac?.sexo && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Heart size={14} /> {pac.sexo}</span>}
                            {pac?.centro && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Building2 size={14} /> {pac.centro}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '20px', marginTop: '6px', flexWrap: 'wrap', fontSize: '0.78rem', opacity: 0.75 }}>
                            {pac?.telefono && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Phone size={13} /> {pac.telefono}</span>}
                            {pac?.email && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Mail size={13} /> {pac.email}</span>}
                        </div>
                    </div>
                    <button
                        onClick={() => { setEditMode(!editMode); setEditData({ telefono: pac?.telefono || '', email: pac?.email || '', nhc: pac?.nhc || '', notas: pac?.notas || '' }); }}
                        style={{
                            padding: '8px 16px', borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)',
                            color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                        }}
                    >
                        <Edit3 size={14} style={{ marginRight: '4px' }} /> Editar
                    </button>
                </div>

                {/* Edit inline */}
                {editMode && (
                    <div style={{
                        marginTop: '16px', padding: '16px', borderRadius: '12px',
                        background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)',
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px',
                    }}>
                        {[
                            { key: 'telefono', label: 'Teléfono', placeholder: '5492645...' },
                            { key: 'email', label: 'Email', placeholder: 'paciente@email.com' },
                            { key: 'nhc', label: 'NHC', placeholder: 'Nro Historia Clínica' },
                        ].map(f => (
                            <div key={f.key}>
                                <label style={{ fontSize: '0.68rem', fontWeight: 700, opacity: 0.8, display: 'block', marginBottom: '3px' }}>{f.label}</label>
                                <input
                                    value={editData[f.key] || ''}
                                    onChange={e => setEditData(prev => ({ ...prev, [f.key]: e.target.value }))}
                                    placeholder={f.placeholder}
                                    style={{
                                        width: '100%', padding: '7px 10px', borderRadius: '8px',
                                        border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.15)',
                                        color: '#fff', fontSize: '0.78rem', fontFamily: 'inherit',
                                        outline: 'none',
                                    }}
                                />
                            </div>
                        ))}
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ fontSize: '0.68rem', fontWeight: 700, opacity: 0.8, display: 'block', marginBottom: '3px' }}>Notas</label>
                            <textarea
                                value={editData.notas || ''}
                                onChange={e => setEditData(prev => ({ ...prev, notas: e.target.value }))}
                                rows={2}
                                style={{
                                    width: '100%', padding: '7px 10px', borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.15)',
                                    color: '#fff', fontSize: '0.78rem', fontFamily: 'inherit',
                                    outline: 'none', resize: 'vertical',
                                }}
                            />
                        </div>
                        <div style={{ gridColumn: 'span 2', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setEditMode(false)} style={{
                                padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.3)',
                                background: 'transparent', color: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                            }}>Cancelar</button>
                            <button onClick={handleSaveEdit} disabled={saving} style={{
                                padding: '6px 14px', borderRadius: '8px', border: 'none',
                                background: '#10B981', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '5px',
                            }}>
                                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                                Guardar
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Detalle sections */}
            {detalleLoading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--neutral-400)' }}>
                    <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
                    <p style={{ marginTop: '8px', fontSize: '0.85rem' }}>Cargando ficha 360°...</p>
                </div>
            ) : detalle && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* 🔪 Cirugías */}
                    <DetailSection
                        icon={Stethoscope} title="Cirugías" color="#8B5CF6" bg="#F5F3FF"
                        count={detalle.cirugias?.length || 0}
                    >
                        {detalle.cirugias?.length > 0 ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--neutral-100)' }}>
                                        {['Fecha', 'Médico', 'Módulo', 'Obra Social', 'Estado'].map(h => (
                                            <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--neutral-500)', fontSize: '0.68rem', textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {detalle.cirugias.map((c, i) => {
                                        const sc = statusColor(c.status);
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--neutral-50)' }}>
                                                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{formatDate(c.fecha_cirugia)}</td>
                                                <td style={{ padding: '8px 10px', color: 'var(--neutral-600)' }}>{c.medico || '—'}</td>
                                                <td style={{ padding: '8px 10px', color: 'var(--neutral-500)' }}>{c.modulo || '—'}</td>
                                                <td style={{ padding: '8px 10px', color: 'var(--neutral-500)' }}>{c.obra_social || '—'}</td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <span style={{ padding: '2px 8px', borderRadius: '6px', background: sc.bg, color: sc.color, fontWeight: 700, fontSize: '0.68rem' }}>{sc.label}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : <EmptyState label="cirugías" />}
                    </DetailSection>

                    {/* 💰 Deudas */}
                    <DetailSection
                        icon={DollarSign} title="Deudas" color="#EF4444" bg="#FEF2F2"
                        count={detalle.deudas ? 1 : 0}
                    >
                        {detalle.deudas ? (
                            <div>
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px', padding: '0 10px' }}>
                                    <div>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', fontWeight: 600 }}>Deuda Total</span>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#EF4444' }}>${detalle.deudas.deuda_total?.toLocaleString('es-AR')}</div>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', fontWeight: 600 }}>Facturas</span>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--neutral-800)' }}>{detalle.deudas.cantidad_facturas}</div>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', fontWeight: 600 }}>Categoría</span>
                                        {(() => { const cb = categoriaBadge(detalle.deudas.categoria); return (
                                            <div style={{ marginTop: '4px' }}>
                                                <span style={{ padding: '3px 10px', borderRadius: '6px', background: cb.bg, color: cb.color, fontWeight: 700, fontSize: '0.72rem' }}>{cb.label}</span>
                                            </div>
                                        ); })()}
                                    </div>
                                </div>
                                {detalle.deudas.facturas?.length > 0 && (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--neutral-100)' }}>
                                                {['Código', 'Fecha', 'Total', 'Pendiente', 'Servicio'].map(h => (
                                                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--neutral-400)', fontSize: '0.65rem', textTransform: 'uppercase' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detalle.deudas.facturas.map((f, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--neutral-50)' }}>
                                                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{f.codigo}</td>
                                                    <td style={{ padding: '6px 10px' }}>{formatDate(f.fecha_factura)}</td>
                                                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>${f.total?.toLocaleString('es-AR')}</td>
                                                    <td style={{ padding: '6px 10px', color: '#EF4444', fontWeight: 700 }}>${f.pendiente?.toLocaleString('es-AR')}</td>
                                                    <td style={{ padding: '6px 10px', color: 'var(--neutral-500)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.servicio || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        ) : <EmptyState label="deudas" />}
                    </DetailSection>

                    {/* 🏥 Altas */}
                    <DetailSection
                        icon={ClipboardCheck} title="Altas Administrativas" color="#2563EB" bg="#EFF6FF"
                        count={detalle.altas?.length || 0}
                    >
                        {detalle.altas?.length > 0 ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--neutral-100)' }}>
                                        {['Admisión', 'Ingreso', 'Alta', 'Especialidad', 'Doctor', 'Estado'].map(h => (
                                            <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--neutral-500)', fontSize: '0.68rem', textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {detalle.altas.map((a, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--neutral-50)' }}>
                                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{a.numero_admision || '—'}</td>
                                            <td style={{ padding: '8px 10px' }}>{formatDate(a.fecha_ingreso)}</td>
                                            <td style={{ padding: '8px 10px' }}>{formatDate(a.fecha_alta)}</td>
                                            <td style={{ padding: '8px 10px', color: 'var(--neutral-600)' }}>{a.especialidad || '—'}</td>
                                            <td style={{ padding: '8px 10px', color: 'var(--neutral-500)' }}>{a.doctor || '—'}</td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <span style={{ padding: '2px 8px', borderRadius: '6px', background: '#EEF2FF', color: '#4F46E5', fontWeight: 700, fontSize: '0.68rem' }}>{a.estado}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <EmptyState label="altas administrativas" />}
                    </DetailSection>

                    {/* 🩺 Consultas Guardia */}
                    <DetailSection
                        icon={Activity} title="Consultas de Guardia" color="#06B6D4" bg="#ECFEFF"
                        count={detalle.consultas?.length || 0}
                    >
                        {detalle.consultas?.length > 0 ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--neutral-100)' }}>
                                        {['Fecha', 'Especialidad', 'Agenda', 'Tipo', 'Obra Social'].map(h => (
                                            <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--neutral-500)', fontSize: '0.68rem', textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {detalle.consultas.map((c, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--neutral-50)' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{formatDate(c.fecha_visita)}</td>
                                            <td style={{ padding: '8px 10px', color: 'var(--neutral-600)' }}>{c.visita_especialidad || '—'}</td>
                                            <td style={{ padding: '8px 10px', color: 'var(--neutral-500)' }}>{c.agenda || '—'}</td>
                                            <td style={{ padding: '8px 10px', color: 'var(--neutral-500)' }}>{c.tipo_visita || '—'}</td>
                                            <td style={{ padding: '8px 10px', color: 'var(--neutral-500)' }}>{c.cliente || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <EmptyState label="consultas de guardia" />}
                    </DetailSection>

                    {/* 🔬 Laboratorios */}
                    <DetailSection
                        icon={Microscope} title="Anatomía Patológica" color="#10B981" bg="#ECFDF5"
                        count={detalle.laboratorios?.length || 0}
                    >
                        {detalle.laboratorios?.length > 0 ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--neutral-100)' }}>
                                        {['Fecha', 'Cliente', 'DNI'].map(h => (
                                            <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--neutral-500)', fontSize: '0.68rem', textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {detalle.laboratorios.map((l, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--neutral-50)' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{formatDate(l.fecha_visita)}</td>
                                            <td style={{ padding: '8px 10px', color: 'var(--neutral-600)' }}>{l.cliente || '—'}</td>
                                            <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{l.dni || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <EmptyState label="estudios de anatomía patológica" />}
                    </DetailSection>

                    {/* 📋 Presupuestos */}
                    <DetailSection
                        icon={FileText} title="Presupuestos" color="#F59E0B" bg="#FFFBEB"
                        count={detalle.presupuestos?.length || 0}
                    >
                        {detalle.presupuestos?.length > 0 ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--neutral-100)' }}>
                                        {['Fecha', 'Importe', 'Aceptado', 'NHC'].map(h => (
                                            <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--neutral-500)', fontSize: '0.68rem', textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {detalle.presupuestos.map((p, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--neutral-50)' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{formatDate(p.fecha)}</td>
                                            <td style={{ padding: '8px 10px', fontWeight: 700 }}>${p.importe_total?.toLocaleString('es-AR')}</td>
                                            <td style={{ padding: '8px 10px' }}>
                                                {p.aceptado ? (
                                                    <span style={{ padding: '2px 8px', borderRadius: '6px', background: '#ECFDF5', color: '#059669', fontWeight: 700, fontSize: '0.68rem' }}>Sí</span>
                                                ) : (
                                                    <span style={{ padding: '2px 8px', borderRadius: '6px', background: '#FEF2F2', color: '#DC2626', fontWeight: 700, fontSize: '0.68rem' }}>No</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 10px', color: 'var(--neutral-500)' }}>{p.nhc || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <EmptyState label="presupuestos" />}
                    </DetailSection>
                </div>
            )}
        </div>
    );
}


// ═══════ DETAIL SECTION COMPONENT ═══════
function DetailSection({ icon: Icon, title, color, bg, count, children }) {
    const [open, setOpen] = useState(count > 0);

    return (
        <div style={{
            background: 'var(--neutral-0)', borderRadius: '16px',
            border: '1px solid var(--neutral-200)', overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
        }}>
            <button
                onClick={() => setOpen(!open)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                    padding: '14px 18px', border: 'none', background: 'transparent',
                    cursor: 'pointer', textAlign: 'left',
                }}
            >
                <div style={{
                    width: '34px', height: '34px', borderRadius: '10px',
                    background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    <Icon size={17} style={{ color }} />
                </div>
                <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 700, color: 'var(--neutral-800)' }}>{title}</span>
                <span style={{
                    padding: '2px 10px', borderRadius: '10px',
                    background: count > 0 ? bg : 'var(--neutral-50)',
                    color: count > 0 ? color : 'var(--neutral-400)',
                    fontSize: '0.72rem', fontWeight: 700,
                }}>
                    {count}
                </span>
                <ChevronRight size={16} style={{
                    color: 'var(--neutral-400)',
                    transition: 'transform 0.2s',
                    transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                }} />
            </button>
            {open && (
                <div style={{ borderTop: '1px solid var(--neutral-100)', padding: count > 0 ? '0' : '16px 18px' }}>
                    {children}
                </div>
            )}
        </div>
    );
}


// ═══════ EMPTY STATE ═══════
function EmptyState({ label }) {
    return (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--neutral-400)', fontSize: '0.82rem' }}>
            Sin registros de {label}
        </div>
    );
}


// ═══════ CREATE PATIENT MODAL ═══════
function CreatePacienteModal({ onClose, onCreated, addToast }) {
    const [form, setForm] = useState({ nombre: '', dni: '', edad: '', sexo: '', email: '', centro: '', nhc: '', telefono: '', notas: '' });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async () => {
        if (!form.nombre.trim()) {
            addToast?.('El nombre es obligatorio', 'error');
            return;
        }
        setSaving(true);
        try {
            await createPaciente(form);
            addToast?.('Paciente creado correctamente', 'success');
            onCreated();
        } catch (e) {
            addToast?.('Error: ' + e.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const inputStyle = {
        width: '100%', padding: '8px 12px', borderRadius: '8px',
        border: '1px solid var(--neutral-200)', fontSize: '0.82rem',
        fontFamily: 'inherit', color: 'var(--neutral-700)', outline: 'none',
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '40px', animation: 'fadeIn 0.2s ease',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: 'var(--neutral-0)', borderRadius: '20px',
                    padding: '0', width: '520px', maxWidth: '95vw',
                    boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '20px 24px', borderBottom: '1px solid var(--neutral-100)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Plus size={18} style={{ color: '#fff' }} />
                        </div>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--neutral-800)' }}>Nuevo Paciente</span>
                    </div>
                    <button onClick={onClose} style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: 'var(--neutral-400)',
                    }}>
                        <X size={16} />
                    </button>
                </div>

                <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-600)', marginBottom: '4px' }}>Nombre *</label>
                        <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="APELLIDO NOMBRE" style={inputStyle} autoFocus />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-600)', marginBottom: '4px' }}>DNI</label>
                        <input value={form.dni} onChange={e => setForm(p => ({ ...p, dni: e.target.value }))} placeholder="12345678" style={inputStyle} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-600)', marginBottom: '4px' }}>NHC</label>
                        <input value={form.nhc} onChange={e => setForm(p => ({ ...p, nhc: e.target.value }))} placeholder="Historia Clínica" style={inputStyle} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-600)', marginBottom: '4px' }}>Teléfono</label>
                        <input value={form.telefono} onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))} placeholder="5492645..." style={inputStyle} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-600)', marginBottom: '4px' }}>Email</label>
                        <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="paciente@email.com" style={inputStyle} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-600)', marginBottom: '4px' }}>Edad</label>
                        <input value={form.edad} onChange={e => setForm(p => ({ ...p, edad: e.target.value }))} placeholder="45" style={inputStyle} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-600)', marginBottom: '4px' }}>Sexo</label>
                        <select value={form.sexo} onChange={e => setForm(p => ({ ...p, sexo: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                            <option value="">—</option>
                            <option value="M">Masculino</option>
                            <option value="F">Femenino</option>
                        </select>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-600)', marginBottom: '4px' }}>Notas</label>
                        <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} rows={2} placeholder="Observaciones..." style={{ ...inputStyle, resize: 'vertical' }} />
                    </div>
                </div>

                <div style={{ padding: '0 24px 24px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{
                        padding: '9px 20px', borderRadius: '10px',
                        border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                        fontSize: '0.82rem', fontWeight: 600, color: 'var(--neutral-600)', cursor: 'pointer',
                    }}>Cancelar</button>
                    <button onClick={handleSubmit} disabled={saving} style={{
                        padding: '9px 20px', borderRadius: '10px', border: 'none',
                        background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                        fontSize: '0.82rem', fontWeight: 700, color: '#fff', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '6px',
                        boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
                    }}>
                        {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
                        Crear Paciente
                    </button>
                </div>
            </div>
        </div>
    );
}
