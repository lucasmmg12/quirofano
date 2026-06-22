/**
 * BoxManagerPanel.jsx — Panel de gestión de boxes para cola de turnos
 * Permite: asignar usuario, toggle on/off, configurar horarios de bloqueo
 * Se integra dentro de TurnoAdminPanel como sección colapsable
 */
import { useState, useEffect, useCallback } from 'react';
import {
    Monitor, Power, PowerOff, User, Clock, Plus,
    Trash2, ChevronDown, ChevronUp, RefreshCw, Shield,
    AlertTriangle, CheckCircle,
} from 'lucide-react';
import {
    fetchBoxes, toggleBoxActivo, asignarBox, liberarBox,
    fetchAllHorarios, addHorario, removeHorario, subscribeToBoxes,
} from '../services/boxService';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIA_OPTIONS = [
    { value: '', label: 'Todos los días' },
    ...DIAS.map((d, i) => ({ value: String(i), label: d })),
];

// Mapa de video-avatar por username → archivo en /public
const USER_AVATARS = {
    frojo: '/Man_smiles_and_nods_directly_202606181046.mp4',
};

// Helper: obtener username a partir del usuario_id del box
function getUsernameForBox(box, allUsers) {
    if (!box.usuario_id || !allUsers?.length) return null;
    const user = allUsers.find(u => u.id === box.usuario_id);
    return user?.usuario || null;
}

