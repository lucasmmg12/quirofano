/**
 * LiquidacionesPanel.jsx
 * Módulo de Procesamiento de Excel y Generación de Liquidaciones en PDF
 * Sanatorio Argentino SRL
 * 
 * Pestañas:
 * 1. Guardia Pediátrica (Consultas Médicas)
 * 2. Instrumentadores Quirúrgicos (Procedimientos Quirúrgicos)
 * 
 * Funcionalidades:
 * - Parser de archivos Excel (.xlsx/.xls)
 * - Emisión de PDF General Consolidado
 * - Emisión de PDF Individual por Prestador (Fidelidad exacta a modelos oficiales)
 * - Descarga Masiva de todos los PDFs individuales en un archivo .ZIP (JSZip)
 * - Edición de matrículas, períodos, valores de adicionales y parámetros
 */

import React, { useState, useRef, useMemo } from 'react';
import {
    FileSpreadsheet, Upload, Download, FileText, CheckCircle2,
    Loader2, Users, DollarSign, Activity, Stethoscope, Search,
    Filter, Archive, RefreshCw, Eye, X, Edit2, ShieldAlert,
    AlertCircle, Sparkles, ChevronRight, Check, Plus, Trash2,
    Clock, Building, ArrowRight, Printer
} from 'lucide-react';
import JSZip from 'jszip';
import { parseGuardiaExcel } from '../utils/guardiaLiquidacionParser';
import { parseInstrumentadoresExcel } from '../utils/instrumentadoresParser';
import {
    generateGuardiaIndividualPdf,
    generateGuardiaGeneralPdf,
    formatCurrency
} from '../utils/guardiaLiquidacionPdf';
import {
    generateInstrumentadorIndividualPdf,
    generateInstrumentadoresGeneralPdf
} from '../utils/instrumentadoresPdf';

