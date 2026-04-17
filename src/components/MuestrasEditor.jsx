import { useState, useEffect } from 'react';
import { Save, Edit2, X } from 'lucide-react';

export default function MuestrasEditor({ record, onSave }) {
    const [isEditing, setIsEditing] = useState(false);
    const [bCongelacion, setBCongelacion] = useState(record.biopsia_congelacion || '');
    const [bSimple, setBSimple] = useState(record.biopsia_simple || '');
    const [bAmpliada, setBAmpliada] = useState(record.biopsia_ampliada || '');

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setBCongelacion(record.biopsia_congelacion || '');
        setBSimple(record.biopsia_simple || '');
        setBAmpliada(record.biopsia_ampliada || '');
    }, [record]);

    const handleSave = async () => {
        setSaving(true);
        await onSave(record.id_visita, {
            biopsia_congelacion: bCongelacion,
            biopsia_simple: bSimple,
            biopsia_ampliada: bAmpliada
        });
        setSaving(false);
        setIsEditing(false);
    };

    if (!isEditing) {
        return (
            <div style={{ position: 'relative' }}>
                <button 
                    onClick={() => setIsEditing(true)} 
                    style={{ position: 'absolute', top: '-34px', right: '0', background: 'none', border: '1px solid var(--neutral-200, #E2E8F0)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: 'var(--neutral-500, #64748B)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.2s' }}
                    onMouseOver={e=>e.currentTarget.style.background='var(--neutral-50, #F8FAFC)'}
                    onMouseOut={e=>e.currentTarget.style.background='none'}
                    title="Editar información de muestras y material"
                >
                    <Edit2 size={12} /> Editar
                </button>
                <div style={{ fontSize: '0.85rem', color: 'var(--neutral-700, #334155)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {record.biopsia_congelacion ? <div><span style={{ background: '#E0F2FE', color: '#0369A1', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, fontSize: '0.75rem', marginRight: '6px', border: '1px solid #BAE6FD' }}>❄️ Congelación</span> <span style={{marginLeft: '4px', fontSize: '0.85rem'}}><strong style={{color: 'var(--neutral-600, #475569)'}}>Cant:</strong> {record.biopsia_congelacion}</span></div> : null}
                    
                    {record.biopsia_simple ? <div><span style={{ background: '#DCFCE7', color: '#15803D', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, fontSize: '0.75rem', marginRight: '6px', border: '1px solid #BBF7D0' }}>Simple</span> <span style={{marginLeft: '4px', fontSize: '0.85rem'}}><strong style={{color: 'var(--neutral-600, #475569)'}}>Cant:</strong> {record.biopsia_simple}</span> <div style={{ color: 'var(--neutral-500, #64748B)', marginLeft: '12px', marginTop: '4px', fontSize: '0.8rem', display: 'flex', gap: '4px' }}><span style={{color: 'var(--neutral-300, #CBD5E1)'}}>↳</span> <span style={{fontStyle: 'italic'}}>{record.material_biopsia_simple || 'Material no especificado'}</span></div></div> : null}
                    
                    {record.biopsia_ampliada ? <div><span style={{ background: '#FFEDD5', color: '#C2410C', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, fontSize: '0.75rem', marginRight: '6px', border: '1px solid #FED7AA' }}>Ampliada</span> <span style={{marginLeft: '4px', fontSize: '0.85rem'}}><strong style={{color: 'var(--neutral-600, #475569)'}}>Cant:</strong> {record.biopsia_ampliada}</span> <div style={{ color: 'var(--neutral-500, #64748B)', marginLeft: '12px', marginTop: '4px', fontSize: '0.8rem', display: 'flex', gap: '4px' }}><span style={{color: 'var(--neutral-300, #CBD5E1)'}}>↳</span> <span style={{fontStyle: 'italic'}}>{record.material_biopsia_ampliada || 'Material no especificado'}</span></div></div> : null}
                    
                    {!record.biopsia_congelacion && !record.biopsia_simple && !record.biopsia_ampliada && <span style={{ color: 'var(--neutral-400, #94A3B8)' }}>Sin muestras registradas.</span>}
                </div>
            </div>
        );
    }

    const inputStyle = { padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--neutral-200, #E2E8F0)', fontSize: '0.8rem', outline: 'none', width: '100%', boxSizing: 'border-box' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--neutral-50, #F8FAFC)', padding: '12px', borderRadius: '8px', border: '1px dashed var(--neutral-300, #CBD5E1)' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 60px', gap: '8px', alignItems: 'center' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0369A1' }}>❄️ Congelación</label>
                <input 
                    type="text" 
                    placeholder="Ej: SI / NO"
                    value={bCongelacion} 
                    onChange={e => setBCongelacion(e.target.value)} 
                    style={{...inputStyle, textAlign: 'center'}} 
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 60px', gap: '8px', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#15803D' }}>Simple (Cant)</label>
                    <input 
                        type="text" 
                        value={bSimple} 
                        onChange={e => setBSimple(e.target.value)} 
                        style={{...inputStyle, textAlign: 'center'}} 
                    />
                </div>
                <div style={{ color: 'var(--neutral-500, #64748B)', marginLeft: '12px', fontSize: '0.8rem', display: 'flex', gap: '4px' }}><span style={{color: 'var(--neutral-300, #CBD5E1)'}}>↳</span> <span style={{fontStyle: 'italic'}}>{record.material_biopsia_simple || 'Material no especificado'}</span></div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 60px', gap: '8px', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#C2410C' }}>Ampliada (Cant)</label>
                    <input 
                        type="text" 
                        value={bAmpliada} 
                        onChange={e => setBAmpliada(e.target.value)} 
                        style={{...inputStyle, textAlign: 'center'}} 
                    />
                </div>
                <div style={{ color: 'var(--neutral-500, #64748B)', marginLeft: '12px', fontSize: '0.8rem', display: 'flex', gap: '4px' }}><span style={{color: 'var(--neutral-300, #CBD5E1)'}}>↳</span> <span style={{fontStyle: 'italic'}}>{record.material_biopsia_ampliada || 'Material no especificado'}</span></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button 
                    onClick={() => setIsEditing(false)} 
                    style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--neutral-500, #64748B)' }}
                    disabled={saving}
                >
                    Cancelar
                </button>
                <button 
                    onClick={handleSave} 
                    style={{ padding: '6px 16px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', background: 'var(--primary-600, #2563EB)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                    disabled={saving}
                >
                    {saving ? 'Guardando...' : <><Save size={14} /> Guardar</>}
                </button>
            </div>
        </div>
    );
}
