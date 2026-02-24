/**
 * ShortcutManager — Modal de administración de atajos rápidos
 * CRUD completo para whatsapp_shortcuts
 */
import { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Save, Loader2, Zap, Search } from 'lucide-react';
import {
    fetchAllShortcuts,
    createShortcut,
    updateShortcut,
    deleteShortcut,
} from '../services/shortcutService';

export default function ShortcutManager({ isOpen, onClose, addToast }) {
    const [shortcuts, setShortcuts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [form, setForm] = useState({ shortcut: '', label: '', message: '', category: '' });

    useEffect(() => {
        if (isOpen) loadShortcuts();
    }, [isOpen]);

    const loadShortcuts = async () => {
        setLoading(true);
        try {
            const data = await fetchAllShortcuts();
            setShortcuts(data);
        } catch (e) {
            addToast?.('Error al cargar atajos: ' + e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setForm({ shortcut: '', label: '', message: '', category: '' });
        setEditingId(null);
    };

    const startEdit = (sc) => {
        setEditingId(sc.id);
        setForm({
            shortcut: sc.shortcut || '',
            label: sc.label || '',
            message: sc.message || '',
            category: sc.category || '',
        });
    };

    const startCreate = () => {
        setEditingId('new');
        setForm({ shortcut: '/', label: '', message: '', category: '' });
    };

    const handleSave = async () => {
        if (!form.shortcut.trim() || !form.label.trim() || !form.message.trim()) {
            addToast?.('Completá comando, nombre y mensaje', 'error');
            return;
        }
        setSaving(true);
        try {
            if (editingId === 'new') {
                await createShortcut(form);
                addToast?.('Atajo creado', 'success');
            } else {
                await updateShortcut(editingId, form);
                addToast?.('Atajo actualizado', 'success');
            }
            resetForm();
            await loadShortcuts();
        } catch (e) {
            addToast?.('Error: ' + e.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        setSaving(true);
        try {
            await deleteShortcut(id);
            addToast?.('Atajo eliminado', 'success');
            setDeleteConfirmId(null);
            await loadShortcuts();
        } catch (e) {
            addToast?.('Error: ' + e.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const filtered = shortcuts.filter(sc =>
        !search || sc.shortcut.toLowerCase().includes(search.toLowerCase()) ||
        sc.label.toLowerCase().includes(search.toLowerCase()) ||
        sc.message.toLowerCase().includes(search.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
            background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000,
        }} onClick={onClose}>
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#fff', borderRadius: '16px',
                    boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                    width: '90%', maxWidth: '680px', maxHeight: '85vh',
                    display: 'flex', flexDirection: 'column',
                    animation: 'scaleIn 0.2s ease-out',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '20px 24px 16px', borderBottom: '1px solid #E2E8F0',
                    display: 'flex', alignItems: 'center', gap: '10px',
                }}>
                    <Zap size={20} style={{ color: '#F59E0B' }} />
                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#111B21', flex: 1 }}>
                        Administrar Atajos
                    </h2>
                    <button
                        onClick={startCreate}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '7px 14px', borderRadius: '8px',
                            background: '#25D366', color: '#fff', border: 'none',
                            fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                        }}
                    >
                        <Plus size={14} /> Nuevo
                    </button>
                    <button onClick={onClose} style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: 'none', border: 'none', color: '#64748B',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <X size={18} />
                    </button>
                </div>

                {/* Search */}
                <div style={{ padding: '12px 24px 8px' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px', borderRadius: '8px',
                        border: '1px solid #E2E8F0', background: '#F8FAFC',
                    }}>
                        <Search size={15} style={{ color: '#94A3B8' }} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar atajos..."
                            style={{
                                border: 'none', background: 'none', outline: 'none',
                                fontSize: '0.82rem', flex: 1, color: '#334155',
                            }}
                        />
                    </div>
                </div>

                {/* Edit Form (when editing or creating) */}
                {editingId && (
                    <div style={{
                        margin: '0 24px', padding: '16px',
                        background: '#F0FDF4', borderRadius: '10px',
                        border: '1px solid #BBF7D0',
                    }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16A34A', marginBottom: '12px', textTransform: 'uppercase' }}>
                            {editingId === 'new' ? '✨ Nuevo Atajo' : '✏️ Editando Atajo'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B', marginBottom: '4px', display: 'block' }}>Comando</label>
                                <input
                                    value={form.shortcut}
                                    onChange={e => setForm(f => ({ ...f, shortcut: e.target.value }))}
                                    placeholder="/saludo"
                                    style={{
                                        width: '100%', padding: '8px 10px', borderRadius: '6px',
                                        border: '1px solid #D1D5DB', fontSize: '0.82rem',
                                        fontFamily: "'JetBrains Mono', monospace", outline: 'none',
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B', marginBottom: '4px', display: 'block' }}>Nombre</label>
                                <input
                                    value={form.label}
                                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                                    placeholder="Saludo inicial"
                                    style={{
                                        width: '100%', padding: '8px 10px', borderRadius: '6px',
                                        border: '1px solid #D1D5DB', fontSize: '0.82rem', outline: 'none',
                                    }}
                                />
                            </div>
                        </div>
                        <div style={{ marginBottom: '10px' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B', marginBottom: '4px', display: 'block' }}>Mensaje</label>
                            <textarea
                                value={form.message}
                                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                                placeholder="Escribí el mensaje del atajo..."
                                rows={3}
                                style={{
                                    width: '100%', padding: '8px 10px', borderRadius: '6px',
                                    border: '1px solid #D1D5DB', fontSize: '0.82rem',
                                    fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B', marginBottom: '4px', display: 'block' }}>Categoría (opcional)</label>
                                <input
                                    value={form.category}
                                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                    placeholder="general"
                                    style={{
                                        width: '100%', padding: '8px 10px', borderRadius: '6px',
                                        border: '1px solid #D1D5DB', fontSize: '0.82rem', outline: 'none',
                                    }}
                                />
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 18px', borderRadius: '8px', marginTop: '16px',
                                    background: '#25D366', color: '#fff', border: 'none',
                                    fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                                }}
                            >
                                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                                Guardar
                            </button>
                            <button
                                onClick={resetForm}
                                style={{
                                    padding: '8px 14px', borderRadius: '8px', marginTop: '16px',
                                    background: 'none', color: '#64748B', border: '1px solid #E2E8F0',
                                    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {/* List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 24px' }}>
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                            <p style={{ margin: '12px 0 0', fontSize: '0.82rem' }}>Cargando atajos...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                            <Zap size={32} strokeWidth={1.2} />
                            <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
                                {search ? 'Sin resultados' : 'No hay atajos creados'}
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                            {filtered.map(sc => (
                                <div
                                    key={sc.id}
                                    style={{
                                        padding: '12px 14px', borderRadius: '10px',
                                        border: '1px solid #E2E8F0',
                                        background: editingId === sc.id ? '#F0FDF4' : '#fff',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontSize: '0.78rem', fontWeight: 700,
                                            color: '#25D366', background: 'rgba(37,211,102,0.1)',
                                            padding: '3px 10px', borderRadius: '6px',
                                        }}>
                                            {sc.shortcut}
                                        </span>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111B21', flex: 1 }}>
                                            {sc.label}
                                        </span>
                                        {sc.category && (
                                            <span style={{
                                                fontSize: '0.65rem', color: '#8696A0',
                                                background: '#F0F2F5', padding: '2px 8px', borderRadius: '4px',
                                            }}>
                                                {sc.category}
                                            </span>
                                        )}
                                        {!sc.is_active && (
                                            <span style={{
                                                fontSize: '0.6rem', color: '#DC2626',
                                                background: '#FEE2E2', padding: '2px 6px', borderRadius: '4px',
                                                fontWeight: 700,
                                            }}>
                                                INACTIVO
                                            </span>
                                        )}
                                        <button
                                            onClick={() => startEdit(sc)}
                                            style={{
                                                width: '30px', height: '30px', borderRadius: '6px',
                                                background: 'none', border: '1px solid #E2E8F0',
                                                color: '#6366F1', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}
                                            title="Editar"
                                        >
                                            <Pencil size={13} />
                                        </button>
                                        {deleteConfirmId === sc.id ? (
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button onClick={() => handleDelete(sc.id)} style={{
                                                    padding: '4px 10px', borderRadius: '6px',
                                                    background: '#EF4444', color: '#fff', border: 'none',
                                                    fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                                                }}>
                                                    Confirmar
                                                </button>
                                                <button onClick={() => setDeleteConfirmId(null)} style={{
                                                    padding: '4px 8px', borderRadius: '6px',
                                                    background: 'none', color: '#64748B', border: '1px solid #E2E8F0',
                                                    fontSize: '0.7rem', cursor: 'pointer',
                                                }}>
                                                    No
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setDeleteConfirmId(sc.id)}
                                                style={{
                                                    width: '30px', height: '30px', borderRadius: '6px',
                                                    background: 'none', border: '1px solid #FEE2E2',
                                                    color: '#EF4444', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}
                                                title="Eliminar"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                    <p style={{
                                        margin: '6px 0 0', fontSize: '0.75rem', color: '#667781',
                                        lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis',
                                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                    }}>
                                        {sc.message}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
