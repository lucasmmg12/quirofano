/**
 * DescartablesModuleCollapsible.jsx
 * 
 * Componente que muestra el "Costo de módulo de descartables" para la cirugía actual.
 * Al desplegarse, detalla la receta completa de descartables (cantidades por moda y promedio,
 * frecuencias de uso y costos unitarios) y permite descargar la constancia técnica oficial
 * en PDF con el formato idéntico al de Asociaciones.
 * 
 * Estándar: Sanatorio Argentino SRL / Calidad QOAG / ITAES
 */

import React, { useState, useMemo } from 'react';
import {
    Package, ChevronDown, ChevronUp, Download, FileText,
    Sparkles, CheckCircle2, Search, ArrowRight, Loader2,
    Layers, AlertCircle, RefreshCw, BarChart3, ShieldCheck
} from 'lucide-react';
import {
    findBestMatchModulo,
    getTop50Modulos,
    formatCurrency,
    generateDescartablesPDF
} from '../services/descartablesService';

export default function DescartablesModuleCollapsible({ surgery, patient = {}, currentUser = null }) {
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [calcMode, setCalcMode] = useState('moda'); // 'moda' | 'promedio'
    const [generatingPdf, setGeneratingPdf] = useState(false);
    const [manualModuloId, setManualModuloId] = useState(null);
    const [showSelectorModal, setShowSelectorModal] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');

    const top50 = useMemo(() => getTop50Modulos(), []);

    // 1. Detectar automáticamente el módulo de la cirugía
    const autoMatch = useMemo(() => {
        return findBestMatchModulo(surgery?.descripcion, surgery?.modulo);
    }, [surgery?.descripcion, surgery?.modulo]);

    // Módulo activo (seleccionado manualmente o auto-detectado)
    const activeModulo = useMemo(() => {
        if (manualModuloId) {
            return top50.find(m => m.ranking === manualModuloId) || autoMatch?.modulo;
        }
        return autoMatch?.modulo || null;
    }, [manualModuloId, top50, autoMatch]);

    // Filtrado del modal de selección alternativa
    const filteredTop50 = useMemo(() => {
        if (!searchFilter.trim()) return top50;
        const q = searchFilter.toLowerCase();
        return top50.filter(m => m.nombre_cirugia.toLowerCase().includes(q));
    }, [top50, searchFilter]);

    // Descarga de PDF
    const handleDownloadPdf = async (e) => {
        e?.stopPropagation();
        if (!activeModulo) return;
        setGeneratingPdf(true);
        try {
            await generateDescartablesPDF({
                surgery,
                modulo: activeModulo,
                patient,
                currentUser,
                mode: calcMode
            });
        } catch (err) {
            console.error('Error generando PDF de descartables:', err);
            alert('Error generando PDF: ' + err.message);
        } finally {
            setGeneratingPdf(false);
        }
    };

    if (!activeModulo && !surgery?.descripcion) {
        return null;
    }

    const totalCosto = activeModulo
        ? (calcMode === 'promedio' ? activeModulo.costo_total_estimado_promedio : activeModulo.costo_total_estimado_moda)
        : 0;

    const totalVenta = activeModulo
        ? (calcMode === 'promedio' ? activeModulo.precio_venta_total_promedio : activeModulo.precio_venta_total_moda)
        : 0;

    const descartablesBase = useMemo(() => {
        if (!activeModulo?.descartables) return [];
        return activeModulo.descartables.filter(d => d.es_modulo_base);
    }, [activeModulo]);

    return (
        <div style={{
            marginTop: '12px',
            background: '#FFFFFF',
            borderRadius: '10px',
            border: '1.5px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
        }}>
            {/* ── BARRA SUPERIOR / COLLAPSIBLE HEADER ── */}
            <div
                onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: isDetailsOpen ? '#F8FAFC' : '#FFFFFF',
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderBottom: isDetailsOpen ? '1px solid #E2E8F0' : 'none',
                    transition: 'background 0.15s ease'
                }}
                onMouseOver={e => { if (!isDetailsOpen) e.currentTarget.style.background = '#F8FAFC'; }}
                onMouseOut={e => { if (!isDetailsOpen) e.currentTarget.style.background = '#FFFFFF'; }}
            >
                {/* Lado Izquierdo: Ícono y Título */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: '#EFF6FF',
                        color: '#2563EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <Package size={17} />
                    </div>

                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                                Costo de módulo de descartables
                            </span>
                            {activeModulo && (
                                <span style={{
                                    fontSize: '0.62rem',
                                    fontWeight: 700,
                                    background: '#DBEAFE',
                                    color: '#1D4ED8',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    letterSpacing: '0.3px'
                                }}>
                                    Top #{activeModulo.ranking}
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '1px' }}>
                            {activeModulo
                                ? activeModulo.nombre_cirugia
                                : (surgery?.descripcion || 'Cirugía no identificada en el Top 50')}
                        </div>
                    </div>
                </div>

                {/* Lado Derecho: Importe Total e Indicador de Expansión */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {activeModulo ? (
                        <div style={{ textAlign: 'right' }}>
                            <div style={{
                                fontSize: '0.92rem',
                                fontWeight: 800,
                                color: '#0D3B66',
                                letterSpacing: '-0.3px',
                                fontFamily: 'monospace'
                            }}>
                                {formatCurrency(totalCosto)}
                            </div>
                            <div style={{ fontSize: '0.62rem', color: '#94A3B8', fontWeight: 600 }}>
                                {calcMode === 'moda' ? 'Moda (habitual)' : 'Promedio continuo'}
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowSelectorModal(true);
                            }}
                            style={{
                                fontSize: '0.7rem',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                background: '#F1F5F9',
                                color: '#334155',
                                border: '1px solid #CBD5E1',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}
                        >
                            Calcular desde Top 50
                        </button>
                    )}

                    <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: isDetailsOpen ? '#E2E8F0' : '#F1F5F9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#475569',
                        transition: 'all 0.2s'
                    }}>
                        {isDetailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                </div>
            </div>

            {/* ── CUERPO DESPLEGABLE / ITEMS & CONTROLES ── */}
            {isDetailsOpen && activeModulo && (
                <div style={{ padding: '14px', background: '#FAFAFA' }}>
                    {/* Header de controles y acciones del módulo */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px',
                        marginBottom: '12px',
                        background: '#FFFFFF',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0'
                    }}>
                        {/* Selector de Moda vs Promedio */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                                Cálculo estadístico:
                            </span>
                            <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '2px', borderRadius: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => setCalcMode('moda')}
                                    style={{
                                        border: 'none',
                                        background: calcMode === 'moda' ? '#FFFFFF' : 'transparent',
                                        color: calcMode === 'moda' ? '#0D3B66' : '#64748B',
                                        fontWeight: calcMode === 'moda' ? 700 : 500,
                                        fontSize: '0.7rem',
                                        padding: '4px 10px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        boxShadow: calcMode === 'moda' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                        transition: 'all 0.15s'
                                    }}
                                    title="Moda: cantidad más frecuente consumida en cirugías estándar (Recomendado)"
                                >
                                    Moda (Habitual)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCalcMode('promedio')}
                                    style={{
                                        border: 'none',
                                        background: calcMode === 'promedio' ? '#FFFFFF' : 'transparent',
                                        color: calcMode === 'promedio' ? '#0D3B66' : '#64748B',
                                        fontWeight: calcMode === 'promedio' ? 700 : 500,
                                        fontSize: '0.7rem',
                                        padding: '4px 10px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        boxShadow: calcMode === 'promedio' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                        transition: 'all 0.15s'
                                    }}
                                    title="Promedio: cantidad media aritmética exacta de todas las cirugías"
                                >
                                    Promedio
                                </button>
                            </div>

                            {/* Badge precio venta sugerido */}
                            <span style={{
                                fontSize: '0.7rem',
                                color: '#1E40AF',
                                background: '#DBEAFE',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontWeight: 600,
                                marginLeft: '6px'
                            }}>
                                Venta estimada: {formatCurrency(totalVenta)}
                            </span>
                        </div>

                        {/* Botones de acción: Cambiar Cirugía y Descargar PDF */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setShowSelectorModal(true)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    fontSize: '0.72rem',
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    background: '#FFFFFF',
                                    color: '#475569',
                                    border: '1px solid #CBD5E1',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                                title="Seleccionar otra cirugía del Top 50"
                            >
                                <RefreshCw size={12} /> Cambiar Cirugía
                            </button>

                            <button
                                type="button"
                                onClick={handleDownloadPdf}
                                disabled={generatingPdf}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '0.72rem',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    background: '#0D3B66',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    cursor: generatingPdf ? 'not-allowed' : 'pointer',
                                    fontWeight: 700,
                                    boxShadow: '0 1px 2px rgba(13, 59, 102, 0.2)',
                                    transition: 'all 0.15s'
                                }}
                                onMouseOver={e => { if (!generatingPdf) e.currentTarget.style.background = '#1E5799'; }}
                                onMouseOut={e => { if (!generatingPdf) e.currentTarget.style.background = '#0D3B66'; }}
                            >
                                {generatingPdf ? (
                                    <>
                                        <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                        Generando PDF...
                                    </>
                                ) : (
                                    <>
                                        <Download size={13} />
                                        Descargar PDF Oficial
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Muestra estadística e información del módulo */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.68rem',
                        color: '#64748B',
                        padding: '4px 6px',
                        marginBottom: '8px'
                    }}>
                        <div>
                            📋 Incluye <strong>{descartablesBase.length} descartables base</strong> (frecuencia ≥ 25% calculada sobre <strong>{activeModulo.casos_analizados} cirugías</strong> reales).
                        </div>
                        <div>
                            Costo Moda: <strong>{formatCurrency(activeModulo.costo_total_estimado_moda)}</strong> | Costo Promedio: <strong>{formatCurrency(activeModulo.costo_total_estimado_promedio)}</strong>
                        </div>
                    </div>

                    {/* ── TABLA DE DETALLE DE DESCARTABLES ── */}
                    <div style={{
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden',
                        background: '#FFFFFF',
                        maxHeight: '340px',
                        overflowY: 'auto'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                            <thead>
                                <tr style={{ background: '#0D3B66', color: '#FFFFFF', textAlign: 'left' }}>
                                    <th style={{ padding: '7px 10px', width: '30px', textAlign: 'center' }}>#</th>
                                    <th style={{ padding: '7px 10px' }}>Insumo / Concepto Descartable</th>
                                    <th style={{ padding: '7px 10px', textAlign: 'center', width: '90px' }}>Frecuencia</th>
                                    <th style={{ padding: '7px 10px', textAlign: 'center', width: '70px', background: calcMode === 'moda' ? '#1E5799' : 'transparent' }}>
                                        Cant. Moda
                                    </th>
                                    <th style={{ padding: '7px 10px', textAlign: 'center', width: '70px', background: calcMode === 'promedio' ? '#1E5799' : 'transparent' }}>
                                        Cant. Prom.
                                    </th>
                                    <th style={{ padding: '7px 10px', textAlign: 'right', width: '95px' }}>Costo Unit.</th>
                                    <th style={{ padding: '7px 10px', textAlign: 'right', width: '105px' }}>Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {descartablesBase.map((item, idx) => {
                                    const subtotal = calcMode === 'promedio'
                                        ? item.costo_subtotal_promedio
                                        : item.costo_subtotal_moda;

                                    return (
                                        <tr
                                            key={idx}
                                            style={{
                                                background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                                                borderBottom: '1px solid #F1F5F9'
                                            }}
                                        >
                                            <td style={{ padding: '6px 10px', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>
                                                {idx + 1}
                                            </td>
                                            <td style={{ padding: '6px 10px', fontWeight: 600, color: '#1E293B' }}>
                                                {item.concepto}
                                            </td>
                                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 700,
                                                    color: item.frecuencia_uso_pct >= 90 ? '#15803D' : item.frecuencia_uso_pct >= 50 ? '#0369A1' : '#B45309',
                                                    background: item.frecuencia_uso_pct >= 90 ? '#DCFCE7' : item.frecuencia_uso_pct >= 50 ? '#E0F2FE' : '#FEF3C7',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px'
                                                }}>
                                                    {item.frecuencia_uso_pct}%
                                                </span>
                                            </td>
                                            <td style={{
                                                padding: '6px 10px',
                                                textAlign: 'center',
                                                fontWeight: calcMode === 'moda' ? 800 : 500,
                                                color: calcMode === 'moda' ? '#0F172A' : '#64748B',
                                                background: calcMode === 'moda' ? '#F1F5F9' : 'transparent'
                                            }}>
                                                {item.cantidad_moda}
                                            </td>
                                            <td style={{
                                                padding: '6px 10px',
                                                textAlign: 'center',
                                                fontWeight: calcMode === 'promedio' ? 800 : 500,
                                                color: calcMode === 'promedio' ? '#0F172A' : '#64748B',
                                                background: calcMode === 'promedio' ? '#F1F5F9' : 'transparent'
                                            }}>
                                                {item.cantidad_promedio}
                                            </td>
                                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#475569', fontFamily: 'monospace' }}>
                                                {formatCurrency(item.costo_unitario)}
                                            </td>
                                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#0D3B66', fontFamily: 'monospace' }}>
                                                {formatCurrency(subtotal)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Resumen de totales al pie */}
                    <div style={{
                        marginTop: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: '#F1F5F9',
                        borderRadius: '8px',
                        fontSize: '0.78rem'
                    }}>
                        <div style={{ color: '#475569', fontWeight: 600 }}>
                            Total Costo Estimado ({calcMode === 'moda' ? 'Moda habitual' : 'Promedio continuo'}):
                        </div>
                        <div style={{
                            fontSize: '1rem',
                            fontWeight: 800,
                            color: '#0D3B66',
                            fontFamily: 'monospace'
                        }}>
                            {formatCurrency(totalCosto)}
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL DE SELECCIÓN DE OTRA CIRUGÍA (TOP 50) ── */}
            {showSelectorModal && (
                <div
                    onClick={() => setShowSelectorModal(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.5)',
                        backdropFilter: 'blur(3px)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#FFFFFF',
                            width: '100%',
                            maxWidth: '650px',
                            maxHeight: '80vh',
                            borderRadius: '12px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}
                    >
                        {/* Modal Header */}
                        <div style={{
                            padding: '14px 18px',
                            background: '#0D3B66',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
                                    Catálogo Top 50 — Módulos de Descartables
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#93C5FD' }}>
                                    Selecciona la cirugía para asociar su módulo de descartables a este paciente
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowSelectorModal(false)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#FFFFFF',
                                    fontSize: '1.2rem',
                                    cursor: 'pointer',
                                    padding: '4px'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Buscador */}
                        <div style={{ padding: '12px 18px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                borderRadius: '8px',
                                padding: '6px 12px'
                            }}>
                                <Search size={15} style={{ color: '#94A3B8' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar cirugía por nombre (ej. Cesárea, Fibroendoscopia, Hernioplastia)..."
                                    value={searchFilter}
                                    onChange={(e) => setSearchFilter(e.target.value)}
                                    style={{
                                        border: 'none',
                                        outline: 'none',
                                        width: '100%',
                                        fontSize: '0.78rem'
                                    }}
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Lista de cirugías */}
                        <div style={{ padding: '10px 18px', overflowY: 'auto', flex: 1 }}>
                            {filteredTop50.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8', fontSize: '0.8rem' }}>
                                    No se encontraron cirugías con ese criterio.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {filteredTop50.map((m) => {
                                        const isSelected = activeModulo?.ranking === m.ranking;
                                        return (
                                            <div
                                                key={m.ranking}
                                                onClick={() => {
                                                    setManualModuloId(m.ranking);
                                                    setShowSelectorModal(false);
                                                    setIsDetailsOpen(true);
                                                }}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '10px 12px',
                                                    borderRadius: '8px',
                                                    border: isSelected ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                                                    background: isSelected ? '#EFF6FF' : '#FFFFFF',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s'
                                                }}
                                                onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = '#F8FAFC'; }}
                                                onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = '#FFFFFF'; }}
                                            >
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{
                                                            fontSize: '0.65rem',
                                                            fontWeight: 700,
                                                            background: isSelected ? '#2563EB' : '#F1F5F9',
                                                            color: isSelected ? '#FFFFFF' : '#64748B',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px'
                                                        }}>
                                                            #{m.ranking}
                                                        </span>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A' }}>
                                                            {m.nombre_cirugia}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '3px' }}>
                                                        {m.cantidad_articulos_modulo} descartables base · {m.casos_analizados} cirugías analizadas
                                                    </div>
                                                </div>

                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0D3B66', fontFamily: 'monospace' }}>
                                                        {formatCurrency(m.costo_total_estimado_moda)}
                                                    </div>
                                                    <div style={{ fontSize: '0.62rem', color: '#94A3B8' }}>
                                                        Venta: {formatCurrency(m.precio_venta_total_moda)}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div style={{
                            padding: '10px 18px',
                            background: '#F8FAFC',
                            borderTop: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'flex-end'
                        }}>
                            <button
                                type="button"
                                onClick={() => setShowSelectorModal(false)}
                                style={{
                                    fontSize: '0.75rem',
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    background: '#E2E8F0',
                                    color: '#475569',
                                    border: 'none',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