export default function LiquidacionesPanel() {
    const [activeTab, setActiveTab] = useState('guardia'); // 'guardia' | 'instrumentadores'
    
    // Estado de datos procesados
    const [guardiaData, setGuardiaData] = useState(null);
    const [instrumentadoresData, setInstrumentadoresData] = useState(null);

    // Parámetros globales de liquidación
    const [periodo, setPeriodo] = useState('Mayo 2026');
    const [numeroLiquidacion, setNumeroLiquidacion] = useState('410');
    const [valorAdicionalGuardia, setValorAdicionalGuardia] = useState(8000);
    const [obrasSocialesAdicional, setObrasSocialesAdicional] = useState(['001 - PROVINCIA', '004 - DAMSU']);
    const [nuevaOSInput, setNuevaOSInput] = useState('');

    // Estados de carga y progreso
    const [isProcessing, setIsProcessing] = useState(false);
    const [isZipping, setIsZipping] = useState(false);
    const [zipProgress, setZipProgress] = useState(0);
    const [searchFilter, setSearchFilter] = useState('');

    // Modal de vista previa / detalle
    const [previewPrestador, setPreviewPrestador] = useState(null);

    // Edición de matrícula en línea
    const [editingMatricula, setEditingMatricula] = useState(null); // id prestador
    const [matriculaInput, setMatriculaInput] = useState('');

    const fileInputRef = useRef(null);

    // Manejador de carga de archivo Excel
    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        try {
            const buffer = await file.arrayBuffer();

            if (activeTab === 'guardia') {
                const parsed = parseGuardiaExcel(buffer, {
                    periodo,
                    liquidacion: numeroLiquidacion,
                    valorAdicional: valorAdicionalGuardia,
                    obrasSocialesAdicional
                });
                setGuardiaData(parsed);
            } else {
                const parsed = parseInstrumentadoresExcel(buffer, {
                    periodo,
                    liquidacion: numeroLiquidacion
                });
                setInstrumentadoresData(parsed);
            }
        } catch (err) {
            console.error('Error procesando archivo Excel:', err);
            alert('Error al leer el archivo Excel. Verifique que el formato sea correcto.');
        } finally {
            setIsProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Actualizar parámetros y recalcular
    const handleRecalcular = () => {
        if (activeTab === 'guardia' && guardiaData) {
            const prestadoresActualizados = guardiaData.prestadores.map(p => {
                let countAdic = 0;
                const adicPorOS = {};
                p.atenciones.forEach(a => {
                    const match = obrasSocialesAdicional.some(os => a.obraSocial.toLowerCase().includes(os.toLowerCase()));
                    if (match) {
                        const osName = obrasSocialesAdicional.find(os => a.obraSocial.toLowerCase().includes(os.toLowerCase())) || a.obraSocial;
                        adicPorOS[osName] = (adicPorOS[osName] || 0) + 1;
                        countAdic++;
                    }
                });
                const totalMontoAdicional = countAdic * valorAdicionalGuardia;
                return {
                    ...p,
                    periodo,
                    liquidacion: numeroLiquidacion,
                    adicionalesPorOS: adicPorOS,
                    totalCantidadAdicional: countAdic,
                    totalMontoAdicional,
                    totalGeneralConAdicional: p.totalImporte + totalMontoAdicional
                };
            });

            const totalFacturadoGlobal = prestadoresActualizados.reduce((acc, p) => acc + p.totalImporte, 0);
            const totalAdicionalesGlobal = prestadoresActualizados.reduce((acc, p) => acc + p.totalMontoAdicional, 0);
            const totalCantidadAdicionalesGlobal = prestadoresActualizados.reduce((acc, p) => acc + p.totalCantidadAdicional, 0);

            setGuardiaData({
                ...guardiaData,
                periodo,
                liquidacion: numeroLiquidacion,
                valorAdicional: valorAdicionalGuardia,
                obrasSocialesAdicional,
                totalFacturadoGlobal,
                totalCantidadAdicionalesGlobal,
                totalAdicionalesGlobal,
                granTotalGlobal: totalFacturadoGlobal + totalAdicionalesGlobal,
                prestadores: prestadoresActualizados
            });
        } else if (activeTab === 'instrumentadores' && instrumentadoresData) {
            const updated = instrumentadoresData.instrumentadores.map(inst => ({
                ...inst,
                periodo,
                liquidacion: numeroLiquidacion
            }));
            setInstrumentadoresData({
                ...instrumentadoresData,
                periodo,
                liquidacion: numeroLiquidacion,
                instrumentadores: updated
            });
        }
    };

    // Agregar / quitar obra social de adicional
    const handleAddOS = () => {
        if (!nuevaOSInput.trim()) return;
        if (!obrasSocialesAdicional.includes(nuevaOSInput.trim())) {
            setObrasSocialesAdicional(prev => [...prev, nuevaOSInput.trim()]);
            setNuevaOSInput('');
        }
    };

    const handleRemoveOS = (osName) => {
        setObrasSocialesAdicional(prev => prev.filter(o => o !== osName));
    };

    // Guardar matrícula editada
    const handleSaveMatricula = (prestadorId) => {
        if (activeTab === 'guardia' && guardiaData) {
            const updated = guardiaData.prestadores.map(p => {
                if (p.id === prestadorId) return { ...p, matricula: matriculaInput.trim() };
                return p;
            });
            setGuardiaData({ ...guardiaData, prestadores: updated });
        } else if (activeTab === 'instrumentadores' && instrumentadoresData) {
            const updated = instrumentadoresData.instrumentadores.map(inst => {
                if (inst.id === prestadorId) return { ...inst, matricula: matriculaInput.trim() };
                return inst;
            });
            setInstrumentadoresData({ ...instrumentadoresData, instrumentadores: updated });
        }
        setEditingMatricula(null);
        setMatriculaInput('');
    };

    // Descargar PDF Individual
    const handleDownloadIndividualPdf = async (prestador) => {
        try {
            if (activeTab === 'guardia') {
                const doc = await generateGuardiaIndividualPdf(prestador, {
                    valorAdicional: valorAdicionalGuardia,
                    obrasSocialesAdicional
                });
                const cleanName = prestador.nombre.replace(/[^a-zA-Z0-9]/g, '_');
                doc.save(`Liquidacion_Guardia_${cleanName}_${periodo.replace(/\s+/g, '_')}.pdf`);
            } else {
                const doc = await generateInstrumentadorIndividualPdf(prestador);
                const cleanName = prestador.nombre.replace(/[^a-zA-Z0-9]/g, '_');
                doc.save(`Liquidacion_Instrumentacion_${cleanName}_${periodo.replace(/\s+/g, '_')}.pdf`);
            }
        } catch (err) {
            console.error('Error generando PDF individual:', err);
            alert('Error al generar el PDF.');
        }
    };

    // Descargar PDF General Consolidado
    const handleDownloadGeneralPdf = async () => {
        try {
            if (activeTab === 'guardia') {
                if (!guardiaData) return;
                const doc = await generateGuardiaGeneralPdf(guardiaData);
                doc.save(`Liquidacion_General_Guardia_Pediatrica_${periodo.replace(/\s+/g, '_')}.pdf`);
            } else {
                if (!instrumentadoresData) return;
                const doc = await generateInstrumentadoresGeneralPdf(instrumentadoresData);
                doc.save(`Liquidacion_General_Instrumentadores_${periodo.replace(/\s+/g, '_')}.pdf`);
            }
        } catch (err) {
            console.error('Error generando PDF general:', err);
            alert('Error al generar el PDF general.');
        }
    };

    // Descargar Todos en ZIP (.zip)
    const handleDownloadZip = async () => {
        const zip = new JSZip();
        setIsZipping(true);
        setZipProgress(0);

        try {
            if (activeTab === 'guardia' && guardiaData) {
                const total = guardiaData.prestadores.length;
                for (let i = 0; i < total; i++) {
                    const p = guardiaData.prestadores[i];
                    const doc = await generateGuardiaIndividualPdf(p, {
                        valorAdicional: valorAdicionalGuardia,
                        obrasSocialesAdicional
                    });
                    const arrayBuffer = doc.output('arraybuffer');
                    const cleanName = p.nombre.replace(/[^a-zA-Z0-9]/g, '_');
                    zip.file(`${String(i + 1).padStart(2, '0')}_${cleanName}.pdf`, arrayBuffer);
                    setZipProgress(Math.round(((i + 1) / total) * 100));
                }

                // Agregar el general consolidado dentro del ZIP
                const docGen = await generateGuardiaGeneralPdf(guardiaData);
                zip.file(`00_RESUMEN_GENERAL_GUARDIA_${periodo.replace(/\s+/g, '_')}.pdf`, docGen.output('arraybuffer'));

                const content = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Liquidaciones_Guardia_${periodo.replace(/\s+/g, '_')}.zip`;
                a.click();
                URL.revokeObjectURL(url);
            } else if (activeTab === 'instrumentadores' && instrumentadoresData) {
                const total = instrumentadoresData.instrumentadores.length;
                for (let i = 0; i < total; i++) {
                    const inst = instrumentadoresData.instrumentadores[i];
                    const doc = await generateInstrumentadorIndividualPdf(inst);
                    const arrayBuffer = doc.output('arraybuffer');
                    const cleanName = inst.nombre.replace(/[^a-zA-Z0-9]/g, '_');
                    zip.file(`${String(i + 1).padStart(2, '0')}_${cleanName}.pdf`, arrayBuffer);
                    setZipProgress(Math.round(((i + 1) / total) * 100));
                }

                const docGen = await generateInstrumentadoresGeneralPdf(instrumentadoresData);
                zip.file(`00_RESUMEN_GENERAL_INSTRUMENTADORES_${periodo.replace(/\s+/g, '_')}.pdf`, docGen.output('arraybuffer'));

                const content = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Liquidaciones_Instrumentadores_${periodo.replace(/\s+/g, '_')}.zip`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Error generando archivo ZIP:', err);
            alert('Error al generar el archivo ZIP.');
        } finally {
            setIsZipping(false);
            setZipProgress(0);
        }
    };

    // Lista filtrada
    const currentList = useMemo(() => {
        if (activeTab === 'guardia') {
            if (!guardiaData) return [];
            if (!searchFilter.trim()) return guardiaData.prestadores;
            const q = searchFilter.toLowerCase();
            return guardiaData.prestadores.filter(p =>
                p.nombre.toLowerCase().includes(q) ||
                (p.matricula && p.matricula.toLowerCase().includes(q))
            );
        } else {
            if (!instrumentadoresData) return [];
            if (!searchFilter.trim()) return instrumentadoresData.instrumentadores;
            const q = searchFilter.toLowerCase();
            return instrumentadoresData.instrumentadores.filter(inst =>
                inst.nombre.toLowerCase().includes(q) ||
                (inst.matricula && inst.matricula.toLowerCase().includes(q))
            );
        }
    }, [activeTab, guardiaData, instrumentadoresData, searchFilter]);

    const activeData = activeTab === 'guardia' ? guardiaData : instrumentadoresData;

    return (
        <div style={{
            padding: '24px',
            maxWidth: '1300px',
            margin: '0 auto',
            fontFamily: "'Montserrat', sans-serif",
            color: '#0F172A'
        }}>
            {/* Cabecera Principal */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                padding: '20px 28px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '14px',
                        background: 'linear-gradient(135deg, #1E5799 0%, #2980B9 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        boxShadow: '0 4px 12px rgba(30,87,153,0.25)'
                    }}>
                        <FileSpreadsheet size={24} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                            Centro de Liquidaciones Médicas (Excel ➔ PDF)
                        </h2>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                            Sanatorio Argentino SRL · Emisión Oficial de Informes Generales y por Prestador
                        </p>
                    </div>
                </div>

                {/* Selector de Pestaña */}
                <div style={{
                    display: 'flex',
                    background: '#F1F5F9',
                    padding: '4px',
                    borderRadius: '12px',
                    gap: '4px'
                }}>
                    <button
                        onClick={() => { setActiveTab('guardia'); setSearchFilter(''); }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            borderRadius: '9px',
                            border: 'none',
                            background: activeTab === 'guardia' ? '#FFFFFF' : 'transparent',
                            color: activeTab === 'guardia' ? '#1E5799' : '#64748B',
                            fontWeight: activeTab === 'guardia' ? 700 : 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            boxShadow: activeTab === 'guardia' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Stethoscope size={16} /> Guardia Pediátrica
                    </button>
                    <button
                        onClick={() => { setActiveTab('instrumentadores'); setSearchFilter(''); }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            borderRadius: '9px',
                            border: 'none',
                            background: activeTab === 'instrumentadores' ? '#FFFFFF' : 'transparent',
                            color: activeTab === 'instrumentadores' ? '#1E5799' : '#64748B',
                            fontWeight: activeTab === 'instrumentadores' ? 700 : 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            boxShadow: activeTab === 'instrumentadores' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Activity size={16} /> Instrumentadores Quirúrgicos
                    </button>
                </div>
            </div>

            {/* Zona de Carga y Parámetros */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 380px',
                gap: '20px',
                marginBottom: '20px'
            }}>
                {/* Drag & Drop Upload Zone */}
                <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                        background: '#FFFFFF',
                        border: '2px dashed #93C5FD',
                        borderRadius: '16px',
                        padding: '32px 24px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                        minHeight: '160px'
                    }}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#1E5799'; }}
                    onDragLeave={(e) => { e.currentTarget.style.borderColor = '#93C5FD'; }}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = '#93C5FD';
                        if (e.dataTransfer.files?.length) {
                            handleFileUpload({ target: { files: e.dataTransfer.files } });
                        }
                    }}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        accept=".xlsx, .xls"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                    />

                    <div style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '50%',
                        background: '#EFF6FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#1E5799',
                        marginBottom: '12px'
                    }}>
                        {isProcessing ? (
                            <Loader2 size={26} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                            <Upload size={26} />
                        )}
                    </div>

                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1E3A8A' }}>
                        {isProcessing ? 'Procesando archivo Excel...' : `Subir planilla de ${activeTab === 'guardia' ? 'Guardia Pediátrica' : 'Instrumentadores'}`}
                    </h4>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                        Arrastra el archivo <strong>.xlsx</strong> o haz clic aquí para seleccionarlo
                    </p>
                </div>

                {/* Panel de Parámetros Globales */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '20px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                            Parámetros de Liquidación
                        </h4>
                        <button
                            onClick={handleRecalcular}
                            style={{
                                padding: '4px 10px',
                                background: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                color: '#1E5799',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            <RefreshCw size={12} /> Recalcular
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '3px' }}>
                                Período
                            </label>
                            <input
                                type="text"
                                value={periodo}
                                onChange={(e) => setPeriodo(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    fontFamily: "'Montserrat', sans-serif",
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '3px' }}>
                                N° Liquidación
                            </label>
                            <input
                                type="text"
                                value={numeroLiquidacion}
                                onChange={(e) => setNumeroLiquidacion(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    fontFamily: "'Montserrat', sans-serif",
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    </div>

                    {/* Si es Guardia, mostrar adicionales */}
                    {activeTab === 'guardia' && (
                        <div>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '3px' }}>
                                Valor Adicional por Consulta ($)
                            </label>
                            <input
                                type="number"
                                value={valorAdicionalGuardia}
                                onChange={(e) => setValorAdicionalGuardia(Number(e.target.value))}
                                style={{
                                    width: '100%',
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    fontFamily: "'Montserrat', sans-serif",
                                    boxSizing: 'border-box'
                                }}
                            />
                            
                            <div style={{ marginTop: '8px' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
                                    Obras Sociales con Adicional:
                                </label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                                    {obrasSocialesAdicional.map(os => (
                                        <span key={os} style={{
                                            background: '#EFF6FF',
                                            border: '1px solid #BFDBFE',
                                            borderRadius: '6px',
                                            padding: '2px 6px',
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            color: '#1E40AF',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            {os}
                                            <X size={10} style={{ cursor: 'pointer' }} onClick={() => handleRemoveOS(os)} />
                                        </span>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <input
                                        type="text"
                                        placeholder="Ej: 005 - OSDE"
                                        value={nuevaOSInput}
                                        onChange={(e) => setNuevaOSInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddOS()}
                                        style={{
                                            flex: 1,
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.72rem',
                                            fontFamily: "'Montserrat', sans-serif"
                                        }}
                                    />
                                    <button
                                        onClick={handleAddOS}
                                        style={{
                                            padding: '4px 8px',
                                            background: '#1E5799',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '0.72rem'
                                        }}
                                    >
                                        <Plus size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Tarjetas de Métricas Resumen */}
            {activeData && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '14px',
                    marginBottom: '20px'
                }}>
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            {activeTab === 'guardia' ? 'Médicos Detectados' : 'Instrumentadores'}
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                            {activeTab === 'guardia' ? activeData.totalPrestadores : activeData.totalInstrumentadores}
                        </div>
                    </div>

                    <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            {activeTab === 'guardia' ? 'Total Consultas' : 'Total Cirugías / Procedimientos'}
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1E5799', marginTop: '4px' }}>
                            {activeTab === 'guardia' ? activeData.totalAtenciones : activeData.totalProcedimientosGlobal}
                        </div>
                    </div>

                    <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Total Facturado Base
                        </div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
                            {formatCurrency(activeData.totalFacturadoGlobal)}
                        </div>
                    </div>

                    {activeTab === 'guardia' && (
                        <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                Adicionales ({activeData.totalCantidadAdicionalesGlobal})
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#7C3AED', marginTop: '4px' }}>
                                {formatCurrency(activeData.totalAdicionalesGlobal)}
                            </div>
                        </div>
                    )}

                    <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Gran Total Liquidación
                        </div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                            {formatCurrency(activeTab === 'guardia' ? activeData.granTotalGlobal : activeData.totalFacturadoGlobal)}
                        </div>
                    </div>
                </div>
            )}

            {/* Barra de Acciones Globales */}
            {activeData && (
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '16px 24px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '20px',
                    flexWrap: 'wrap',
                    gap: '14px'
                }}>
                    <div style={{ position: 'relative', width: '320px' }}>
                        <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Buscar por profesional o matrícula..."
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px 12px 8px 36px',
                                borderRadius: '10px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.82rem',
                                fontFamily: "'Montserrat', sans-serif",
                                outline: 'none',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={handleDownloadGeneralPdf}
                            style={{
                                padding: '9px 18px',
                                background: '#EFF6FF',
                                color: '#1E5799',
                                border: '1.5px solid #BFDBFE',
                                borderRadius: '10px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 1px 4px rgba(30,87,153,0.1)'
                            }}
                        >
                            <FileText size={16} /> Descargar PDF General Consolidado
                        </button>

                        <button
                            onClick={handleDownloadZip}
                            disabled={isZipping}
                            style={{
                                padding: '9px 20px',
                                background: 'linear-gradient(135deg, #1E5799 0%, #2980B9 100%)',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '10px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: isZipping ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 2px 8px rgba(30,87,153,0.25)'
                            }}
                        >
                            {isZipping ? (
                                <>
                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                    Generando ZIP ({zipProgress}%)...
                                </>
                            ) : (
                                <>
                                    <Archive size={16} /> Descargar Todos en ZIP (.zip)
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Tabla de Prestadores */}
            {activeData && (
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                    overflow: 'hidden'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: '#334155', width: '50px' }}>N°</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: '#334155' }}>Profesional / Prestador</th>
                                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#334155', width: '130px' }}>Matrícula</th>
                                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#334155', width: '110px' }}>
                                    {activeTab === 'guardia' ? 'Atenciones' : 'Procedimientos'}
                                </th>
                                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#334155', width: '140px' }}>
                                    Subtotal Facturado
                                </th>
                                {activeTab === 'guardia' && (
                                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#334155', width: '140px' }}>
                                        Adicional ($)
                                    </th>
                                )}
                                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#334155', width: '150px' }}>
                                    Total Liquidado
                                </th>
                                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#334155', width: '160px' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentList.map((p, idx) => {
                                const isEditing = editingMatricula === p.id;
                                const totalFila = activeTab === 'guardia' ? p.totalGeneralConAdicional : p.totalValor;

                                return (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.1s ease' }}>
                                        <td style={{ padding: '12px 16px', color: '#94A3B8', fontWeight: 700 }}>{idx + 1}</td>
                                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>
                                            {p.nombre}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            {isEditing ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                                                    <input
                                                        type="text"
                                                        value={matriculaInput}
                                                        onChange={(e) => setMatriculaInput(e.target.value)}
                                                        autoFocus
                                                        style={{ width: '70px', padding: '3px 6px', fontSize: '0.78rem', borderRadius: '6px', border: '1px solid #1E5799', textAlign: 'center' }}
                                                    />
                                                    <button onClick={() => handleSaveMatricula(p.id)} style={{ border: 'none', background: '#10B981', color: '#fff', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer' }}><Check size={12} /></button>
                                                    <button onClick={() => setEditingMatricula(null)} style={{ border: 'none', background: '#EF4444', color: '#fff', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer' }}><X size={12} /></button>
                                                </div>
                                            ) : (
                                                <span
                                                    onClick={() => { setEditingMatricula(p.id); setMatriculaInput(p.matricula || ''); }}
                                                    title="Clic para editar matrícula"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        cursor: 'pointer',
                                                        padding: '3px 8px',
                                                        borderRadius: '6px',
                                                        background: p.matricula ? '#F1F5F9' : '#FEF3C7',
                                                        color: p.matricula ? '#334155' : '#D97706',
                                                        fontWeight: 700,
                                                        fontSize: '0.75rem'
                                                    }}
                                                >
                                                    {p.matricula || 'Sin Matr.'} <Edit2 size={10} />
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#1E5799' }}>
                                            {activeTab === 'guardia' ? p.atenciones.length : p.procedimientos.length}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                                            {formatCurrency(activeTab === 'guardia' ? p.totalImporte : p.totalValor)}
                                        </td>
                                        {activeTab === 'guardia' && (
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#7C3AED' }}>
                                                {p.totalMontoAdicional > 0 ? (
                                                    <span title={`${p.totalCantidadAdicional} consultas con adicional`}>
                                                        {formatCurrency(p.totalMontoAdicional)}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                        )}
                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                                            {formatCurrency(totalFila)}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                <button
                                                    onClick={() => setPreviewPrestador(p)}
                                                    title="Ver Detalle de Prestaciones"
                                                    style={{
                                                        padding: '6px 10px',
                                                        background: '#F8FAFC',
                                                        border: '1px solid #CBD5E1',
                                                        borderRadius: '8px',
                                                        color: '#475569',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600
                                                    }}
                                                >
                                                    <Eye size={13} /> Ver
                                                </button>
                                                <button
                                                    onClick={() => handleDownloadIndividualPdf(p)}
                                                    title="Descargar PDF Oficial"
                                                    style={{
                                                        padding: '6px 10px',
                                                        background: '#1E5799',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                        color: '#FFFFFF',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700
                                                    }}
                                                >
                                                    <Download size={13} /> PDF
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal de Vista Previa y Detalle de Atenciones */}
            {previewPrestador && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.6)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                    zIndex: 1000,
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '20px',
                        width: '100%',
                        maxWidth: '900px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                    }}>
                        {/* Cabecera Modal */}
                        <div style={{
                            padding: '20px 24px',
                            background: '#F8FAFC',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                                    {previewPrestador.nombre}
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                                    Matrícula: <strong>{previewPrestador.matricula || '—'}</strong> · Período: {previewPrestador.periodo} · Liquidación: {previewPrestador.liquidacion}
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    onClick={() => handleDownloadIndividualPdf(previewPrestador)}
                                    style={{
                                        padding: '8px 16px',
                                        background: '#1E5799',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        borderRadius: '10px',
                                        fontSize: '0.82rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <Download size={14} /> Descargar PDF
                                </button>
                                <button
                                    onClick={() => setPreviewPrestador(null)}
                                    style={{
                                        padding: '8px',
                                        background: '#E2E8F0',
                                        border: 'none',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        color: '#475569'
                                    }}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Cuerpo Modal (Lista de Consultas o Procedimientos) */}
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                            {activeTab === 'guardia' ? (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>
                                            <th style={{ padding: '8px', textAlign: 'left' }}>Fecha</th>
                                            <th style={{ padding: '8px', textAlign: 'left' }}>Paciente</th>
                                            <th style={{ padding: '8px', textAlign: 'left' }}>Obra Social</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>Importe</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewPrestador.atenciones.map((a, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '8px', color: '#64748B' }}>{a.fecha}</td>
                                                <td style={{ padding: '8px', fontWeight: 600 }}>{a.paciente}</td>
                                                <td style={{ padding: '8px', color: '#334155' }}>{a.obraSocial}</td>
                                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(a.importe)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>
                                            <th style={{ padding: '8px', textAlign: 'left' }}>Fecha</th>
                                            <th style={{ padding: '8px', textAlign: 'left' }}>Paciente</th>
                                            <th style={{ padding: '8px', textAlign: 'left' }}>Procedimiento</th>
                                            <th style={{ padding: '8px', textAlign: 'left' }}>Obs.</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>Valor</th>
                                            <th style={{ padding: '8px', textAlign: 'left' }}>Cirujano</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewPrestador.procedimientos.map((p, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '8px', color: '#64748B' }}>{p.fecha}</td>
                                                <td style={{ padding: '8px', fontWeight: 600 }}>{p.paciente}</td>
                                                <td style={{ padding: '8px', color: '#334155' }}>{p.procedimiento}</td>
                                                <td style={{ padding: '8px', color: '#7C3AED', fontSize: '0.72rem' }}>{p.observacion}</td>
                                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(p.valor)}</td>
                                                <td style={{ padding: '8px', color: '#64748B' }}>{p.cirujano}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Pie Modal con Resumen de Totales */}
                        <div style={{
                            padding: '16px 24px',
                            background: '#F8FAFC',
                            borderTop: '1px solid #E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                {activeTab === 'guardia' && previewPrestador.totalCantidadAdicional > 0 && (
                                    <div style={{ fontSize: '0.8rem', color: '#7C3AED', fontWeight: 700 }}>
                                        Adicional Guardia ({previewPrestador.totalCantidadAdicional} atenciones): {formatCurrency(previewPrestador.totalMontoAdicional)}
                                    </div>
                                )}
                            </div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                Total General: {formatCurrency(activeTab === 'guardia' ? previewPrestador.totalGeneralConAdicional : previewPrestador.totalValor)}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
            `}</style>
        </div>
    );
}
