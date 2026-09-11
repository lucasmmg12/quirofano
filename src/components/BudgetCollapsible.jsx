/**
 * BudgetCollapsible — Componente ejecutivo de presupuestos para una cirugía
 * 
 * Renderiza dentro de la expanded row de SurgeryPanel o Paneles Clínicos.
 * Carga lazy-load de Supabase. Parsea automáticamente las observaciones complejas de
 * Salus (Prestación, Cobertura, Inclusiones, Exclusiones, Requisitos y Formas de Pago)
 * para brindar una experiencia "Limpia y Clínica" acorde al estándar de Sanatorio Argentino.
 * 
 * Props:
 *   - idPaciente: string — ID del paciente vinculado a la cirugía
 *   - patientName: string — Nombre del paciente (para display)
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
    ChevronDown, ChevronUp, FileText, Loader2,
    DollarSign, Package, Calendar, CheckCircle2, AlertCircle, Clock,
    ShieldCheck, AlertTriangle, ClipboardList, CreditCard, Phone,
    MessageCircle, Mail, Check, Info, Sparkles, Hash
} from 'lucide-react';
import { fetchBudgetsByPatient, fetchBudgetItems } from '../services/budgetService';
import { parseBudgetObservaciones } from '../utils/budgetParser';

export default function BudgetCollapsible({ idPaciente, patientName }) {
    const [isOpen, setIsOpen] = useState(false);
    const [budgets, setBudgets] = useState(null);  // null = not loaded, [] = loaded empty
    const [loading, setLoading] = useState(false);
    const [expandedBudgetId, setExpandedBudgetId] = useState(null);
    const [budgetItems, setBudgetItems] = useState({});  // { [id_presupuesto]: items[] }
    const [loadingItems, setLoadingItems] = useState(null);
    const [activeTabs, setActiveTabs] = useState({}); // { [id_presupuesto]: 'condiciones' | 'items' }

    // Lazy load: fetch budgets on first open
    const handleToggle = useCallback(async (e) => {
        e?.stopPropagation();

        if (!isOpen && budgets === null) {
            setLoading(true);
            setIsOpen(true);
            try {
                const data = await fetchBudgetsByPatient(idPaciente);
                setBudgets(data || []);
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

        // Fetch items if not yet loaded
        if (!budgetItems[idPresupuesto]) {
            setLoadingItems(idPresupuesto);
            try {
                const items = await fetchBudgetItems(idPresupuesto);
                setBudgetItems(prev => ({ ...prev, [idPresupuesto]: items || [] }));
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

    // Helper de estado del presupuesto
    const getBudgetStatusInfo = (budget) => {
        const isAccepted = budget.aceptado?.toLowerCase() === 'si';
        const isExpired = budget.fecha_caducidad && new Date(budget.fecha_caducidad) < new Date();
        const daysToExpiry = budget.fecha_caducidad
            ? Math.ceil((new Date(budget.fecha_caducidad) - new Date()) / (1000 * 60 * 60 * 24))
            : null;
        const isNearExpiry = daysToExpiry !== null && daysToExpiry > 0 && daysToExpiry <= 7;

        if (isExpired) return { label: 'Vencido', color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5', icon: AlertCircle };
        if (isNearExpiry) return { label: `Vence en ${daysToExpiry}d`, color: '#D97706', bg: '#FFFBEB', border: '#FCD34D', icon: Clock };
        if (isAccepted) return { label: 'Aceptado', color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC', icon: CheckCircle2 };
        return { label: 'Pendiente', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE', icon: FileText };
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
            {/* ── BOTÓN PRINCIPAL (TRIGGER) ── */}
            <button
                onClick={handleToggle}
                style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: isOpen
                        ? 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)'
                        : '#F8FAFC',
                    border: `1.5px solid ${isOpen ? '#3B82F6' : '#E2E8F0'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontSize: '0.8rem',
                }}
                onMouseOver={e => {
                    if (!isOpen) {
                        e.currentTarget.style.borderColor = '#93C5FD';
                        e.currentTarget.style.background = '#F0F9FF';
                    }
                }}
                onMouseOut={e => {
                    if (!isOpen) {
                        e.currentTarget.style.borderColor = '#E2E8F0';
                        e.currentTarget.style.background = '#F8FAFC';
                    }
                }}
            >
                <DollarSign size={16} style={{ color: '#2563EB' }} />
                <span style={{ fontWeight: 700, color: '#1E40AF', letterSpacing: '-0.01em' }}>
                    Presupuestos Quirúrgicos
                </span>

                {/* Contador y Suma Total */}
                {budgets !== null && (
                    <>
                        <span style={{
                            padding: '1px 8px', borderRadius: '12px',
                            fontSize: '0.68rem', fontWeight: 700,
                            background: budgetCount > 0 ? '#DBEAFE' : '#F1F5F9',
                            color: budgetCount > 0 ? '#1D4ED8' : '#94A3B8',
                        }}>
                            {budgetCount} {budgetCount === 1 ? 'presupuesto' : 'presupuestos'}
                        </span>
                        {budgetCount > 0 && (
                            <span style={{
                                fontSize: '0.78rem', fontWeight: 800,
                                color: '#1E40AF', marginLeft: '4px',
                            }}>
                                {formatCurrency(budgets.reduce((sum, b) => sum + (parseFloat(b.importe_total) || 0), 0))}
                            </span>
                        )}
                    </>
                )}

                <span style={{ marginLeft: 'auto', color: '#64748B' }}>
                    {loading ? (
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : isOpen ? (
                        <ChevronUp size={15} />
                    ) : (
                        <ChevronDown size={15} />
                    )}
                </span>
            </button>

            {/* ── CONTENEDOR DESPLEGABLE ── */}
            {isOpen && (
                <div style={{
                    marginTop: '8px',
                    animation: 'fadeIn 0.2s ease-out',
                }}>
                    {loading ? (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: '8px', padding: '24px',
                            color: '#64748B', fontSize: '0.8rem',
                            background: '#FFFFFF', borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                        }}>
                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: '#2563EB' }} />
                            Consultando presupuestos en Salus / Base de Datos...
                        </div>
                    ) : budgetCount === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '20px 16px',
                            color: '#64748B', fontSize: '0.78rem',
                            background: '#FFFFFF',
                            borderRadius: '8px',
                            border: '1px dashed #CBD5E1',
                        }}>
                            <DollarSign size={24} style={{ opacity: 0.3, marginBottom: '6px', color: '#64748B' }} />
                            <div style={{ fontWeight: 600, color: '#475569' }}>Sin presupuestos asociados a este paciente</div>
                            <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '2px' }}>
                                No se encontraron presupuestos cargados o vinculados en el sistema
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {budgets.map((budget) => {
                                const statusInfo = getBudgetStatusInfo(budget);
                                const StatusIcon = statusInfo.icon;
                                const isItemsExpanded = expandedBudgetId === budget.id_presupuesto;
                                const items = budgetItems[budget.id_presupuesto];
                                const isItemsLoading = loadingItems === budget.id_presupuesto;

                                // Parsear el texto complejo de observaciones de Salus
                                const parsedObs = parseBudgetObservaciones(budget.observaciones);
                                const currentTab = activeTabs[budget.id_presupuesto] || (parsedObs?.isStructured ? 'condiciones' : 'items');

                                return (
                                    <div key={budget.id_presupuesto} style={{
                                        borderRadius: '8px',
                                        border: `1.5px solid ${isItemsExpanded ? '#93C5FD' : '#E2E8F0'}`,
                                        background: '#FFFFFF',
                                        boxShadow: isItemsExpanded ? '0 4px 12px -2px rgba(37, 99, 235, 0.08)' : '0 1px 3px rgba(0,0,0,0.03)',
                                        overflow: 'hidden',
                                        transition: 'all 0.2s ease',
                                    }}>
                                        {/* ── CABECERA DE LA TARJETA (LIMPIA Y EJECUTIVA) ── */}
                                        <button
                                            onClick={(e) => handleExpandBudget(budget.id_presupuesto, e)}
                                            style={{
                                                width: '100%',
                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                padding: '12px 14px',
                                                background: isItemsExpanded ? '#F8FAFC' : '#FFFFFF',
                                                border: 'none', cursor: 'pointer',
                                                transition: 'background 0.15s ease',
                                                textAlign: 'left',
                                            }}
                                            onMouseOver={e => e.currentTarget.style.background = '#F1F5F9'}
                                            onMouseOut={e => e.currentTarget.style.background = isItemsExpanded ? '#F8FAFC' : '#FFFFFF'}
                                        >
                                            {/* Badge de Estado */}
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                padding: '3px 8px', borderRadius: '6px',
                                                fontSize: '0.68rem', fontWeight: 700,
                                                background: statusInfo.bg, color: statusInfo.color,
                                                border: `1px solid ${statusInfo.border}`,
                                                whiteSpace: 'nowrap', flexShrink: 0,
                                            }}>
                                                <StatusIcon size={12} />
                                                {statusInfo.label}
                                            </span>

                                            {/* Chip con Nro de Presupuesto */}
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '2px',
                                                padding: '2px 6px', borderRadius: '4px',
                                                fontSize: '0.65rem', fontWeight: 600,
                                                fontFamily: 'ui-monospace, monospace',
                                                background: '#F1F5F9', color: '#475569',
                                                border: '1px solid #E2E8F0', flexShrink: 0,
                                            }}>
                                                <Hash size={10} style={{ opacity: 0.6 }} />
                                                {budget.id_presupuesto}
                                            </span>

                                            {/* Contenido Central: Título y Chips Descriptivos */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                {/* Título de la Prestación */}
                                                <div style={{
                                                    fontSize: '0.82rem', fontWeight: 700,
                                                    color: '#0F172A',
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    letterSpacing: '-0.01em',
                                                }}>
                                                    {budget.presup_descripcion || parsedObs?.prestacion || `Presupuesto #${budget.id_presupuesto}`}
                                                </div>

                                                {/* Fila de Chips de Metadata (en lugar del texto crudo) */}
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    flexWrap: 'wrap', marginTop: '4px',
                                                }}>
                                                    {/* Cobertura / Coseguro */}
                                                    {parsedObs?.cobertura && (
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                            padding: '1px 6px', borderRadius: '4px',
                                                            fontSize: '0.64rem', fontWeight: 600,
                                                            background: '#EFF6FF', color: '#1E40AF',
                                                            border: '1px solid #DBEAFE',
                                                        }}>
                                                            <ShieldCheck size={11} style={{ color: '#2563EB' }} />
                                                            {parsedObs.cobertura}
                                                        </span>
                                                    )}

                                                    {/* Total de Ítems */}
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                        padding: '1px 6px', borderRadius: '4px',
                                                        fontSize: '0.64rem', fontWeight: 500,
                                                        background: '#F8FAFC', color: '#64748B',
                                                        border: '1px solid #E2E8F0',
                                                    }}>
                                                        <Package size={11} />
                                                        {budget.total_items || 0} {budget.total_items === 1 ? 'ítem' : 'ítems'}
                                                    </span>

                                                    {/* Fecha de Emisión */}
                                                    {budget.fecha && (
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                            fontSize: '0.64rem', color: '#64748B',
                                                        }}>
                                                            <Calendar size={11} />
                                                            Emitido: {formatDate(budget.fecha)}
                                                        </span>
                                                    )}

                                                    {/* Vencimiento */}
                                                    {budget.fecha_caducidad && (
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                            fontSize: '0.64rem', fontWeight: 600,
                                                            color: statusInfo.color,
                                                        }}>
                                                            · Vence: {formatDate(budget.fecha_caducidad)}
                                                        </span>
                                                    )}

                                                    {/* Pill indicador de desglose listo */}
                                                    {parsedObs?.isStructured && (
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '2px',
                                                            padding: '1px 5px', borderRadius: '4px',
                                                            fontSize: '0.6rem', fontWeight: 600,
                                                            background: '#F0FDF4', color: '#15803D',
                                                            border: '1px solid #BBF7D0',
                                                        }}>
                                                            <Check size={10} />
                                                            Condiciones desglosadas
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Importe Total y Saldo */}
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{
                                                    fontSize: '0.92rem', fontWeight: 800,
                                                    color: '#1E40AF', whiteSpace: 'nowrap',
                                                    letterSpacing: '-0.02em',
                                                }}>
                                                    {formatCurrency(budget.importe_total)}
                                                </div>
                                                {parseFloat(budget.importe_cobrado) > 0 && (
                                                    <div style={{
                                                        fontSize: '0.63rem', fontWeight: 700,
                                                        color: '#16A34A', marginTop: '1px',
                                                    }}>
                                                        Cobrado: {formatCurrency(budget.importe_cobrado)}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Chevron Toggle */}
                                            <span style={{
                                                color: isItemsExpanded ? '#2563EB' : '#94A3B8',
                                                transition: 'transform 0.2s ease',
                                                display: 'flex', alignItems: 'center',
                                            }}>
                                                {isItemsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </span>
                                        </button>

                                        {/* ── DETALLE EXPANDIDO (PESTAÑAS & CONTENIDO) ── */}
                                        {isItemsExpanded && (
                                            <div style={{
                                                borderTop: '1px solid #E2E8F0',
                                                background: '#FFFFFF',
                                            }}>
                                                {/* BARRA DE PESTAÑAS (SEGMENTED CONTROL) */}
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                    padding: '6px 12px',
                                                    background: '#F8FAFC',
                                                    borderBottom: '1px solid #E2E8F0',
                                                }}>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActiveTabs(prev => ({ ...prev, [budget.id_presupuesto]: 'condiciones' }));
                                                        }}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                            padding: '5px 12px', borderRadius: '6px',
                                                            fontSize: '0.72rem', fontWeight: currentTab === 'condiciones' ? 700 : 500,
                                                            background: currentTab === 'condiciones' ? '#FFFFFF' : 'transparent',
                                                            color: currentTab === 'condiciones' ? '#1E40AF' : '#64748B',
                                                            border: `1px solid ${currentTab === 'condiciones' ? '#CBD5E1' : 'transparent'}`,
                                                            boxShadow: currentTab === 'condiciones' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.15s ease',
                                                        }}
                                                    >
                                                        <ClipboardList size={13} style={{ color: currentTab === 'condiciones' ? '#2563EB' : '#94A3B8' }} />
                                                        Condiciones y Cobertura
                                                        {parsedObs?.isStructured && (
                                                            <span style={{
                                                                width: '6px', height: '6px', borderRadius: '50%',
                                                                background: '#10B981', display: 'inline-block',
                                                            }} />
                                                        )}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActiveTabs(prev => ({ ...prev, [budget.id_presupuesto]: 'items' }));
                                                        }}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                            padding: '5px 12px', borderRadius: '6px',
                                                            fontSize: '0.72rem', fontWeight: currentTab === 'items' ? 700 : 500,
                                                            background: currentTab === 'items' ? '#FFFFFF' : 'transparent',
                                                            color: currentTab === 'items' ? '#1E40AF' : '#64748B',
                                                            border: `1px solid ${currentTab === 'items' ? '#CBD5E1' : 'transparent'}`,
                                                            boxShadow: currentTab === 'items' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.15s ease',
                                                        }}
                                                    >
                                                        <Package size={13} style={{ color: currentTab === 'items' ? '#2563EB' : '#94A3B8' }} />
                                                        Desglose de Ítems
                                                        <span style={{
                                                            padding: '1px 6px', borderRadius: '10px',
                                                            fontSize: '0.62rem', fontWeight: 700,
                                                            background: currentTab === 'items' ? '#EFF6FF' : '#E2E8F0',
                                                            color: currentTab === 'items' ? '#1D4ED8' : '#64748B',
                                                        }}>
                                                            {items ? items.length : (budget.total_items || 0)}
                                                        </span>
                                                    </button>
                                                </div>

                                                {/* ── VISTA 1: CONDICIONES Y COBERTURA ── */}
                                                {currentTab === 'condiciones' && (
                                                    <div style={{ padding: '14px', animation: 'fadeIn 0.15s ease-out' }}>
                                                        {parsedObs?.isStructured ? (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                                {/* Tarjeta de Resumen Clínico */}
                                                                <div style={{
                                                                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                                                    gap: '8px', padding: '10px 12px',
                                                                    background: '#F0F9FF', borderRadius: '8px',
                                                                    border: '1px solid #BAE6FD',
                                                                }}>
                                                                    <div>
                                                                        <div style={{ fontSize: '0.64rem', fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                                            Prestación Presupuestada
                                                                        </div>
                                                                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0C4A6E', marginTop: '2px' }}>
                                                                            {parsedObs.prestacion || budget.presup_descripcion || 'No especificada'}
                                                                        </div>
                                                                    </div>
                                                                    {parsedObs.cobertura && (
                                                                        <div>
                                                                            <div style={{ fontSize: '0.64rem', fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                                                Cobertura / Obra Social
                                                                            </div>
                                                                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0C4A6E', marginTop: '2px' }}>
                                                                                🛡️ {parsedObs.cobertura}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* SECCIÓN: INCLUYE (VERDE CLÍNICO) */}
                                                                {parsedObs.incluye?.length > 0 && (
                                                                    <div style={{
                                                                        borderRadius: '8px',
                                                                        border: '1px solid #BBF7D0',
                                                                        background: '#F0FDF4',
                                                                        padding: '10px 12px',
                                                                    }}>
                                                                        <div style={{
                                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                                            fontSize: '0.72rem', fontWeight: 700, color: '#166534',
                                                                            marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em',
                                                                        }}>
                                                                            <CheckCircle2 size={13} style={{ color: '#16A34A' }} />
                                                                            Incluye en la Prestación
                                                                        </div>
                                                                        <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                            {parsedObs.incluye.map((inc, i) => (
                                                                                <li key={i} style={{ fontSize: '0.72rem', color: '#14532D', lineHeight: '1.4' }}>
                                                                                    {inc}
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}

                                                                {/* SECCIÓN: EXCLUSIONES (ÁMBAR ADVERTENCIA) */}
                                                                {parsedObs.exclusiones?.length > 0 && (
                                                                    <div style={{
                                                                        borderRadius: '8px',
                                                                        border: '1px solid #FED7AA',
                                                                        background: '#FFFBEB',
                                                                        padding: '10px 12px',
                                                                    }}>
                                                                        <div style={{
                                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                                            fontSize: '0.72rem', fontWeight: 700, color: '#9A3412',
                                                                            marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em',
                                                                        }}>
                                                                            <AlertTriangle size={13} style={{ color: '#EA580C' }} />
                                                                            Exclusiones del Presupuesto
                                                                        </div>
                                                                        <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                            {parsedObs.exclusiones.map((exc, i) => (
                                                                                <li key={i} style={{ fontSize: '0.72rem', color: '#7C2D12', lineHeight: '1.4' }}>
                                                                                    {exc}
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}

                                                                {/* SECCIÓN: REQUISITOS DE INTERNACIÓN (AZUL CLÍNICO) */}
                                                                {parsedObs.requisitos?.length > 0 && (
                                                                    <div style={{
                                                                        borderRadius: '8px',
                                                                        border: '1px solid #BFDBFE',
                                                                        background: '#EFF6FF',
                                                                        padding: '10px 12px',
                                                                    }}>
                                                                        <div style={{
                                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                                            fontSize: '0.72rem', fontWeight: 700, color: '#1E40AF',
                                                                            marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em',
                                                                        }}>
                                                                            <ClipboardList size={13} style={{ color: '#2563EB' }} />
                                                                            Requisitos Obligatorios de Internación
                                                                        </div>
                                                                        <div style={{
                                                                            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                                                            gap: '6px',
                                                                        }}>
                                                                            {parsedObs.requisitos.map((req, i) => (
                                                                                <div key={i} style={{
                                                                                    display: 'flex', alignItems: 'flex-start', gap: '6px',
                                                                                    fontSize: '0.7rem', color: '#1E3A8A', lineHeight: '1.3',
                                                                                    background: '#FFFFFF', padding: '6px 8px', borderRadius: '6px',
                                                                                    border: '1px solid #DBEAFE',
                                                                                }}>
                                                                                    <Check size={12} style={{ color: '#2563EB', flexShrink: 0, marginTop: '2px' }} />
                                                                                    <span>{req}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* SECCIÓN: FORMAS DE PAGO (PÚRPURA / ÍNDIGO) */}
                                                                {parsedObs.formasPago?.length > 0 && (
                                                                    <div style={{
                                                                        borderRadius: '8px',
                                                                        border: '1px solid #E0E7FF',
                                                                        background: '#EEF2FF',
                                                                        padding: '10px 12px',
                                                                    }}>
                                                                        <div style={{
                                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                                            fontSize: '0.72rem', fontWeight: 700, color: '#3730A3',
                                                                            marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em',
                                                                        }}>
                                                                            <CreditCard size={13} style={{ color: '#4F46E5' }} />
                                                                            Medios de Pago y Financiación
                                                                        </div>
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                            {parsedObs.formasPago.map((fp, i) => (
                                                                                <span key={i} style={{
                                                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                                    padding: '4px 8px', borderRadius: '6px',
                                                                                    fontSize: '0.68rem', fontWeight: 500,
                                                                                    background: '#FFFFFF', color: '#312E81',
                                                                                    border: '1px solid #C7D2FE',
                                                                                }}>
                                                                                    💳 {fp}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* FOOTER: VIGENCIA Y CANALES DE ATENCIÓN */}
                                                                <div style={{
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                    flexWrap: 'wrap', gap: '8px',
                                                                    padding: '8px 12px', borderRadius: '6px',
                                                                    background: '#F8FAFC', border: '1px solid #E2E8F0',
                                                                    fontSize: '0.68rem', color: '#475569',
                                                                }}>
                                                                    {parsedObs.importante?.length > 0 && (
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                                                                            <Clock size={12} style={{ color: '#64748B' }} />
                                                                            {parsedObs.importante.join(' · ')}
                                                                        </div>
                                                                    )}

                                                                    {parsedObs.contacto && (
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
                                                                            {parsedObs.contacto.tel && (
                                                                                <a
                                                                                    href={`tel:${parsedObs.contacto.tel.replace(/\D/g, '')}`}
                                                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}
                                                                                    onClick={e => e.stopPropagation()}
                                                                                >
                                                                                    <Phone size={11} />
                                                                                    {parsedObs.contacto.tel}
                                                                                </a>
                                                                            )}
                                                                            {parsedObs.contacto.wsp && (
                                                                                <a
                                                                                    href={`https://wa.me/549${parsedObs.contacto.wsp.replace(/\D/g, '')}`}
                                                                                    target="_blank" rel="noreferrer"
                                                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#16A34A', textDecoration: 'none', fontWeight: 600 }}
                                                                                    onClick={e => e.stopPropagation()}
                                                                                >
                                                                                    <MessageCircle size={11} />
                                                                                    WSP {parsedObs.contacto.wsp}
                                                                                </a>
                                                                            )}
                                                                            {parsedObs.contacto.email && (
                                                                                <a
                                                                                    href={`mailto:${parsedObs.contacto.email}`}
                                                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#475569', textDecoration: 'none' }}
                                                                                    onClick={e => e.stopPropagation()}
                                                                                >
                                                                                    <Mail size={11} />
                                                                                    {parsedObs.contacto.email}
                                                                                </a>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            /* Observaciones simples no estructuradas */
                                                            <div style={{
                                                                display: 'flex', gap: '10px', alignItems: 'flex-start',
                                                                padding: '12px', borderRadius: '8px',
                                                                background: '#F8FAFC', border: '1px solid #E2E8F0',
                                                            }}>
                                                                <Info size={16} style={{ color: '#64748B', flexShrink: 0, marginTop: '2px' }} />
                                                                <div style={{ fontSize: '0.75rem', color: '#334155', lineHeight: '1.5' }}>
                                                                    <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '2px' }}>Observaciones Registradas:</div>
                                                                    {budget.observaciones || 'Sin observaciones detalladas registradas en el presupuesto.'}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* ── VISTA 2: DESGLOSE DE ÍTEMS ── */}
                                                {currentTab === 'items' && (
                                                    <div style={{ animation: 'fadeIn 0.15s ease-out' }}>
                                                        {isItemsLoading ? (
                                                            <div style={{
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                gap: '8px', padding: '24px',
                                                                color: '#64748B', fontSize: '0.75rem',
                                                            }}>
                                                                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', color: '#2563EB' }} />
                                                                Cargando detalle de ítems...
                                                            </div>
                                                        ) : items && items.length > 0 ? (
                                                            <div style={{ overflowX: 'auto' }}>
                                                                <table style={{
                                                                    width: '100%', borderCollapse: 'collapse',
                                                                    fontSize: '0.73rem',
                                                                }}>
                                                                    <thead>
                                                                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                                                Cód. / Nomenclador
                                                                            </th>
                                                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                                                Descripción del Ítem
                                                                            </th>
                                                                            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                                                Cant.
                                                                            </th>
                                                                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                                                Unitario
                                                                            </th>
                                                                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                                                Total
                                                                            </th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {items.map((item, idx) => (
                                                                            <tr key={item.id || idx} style={{
                                                                                borderBottom: '1px solid #F1F5F9',
                                                                                background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                                                                                transition: 'background 0.1s',
                                                                            }}>
                                                                                <td style={{ padding: '8px 12px', color: '#64748B', fontFamily: 'monospace', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                                                                                    {item.id_articulo || '—'}
                                                                                </td>
                                                                                <td style={{ padding: '8px 12px', color: '#1E293B', fontWeight: 500 }}>
                                                                                    {item.descripcion || '—'}
                                                                                </td>
                                                                                <td style={{ padding: '8px 12px', textAlign: 'center', color: '#334155', fontWeight: 600 }}>
                                                                                    {item.cantidad}
                                                                                </td>
                                                                                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748B' }}>
                                                                                    {formatCurrency(item.importe_unitario)}
                                                                                </td>
                                                                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1E40AF' }}>
                                                                                    {formatCurrency(item.importe_total)}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                    {/* Filas de Totales */}
                                                                    <tfoot>
                                                                        <tr style={{
                                                                            borderTop: '2px solid #BFDBFE',
                                                                            background: '#EFF6FF',
                                                                        }}>
                                                                            <td colSpan={4} style={{
                                                                                padding: '10px 12px', textAlign: 'right',
                                                                                fontWeight: 700, fontSize: '0.74rem',
                                                                                color: '#1E40AF',
                                                                            }}>
                                                                                TOTAL PRESUPUESTADO:
                                                                            </td>
                                                                            <td style={{
                                                                                padding: '10px 12px', textAlign: 'right',
                                                                                fontWeight: 800, fontSize: '0.85rem',
                                                                                color: '#1E40AF',
                                                                            }}>
                                                                                {formatCurrency(budget.importe_total)}
                                                                            </td>
                                                                        </tr>
                                                                        {parseFloat(budget.importe_cobrado) > 0 && (
                                                                            <tr style={{ background: '#F0FDF4' }}>
                                                                                <td colSpan={4} style={{
                                                                                    padding: '8px 12px', textAlign: 'right',
                                                                                    fontWeight: 600, fontSize: '0.72rem',
                                                                                    color: '#15803D',
                                                                                }}>
                                                                                    Monto Cobrado:
                                                                                </td>
                                                                                <td style={{
                                                                                    padding: '8px 12px', textAlign: 'right',
                                                                                    fontWeight: 800, fontSize: '0.8rem',
                                                                                    color: '#15803D',
                                                                                }}>
                                                                                    {formatCurrency(budget.importe_cobrado)}
                                                                                </td>
                                                                            </tr>
                                                                        )}
                                                                    </tfoot>
                                                                </table>
                                                            </div>
                                                        ) : (
                                                            <div style={{
                                                                padding: '24px', textAlign: 'center',
                                                                color: '#94A3B8', fontSize: '0.75rem',
                                                            }}>
                                                                <Package size={20} style={{ opacity: 0.3, marginBottom: '4px' }} />
                                                                <div>Sin ítems detallados para este presupuesto</div>
                                                            </div>
                                                        )}
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
