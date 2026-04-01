/**
 * AsignacionPanel.jsx — Criterios de Asignación para Altas Administrativas
 * CRUD editable + Import Excel + Matching jerárquico
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Search, Upload, Plus, Trash2, Save, X, Loader2, FileText,
    Edit2, Check, AlertCircle, Download, Filter, ChevronDown,
    Shield, RefreshCw,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
    fetchAsignaciones, upsertAsignacion, deleteAsignacion,
    importFromExcel, canEditAsignacion,
} from '../services/asignacionService';

const PRIORIDAD_STYLES = {
    3: { label: 'OS + Espec + Proceso', color: '#10B981', bg: '#ECFDF5', border: '#10B98130' },
    2: { label: 'OS + Especialidad', color: '#F59E0B', bg: '#FFFBEB', border: '#F59E0B30' },
    1: { label: 'Solo OS', color: '#6B7280', bg: '#F3F4F6', border: '#6B728030' },
};

export default function AsignacionPanel({ addToast, currentUser }) {
    const [reglas, setReglas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterResp, setFilterResp] = useState('');
    const [filterPrioridad, setFilterPrioridad] = useState('');

    // Editing
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);

    // New rule
    const [showNewRow, setShowNewRow] = useState(false);
    const [newForm, setNewForm] = useState({ obra_social: '', especialidad: '', proceso: '', responsable: '', tutor: '' });

    // Import
    const [importing, setImporting] = useState(false);
    const [importPreview, setImportPreview] = useState(null);
    const fileInputRef = useRef(null);

    const isEditor = canEditAsignacion(currentUser);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchAsignaciones();
            setReglas(data);
        } catch (e) {
            addToast?.('Error cargando asignaciones: ' + e.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    // Unique responsables for filter
    const responsables = [...new Set(reglas.map(r => r.responsable).filter(Boolean))].sort();

    // Filtered list
    const filtered = reglas.filter(r => {
        if (search) {
            const s = search.toLowerCase();
            if (!(r.obra_social?.toLowerCase().includes(s) || r.especialidad?.toLowerCase().includes(s) ||
                  r.proceso?.toLowerCase().includes(s) || r.responsable?.toLowerCase().includes(s) ||
                  r.tutor?.toLowerCase().includes(s))) return false;
        }
        if (filterResp && r.responsable !== filterResp) return false;
        if (filterPrioridad && r.prioridad !== parseInt(filterPrioridad)) return false;
        return true;
    });

    // ── CRUD ──
    async function handleSaveEdit() {
        if (!editForm.obra_social?.trim() || !editForm.responsable?.trim()) {
            addToast?.('Obra Social y Responsable son obligatorios', 'error');
            return;
        }
        setSaving(true);
        try {
            await upsertAsignacion({ ...editForm, id: editingId }, currentUser?.email);
            addToast?.('Regla actualizada', 'success');
            setEditingId(null); setEditForm({});
            loadData();
        } catch (e) { addToast?.('Error: ' + e.message, 'error'); }
        setSaving(false);
    }

    async function handleSaveNew() {
        if (!newForm.obra_social?.trim() || !newForm.responsable?.trim()) {
            addToast?.('Obra Social y Responsable son obligatorios', 'error');
            return;
        }
        setSaving(true);
        try {
            await upsertAsignacion(newForm, currentUser?.email);
            addToast?.('Regla creada', 'success');
            setShowNewRow(false);
            setNewForm({ obra_social: '', especialidad: '', proceso: '', responsable: '', tutor: '' });
            loadData();
        } catch (e) { addToast?.('Error: ' + e.message, 'error'); }
        setSaving(false);
    }

    async function handleDelete(id) {
        if (!confirm('¿Eliminar esta regla de asignación?')) return;
        try {
            await deleteAsignacion(id);
            addToast?.('Regla eliminada', 'success');
            loadData();
        } catch (e) { addToast?.('Error: ' + e.message, 'error'); }
    }

    // ── EXCEL IMPORT ──
    function handleFileSelect(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const wb = XLSX.read(event.target.result, { type: 'array' });
                // Try "Asignacion" sheet first, then first sheet
                const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes('asignacion')) || wb.SheetNames[0];
                const ws = wb.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                // Find header row
                let headerIdx = 0;
                for (let i = 0; i < Math.min(5, rows.length); i++) {
                    const row = rows[i].map(c => String(c).toLowerCase());
                    if (row.some(c => c.includes('obra social') || c.includes('obra_social'))) {
                        headerIdx = i; break;
                    }
                }

                // Map columns: A=obra_social, B=especialidad, C=proceso, D=responsable, E=tutor
                const dataRows = rows.slice(headerIdx + 1)
                    .filter(r => r[0] && String(r[3] || '').trim()) // Need at least OS and Responsable
                    .map(r => ({
                        obra_social: String(r[0] || '').trim(),
                        especialidad: String(r[1] || '').trim(),
                        proceso: String(r[2] || '').trim(),
                        responsable: String(r[3] || '').trim(),
                        tutor: String(r[4] || '').trim(),
                    }));

                setImportPreview({ rows: dataRows, sheetName, fileName: file.name });
            } catch (err) {
                addToast?.('Error leyendo Excel: ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    async function confirmImport() {
        if (!importPreview?.rows?.length) return;
        setImporting(true);
        try {
            const result = await importFromExcel(importPreview.rows, currentUser?.email);
            addToast?.(`✅ ${result.inserted} reglas importadas`, 'success');
            setImportPreview(null);
            loadData();
        } catch (e) { addToast?.('Error importando: ' + e.message, 'error'); }
        setImporting(false);
    }

    // ════════════════════════════════════
    // RENDER
    // ════════════════════════════════════
    return (
        <div className="content no-print" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{
                        margin: 0, fontSize: '1.35rem', fontWeight: 800,
                        color: 'var(--neutral-800)', letterSpacing: '-0.3px',
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #10B981, #059669)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: '1rem',
                        }}>📋</div>
                        Criterios de Asignación
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--neutral-400)' }}>
                        {reglas.length} reglas activas · Matching jerárquico OS → Especialidad → Proceso
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isEditor && (
                        <>
                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFileSelect} style={{ display: 'none' }} />
                            <button onClick={() => fileInputRef.current?.click()} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '8px 14px', borderRadius: '10px',
                                background: '#fff', color: '#10B981',
                                border: '1px solid #10B98140', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                            }}><Upload size={14} /> Importar Excel</button>
                            <button onClick={() => { setShowNewRow(true); setNewForm({ obra_social: '', especialidad: '', proceso: '', responsable: '', tutor: '' }); }} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '8px 14px', borderRadius: '10px',
                                background: 'linear-gradient(135deg, #10B981, #059669)', color: '#fff',
                                border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                            }}><Plus size={14} /> Nueva Regla</button>
                        </>
                    )}
                    <button onClick={loadData} disabled={loading} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '8px 14px', borderRadius: '10px',
                        background: '#fff', color: 'var(--neutral-600)',
                        border: '1px solid var(--neutral-200)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                    }}><RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Actualizar</button>
                </div>
            </div>

            {/* Permission notice */}
            {!isEditor && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                    borderRadius: '10px', background: '#FFFBEB', border: '1px solid #F59E0B30',
                    fontSize: '0.78rem', color: '#92400E',
                }}><Shield size={14} /> Modo lectura. Solo jcorrea y lmarinero pueden modificar las reglas.</div>
            )}

            {/* ── Import Preview Modal ── */}
            {importPreview && (
                <div style={{
                    padding: '16px', borderRadius: '12px',
                    background: '#ECFDF5', border: '1px solid #10B98130',
                    animation: 'fadeIn 0.2s ease-out',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#065F46' }}>
                                📥 Preview: {importPreview.fileName}
                            </h4>
                            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#064E3B' }}>
                                Hoja: "{importPreview.sheetName}" · {importPreview.rows.length} reglas detectadas
                            </p>
                        </div>
                        <button onClick={() => setImportPreview(null)} style={{
                            background: 'none', border: 'none', cursor: 'pointer', color: '#064E3B',
                        }}><X size={16} /></button>
                    </div>

                    {/* Preview table */}
                    <div style={{ maxHeight: '250px', overflow: 'auto', borderRadius: '8px', border: '1px solid #10B98120', background: '#fff' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                            <thead>
                                <tr style={{ background: '#F0FDF4' }}>
                                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#065F46' }}>Obra Social</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#065F46' }}>Especialidad</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#065F46' }}>Proceso</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#065F46' }}>Responsable</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#065F46' }}>Tutor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {importPreview.rows.slice(0, 20).map((r, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                        <td style={{ padding: '5px 10px' }}>{r.obra_social}</td>
                                        <td style={{ padding: '5px 10px', color: r.especialidad ? 'inherit' : '#9CA3AF' }}>{r.especialidad || '—'}</td>
                                        <td style={{ padding: '5px 10px', color: r.proceso ? 'inherit' : '#9CA3AF', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.proceso || '—'}</td>
                                        <td style={{ padding: '5px 10px', fontWeight: 600 }}>{r.responsable}</td>
                                        <td style={{ padding: '5px 10px', color: r.tutor ? 'inherit' : '#9CA3AF' }}>{r.tutor || '—'}</td>
                                    </tr>
                                ))}
                                {importPreview.rows.length > 20 && (
                                    <tr><td colSpan={5} style={{ padding: '8px', textAlign: 'center', color: '#6B7280', fontStyle: 'italic' }}>... y {importPreview.rows.length - 20} más</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setImportPreview(null)} style={{
                            padding: '8px 16px', borderRadius: '8px', border: '1px solid #D1D5DB',
                            background: '#fff', color: '#6B7280', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                        }}>Cancelar</button>
                        <button onClick={confirmImport} disabled={importing} style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 20px', borderRadius: '8px', border: 'none',
                            background: '#10B981', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                        }}>{importing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} Reemplazar todo ({importPreview.rows.length} reglas)</button>
                    </div>
                </div>
            )}

            {/* ── Filtros ── */}
            <div style={{
                display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
                padding: '10px 14px', borderRadius: '12px',
                background: '#FAFAFA', border: '1px solid var(--neutral-100)',
            }}>
                <div style={{ flex: 1, position: 'relative', minWidth: '200px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
                    <input type="text" placeholder="Buscar OS, especialidad, proceso, responsable..." value={search} onChange={e => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.8rem', color: 'var(--neutral-700)' }} />
                </div>
                <select value={filterResp} onChange={e => setFilterResp(e.target.value)} style={{
                    padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--neutral-200)',
                    fontSize: '0.78rem', color: 'var(--neutral-700)', background: '#fff',
                }}>
                    <option value="">Todos los responsables</option>
                    {responsables.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={filterPrioridad} onChange={e => setFilterPrioridad(e.target.value)} style={{
                    padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--neutral-200)',
                    fontSize: '0.78rem', color: 'var(--neutral-700)', background: '#fff',
                }}>
                    <option value="">Todas las prioridades</option>
                    <option value="3">🔴 OS + Espec + Proceso</option>
                    <option value="2">🟡 OS + Especialidad</option>
                    <option value="1">⚪ Solo OS</option>
                </select>
                {(search || filterResp || filterPrioridad) && (
                    <button onClick={() => { setSearch(''); setFilterResp(''); setFilterPrioridad(''); }} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '5px 10px', borderRadius: '6px',
                        background: '#FEE2E2', color: '#DC2626',
                        border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
                    }}><X size={12} /> Limpiar</button>
                )}
            </div>

            {/* ── Table ── */}
            <div className="cart animate-fade-in" style={{ overflow: 'visible' }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '10px', color: 'var(--neutral-400)' }}>
                        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Cargando reglas...</span>
                    </div>
                ) : (
                    <div className="cart__table-wrapper" style={{ overflowX: 'auto' }}>
                        <table className="cart__table" style={{ minWidth: '900px' }}>
                            <thead>
                                <tr>
                                    <th className="cart__th" style={{ width: '50px', textAlign: 'center' }}>Nivel</th>
                                    <th className="cart__th">Obra Social</th>
                                    <th className="cart__th">Especialidad</th>
                                    <th className="cart__th">Proceso</th>
                                    <th className="cart__th" style={{ width: '120px' }}>Responsable</th>
                                    <th className="cart__th" style={{ width: '100px' }}>Tutor</th>
                                    {isEditor && <th className="cart__th" style={{ width: '70px', textAlign: 'center' }}>Acciones</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {/* New row form */}
                                {showNewRow && isEditor && (
                                    <tr style={{ background: '#ECFDF5' }}>
                                        <td className="cart__td" style={{ textAlign: 'center' }}><Plus size={14} color="#10B981" /></td>
                                        <td className="cart__td">
                                            <input type="text" value={newForm.obra_social} onChange={e => setNewForm(p => ({ ...p, obra_social: e.target.value }))}
                                                placeholder="001 - PROVINCIA" style={inputStyle} autoFocus />
                                        </td>
                                        <td className="cart__td">
                                            <input type="text" value={newForm.especialidad} onChange={e => setNewForm(p => ({ ...p, especialidad: e.target.value }))}
                                                placeholder="CIRUGIA" style={inputStyle} />
                                        </td>
                                        <td className="cart__td">
                                            <input type="text" value={newForm.proceso} onChange={e => setNewForm(p => ({ ...p, proceso: e.target.value }))}
                                                placeholder="110403 - CESAREA" style={inputStyle} />
                                        </td>
                                        <td className="cart__td">
                                            <input type="text" value={newForm.responsable} onChange={e => setNewForm(p => ({ ...p, responsable: e.target.value }))}
                                                placeholder="MARCE" style={{ ...inputStyle, fontWeight: 700 }} />
                                        </td>
                                        <td className="cart__td">
                                            <input type="text" value={newForm.tutor} onChange={e => setNewForm(p => ({ ...p, tutor: e.target.value }))}
                                                placeholder="—" style={inputStyle} />
                                        </td>
                                        <td className="cart__td" style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                <button onClick={handleSaveNew} disabled={saving} style={actionBtnStyle('#10B981')}><Check size={13} /></button>
                                                <button onClick={() => setShowNewRow(false)} style={actionBtnStyle('#EF4444')}><X size={13} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                )}

                                {filtered.length === 0 && !showNewRow ? (
                                    <tr>
                                        <td colSpan={isEditor ? 7 : 6} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--neutral-400)' }}>
                                            <FileText size={40} strokeWidth={1.2} style={{ marginBottom: '8px' }} />
                                            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Sin reglas de asignación</p>
                                            <p style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>Importá un Excel o agregá manualmente.</p>
                                        </td>
                                    </tr>
                                ) : filtered.map(r => {
                                    const pStyle = PRIORIDAD_STYLES[r.prioridad] || PRIORIDAD_STYLES[1];
                                    const isEditing = editingId === r.id;

                                    return (
                                        <tr key={r.id} className="cart__row" style={{ transition: 'background 0.15s' }}
                                            onMouseOver={e => !isEditing && (e.currentTarget.style.background = 'var(--neutral-50)')}
                                            onMouseOut={e => !isEditing && (e.currentTarget.style.background = isEditing ? '#FFFBEB' : '')}
                                        >
                                            <td className="cart__td" style={{ textAlign: 'center' }}>
                                                <span style={{
                                                    display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
                                                    fontSize: '0.62rem', fontWeight: 800,
                                                    background: pStyle.bg, color: pStyle.color,
                                                    border: `1px solid ${pStyle.border}`,
                                                }}>{r.prioridad}</span>
                                            </td>
                                            <td className="cart__td">
                                                {isEditing ? <input type="text" value={editForm.obra_social || ''} onChange={e => setEditForm(p => ({ ...p, obra_social: e.target.value }))} style={inputStyle} /> :
                                                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{r.obra_social}</span>}
                                            </td>
                                            <td className="cart__td">
                                                {isEditing ? <input type="text" value={editForm.especialidad || ''} onChange={e => setEditForm(p => ({ ...p, especialidad: e.target.value }))} style={inputStyle} /> :
                                                <span style={{ fontSize: '0.78rem', color: r.especialidad ? 'var(--neutral-600)' : 'var(--neutral-300)' }}>{r.especialidad || '—'}</span>}
                                            </td>
                                            <td className="cart__td">
                                                {isEditing ? <input type="text" value={editForm.proceso || ''} onChange={e => setEditForm(p => ({ ...p, proceso: e.target.value }))} style={inputStyle} /> :
                                                <span style={{ fontSize: '0.75rem', color: r.proceso ? 'var(--neutral-500)' : 'var(--neutral-300)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{r.proceso || '—'}</span>}
                                            </td>
                                            <td className="cart__td">
                                                {isEditing ? <input type="text" value={editForm.responsable || ''} onChange={e => setEditForm(p => ({ ...p, responsable: e.target.value }))} style={{ ...inputStyle, fontWeight: 700 }} /> :
                                                <span style={{
                                                    display: 'inline-block', padding: '2px 10px', borderRadius: 'var(--radius-full)',
                                                    background: '#EFF6FF', color: '#1E40AF',
                                                    fontSize: '0.75rem', fontWeight: 700,
                                                }}>{r.responsable}</span>}
                                            </td>
                                            <td className="cart__td">
                                                {isEditing ? <input type="text" value={editForm.tutor || ''} onChange={e => setEditForm(p => ({ ...p, tutor: e.target.value }))} style={inputStyle} /> :
                                                r.tutor ? <span style={{
                                                    display: 'inline-block', padding: '2px 10px', borderRadius: 'var(--radius-full)',
                                                    background: '#F5F3FF', color: '#6D28D9',
                                                    fontSize: '0.72rem', fontWeight: 600,
                                                }}>{r.tutor}</span> : <span style={{ color: 'var(--neutral-300)', fontSize: '0.78rem' }}>—</span>}
                                            </td>
                                            {isEditor && (
                                                <td className="cart__td" style={{ textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                        {isEditing ? (
                                                            <>
                                                                <button onClick={handleSaveEdit} disabled={saving} style={actionBtnStyle('#10B981')}><Check size={13} /></button>
                                                                <button onClick={() => { setEditingId(null); setEditForm({}); }} style={actionBtnStyle('#6B7280')}><X size={13} /></button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => { setEditingId(r.id); setEditForm({ obra_social: r.obra_social, especialidad: r.especialidad || '', proceso: r.proceso || '', responsable: r.responsable, tutor: r.tutor || '' }); }} style={actionBtnStyle('#3B82F6')}><Edit2 size={12} /></button>
                                                                <button onClick={() => handleDelete(r.id)} style={actionBtnStyle('#EF4444')}><Trash2 size={12} /></button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Stats bar ── */}
            {!loading && reglas.length > 0 && (
                <div style={{
                    display: 'flex', gap: '16px', justifyContent: 'center',
                    padding: '8px', fontSize: '0.72rem', color: 'var(--neutral-400)',
                }}>
                    {[3, 2, 1].map(p => {
                        const count = reglas.filter(r => r.prioridad === p).length;
                        const s = PRIORIDAD_STYLES[p];
                        return (
                            <span key={p} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                                {s.label}: {count}
                            </span>
                        );
                    })}
                    <span>Total: {reglas.length}</span>
                    {filtered.length !== reglas.length && <span>(mostrando {filtered.length})</span>}
                </div>
            )}
        </div>
    );
}

// ── Shared Styles ──
const inputStyle = {
    width: '100%', padding: '4px 8px', borderRadius: '6px',
    border: '1px solid #10B98150', fontSize: '0.78rem',
    fontFamily: 'inherit', outline: 'none',
};

function actionBtnStyle(color) {
    return {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '28px', height: '28px', borderRadius: '6px',
        border: 'none', background: `${color}15`, color,
        cursor: 'pointer', transition: 'all 0.15s',
    };
}
