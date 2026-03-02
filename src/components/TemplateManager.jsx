/**
 * TemplateManager — Gestor de plantillas de mensajes con variables dinámicas
 * Sección dentro de Configuración para CRUD de plantillas (whatsapp_shortcuts)
 * con inserción de variables via chips clickeables y preview en vivo.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Plus, Pencil, Trash2, Save, Loader2, Zap, Search, X,
    Eye, ChevronDown, ChevronRight, Variable, Copy, FileText,
} from 'lucide-react';
import {
    fetchAllShortcuts,
    createShortcut,
    updateShortcut,
    deleteShortcut,
} from '../services/shortcutService';

// ============================================
// Variables disponibles para insertar
// ============================================
const AVAILABLE_VARIABLES = [
    { key: '{nombre}', label: 'Nombre Paciente', icon: '👤', color: '#6366F1', group: 'Paciente' },
    { key: '{obra_social}', label: 'Obra Social', icon: '🏥', color: '#0EA5E9', group: 'Paciente' },
    { key: '{afiliado}', label: 'N° Afiliado', icon: '🔢', color: '#0EA5E9', group: 'Paciente' },
    { key: '{diagnostico}', label: 'Diagnóstico', icon: '📋', color: '#8B5CF6', group: 'Clínico' },
    { key: '{tratamiento}', label: 'Tratamiento', icon: '💊', color: '#8B5CF6', group: 'Clínico' },
    { key: '{medico}', label: 'Médico Solicitante', icon: '🩺', color: '#14B8A6', group: 'Clínico' },
    { key: '{fecha_cirugia}', label: 'Fecha de Cirugía', icon: '📅', color: '#F59E0B', group: 'Fechas' },
    { key: '{fecha_hoy}', label: 'Fecha de Hoy', icon: '🗓️', color: '#F59E0B', group: 'Fechas' },
    { key: '{presupuesto_total}', label: 'Presupuesto Total', icon: '💰', color: '#22C55E', group: 'Presupuesto' },
];

// Datos de ejemplo para el preview
const PREVIEW_DATA = {
    '{nombre}': 'María González',
    '{obra_social}': 'OSDE 310',
    '{afiliado}': '38078381-2',
    '{diagnostico}': 'EMB. 35 SEM.',
    '{tratamiento}': 'CESAREA',
    '{medico}': 'Dr. Juan Pérez',
    '{fecha_cirugia}': '15/03/2026',
    '{fecha_hoy}': new Date().toLocaleDateString('es-AR'),
    '{presupuesto_total}': '$350.000',
};

// Categorías predefinidas
const CATEGORIES = [
    { id: 'documentacion', label: 'Documentación', color: '#6366F1' },
    { id: 'obra_social', label: 'Obra Social', color: '#0EA5E9' },
    { id: 'pagos', label: 'Pagos', color: '#22C55E' },
    { id: 'confirmacion', label: 'Confirmación', color: '#F59E0B' },
    { id: 'info', label: 'Información', color: '#8B5CF6' },
    { id: 'damsu', label: 'DAMSU', color: '#EC4899' },
    { id: 'general', label: 'General', color: '#64748B' },
];

export default function TemplateManager({ addToast }) {
    const [shortcuts, setShortcuts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [editingId, setEditingId] = useState(null); // null | 'new' | uuid
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [expandedItems, setExpandedItems] = useState({});
    const [activeCategory, setActiveCategory] = useState('all');
    const [form, setForm] = useState({ shortcut: '', label: '', message: '', category: 'general' });
    const textareaRef = useRef(null);

    // ============================================
    // DATA LOADING
    // ============================================
    const loadShortcuts = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchAllShortcuts();
            setShortcuts(data);
        } catch (e) {
            addToast?.('Error al cargar plantillas: ' + e.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { loadShortcuts(); }, [loadShortcuts]);

    // ============================================
    // FORM ACTIONS
    // ============================================
    const resetForm = () => {
        setForm({ shortcut: '', label: '', message: '', category: 'general' });
        setEditingId(null);
        setShowPreview(false);
    };

    const startEdit = (sc) => {
        setEditingId(sc.id);
        setForm({
            shortcut: sc.shortcut || '',
            label: sc.label || '',
            message: sc.message || '',
            category: sc.category || 'general',
        });
        setShowPreview(false);
    };

    const startCreate = () => {
        setEditingId('new');
        setForm({ shortcut: '/', label: '', message: '', category: 'general' });
        setShowPreview(false);
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
                addToast?.('✅ Plantilla creada correctamente', 'success');
            } else {
                await updateShortcut(editingId, form);
                addToast?.('✅ Plantilla actualizada', 'success');
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
            addToast?.('Plantilla eliminada', 'success');
            setDeleteConfirmId(null);
            await loadShortcuts();
        } catch (e) {
            addToast?.('Error: ' + e.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    // ============================================
    // VARIABLE INSERTION
    // ============================================
    const insertVariable = (variableKey) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            setForm(f => ({ ...f, message: f.message + variableKey }));
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = form.message.substring(0, start);
        const after = form.message.substring(end);
        const newMessage = before + variableKey + after;

        setForm(f => ({ ...f, message: newMessage }));

        // Restore cursor position after the inserted variable
        requestAnimationFrame(() => {
            textarea.focus();
            const newPos = start + variableKey.length;
            textarea.setSelectionRange(newPos, newPos);
        });
    };

    // ============================================
    // PREVIEW
    // ============================================
    const resolvePreview = (text) => {
        let resolved = text;
        AVAILABLE_VARIABLES.forEach(v => {
            const regex = new RegExp(v.key.replace(/[{}]/g, '\\$&'), 'gi');
            resolved = resolved.replace(regex, PREVIEW_DATA[v.key] || v.key);
        });
        return resolved;
    };

    // ============================================
    // FILTER
    // ============================================
    const filtered = shortcuts.filter(sc => {
        const matchCategory = activeCategory === 'all' || sc.category === activeCategory;
        const matchSearch = !search ||
            sc.shortcut.toLowerCase().includes(search.toLowerCase()) ||
            sc.label.toLowerCase().includes(search.toLowerCase()) ||
            sc.message.toLowerCase().includes(search.toLowerCase());
        return matchCategory && matchSearch;
    });

    const toggleExpand = (id) => {
        setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Count variables in a message
    const countVariables = (message) => {
        const matches = message.match(/\{[a-z_]+\}/gi);
        return matches ? matches.length : 0;
    };

    // Get category color
    const getCategoryColor = (catId) => {
        const cat = CATEGORIES.find(c => c.id === catId);
        return cat?.color || '#64748B';
    };

    // ============================================
    // RENDER
    // ============================================
    return (
        <div style={{ marginTop: '32px' }}>
            {/* Section Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                marginBottom: '16px', paddingBottom: '8px',
                borderBottom: '2px solid rgba(245,158,11,0.15)',
            }}>
                <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: 'rgba(245,158,11,0.1)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    <Zap size={16} color="#F59E0B" />
                </div>
                <div style={{ flex: 1 }}>
                    <h4 style={{
                        margin: 0, fontSize: '0.9rem', fontWeight: 700,
                        color: 'var(--neutral-700)',
                    }}>
                        Plantillas de Mensajes
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--neutral-400)' }}>
                        Atajos rápidos con variables dinámicas · Se activan con "/" en el chat
                    </p>
                </div>
                <span style={{
                    fontSize: '0.72rem', color: 'var(--neutral-400)',
                    background: 'var(--neutral-50)', padding: '3px 10px',
                    borderRadius: '12px', fontWeight: 600,
                }}>
                    {shortcuts.length} plantilla{shortcuts.length !== 1 ? 's' : ''}
                </span>
                <button
                    onClick={startCreate}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '7px 16px', borderRadius: '8px',
                        background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                        color: '#fff', border: 'none',
                        fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(245,158,11,0.3)',
                        transition: 'all 0.2s',
                    }}
                >
                    <Plus size={14} /> Nueva Plantilla
                </button>
            </div>

            {/* ========== EDITOR FORM ========== */}
            {editingId && (
                <div className="animate-fade-in" style={{
                    background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                    borderRadius: '12px', border: '1px solid #FDE68A',
                    padding: '20px', marginBottom: '16px',
                    boxShadow: '0 4px 12px rgba(245,158,11,0.1)',
                }}>
                    {/* Form Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginBottom: '16px',
                    }}>
                        <div style={{
                            fontSize: '0.78rem', fontWeight: 700,
                            color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.05em',
                            display: 'flex', alignItems: 'center', gap: '6px',
                        }}>
                            <FileText size={14} />
                            {editingId === 'new' ? '✨ Nueva Plantilla' : '✏️ Editando Plantilla'}
                        </div>
                        <button
                            onClick={() => setShowPreview(!showPreview)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '5px',
                                padding: '5px 12px', borderRadius: '6px',
                                background: showPreview ? '#D97706' : 'rgba(180,83,9,0.1)',
                                color: showPreview ? '#fff' : '#B45309',
                                border: 'none', fontSize: '0.72rem', fontWeight: 700,
                                cursor: 'pointer', transition: 'all 0.15s',
                            }}
                        >
                            <Eye size={13} />
                            {showPreview ? 'Ocultar Preview' : 'Ver Preview'}
                        </button>
                    </div>

                    {/* Top row: Command + Name + Category */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 160px', gap: '10px', marginBottom: '12px' }}>
                        <div>
                            <label style={labelStyle}>Comando</label>
                            <input
                                value={form.shortcut}
                                onChange={e => setForm(f => ({ ...f, shortcut: e.target.value }))}
                                placeholder="/saludo"
                                style={{
                                    ...inputStyle,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontWeight: 700, color: '#B45309',
                                }}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Nombre de la plantilla</label>
                            <input
                                value={form.label}
                                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                                placeholder="Saludo inicial"
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Categoría</label>
                            <select
                                value={form.category}
                                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                style={{ ...inputStyle, cursor: 'pointer' }}
                            >
                                {CATEGORIES.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Variable Chips */}
                    <div style={{ marginBottom: '8px' }}>
                        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Variable size={12} />
                            Variables disponibles
                            <span style={{ fontWeight: 400, color: '#94A3B8' }}>— click para insertar en el mensaje</span>
                        </label>
                        <p style={{
                            margin: '2px 0 6px', fontSize: '0.72rem', color: '#78716C',
                            lineHeight: 1.4, fontStyle: 'italic',
                            padding: '5px 10px', borderRadius: '6px',
                            background: 'rgba(180,83,9,0.05)', border: '1px dashed #D6BFA040',
                        }}>
                            💡 Las <strong>variables</strong> son campos que se reemplazan automáticamente por los datos reales del paciente al usar la plantilla en el chat.
                            Ej: <code style={{ background: '#FEF3C7', padding: '1px 4px', borderRadius: '3px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem' }}>{'{nombre}'}</code> se convierte en el nombre del paciente.
                        </p>
                        <div style={{
                            display: 'flex', flexWrap: 'wrap', gap: '6px',
                        }}>
                            {AVAILABLE_VARIABLES.map(v => (
                                <button
                                    key={v.key}
                                    onClick={() => insertVariable(v.key)}
                                    type="button"
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        padding: '4px 10px', borderRadius: '6px',
                                        background: `${v.color}10`, border: `1px solid ${v.color}30`,
                                        color: v.color, fontSize: '0.72rem', fontWeight: 700,
                                        cursor: 'pointer', transition: 'all 0.15s',
                                        fontFamily: "'JetBrains Mono', monospace",
                                    }}
                                    onMouseOver={e => {
                                        e.currentTarget.style.background = `${v.color}20`;
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                    }}
                                    onMouseOut={e => {
                                        e.currentTarget.style.background = `${v.color}10`;
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                    title={`Insertar ${v.label}`}
                                >
                                    <span>{v.icon}</span>
                                    {v.key}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Message Textarea + Preview side by side */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: showPreview ? '1fr 1fr' : '1fr',
                        gap: '12px', marginBottom: '12px',
                    }}>
                        <div>
                            <label style={labelStyle}>Mensaje</label>
                            <textarea
                                ref={textareaRef}
                                value={form.message}
                                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                                placeholder="Escribí el mensaje de la plantilla... Usá las variables de arriba para personalizar."
                                rows={8}
                                style={{
                                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                                    border: '1px solid #D1D5DB', fontSize: '0.82rem',
                                    fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                                    lineHeight: 1.5, background: '#fff',
                                    transition: 'border-color 0.2s',
                                }}
                                onFocus={e => e.target.style.borderColor = '#F59E0B'}
                                onBlur={e => e.target.style.borderColor = '#D1D5DB'}
                            />
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', marginTop: '4px',
                            }}>
                                <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                                    {form.message.length} caracteres
                                </span>
                                <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                                    {countVariables(form.message)} variable{countVariables(form.message) !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>

                        {/* Live Preview */}
                        {showPreview && (
                            <div className="animate-fade-in">
                                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Eye size={12} />
                                    Preview (datos de ejemplo)
                                </label>
                                <div style={{
                                    padding: '12px 14px', borderRadius: '8px',
                                    background: '#D9FDD3', fontSize: '0.82rem',
                                    lineHeight: 1.5, whiteSpace: 'pre-wrap',
                                    minHeight: '180px', maxHeight: '300px', overflowY: 'auto',
                                    border: '1px solid #BBF7D0',
                                    fontFamily: 'inherit',
                                    boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.04)',
                                }}>
                                    {form.message ? renderPreviewWithHighlights(resolvePreview(form.message)) : (
                                        <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>
                                            El preview aparecerá aquí cuando escribas un mensaje...
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                            onClick={resetForm}
                            style={{
                                padding: '8px 16px', borderRadius: '8px',
                                background: 'none', color: '#64748B', border: '1px solid #E2E8F0',
                                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 20px', borderRadius: '8px',
                                background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                                color: '#fff', border: 'none',
                                fontSize: '0.8rem', fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
                                boxShadow: '0 2px 8px rgba(34,197,94,0.3)',
                                transition: 'all 0.2s',
                            }}
                        >
                            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                            {saving ? 'Guardando...' : 'Guardar Plantilla'}
                        </button>
                    </div>
                </div>
            )}

            {/* ========== SEARCH + CATEGORY FILTER ========== */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '7px 12px', borderRadius: '8px',
                    border: '1px solid var(--neutral-200)', background: '#F8FAFC',
                    flex: '1 1 200px', minWidth: '200px',
                }}>
                    <Search size={15} style={{ color: '#94A3B8' }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar plantillas..."
                        style={{
                            border: 'none', background: 'none', outline: 'none',
                            fontSize: '0.82rem', flex: 1, color: '#334155',
                        }}
                    />
                    {search && (
                        <button onClick={() => setSearch('')} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#94A3B8', padding: '0', display: 'flex',
                        }}>
                            <X size={14} />
                        </button>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setActiveCategory('all')}
                        style={{
                            ...chipStyle,
                            background: activeCategory === 'all' ? '#334155' : '#F1F5F9',
                            color: activeCategory === 'all' ? '#fff' : '#64748B',
                            borderColor: activeCategory === 'all' ? '#334155' : '#E2E8F0',
                        }}
                    >
                        Todos
                    </button>
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            style={{
                                ...chipStyle,
                                background: activeCategory === cat.id ? cat.color : '#F1F5F9',
                                color: activeCategory === cat.id ? '#fff' : '#64748B',
                                borderColor: activeCategory === cat.id ? cat.color : '#E2E8F0',
                            }}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ========== LIST ========== */}
            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    <p style={{ margin: '12px 0 0', fontSize: '0.82rem' }}>Cargando plantillas...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                    <Zap size={32} strokeWidth={1.2} />
                    <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
                        {search || activeCategory !== 'all' ? 'Sin resultados para este filtro' : 'No hay plantillas creadas'}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.75rem' }}>
                        {!search && activeCategory === 'all' && 'Creá tu primera plantilla con el botón "Nueva Plantilla"'}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {filtered.map(sc => (
                        <div
                            key={sc.id}
                            style={{
                                borderRadius: '10px',
                                border: `1px solid ${editingId === sc.id ? '#FDE68A' : 'var(--neutral-200)'}`,
                                background: editingId === sc.id ? '#FFFBEB' : '#fff',
                                transition: 'all 0.15s',
                                overflow: 'hidden',
                            }}
                        >
                            {/* Row Header */}
                            <div
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '12px 14px', cursor: 'pointer',
                                }}
                                onClick={() => toggleExpand(sc.id)}
                            >
                                {expandedItems[sc.id]
                                    ? <ChevronDown size={14} style={{ color: 'var(--neutral-400)', transition: 'transform 0.2s', flexShrink: 0 }} />
                                    : <ChevronRight size={14} style={{ color: 'var(--neutral-400)', transition: 'transform 0.2s', flexShrink: 0 }} />
                                }
                                <span style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: '0.78rem', fontWeight: 700,
                                    color: getCategoryColor(sc.category),
                                    background: `${getCategoryColor(sc.category)}10`,
                                    padding: '3px 10px', borderRadius: '6px',
                                    flexShrink: 0,
                                }}>
                                    {sc.shortcut}
                                </span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111B21', flex: 1 }}>
                                    {sc.label}
                                </span>
                                {sc.category && (
                                    <span style={{
                                        fontSize: '0.65rem', color: getCategoryColor(sc.category),
                                        background: `${getCategoryColor(sc.category)}10`,
                                        padding: '2px 8px', borderRadius: '4px', fontWeight: 600,
                                        flexShrink: 0,
                                    }}>
                                        {CATEGORIES.find(c => c.id === sc.category)?.label || sc.category}
                                    </span>
                                )}
                                {countVariables(sc.message) > 0 && (
                                    <span style={{
                                        fontSize: '0.62rem', color: '#F59E0B',
                                        background: '#FFFBEB', padding: '2px 6px', borderRadius: '4px',
                                        fontWeight: 700, flexShrink: 0,
                                    }}>
                                        <Variable size={10} style={{ verticalAlign: '-1px', marginRight: '2px' }} />
                                        {countVariables(sc.message)}
                                    </span>
                                )}
                                {!sc.is_active && (
                                    <span style={{
                                        fontSize: '0.6rem', color: '#DC2626',
                                        background: '#FEE2E2', padding: '2px 6px', borderRadius: '4px',
                                        fontWeight: 700, flexShrink: 0,
                                    }}>
                                        INACTIVO
                                    </span>
                                )}
                                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={() => startEdit(sc)}
                                        style={actionBtnStyle}
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
                                                Sí
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
                                            style={{ ...actionBtnStyle, borderColor: '#FEE2E2', color: '#EF4444' }}
                                            title="Eliminar"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Expanded Content */}
                            {expandedItems[sc.id] && (
                                <div className="animate-fade-in" style={{
                                    padding: '0 14px 14px 38px',
                                    borderTop: '1px solid var(--neutral-100)',
                                }}>
                                    <p style={{
                                        margin: '10px 0 0', fontSize: '0.78rem', color: '#667781',
                                        lineHeight: 1.5, whiteSpace: 'pre-wrap',
                                        background: '#F8FAFC', padding: '10px 12px',
                                        borderRadius: '8px', border: '1px solid #E2E8F0',
                                    }}>
                                        {sc.message}
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================
// Preview renderer — highlights resolved variables
// ============================================
function renderPreviewWithHighlights(text) {
    return text;
}

// ============================================
// Shared styles
// ============================================
const labelStyle = {
    fontSize: '0.7rem', fontWeight: 600, color: '#64748B',
    marginBottom: '4px', display: 'block', textTransform: 'uppercase',
    letterSpacing: '0.03em',
};

const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: '6px',
    border: '1px solid #D1D5DB', fontSize: '0.82rem', outline: 'none',
    background: '#fff', transition: 'border-color 0.2s',
};

const chipStyle = {
    padding: '5px 12px', borderRadius: '16px',
    border: '1px solid', fontSize: '0.7rem', fontWeight: 700,
    cursor: 'pointer', transition: 'all 0.15s',
    whiteSpace: 'nowrap',
};

const actionBtnStyle = {
    width: '30px', height: '30px', borderRadius: '6px',
    background: 'none', border: '1px solid #E2E8F0',
    color: '#6366F1', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
};
