/**
 * BudgetCollapsible — Componente colapsable de presupuestos para una cirugía
 * 
 * Renderiza dentro de la expanded row de SurgeryPanel.
 * Solo carga los datos de Supabase cuando el usuario hace click (lazy load).
 * 
 * Props:
 *   - idPaciente: string — ID del paciente vinculado a la cirugía
 *   - patientName: string — Nombre del paciente (para display)
 */
import { useState, useCallback } from 'react';
import {
    ChevronDown, ChevronUp, FileText, Loader2,
    DollarSign, Package, Calendar, CheckCircle2, AlertCircle, Clock
} from 'lucide-react';
import { fetchBudgetsByPatient, fetchBudgetItems } from '../services/budgetService';


export default function BudgetCollapsible({ idPaciente, patientName }) {
    const [isOpen, setIsOpen] = useState(false);
    const [budgets, setBudgets] = useState(null);  // null = not loaded, [] = loaded empty
    const [loading, setLoading] = useState(false);
    const [expandedBudgetId, setExpandedBudgetId] = useState(null);
    const [budgetItems, setBudgetItems] = useState({});  // { [id_presupuesto]: items[] }
    const [loadingItems, setLoadingItems] = useState(null);

    // Lazy load: fetch budgets on first open
    const handleToggle = useCallback(async (e) => {
        e?.stopPropagation();

        if (!isOpen && budgets === null) {
            // First open → load from Supabase
            setLoading(true);
            setIsOpen(true);
            try {
                const data = await fetchBudgetsByPatient(idPaciente);
                setBudgets(data);
            } catch (err) {
                console.error('[BudgetCollapsible] Error:', err);
                setBudgets([]);
            } finally {
                setLoading(false);
            }
        } else {
            setIsOpen(!isOpen);
        }
    }, [isOpen, budgets, idPaciente]);

    // Load items for a specific budget
    const handleExpandBudget = useCallback(async (idPresupuesto, e) => {
        e?.stopPropagation();

        if (expandedBudgetId === idPresupuesto) {
            setExpandedBudgetId(null);
            return;
        }

        setExpandedBudgetId(idPresupuesto);

        // Only fetch if not yet loaded
        if (!budgetItems[idPresupuesto]) {
            setLoadingItems(idPresupuesto);
            try {
                const items = await fetchBudgetItems(idPresupuesto);
                setBudgetItems(prev => ({ ...prev, [idPresupuesto]: items }));
            } catch (err) {
                console.error('[BudgetCollapsible] Error loading items:', err);
                setBudgetItems(prev => ({ ...prev, [idPresupuesto]: [] }));
            } finally {
                setLoadingItems(null);
            }
        }
    }, [expandedBudgetId, budgetItems]);

    if (!idPaciente) return null;

    const budgetCount = budgets?.length || 0;

    // Status helpers
    const getBudgetStatusInfo = (budget) => {
        const isAccepted = budget.aceptado?.toLowerCase() === 'si';
        const isExpired = budget.fecha_caducidad && new Date(budget.fecha_caducidad) < new Date();
        const daysToExpiry = budget.fecha_caducidad
            ? Math.ceil((new Date(budget.fecha_caducidad) - new Date()) / (1000 * 60 * 60 * 24))
            : null;
        const isNearExpiry = daysToExpiry !== null && daysToExpiry > 0 && daysToExpiry <= 7;

        if (isExpired) return { label: 'Vencido', color: '#DC2626', bg: '#FEF2F2', icon: AlertCircle };
        if (isNearExpiry) return { label: `Vence en ${daysToExpiry}d`, color: '#D97706', bg: '#FFFBEB', icon: Clock };
        if (isAccepted) return { label: 'Aceptado', color: '#16A34A', bg: '#F0FDF4', icon: CheckCircle2 };
        return { label: 'Pendiente', color: '#6366F1', bg: '#EEF2FF', icon: FileText };
    };

    const formatCurrency = (val) => {
        const num = parseFloat(val) || 0;
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(num);
    };

    const formatDate = (d) => {
        if (!d) return '—';
        try {
            return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch { return '—'; }
    };

    return (
        <div style={{ marginTop: '12px' }}>
            {/* ── TRIGGER BUTTON ── */}
            <button
                onClick={handleToggle}
                style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: isOpen
                        ? 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)'
                        : 'var(--neutral-50)',
                    border: `1.5px solid ${isOpen ? '#818CF8' : 'var(--neutral-200)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '0.8rem',
                }}
                onMouseOver={e => {
                    if (!isOpen) {
                        e.currentTarget.style.borderColor = '#818CF8';
                        e.currentTarget.style.background = '#F5F3FF';
                    }
                }}
                onMouseOut={e => {
                    if (!isOpen) {
                        e.currentTarget.style.borderColor = 'var(--neutral-200)';
                        e.currentTarget.style.background = 'var(--neutral-50)';
                    }
                }}
            >
                <DollarSign size={15} style={{ color: '#6366F1' }} />
                <span style={{ fontWeight: 700, color: '#4338CA' }}>
                    Presupuestos
                </span>

                {/* Badge count (only after loaded) */}
                {budgets !== null && (
                    <span style={{
                        padding: '1px 8px', borderRadius: '10px',
                        fontSize: '0.68rem', fontWeight: 700,
                        background: budgetCount > 0 ? '#6366F120' : 'var(--neutral-100)',
                        color: budgetCount > 0 ? '#4338CA' : 'var(--neutral-400)',
                    }}>
                        {budgetCount}
                    </span>
                )}

                <span style={{ marginLeft: 'auto', color: 'var(--neutral-400)' }}>
                    {loading ? (
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : isOpen ? (
                        <ChevronUp size={14} />
                    ) : (
                        <ChevronDown size={14} />
                    )}
                </span>
            </button>

            {/* ── CONTENT ── */}
            {isOpen && (
                <div style={{
                    marginTop: '6px',
                    animation: 'fadeIn 0.2s ease-out',
                }}>
                    {loading ? (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: '8px', padding: '20px',
                            color: 'var(--neutral-400)', fontSize: '0.8rem',
                        }}>
                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                            Cargando presupuestos...
                        </div>
                    ) : budgetCount === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '16px',
                            color: 'var(--neutral-400)', fontSize: '0.78rem',
                            background: 'var(--neutral-50)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px dashed var(--neutral-200)',
                        }}>
                            <DollarSign size={20} style={{ opacity: 0.3, marginBottom: '4px' }} />
                            <br />
                            Sin presupuestos asociados a este paciente
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {budgets.map((budget) => {
                                const statusInfo = getBudgetStatusInfo(budget);
                                const StatusIcon = statusInfo.icon;
                                const isItemsExpanded = expandedBudgetId === budget.id_presupuesto;
                                const items = budgetItems[budget.id_presupuesto];
                                const isItemsLoading = loadingItems === budget.id_presupuesto;

                                return (
                                    <div key={budget.id_presupuesto} style={{
                                        borderRadius: 'var(--radius-md)',
                                        border: `1px solid ${isItemsExpanded ? '#C7D2FE' : 'var(--neutral-200)'}`,
                                        overflow: 'hidden',
                                        transition: 'border-color 0.2s',
                                    }}>
                                        {/* Budget Header */}
                                        <button
                                            onClick={(e) => handleExpandBudget(budget.id_presupuesto, e)}
                                            style={{
                                                width: '100%',
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                padding: '10px 12px',
                                                background: isItemsExpanded ? '#FAFAFE' : '#fff',
                                                border: 'none', cursor: 'pointer',
                                                transition: 'all 0.15s',
                                                textAlign: 'left',
                                            }}
                                            onMouseOver={e => e.currentTarget.style.background = '#F8F9FE'}
                                            onMouseOut={e => e.currentTarget.style.background = isItemsExpanded ? '#FAFAFE' : '#fff'}
                                        >
                                            {/* Status badge */}
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                padding: '2px 8px', borderRadius: '8px',
                                                fontSize: '0.65rem', fontWeight: 700,
                                                background: statusInfo.bg, color: statusInfo.color,
                                                border: `1px solid ${statusInfo.color}25`,
                                                whiteSpace: 'nowrap',
                                            }}>
                                                <StatusIcon size={11} />
                                                {statusInfo.label}
                                            </span>

                                            {/* Description */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: '0.76rem', fontWeight: 600,
                                                    color: 'var(--neutral-700)',
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                }}>
                                                    {budget.presup_descripcion || `Presupuesto #${budget.id_presupuesto}`}
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--neutral-400)', marginTop: '1px' }}>
                                                    {budget.observaciones || '—'} · {budget.total_items} ítem{budget.total_items !== 1 ? 's' : ''}
                                                    {budget.fecha_caducidad && (
                                                        <> · Vence: {formatDate(budget.fecha_caducidad)}</>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Total */}
                                            <span style={{
                                                fontSize: '0.78rem', fontWeight: 700,
                                                color: '#4338CA', whiteSpace: 'nowrap',
                                            }}>
                                                {formatCurrency(budget.importe_total)}
                                            </span>

                                            {/* Expand icon */}
                                            <span style={{ color: 'var(--neutral-300)' }}>
                                                {isItemsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                            </span>
                                        </button>

                                        {/* Items Detail */}
                                        {isItemsExpanded && (
                                            <div style={{
                                                borderTop: '1px solid var(--neutral-100)',
                                                background: '#FAFAFE',
                                                animation: 'fadeIn 0.15s ease-out',
                                            }}>
                                                {isItemsLoading ? (
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        gap: '6px', padding: '12px',
                                                        color: 'var(--neutral-400)', fontSize: '0.75rem',
                                                    }}>
                                                        <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                                        Cargando ítems...
                                                    </div>
                                                ) : items && items.length > 0 ? (
                                                    <table style={{
                                                        width: '100%', borderCollapse: 'collapse',
                                                        fontSize: '0.72rem',
                                                    }}>
                                                        <thead>
                                                            <tr style={{ background: '#F1F0FB' }}>
                                                                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--neutral-500)', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                                                                    Artículo
                                                                </th>
                                                                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--neutral-500)', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                                                                    Descripción
                                                                </th>
                                                                <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: 'var(--neutral-500)', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                                                                    Cant.
                                                                </th>
                                                                <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--neutral-500)', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                                                                    Unitario
                                                                </th>
                                                                <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--neutral-500)', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                                                                    Total
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {items.map((item, idx) => (
                                                                <tr key={item.id || idx} style={{
                                                                    borderBottom: idx < items.length - 1 ? '1px solid var(--neutral-100)' : 'none',
                                                                }}>
                                                                    <td style={{ padding: '6px 10px', color: 'var(--neutral-500)', fontFamily: 'monospace', fontSize: '0.68rem' }}>
                                                                        {item.id_articulo || '—'}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', color: 'var(--neutral-700)', fontWeight: 500 }}>
                                                                        {item.descripcion || '—'}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--neutral-600)' }}>
                                                                        {item.cantidad}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--neutral-600)' }}>
                                                                        {formatCurrency(item.importe_unitario)}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#4338CA' }}>
                                                                        {formatCurrency(item.importe_total)}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                        {/* Totals row */}
                                                        <tfoot>
                                                            <tr style={{
                                                                borderTop: '2px solid #C7D2FE',
                                                                background: '#EEF2FF',
                                                            }}>
                                                                <td colSpan={4} style={{
                                                                    padding: '8px 10px', textAlign: 'right',
                                                                    fontWeight: 700, fontSize: '0.73rem',
                                                                    color: 'var(--neutral-600)',
                                                                }}>
                                                                    TOTAL:
                                                                </td>
                                                                <td style={{
                                                                    padding: '8px 10px', textAlign: 'right',
                                                                    fontWeight: 800, fontSize: '0.8rem',
                                                                    color: '#4338CA',
                                                                }}>
                                                                    {formatCurrency(budget.importe_total)}
                                                                </td>
                                                            </tr>
                                                            {parseFloat(budget.importe_cobrado) > 0 && (
                                                                <tr style={{ background: '#F0FDF4' }}>
                                                                    <td colSpan={4} style={{
                                                                        padding: '6px 10px', textAlign: 'right',
                                                                        fontWeight: 600, fontSize: '0.7rem',
                                                                        color: '#16A34A',
                                                                    }}>
                                                                        Cobrado:
                                                                    </td>
                                                                    <td style={{
                                                                        padding: '6px 10px', textAlign: 'right',
                                                                        fontWeight: 700, fontSize: '0.75rem',
                                                                        color: '#16A34A',
                                                                    }}>
                                                                        {formatCurrency(budget.importe_cobrado)}
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </tfoot>
                                                    </table>
                                                ) : (
                                                    <div style={{
                                                        padding: '12px', textAlign: 'center',
                                                        color: 'var(--neutral-400)', fontSize: '0.72rem',
                                                    }}>
                                                        Sin ítems de detalle
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
