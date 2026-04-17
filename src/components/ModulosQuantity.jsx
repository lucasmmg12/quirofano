import { useState, useEffect } from 'react';
import { Save, Check, Edit2, Trash2, X } from 'lucide-react';

export default function ModulosQuantity({ record, onSave, onDelete, readonly = false }) {
    const [modA, setModA] = useState(record.modulo_a_qty || 0);
    const [modB, setModB] = useState(record.modulo_b_qty || 0);
    const [modC, setModC] = useState(record.modulo_c_qty || 0);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        setModA(record.modulo_a_qty || 0);
        setModB(record.modulo_b_qty || 0);
        setModC(record.modulo_c_qty || 0);
        setIsEditing(false);
    }, [record.modulo_a_qty, record.modulo_b_qty, record.modulo_c_qty]);

    const isAssigned = record.modulo_a_qty > 0 || record.modulo_b_qty > 0 || record.modulo_c_qty > 0 || record.modulo_asignado;

    // View mode for LaboratoriosPanel if readonly and assigned
    if (readonly && isAssigned && !isEditing) {
         return (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                     {record.modulo_asignado && !record.modulo_a_qty && !record.modulo_b_qty && !record.modulo_c_qty ? (
                        <div style={{ padding: '4px 10px', background: '#F5F3FF', color: '#7C3AED', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #DDD6FE', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Check size={12} /> {record.modulo_asignado}
                        </div>
                     ) : (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                             {record.modulo_a_qty > 0 && <span style={{ background: '#EEF2FF', color: '#4F46E5', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>A: {record.modulo_a_qty}</span>}
                             {record.modulo_b_qty > 0 && <span style={{ background: '#ECFEFF', color: '#0891B2', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>B: {record.modulo_b_qty}</span>}
                             {record.modulo_c_qty > 0 && <span style={{ background: '#FDF4FF', color: '#C026D3', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>C: {record.modulo_c_qty}</span>}
                         </div>
                     )}
                     <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                         <button onClick={() => setIsEditing(true)} style={{ background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px' }} title="Editar">
                             <Edit2 size={14} />
                         </button>
                         {onDelete && (
                             <button onClick={() => { if(window.confirm('¿Seguro que desea eliminar esta asignación?')) { onDelete(record.id_visita); } }} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '4px' }} title="Eliminar">
                                 <Trash2 size={14} />
                             </button>
                         )}
                     </div>
                 </div>
                 <div style={{ fontSize: '0.65rem', color: 'var(--neutral-400)', marginTop: '2px' }}>
                    {record.clasificado_por} • {new Date(record.clasificado_at).toLocaleDateString('es-AR')}
                </div>
             </div>
         )
    }

    // Editable Mode
    const handleSave = async () => {
        setSaving(true);
        await onSave(record.id_visita, modA, modB, modC);
        setSaving(false);
        setIsEditing(false);
    };

    const hasChanges = modA !== (record.modulo_a_qty || 0) || modB !== (record.modulo_b_qty || 0) || modC !== (record.modulo_c_qty || 0);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', width: '12px' }}>A:</span>
                    <input type="number" min="0" max="10" value={modA} onChange={e => setModA(parseInt(e.target.value) || 0)} style={{ width: '40px', padding: '2px', border: '1px solid #CBD5E1', borderRadius: '4px', textAlign: 'center', outline: 'none', background: '#fff' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', width: '12px' }}>B:</span>
                    <input type="number" min="0" max="10" value={modB} onChange={e => setModB(parseInt(e.target.value) || 0)} style={{ width: '40px', padding: '2px', border: '1px solid #CBD5E1', borderRadius: '4px', textAlign: 'center', outline: 'none', background: '#fff' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', width: '12px' }}>C:</span>
                    <input type="number" min="0" max="10" value={modC} onChange={e => setModC(parseInt(e.target.value) || 0)} style={{ width: '40px', padding: '2px', border: '1px solid #CBD5E1', borderRadius: '4px', textAlign: 'center', outline: 'none', background: '#fff' }} />
                </div>
            </div>
            {hasChanges ? (
                <button onClick={handleSave} disabled={saving} style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.7 : 1 }}>
                    <Save size={16} />
                </button>
            ) : isEditing ? (
                <button onClick={() => setIsEditing(false)} style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={16} />
                </button>
            ) : null}
        </div>
    );
}
