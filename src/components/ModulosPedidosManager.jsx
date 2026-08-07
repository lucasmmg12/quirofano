import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Save, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PRACTICES } from '../data/nomenclador';

export default function ModulosPedidosManager({ isOpen, onClose, onModuleAdded }) {
    const [modulos, setModulos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editItems, setEditItems] = useState([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (isOpen) {
            loadModulos();
        }
    }, [isOpen]);

    const loadModulos = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('pedidos_modulos').select('*').order('created_at', { ascending: true });
            if (error) throw error;
            setModulos(data || []);
        } catch (err) {
            console.error('Error loading modules:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = () => {
        setEditingId('new');
        setEditName('Nuevo Módulo');
        setEditItems([]);
        setSearch('');
    };

    const handleEdit = (mod) => {
        setEditingId(mod.id);
        setEditName(mod.nombre);
        setEditItems(mod.items || []);
        setSearch('');
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Seguro que deseas eliminar este módulo?')) return;
        try {
            await supabase.from('pedidos_modulos').delete().eq('id', id);
            setModulos(modulos.filter(m => m.id !== id));
            onModuleAdded();
        } catch (err) {
            console.error(err);
        }
    };

    const handleSave = async () => {
        if (!editName.trim()) return;
        try {
            if (editingId === 'new') {
                const { data, error } = await supabase.from('pedidos_modulos').insert({
                    nombre: editName,
                    items: editItems
                }).select();
                if (error) throw error;
                setModulos([...modulos, data[0]]);
            } else {
                const { error } = await supabase.from('pedidos_modulos').update({
                    nombre: editName,
                    items: editItems
                }).eq('id', editingId);
                if (error) throw error;
                setModulos(modulos.map(m => m.id === editingId ? { ...m, nombre: editName, items: editItems } : m));
            }
            setEditingId(null);
            onModuleAdded(); // Refresh parent
        } catch (err) {
            console.error(err);
        }
    };

    const toggleItem = (code) => {
        if (editItems.includes(code)) {
            setEditItems(editItems.filter(c => c !== code));
        } else {
            setEditItems([...editItems, code]);
        }
    };

    const filteredPractices = PRACTICES.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) || 
        p.code.toLowerCase().includes(search.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', width: '90%', maxWidth: '800px', maxHeight: '90vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '20px', borderBottom: '1px solid #E5E7EB' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1E293B', fontWeight: 700 }}>Gestión de Módulos de Pedidos</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', gap: '20px' }}>
                    {/* List of Modules */}
                    <div style={{ flex: 1, borderRight: editingId ? '1px solid #E5E7EB' : 'none', paddingRight: editingId ? '20px' : '0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', color: '#334155' }}>Mis Módulos</h3>
                            {!editingId && (
                                <button onClick={handleCreateNew} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#3B82F6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                                    <Plus size={16} /> Nuevo
                                </button>
                            )}
                        </div>
                        {loading ? (
                            <p style={{ color: '#94A3B8' }}>Cargando...</p>
                        ) : modulos.length === 0 ? (
                            <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>No hay módulos creados. Crea uno para agrupar prácticas frecuentes.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {modulos.map(mod => (
                                    <div key={mod.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.95rem' }}>{mod.nombre}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{mod.items.length} prácticas incluidas</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => handleEdit(mod)} style={{ background: '#EEF2FF', border: 'none', padding: '6px', borderRadius: '4px', color: '#4F46E5', cursor: 'pointer' }} title="Editar">
                                                <Edit2 size={16} />
                                            </button>
                                            <button onClick={() => handleDelete(mod.id)} style={{ background: '#FEF2F2', border: 'none', padding: '6px', borderRadius: '4px', color: '#EF4444', cursor: 'pointer' }} title="Eliminar">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Editor */}
                    {editingId && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Nombre del Módulo</label>
                                <input 
                                    type="text" 
                                    value={editName} 
                                    onChange={e => setEditName(e.target.value)} 
                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' }} 
                                    placeholder="Ej: Cirugía Hernia"
                                />
                            </div>

                            <div style={{ marginBottom: '12px' }}>
                                <input 
                                    type="text" 
                                    value={search} 
                                    onChange={e => setSearch(e.target.value)} 
                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '0.85rem', background: '#F8FAFC', boxSizing: 'border-box' }} 
                                    placeholder="Buscar prácticas para añadir..."
                                />
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '4px', maxHeight: '300px' }}>
                                {filteredPractices.slice(0, 50).map(p => {
                                    const isSelected = editItems.includes(p.code);
                                    return (
                                        <div 
                                            key={p.code} 
                                            onClick={() => toggleItem(p.code)}
                                            style={{ display: 'flex', alignItems: 'center', padding: '8px', gap: '8px', cursor: 'pointer', borderRadius: '4px', background: isSelected ? '#F0FDF4' : 'transparent', marginBottom: '2px' }}
                                        >
                                            <div style={{ width: '18px', height: '18px', border: isSelected ? 'none' : '2px solid #CBD5E1', background: isSelected ? '#22C55E' : 'transparent', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                {isSelected && <Check size={14} color="#fff" />}
                                            </div>
                                            <div style={{ flex: 1, fontSize: '0.85rem', color: isSelected ? '#166534' : '#334155', lineHeight: '1.2' }}>
                                                <span style={{ fontWeight: 600 }}>{p.code}</span> - {p.name}
                                            </div>
                                        </div>
                                    );
                                })}
                                {filteredPractices.length > 50 && <div style={{ padding: '8px', fontSize: '0.8rem', color: '#94A3B8', textAlign: 'center' }}>Demasiados resultados, refina la búsqueda.</div>}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                                <button onClick={() => setEditingId(null)} style={{ padding: '8px 16px', border: '1px solid #CBD5E1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
                                    Cancelar
                                </button>
                                <button onClick={handleSave} style={{ padding: '8px 16px', border: 'none', background: '#3B82F6', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Save size={16} /> Guardar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
