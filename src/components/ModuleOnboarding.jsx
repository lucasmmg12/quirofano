/**
 * ModuleOnboarding.jsx — Selección de módulos del sidebar
 *
 * Se muestra una sola vez al primer login del usuario (sin fila en user_module_preferences).
 * También se puede re-abrir desde ConfigPanel.
 * Los módulos que siempre son visibles (inicio, config, manual) NO se muestran en la selección.
 */
import { useState } from 'react';
import {
    MessageCircle, MessageSquareText, ClipboardList, History, BookOpen,
    ClipboardPlus, ClipboardCheck, Receipt, Users, FileSpreadsheet,
    Ticket, DollarSign, Activity, FolderOpen, Stethoscope,
    BarChart3, PackageCheck, Microscope, Brain, CheckCircle, Sparkles, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// Módulos agrupados con descripciones orientadas a tareas
const MODULE_GROUPS = [
    {
        label: 'Mensajería',
        description: 'Comunicación con pacientes por WhatsApp',
        items: [
            { id: 'mensajeria', label: 'Chat WhatsApp', icon: MessageCircle, hint: 'Si enviás mensajes a pacientes por WhatsApp' },
            { id: 'plantillas', label: 'Plantillas WhatsApp', icon: MessageSquareText, hint: 'Si creás o gestionás plantillas de mensaje' },
        ],
    },
    {
        label: 'Pedidos Médicos',
        description: 'Emisión y seguimiento de pedidos',
        items: [
            { id: 'pedidos', label: 'Nuevo Pedido', icon: ClipboardList, hint: 'Si emitís pedidos de prácticas o insumos' },
            { id: 'historial', label: 'Historial', icon: History, hint: 'Si consultás pedidos anteriores' },
            { id: 'nomenclador', label: 'Nomenclador', icon: BookOpen, hint: 'Si buscás códigos de prácticas' },
            { id: 'pedidos_marcela', label: 'Pedidos Especiales', icon: ClipboardPlus, hint: 'Si manejás pedidos especiales' },
        ],
    },
    {
        label: 'Altas Administrativas',
        description: 'Gestión de altas y facturación',
        items: [
            { id: 'altas', label: 'Control de Altas', icon: ClipboardCheck, hint: 'Si gestionás altas de pacientes' },
            { id: 'facturacion', label: 'Facturación', icon: Receipt, hint: 'Si facturás internaciones o prácticas' },
            { id: 'asignaciones', label: 'Asignaciones', icon: Users, hint: 'Si asignás responsables a pacientes' },
            { id: 'auditoria_historias', label: 'Auditoría H.C.', icon: FileSpreadsheet, hint: 'Si auditás historias clínicas' },
        ],
    },
    {
        label: 'Gestión General',
        description: 'Turnos, deudas y documentos',
        items: [
            { id: 'turnos', label: 'Cola de Turnos', icon: Ticket, hint: 'Si gestionás la cola de turnos' },
            { id: 'deudas', label: 'Deudas', icon: DollarSign, hint: 'Si controlás deudas de pacientes' },
            { id: 'consultas', label: 'Consultas Guardia', icon: Activity, hint: 'Si revisás consultas de guardia' },
            { id: 'documentos', label: 'Documentos', icon: FolderOpen, hint: 'Si subís o consultás documentos' },
        ],
    },
    {
        label: 'Cirugías',
        description: 'Control quirúrgico completo',
        items: [
            { id: 'cirugias', label: 'Control de Cirugías', icon: Stethoscope, hint: 'Si controlás el flujo de cirugías' },
            { id: 'pacientes', label: 'Pacientes', icon: Users, hint: 'Si consultás datos de pacientes' },
            { id: 'metricas', label: 'Métricas', icon: BarChart3, hint: 'Si analizás métricas de cirugías' },
            { id: 'asociaciones_entrega', label: 'Entrega Asociaciones', icon: PackageCheck, hint: 'Si gestionás entregas a asociaciones' },
            { id: 'laboratorios', label: 'Anatomía Pat.', icon: Microscope, hint: 'Si controlás resultados de laboratorio' },
        ],
    },
    {
        label: 'Analytics',
        description: 'Reportes y análisis',
        items: [
            { id: 'beto', label: 'Simon IA', icon: Brain, hint: 'Asistente documental con IA, reglas y gestor de archivos' },
        ],
    },
];

// All selectable module IDs (flat)
const ALL_MODULE_IDS = MODULE_GROUPS.flatMap(g => g.items.map(i => i.id));

export default function ModuleOnboarding({ currentUser, onComplete, isReconfig = false }) {
    // Start with all selected
    const [selected, setSelected] = useState(() => {
        if (isReconfig && currentUser?._modulePrefs) {
            return new Set(currentUser._modulePrefs);
        }
        return new Set(ALL_MODULE_IDS);
    });
    const [saving, setSaving] = useState(false);
    const [closing, setClosing] = useState(false);

    const toggle = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleGroup = (group) => {
        const ids = group.items.map(i => i.id);
        const allSelected = ids.every(id => selected.has(id));
        setSelected(prev => {
            const next = new Set(prev);
            ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
            return next;
        });
    };

    const selectAll = () => setSelected(new Set(ALL_MODULE_IDS));

    const handleSave = async () => {
        if (!currentUser?.id) return;
        setSaving(true);
        try {
            const modules = Array.from(selected);
            await supabase.from('user_module_preferences').upsert({
                user_id: currentUser.id,
                usuario: currentUser.usuario,
                selected_modules: modules,
                completed_onboarding: true,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

            setClosing(true);
            setTimeout(() => onComplete?.(modules), 300);
        } catch (err) {
            console.error('[ModuleOnboarding] save error:', err);
            setSaving(false);
        }
    };

    const firstName = currentUser?.nombre || currentUser?.usuario || 'Usuario';

    return (
        <>
            {/* Backdrop */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 100000,
                background: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(6px)',
                animation: closing ? 'onb-fadeOut 0.3s ease-out forwards' : 'onb-fadeIn 0.4s ease-out',
            }} />

            {/* Modal */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 100001,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
            }}>
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        pointerEvents: 'all', position: 'relative',
                        width: '100%', maxWidth: '640px', maxHeight: '85vh',
                        margin: '0 20px', background: '#FFFFFF',
                        borderRadius: '20px', overflow: 'hidden',
                        boxShadow: '0 25px 80px rgba(13, 59, 102, 0.2), 0 8px 24px rgba(0,0,0,0.1)',
                        display: 'flex', flexDirection: 'column',
                        animation: closing
                            ? 'onb-slideOut 0.3s ease-in forwards'
                            : 'onb-slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                >
                    {/* Close (only in reconfig mode) */}
                    {isReconfig && (
                        <button
                            onClick={() => { setClosing(true); setTimeout(() => onComplete?.(null), 300); }}
                            style={{
                                position: 'absolute', top: '12px', right: '12px', zIndex: 3,
                                background: 'rgba(255,255,255,0.9)', border: 'none',
                                borderRadius: '50%', width: '32px', height: '32px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: '#64748B',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            }}
                        >
                            <X size={16} />
                        </button>
                    )}

                    {/* Header */}
                    <div style={{
                        background: 'linear-gradient(135deg, #0D3B66 0%, #1E5A8C 50%, #2980B9 100%)',
                        padding: '24px 28px 20px', position: 'relative', overflow: 'hidden', flexShrink: 0,
                    }}>
                        <div style={{
                            position: 'absolute', top: '-30px', right: '-30px',
                            width: '100px', height: '100px', borderRadius: '50%',
                            background: 'rgba(255,255,255,0.05)',
                        }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 1 }}>
                            <div style={{
                                width: '44px', height: '44px', borderRadius: '12px',
                                background: 'rgba(255,255,255,0.15)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Sparkles size={22} color="#fff" />
                            </div>
                            <div>
                                <h2 style={{
                                    margin: 0, color: '#fff', fontSize: '1.15rem', fontWeight: 800,
                                }}>
                                    {isReconfig ? 'Personalizar módulos' : `¡Hola ${firstName}! Personalizá tu experiencia`}
                                </h2>
                                <p style={{
                                    margin: '2px 0 0', color: 'rgba(255,255,255,0.6)',
                                    fontSize: '0.76rem', fontWeight: 500,
                                }}>
                                    Elegí qué módulos necesitás. Los que no uses, simplemente desmarcalos.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Module list — scrollable */}
                    <div style={{
                        flex: 1, overflowY: 'auto', padding: '16px 24px 8px',
                    }}>
                        {MODULE_GROUPS.map((group) => {
                            const groupIds = group.items.map(i => i.id);
                            const allGroupSelected = groupIds.every(id => selected.has(id));
                            const someGroupSelected = groupIds.some(id => selected.has(id));

                            return (
                                <div key={group.label} style={{ marginBottom: '16px' }}>
                                    {/* Group header */}
                                    <button
                                        onClick={() => toggleGroup(group)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            width: '100%', padding: '6px 0', border: 'none',
                                            background: 'none', cursor: 'pointer', textAlign: 'left',
                                        }}
                                    >
                                        <div style={{
                                            width: '18px', height: '18px', borderRadius: '4px',
                                            border: `2px solid ${allGroupSelected ? '#0D3B66' : '#CBD5E1'}`,
                                            background: allGroupSelected ? '#0D3B66' : someGroupSelected ? '#0D3B6640' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'all 0.15s',
                                        }}>
                                            {allGroupSelected && <CheckCircle size={12} color="#fff" />}
                                        </div>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B' }}>
                                            {group.label}
                                        </span>
                                        <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 500 }}>
                                            — {group.description}
                                        </span>
                                    </button>

                                    {/* Module items */}
                                    <div style={{
                                        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                                        gap: '6px', paddingLeft: '6px', marginTop: '4px',
                                    }}>
                                        {group.items.map(item => {
                                            const Icon = item.icon;
                                            const isSelected = selected.has(item.id);
                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={() => toggle(item.id)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '10px',
                                                        padding: '10px 12px', borderRadius: '10px',
                                                        border: `1.5px solid ${isSelected ? '#0D3B6640' : '#E2E8F0'}`,
                                                        background: isSelected ? '#EFF6FF' : '#FAFAFA',
                                                        cursor: 'pointer', textAlign: 'left',
                                                        transition: 'all 0.15s',
                                                        opacity: isSelected ? 1 : 0.6,
                                                    }}
                                                >
                                                    <div style={{
                                                        width: '32px', height: '32px', borderRadius: '8px',
                                                        background: isSelected ? '#0D3B6615' : '#F1F5F9',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        flexShrink: 0,
                                                    }}>
                                                        <Icon size={16} color={isSelected ? '#0D3B66' : '#94A3B8'} />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{
                                                            margin: 0, fontSize: '0.78rem', fontWeight: 600,
                                                            color: isSelected ? '#1E293B' : '#94A3B8',
                                                        }}>{item.label}</p>
                                                        <p style={{
                                                            margin: '1px 0 0', fontSize: '0.65rem',
                                                            color: '#94A3B8', lineHeight: 1.3,
                                                        }}>{item.hint}</p>
                                                    </div>
                                                    <div style={{
                                                        width: '20px', height: '20px', borderRadius: '6px',
                                                        border: `2px solid ${isSelected ? '#0D3B66' : '#CBD5E1'}`,
                                                        background: isSelected ? '#0D3B66' : 'transparent',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        flexShrink: 0, transition: 'all 0.15s',
                                                    }}>
                                                        {isSelected && <CheckCircle size={12} color="#fff" />}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: '12px 24px 16px', borderTop: '1px solid #E2E8F0',
                        flexShrink: 0, background: '#FAFAFA',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '0.72rem', color: '#94A3B8', flex: 1 }}>
                                {selected.size} de {ALL_MODULE_IDS.length} módulos seleccionados
                            </span>
                            <button
                                onClick={selectAll}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px',
                                    border: '1px solid #E2E8F0', background: 'transparent',
                                    color: '#64748B', fontSize: '0.78rem', fontWeight: 600,
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}
                            >
                                Seleccionar todos
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || selected.size === 0}
                                style={{
                                    padding: '8px 20px', borderRadius: '8px',
                                    border: 'none', cursor: saving ? 'wait' : 'pointer',
                                    background: 'linear-gradient(135deg, #0D3B66 0%, #1E5A8C 100%)',
                                    color: '#fff', fontSize: '0.82rem', fontWeight: 700,
                                    boxShadow: '0 3px 12px rgba(13, 59, 102, 0.3)',
                                    transition: 'all 0.15s',
                                    opacity: selected.size === 0 ? 0.5 : 1,
                                }}
                            >
                                {saving ? 'Guardando...' : isReconfig ? 'Guardar cambios' : 'Continuar'}
                            </button>
                        </div>
                        {!isReconfig && (
                            <p style={{
                                margin: '8px 0 0', fontSize: '0.7rem', color: '#94A3B8',
                                textAlign: 'center', lineHeight: 1.4,
                            }}>
                                💡 Podés cambiar esto en cualquier momento desde <strong style={{ color: '#64748B' }}>Configuración → Personalizar Módulos</strong>
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Reuse onboarding animations */}
            <style>{`
                @keyframes onb-fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes onb-fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                @keyframes onb-slideIn {
                    from { opacity: 0; transform: scale(0.9) translateY(30px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes onb-slideOut {
                    from { opacity: 1; transform: scale(1) translateY(0); }
                    to { opacity: 0; transform: scale(0.95) translateY(10px); }
                }
            `}</style>
        </>
    );
}