export default function BoxManagerPanel({ addToast, currentUser, allUsers }) {
    const [boxes, setBoxes] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null); // box numero expandido
    const [toggling, setToggling] = useState({}); // boxNum → true
    const [assigning, setAssigning] = useState({}); // boxNum → true

    // Form para nuevo horario
    const [newHorario, setNewHorario] = useState({
        dia: '', horaInicio: '12:00', horaFin: '14:00', motivo: '',
    });
    const [addingHorario, setAddingHorario] = useState(false);

    // ─── Load ───
    const loadData = useCallback(async () => {
        try {
            const [boxData, horData] = await Promise.all([
                fetchBoxes(),
                fetchAllHorarios(),
            ]);
            setBoxes(boxData);
            setHorarios(horData);
        } catch (err) {
            console.error('Error loading boxes:', err);
            addToast?.('Error al cargar boxes', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    // Realtime
    useEffect(() => {
        const unsub = subscribeToBoxes(() => loadData());
        return () => unsub();
    }, [loadData]);

    // ─── Handlers ───
    const handleToggle = async (box) => {
        setToggling(p => ({ ...p, [box.numero]: true }));
        try {
            await toggleBoxActivo(box.numero, !box.activo);
            const boxName = box.numero === 99 ? 'UCI' : `Box ${box.numero}`;
            addToast?.(`${boxName} ${!box.activo ? 'encendido' : 'apagado'}`, 'success');
            await loadData();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        } finally {
            setToggling(p => ({ ...p, [box.numero]: false }));
        }
    };

    const handleAsignarme = async (box) => {
        if (!currentUser?.id) return;
        setAssigning(p => ({ ...p, [box.numero]: true }));
        try {
            await asignarBox(box.numero, currentUser.id, currentUser.nombre);
            const boxName = box.numero === 99 ? 'UCI' : `Box ${box.numero}`;
            addToast?.(`${boxName} asignado a ${currentUser.nombre}`, 'success');
            await loadData();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        } finally {
            setAssigning(p => ({ ...p, [box.numero]: false }));
        }
    };

    const handleAsignarUsuario = async (box, userId) => {
        if (!userId) {
            // Liberar
            try {
                await liberarBox(box.numero);
                const boxName = box.numero === 99 ? 'UCI' : `Box ${box.numero}`;
                addToast?.(`${boxName} liberado`, 'success');
                await loadData();
            } catch (err) {
                addToast?.('Error: ' + err.message, 'error');
            }
            return;
        }
        const user = (allUsers || []).find(u => u.id === userId);
        if (!user) return;
        setAssigning(p => ({ ...p, [box.numero]: true }));
        try {
            await asignarBox(box.numero, user.id, user.nombre);
            const boxName = box.numero === 99 ? 'UCI' : `Box ${box.numero}`;
            addToast?.(`${boxName} asignado a ${user.nombre}`, 'success');
            await loadData();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        } finally {
            setAssigning(p => ({ ...p, [box.numero]: false }));
        }
    };

    const handleAddHorario = async (boxId) => {
        setAddingHorario(true);
        try {
            const dia = newHorario.dia === '' ? null : parseInt(newHorario.dia);
            await addHorario(boxId, dia, newHorario.horaInicio, newHorario.horaFin, newHorario.motivo);
            addToast?.('Horario de bloqueo agregado', 'success');
            setNewHorario({ dia: '', horaInicio: '12:00', horaFin: '14:00', motivo: '' });
            await loadData();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        } finally {
            setAddingHorario(false);
        }
    };

    const handleRemoveHorario = async (hId) => {
        try {
            await removeHorario(hId);
            addToast?.('Horario eliminado', 'success');
            await loadData();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        }
    };

    if (loading) return (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8' }}>
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {boxes.map(box => {
                const boxHorarios = horarios.filter(h => h.box_id === box.id);
                const isExpanded = expanded === box.numero;
                const isMyBox = currentUser?.id && box.usuario_id === currentUser.id;

                return (
                    <div
                        key={box.numero}
                        style={{
                            borderRadius: '14px',
                            border: `2px solid ${box.activo ? '#22C55E30' : '#EF444430'}`,
                            background: box.activo ? '#F0FDF4' : '#FEF2F2',
                            overflow: 'hidden',
                            transition: 'all 0.25s',
                        }}
                    >
                        {/* Box Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '14px',
                            padding: '14px 16px',
                        }}>
                            {/* Box icon + number / video avatar */}
                            {(() => {
                                const username = getUsernameForBox(box, allUsers);
                                const avatarSrc = username ? USER_AVATARS[username] : null;
                                const borderColor = box.activo ? '#22C55E' : '#EF4444';
                                if (avatarSrc) {
                                    return (
                                        <div style={{
                                            width: '52px', height: '52px', borderRadius: '50%',
                                            border: `3px solid ${borderColor}`,
                                            overflow: 'hidden', flexShrink: 0,
                                            boxShadow: box.activo
                                                ? '0 3px 14px rgba(34,197,94,0.35)'
                                                : '0 3px 14px rgba(239,68,68,0.25)',
                                            position: 'relative',
                                        }}>
                                            <video
                                                src={avatarSrc}
                                                autoPlay
                                                loop
                                                muted
                                                playsInline
                                                style={{
                                                    width: '100%', height: '100%',
                                                    objectFit: 'cover',
                                                    display: 'block',
                                                }}
                                            />
                                        </div>
                                    );
                                }
                                return (
                                    <div style={{
                                        width: '48px', height: '48px', borderRadius: '12px',
                                        background: box.activo
                                            ? 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)'
                                            : 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0,
                                        boxShadow: box.activo
                                            ? '0 3px 12px rgba(34,197,94,0.3)'
                                            : '0 3px 12px rgba(239,68,68,0.2)',
                                    }}>
                                        <span style={{
                                            color: '#fff', fontWeight: 900, fontSize: '1.3rem',
                                        }}>
                                            {box.numero === 99 ? 'UCI' : box.numero}
                                        </span>
                                    </div>
                                );
                            })()}

                            {/* Info */}
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    marginBottom: '2px',
                                }}>
                                    <span style={{
                                        fontWeight: 700, fontSize: '0.95rem', color: '#0D3B66',
                                    }}>
                                        {box.numero === 99 ? 'UCI' : `Box ${box.numero}`}
                                    </span>
                                    <span style={{
                                        fontSize: '0.65rem', fontWeight: 700,
                                        padding: '2px 8px', borderRadius: '8px',
                                        background: box.activo ? '#DCFCE7' : '#FEE2E2',
                                        color: box.activo ? '#16A34A' : '#DC2626',
                                        border: `1px solid ${box.activo ? '#BBF7D0' : '#FECACA'}`,
                                    }}>
                                        {box.activo ? '● ACTIVO' : '○ APAGADO'}
                                    </span>
                                    {isMyBox && (
                                        <span style={{
                                            fontSize: '0.6rem', fontWeight: 700,
                                            padding: '2px 6px', borderRadius: '6px',
                                            background: '#DBEAFE', color: '#1D4ED8',
                                        }}>
                                            MI BOX
                                        </span>
                                    )}
                                </div>
                                <div style={{
                                    fontSize: '0.78rem', color: '#64748B',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                }}>
                                    <User size={12} />
                                    {box.usuario_nombre || 'Sin asignar'}
                                    {boxHorarios.length > 0 && (
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                                            marginLeft: '8px', fontSize: '0.68rem', color: '#F59E0B',
                                        }}>
                                            <Clock size={10} /> {boxHorarios.length} bloqueos
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                {/* Toggle ON/OFF */}
                                <button
                                    onClick={() => handleToggle(box)}
                                    disabled={toggling[box.numero]}
                                    title={box.activo ? 'Apagar box' : 'Encender box'}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        padding: '8px 14px', borderRadius: '10px',
                                        border: 'none', cursor: 'pointer',
                                        background: box.activo
                                            ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                                            : 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                                        color: '#fff',
                                        fontSize: '0.75rem', fontWeight: 700,
                                        transition: 'all 0.2s',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                        opacity: toggling[box.numero] ? 0.6 : 1,
                                    }}
                                >
                                    {box.activo ? <PowerOff size={14} /> : <Power size={14} />}
                                    {box.activo ? 'Apagar' : 'Encender'}
                                </button>

                                {/* Asignarme */}
                                {!isMyBox && (
                                    <button
                                        onClick={() => handleAsignarme(box)}
                                        disabled={assigning[box.numero]}
                                        title="Asignarme este box"
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            padding: '8px 14px', borderRadius: '10px',
                                            border: '1px solid #1565C030',
                                            background: '#EFF6FF', color: '#1565C0',
                                            cursor: 'pointer',
                                            fontSize: '0.75rem', fontWeight: 700,
                                            transition: 'all 0.2s',
                                            opacity: assigning[box.numero] ? 0.6 : 1,
                                        }}
                                    >
                                        <Shield size={14} />
                                        Asignarme
                                    </button>
                                )}

                                {/* Expand */}
                                <button
                                    onClick={() => setExpanded(isExpanded ? null : box.numero)}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: '34px', height: '34px', borderRadius: '10px',
                                        border: '1px solid #E2E8F0', background: '#fff',
                                        cursor: 'pointer', color: '#64748B',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Expanded: User assignment + Horarios */}
                        {isExpanded && (
                            <div style={{
                                borderTop: '1px solid rgba(0,0,0,0.06)',
                                padding: '14px 16px',
                                background: 'rgba(255,255,255,0.7)',
                            }}>
                                {/* Selector de usuario */}
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{
                                        display: 'block', fontSize: '0.75rem', fontWeight: 700,
                                        color: '#475569', marginBottom: '6px',
                                    }}>
                                        <User size={12} style={{ marginRight: '4px', verticalAlign: '-2px' }} />
                                        Usuario asignado
                                    </label>
                                    <select
                                        value={box.usuario_id || ''}
                                        onChange={(e) => handleAsignarUsuario(box, e.target.value || null)}
                                        style={{
                                            width: '100%', padding: '10px 14px',
                                            borderRadius: '10px',
                                            border: '2px solid #E2E8F0',
                                            fontSize: '0.85rem', fontWeight: 600,
                                            color: '#0D3B66', background: '#FAFBFC',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <option value="">— Sin asignar —</option>
                                        {(allUsers || []).map(u => (
                                            <option key={u.id} value={u.id}>{u.nombre} ({u.usuario})</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Horarios de bloqueo */}
                                <div>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        marginBottom: '10px',
                                    }}>
                                        <Clock size={13} style={{ color: '#F59E0B' }} />
                                        <span style={{
                                            fontSize: '0.78rem', fontWeight: 700, color: '#475569',
                                        }}>
                                            Horarios de no-atención
                                        </span>
                                    </div>

                                    {/* Lista de horarios existentes */}
                                    {boxHorarios.length > 0 ? (
                                        <div style={{
                                            display: 'flex', flexDirection: 'column', gap: '6px',
                                            marginBottom: '12px',
                                        }}>
                                            {boxHorarios.map(h => (
                                                <div key={h.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: '10px',
                                                    padding: '8px 12px',
                                                    borderRadius: '10px',
                                                    background: '#FEF3C7',
                                                    border: '1px solid #FDE68A',
                                                }}>
                                                    <AlertTriangle size={12} style={{ color: '#F59E0B', flexShrink: 0 }} />
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{
                                                            fontSize: '0.78rem', fontWeight: 700, color: '#92400E',
                                                        }}>
                                                            {h.hora_inicio?.slice(0, 5)} – {h.hora_fin?.slice(0, 5)}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.7rem', color: '#B45309',
                                                            marginLeft: '8px',
                                                        }}>
                                                            {h.dia_semana !== null ? DIAS[h.dia_semana] : 'Todos los días'}
                                                        </span>
                                                        {h.motivo && (
                                                            <span style={{
                                                                fontSize: '0.68rem', color: '#78716C',
                                                                marginLeft: '8px', fontStyle: 'italic',
                                                            }}>
                                                                — {h.motivo}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveHorario(h.id)}
                                                        title="Eliminar"
                                                        style={{
                                                            display: 'flex', alignItems: 'center',
                                                            justifyContent: 'center',
                                                            width: '28px', height: '28px', borderRadius: '8px',
                                                            border: 'none', background: '#FEE2E2',
                                                            color: '#DC2626', cursor: 'pointer',
                                                            transition: 'all 0.15s',
                                                        }}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p style={{
                                            fontSize: '0.75rem', color: '#94A3B8',
                                            marginBottom: '12px', fontStyle: 'italic',
                                        }}>
                                            Sin horarios de bloqueo configurados
                                        </p>
                                    )}

                                    {/* Formulario agregar */}
                                    <div style={{
                                        display: 'flex', gap: '8px', alignItems: 'flex-end',
                                        flexWrap: 'wrap',
                                        padding: '12px',
                                        borderRadius: '10px',
                                        background: '#F1F5F9',
                                        border: '1px solid #E2E8F0',
                                    }}>
                                        <div style={{ flex: '1 1 100px' }}>
                                            <label style={formLabel}>Día</label>
                                            <select
                                                value={newHorario.dia}
                                                onChange={e => setNewHorario(p => ({ ...p, dia: e.target.value }))}
                                                style={formInput}
                                            >
                                                {DIA_OPTIONS.map(o => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ flex: '0 0 90px' }}>
                                            <label style={formLabel}>Desde</label>
                                            <input
                                                type="time"
                                                value={newHorario.horaInicio}
                                                onChange={e => setNewHorario(p => ({ ...p, horaInicio: e.target.value }))}
                                                style={formInput}
                                            />
                                        </div>
                                        <div style={{ flex: '0 0 90px' }}>
                                            <label style={formLabel}>Hasta</label>
                                            <input
                                                type="time"
                                                value={newHorario.horaFin}
                                                onChange={e => setNewHorario(p => ({ ...p, horaFin: e.target.value }))}
                                                style={formInput}
                                            />
                                        </div>
                                        <div style={{ flex: '1 1 120px' }}>
                                            <label style={formLabel}>Motivo</label>
                                            <input
                                                type="text"
                                                placeholder="Ej: Almuerzo"
                                                value={newHorario.motivo}
                                                onChange={e => setNewHorario(p => ({ ...p, motivo: e.target.value }))}
                                                style={formInput}
                                            />
                                        </div>
                                        <button
                                            onClick={() => handleAddHorario(box.id)}
                                            disabled={addingHorario || !newHorario.horaInicio || !newHorario.horaFin}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                padding: '8px 16px', borderRadius: '10px',
                                                border: 'none', cursor: 'pointer',
                                                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                                                color: '#fff', fontSize: '0.78rem', fontWeight: 700,
                                                boxShadow: '0 2px 8px rgba(245,158,11,0.3)',
                                                opacity: addingHorario ? 0.6 : 1,
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            <Plus size={14} />
                                            Agregar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Info banner */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 14px', borderRadius: '10px',
                background: '#EFF6FF', border: '1px solid #BFDBFE',
                fontSize: '0.73rem', color: '#1E40AF',
            }}>
                <Monitor size={14} />
                <span>
                    Los turnos se asignan automáticamente al box activo con menos espera.
                    Fuera de horario (20:00 – 07:00) no se emiten turnos.
                </span>
            </div>
        </div>
    );
}

// Shared form styles
const formLabel = {
    display: 'block', fontSize: '0.68rem', fontWeight: 700,
    color: '#64748B', marginBottom: '3px',
};
const formInput = {
    width: '100%', padding: '7px 10px', borderRadius: '8px',
    border: '1.5px solid #CBD5E1', fontSize: '0.8rem',
    fontWeight: 600, color: '#0D3B66', background: '#fff',
    boxSizing: 'border-box',
};
