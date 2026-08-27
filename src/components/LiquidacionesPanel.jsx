/**
 * LiquidacionesPanel.jsx
 * Módulo de Procesamiento de Excel y Generación de Liquidaciones en PDF
 * Sanatorio Argentino SRL
 * 
 * Pestañas:
 * 1. 🩺 Guardia Pediátrica (Consultas Médicas: 70% Honorarios Netos + Adicionales Discriminados)
 * 2. 🏥 Instrumentadores Quirúrgicos (Procedimientos Quirúrgicos)
 * 3. 📜 Historial de Liquidaciones (Auditoría y re-descargas en .zip o PDF)
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
    FileSpreadsheet, Upload, Download, FileText, CheckCircle2,
    Loader2, Users, DollarSign, Activity, Stethoscope, Search,
    Filter, Archive, RefreshCw, Eye, X, Edit2, ShieldAlert,
    AlertCircle, Sparkles, ChevronRight, Check, Plus, Trash2,
    Clock, Building, ArrowRight, Printer, History, Calendar,
    UserCheck, FileArchive, ArrowUpRight, Percent, Tag
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
import {
    getHistorialLiquidaciones,
    saveLiquidacionEnHistorial,
    deleteLiquidacionDelHistorial
} from '../services/liquidacionesService';

export default function LiquidacionesPanel({ currentUser, addToast }) {
    const [activeTab, setActiveTab] = useState('guardia'); // 'guardia' | 'instrumentadores' | 'historial'
    
    // Estado de datos procesados en sesión activa
    const [guardiaData, setGuardiaData] = useState(null);
    const [instrumentadoresData, setInstrumentadoresData] = useState(null);

    // Historial
    const [historial, setHistorial] = useState([]);
    const [historialFilter, setHistorialFilter] = useState('');

    // Parámetros globales de liquidación
    const [periodo, setPeriodo] = useState('Mayo 2026');
    const [numeroLiquidacion, setNumeroLiquidacion] = useState('410');
    const [porcentajeRetencion, setPorcentajeRetencion] = useState(30); // 30% retención = 70% neto
    
    // Lista configurable de adicionales por Obra Social
    const [adicionalesConfig, setAdicionalesConfig] = useState([
        { id: 'os_1', obraSocial: '001 - PROVINCIA', valor: 8000 },
        { id: 'os_2', obraSocial: '004 - DAMSU', valor: 8000 }
    ]);
    const [nuevaOSNombre, setNuevaOSNombre] = useState('');
    const [nuevoOSValor, setNuevoOSValor] = useState(8000);

    // Estados de carga y progreso
    const [isProcessing, setIsProcessing] = useState(false);
    const [isZipping, setIsZipping] = useState(false);
    const [zipProgress, setZipProgress] = useState(0);
    const [searchFilter, setSearchFilter] = useState('');

    // Modal de vista previa / detalle
    const [previewPrestador, setPreviewPrestador] = useState(null);

    // Edición de matrícula en línea
    const [editingMatricula, setEditingMatricula] = useState(null);
    const [matriculaInput, setMatriculaInput] = useState('');

    const fileInputRef = useRef(null);

    // Cargar historial al montar
    useEffect(() => {
        setHistorial(getHistorialLiquidaciones());
    }, []);

    const refreshHistorial = () => {
        setHistorial(getHistorialLiquidaciones());
    };

    // Manejador de carga de archivo Excel (siempre toma la primera hoja)
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
                    porcentajeRetencion,
                    adicionalesConfig
                });
                parsed.usuario = currentUser?.nombre || currentUser?.usuario || 'Administración';
                setGuardiaData(parsed);
                saveLiquidacionEnHistorial(parsed);
                refreshHistorial();
                addToast?.('Planilla de Guardia Pediátrica procesada (Retención 30% / Honorarios 70%).', 'success');
            } else if (activeTab === 'instrumentadores') {
                const parsed = parseInstrumentadoresExcel(buffer, {
                    periodo,
                    liquidacion: numeroLiquidacion
                });
                parsed.usuario = currentUser?.nombre || currentUser?.usuario || 'Administración';
                setInstrumentadoresData(parsed);
                saveLiquidacionEnHistorial(parsed);
                refreshHistorial();
                addToast?.('Planilla de Instrumentadores procesada y guardada.', 'success');
            }
        } catch (err) {
            console.error('Error procesando archivo Excel:', err);
            addToast?.('Error al procesar el archivo Excel. Verifique el formato.', 'error');
        } finally {
            setIsProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Recalcular parámetros
    const handleRecalcular = () => {
        if (activeTab === 'guardia' && guardiaData) {
            const pctHon = 100 - porcentajeRetencion;
            const factorHon = pctHon / 100;

            const prestadoresActualizados = guardiaData.prestadores.map(p => {
                const conteoPorOS = {};
                let countAdic = 0;
                let totalMontoAdic = 0;

                p.atenciones.forEach(a => {
                    const match = adicionalesConfig.find(item => a.obraSocial.toLowerCase().includes(item.obraSocial.toLowerCase()));
                    if (match) {
                        if (!conteoPorOS[match.obraSocial]) {
                            conteoPorOS[match.obraSocial] = {
                                obraSocial: match.obraSocial,
                                valorUnitario: match.valor,
                                cantidad: 0,
                                subtotal: 0
                            };
                        }
                        conteoPorOS[match.obraSocial].cantidad++;
                        conteoPorOS[match.obraSocial].subtotal += match.valor;
                        countAdic++;
                        totalMontoAdic += match.valor;
                    }
                });

                const subtotalBruto = p.totalImporteBruto || p.totalImporte;
                const montoRetencion = subtotalBruto * (porcentajeRetencion / 100);
                const totalHonorariosNeto = subtotalBruto - montoRetencion;

                return {
                    ...p,
                    periodo,
                    liquidacion: numeroLiquidacion,
                    porcentajeRetencion,
                    porcentajeHonorarios: pctHon,
                    montoRetencion,
                    totalHonorariosNeto,
                    conteoPorOS,
                    adicionalesDiscriminados: Object.values(conteoPorOS),
                    totalCantidadAdicional: countAdic,
                    totalMontoAdicional: totalMontoAdic,
                    totalGeneralConAdicional: totalHonorariosNeto + totalMontoAdic
                };
            });

            const totalFacturadoBrutoGlobal = prestadoresActualizados.reduce((acc, p) => acc + (p.totalImporteBruto || p.totalImporte), 0);
            const totalRetencionGlobal = totalFacturadoBrutoGlobal * (porcentajeRetencion / 100);
            const totalHonorariosNetoGlobal = totalFacturadoBrutoGlobal - totalRetencionGlobal;
            const totalCantidadAdicionalesGlobal = prestadoresActualizados.reduce((acc, p) => acc + p.totalCantidadAdicional, 0);
            const totalAdicionalesGlobal = prestadoresActualizados.reduce((acc, p) => acc + p.totalMontoAdicional, 0);

            const updatedData = {
                ...guardiaData,
                periodo,
                liquidacion: numeroLiquidacion,
                porcentajeRetencion,
                porcentajeHonorarios: pctHon,
                adicionalesConfig,
                totalFacturadoBrutoGlobal,
                totalFacturadoGlobal: totalFacturadoBrutoGlobal,
                totalRetencionGlobal,
                totalHonorariosNetoGlobal,
                totalCantidadAdicionalesGlobal,
                totalAdicionalesGlobal,
                granTotalGlobal: totalHonorariosNetoGlobal + totalAdicionalesGlobal,
                prestadores: prestadoresActualizados
            };

            setGuardiaData(updatedData);
            saveLiquidacionEnHistorial(updatedData);
            refreshHistorial();
            addToast?.('Cálculos actualizados con ' + pctHon + '% neto y adicionales discriminados.', 'info');
        } else if (activeTab === 'instrumentadores' && instrumentadoresData) {
            const updated = instrumentadoresData.instrumentadores.map(inst => ({
                ...inst,
                periodo,
                liquidacion: numeroLiquidacion
            }));
            const updatedData = {
                ...instrumentadoresData,
                periodo,
                liquidacion: numeroLiquidacion,
                instrumentadores: updated
            };
            setInstrumentadoresData(updatedData);
            saveLiquidacionEnHistorial(updatedData);
            refreshHistorial();
            addToast?.('Parámetros de instrumentadores actualizados.', 'info');
        }
    };

    const handleAddOS = () => {
        if (!nuevaOSNombre.trim()) return;
        const exists = adicionalesConfig.some(item => item.obraSocial.toLowerCase() === nuevaOSNombre.trim().toLowerCase());
        if (!exists) {
            setAdicionalesConfig(prev => [
                ...prev,
                { id: 'os_' + Date.now(), obraSocial: nuevaOSNombre.trim(), valor: Number(nuevoOSValor) || 8000 }
            ]);
            setNuevaOSNombre('');
            setNuevoOSValor(8000);
        }
    };

    const handleRemoveOS = (id) => {
        setAdicionalesConfig(prev => prev.filter(item => item.id !== id));
    };

    const handleSaveMatricula = (prestadorId) => {
        if (activeTab === 'guardia' && guardiaData) {
            const updated = guardiaData.prestadores.map(p => {
                if (p.id === prestadorId) return { ...p, matricula: matriculaInput.trim() };
                return p;
            });
            const updatedData = { ...guardiaData, prestadores: updated };
            setGuardiaData(updatedData);
            saveLiquidacionEnHistorial(updatedData);
            refreshHistorial();
        } else if (activeTab === 'instrumentadores' && instrumentadoresData) {
            const updated = instrumentadoresData.instrumentadores.map(inst => {
                if (inst.id === prestadorId) return { ...inst, matricula: matriculaInput.trim() };
                return inst;
            });
            const updatedData = { ...instrumentadoresData, instrumentadores: updated };
            setInstrumentadoresData(updatedData);
            saveLiquidacionEnHistorial(updatedData);
            refreshHistorial();
        }
        setEditingMatricula(null);
        setMatriculaInput('');
    };

    // Descarga PDF Individual
    const handleDownloadIndividualPdf = async (prestador) => {
        try {
            if (activeTab === 'guardia') {
                const doc = await generateGuardiaIndividualPdf(prestador, {
                    adicionalesConfig
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
            addToast?.('Error al generar PDF individual.', 'error');
        }
    };

    // Descarga PDF General Consolidado
    const handleDownloadGeneralPdf = async (dataOverride = null) => {
        try {
            const targetGuardia = dataOverride || guardiaData;
            const targetInst = dataOverride || instrumentadoresData;

            if (activeTab === 'guardia' || targetGuardia?.tipo === 'guardia_pediatrica') {
                if (!targetGuardia) return;
                const doc = await generateGuardiaGeneralPdf(targetGuardia);
                doc.save(`Liquidacion_General_Guardia_Pediatrica_${(targetGuardia.periodo || periodo).replace(/\s+/g, '_')}.pdf`);
            } else {
                if (!targetInst) return;
                const doc = await generateInstrumentadoresGeneralPdf(targetInst);
                doc.save(`Liquidacion_General_Instrumentadores_${(targetInst.periodo || periodo).replace(/\s+/g, '_')}.pdf`);
            }
        } catch (err) {
            console.error('Error generando PDF general:', err);
            addToast?.('Error al generar PDF general.', 'error');
        }
    };

    // Descarga Masiva Prestador por Prestador en archivo .ZIP
    const handleDownloadZip = async (dataOverride = null) => {
        const zip = new JSZip();
        setIsZipping(true);
        setZipProgress(0);

        try {
            const isGuardia = dataOverride ? (dataOverride.tipo === 'guardia_pediatrica' || dataOverride.tipo === 'guardia') : (activeTab === 'guardia');
            const targetData = dataOverride || (activeTab === 'guardia' ? guardiaData : instrumentadoresData);

            if (!targetData) return;

            if (isGuardia) {
                const total = targetData.prestadores.length;
                for (let i = 0; i < total; i++) {
                    const p = targetData.prestadores[i];
                    const doc = await generateGuardiaIndividualPdf(p, {
                        adicionalesConfig: targetData.adicionalesConfig || adicionalesConfig
                    });
                    const arrayBuffer = doc.output('arraybuffer');
                    const cleanName = p.nombre.replace(/[^a-zA-Z0-9]/g, '_');
                    zip.file(`${String(i + 1).padStart(2, '0')}_${cleanName}.pdf`, arrayBuffer);
                    setZipProgress(Math.round(((i + 1) / total) * 100));
                }

                // Incluir Resumen General dentro del ZIP
                const docGen = await generateGuardiaGeneralPdf(targetData);
                zip.file(`00_RESUMEN_GENERAL_GUARDIA_${(targetData.periodo || periodo).replace(/\s+/g, '_')}.pdf`, docGen.output('arraybuffer'));

                const content = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Liquidaciones_Guardia_Prestador_por_Prestador_${(targetData.periodo || periodo).replace(/\s+/g, '_')}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                addToast?.('Paquete .ZIP de Guardia descargado con éxito.', 'success');
            } else {
                const total = targetData.instrumentadores.length;
                for (let i = 0; i < total; i++) {
                    const inst = targetData.instrumentadores[i];
                    const doc = await generateInstrumentadorIndividualPdf(inst);
                    const arrayBuffer = doc.output('arraybuffer');
                    const cleanName = inst.nombre.replace(/[^a-zA-Z0-9]/g, '_');
                    zip.file(`${String(i + 1).padStart(2, '0')}_${cleanName}.pdf`, arrayBuffer);
                    setZipProgress(Math.round(((i + 1) / total) * 100));
                }

                // Incluir Resumen General dentro del ZIP
                const docGen = await generateInstrumentadoresGeneralPdf(targetData);
                zip.file(`00_RESUMEN_GENERAL_INSTRUMENTADORES_${(targetData.periodo || periodo).replace(/\s+/g, '_')}.pdf`, docGen.output('arraybuffer'));

                const content = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Liquidaciones_Instrumentadores_Prestador_por_Prestador_${(targetData.periodo || periodo).replace(/\s+/g, '_')}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                addToast?.('Paquete .ZIP de Instrumentadores descargado con éxito.', 'success');
            }
        } catch (err) {
            console.error('Error generando archivo ZIP:', err);
            addToast?.('Error al compilar el archivo ZIP.', 'error');
        } finally {
            setIsZipping(false);
            setZipProgress(0);
        }
    };

    // Restaurar desde Historial
    const handleCargarDesdeHistorial = (item) => {
        if (item.tipo === 'guardia_pediatrica' || item.tipo === 'guardia') {
            setGuardiaData(item.dataSnapshot);
            setPeriodo(item.periodo);
            setNumeroLiquidacion(item.numeroLiquidacion);
            if (item.porcentajeRetencion !== undefined) setPorcentajeRetencion(item.porcentajeRetencion);
            if (item.adicionalesConfig) setAdicionalesConfig(item.adicionalesConfig);
            setActiveTab('guardia');
            addToast?.(`Liquidación de Guardia (${item.periodo}) cargada en el panel activo.`, 'info');
        } else {
            setInstrumentadoresData(item.dataSnapshot);
            setPeriodo(item.periodo);
            setNumeroLiquidacion(item.numeroLiquidacion);
            setActiveTab('instrumentadores');
            addToast?.(`Liquidación de Instrumentadores (${item.periodo}) cargada en el panel activo.`, 'info');
        }
    };

    const handleDeleteHistorial = (id) => {
        if (window.confirm('¿Desea eliminar esta liquidación del historial?')) {
            deleteLiquidacionDelHistorial(id);
            refreshHistorial();
            addToast?.('Registro eliminado del historial.', 'info');
        }
    };

    // Lista filtrada de la pestaña activa
    const currentList = useMemo(() => {
        if (activeTab === 'guardia') {
            if (!guardiaData) return [];
            if (!searchFilter.trim()) return guardiaData.prestadores;
            const q = searchFilter.toLowerCase();
            return guardiaData.prestadores.filter(p =>
                p.nombre.toLowerCase().includes(q) ||
                (p.matricula && p.matricula.toLowerCase().includes(q))
            );
        } else if (activeTab === 'instrumentadores') {
            if (!instrumentadoresData) return [];
            if (!searchFilter.trim()) return instrumentadoresData.instrumentadores;
            const q = searchFilter.toLowerCase();
            return instrumentadoresData.instrumentadores.filter(inst =>
                inst.nombre.toLowerCase().includes(q) ||
                (inst.matricula && inst.matricula.toLowerCase().includes(q))
            );
        }
        return [];
    }, [activeTab, guardiaData, instrumentadoresData, searchFilter]);

    // Historial filtrado
    const filteredHistorial = useMemo(() => {
        if (!historialFilter.trim()) return historial;
        const q = historialFilter.toLowerCase();
        return historial.filter(h =>
            (h.periodo && h.periodo.toLowerCase().includes(q)) ||
            (h.tipo && h.tipo.toLowerCase().includes(q)) ||
            (h.usuario && h.usuario.toLowerCase().includes(q)) ||
            (h.numeroLiquidacion && h.numeroLiquidacion.toLowerCase().includes(q))
        );
    }, [historial, historialFilter]);

    const activeData = activeTab === 'guardia' ? guardiaData : instrumentadoresData;

    return (
        <div style={{
            padding: '8px 0',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
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
                        background: 'linear-gradient(135deg, #0D3B66 0%, #1E5799 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        boxShadow: '0 4px 12px rgba(13,59,102,0.25)'
                    }}>
                        <FileSpreadsheet size={24} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                            Centro de Liquidaciones Médicas (Excel ➔ PDF)
                        </h2>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                            Sanatorio Argentino SRL · Retención 30% / Honorarios 70% + Adicionales Discriminados en Modo .ZIP
                        </p>
                    </div>
                </div>

                {/* Selector de Pestañas */}
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
                            color: activeTab === 'guardia' ? '#0D3B66' : '#64748B',
                            fontWeight: activeTab === 'guardia' ? 700 : 600,
                            fontSize: '0.84rem',
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
                            color: activeTab === 'instrumentadores' ? '#0D3B66' : '#64748B',
                            fontWeight: activeTab === 'instrumentadores' ? 700 : 600,
                            fontSize: '0.84rem',
                            cursor: 'pointer',
                            boxShadow: activeTab === 'instrumentadores' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Activity size={16} /> Instrumentadores
                    </button>
                    <button
                        onClick={() => { setActiveTab('historial'); refreshHistorial(); }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            borderRadius: '9px',
                            border: 'none',
                            background: activeTab === 'historial' ? '#FFFFFF' : 'transparent',
                            color: activeTab === 'historial' ? '#0D3B66' : '#64748B',
                            fontWeight: activeTab === 'historial' ? 700 : 600,
                            fontSize: '0.84rem',
                            cursor: 'pointer',
                            boxShadow: activeTab === 'historial' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <History size={16} /> Historial ({historial.length})
                    </button>
                </div>
            </div>

            {/* VISTA 1 & 2: Guardia Pediátrica o Instrumentadores */}
            {activeTab !== 'historial' && (
                <>
                    {/* Zona de Carga y Parámetros */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 440px',
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
                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#0D3B66'; }}
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
                                color: '#0D3B66',
                                marginBottom: '12px'
                            }}>
                                {isProcessing ? (
                                    <Loader2 size={26} style={{ animation: 'spin 1s linear infinite' }} />
                                ) : (
                                    <Upload size={26} />
                                )}
                            </div>

                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0D3B66' }}>
                                {isProcessing ? 'Procesando primera hoja de Excel...' : `Subir planilla de ${activeTab === 'guardia' ? 'Guardia Pediátrica' : 'Instrumentadores'}`}
                            </h4>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                                Se procesa automáticamente la <strong>primera hoja</strong> del archivo .xlsx
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
                            gap: '10px'
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
                                        color: '#0D3B66',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <RefreshCw size={12} /> Recalcular
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
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
                                {activeTab === 'guardia' ? (
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '3px' }}>
                                            Retención / Neto
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type="number"
                                                value={porcentajeRetencion}
                                                onChange={(e) => setPorcentajeRetencion(Number(e.target.value))}
                                                title="Porcentaje retenido por el Sanatorio (ej: 30%)"
                                                style={{
                                                    width: '100%',
                                                    padding: '6px 20px 6px 8px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #CBD5E1',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 700,
                                                    color: '#DC2626',
                                                    fontFamily: "'Montserrat', sans-serif",
                                                    boxSizing: 'border-box'
                                                }}
                                            />
                                            <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', fontWeight: 800, color: '#64748B' }}>-%</span>
                                        </div>
                                    </div>
                                ) : <div />}
                            </div>

                            {activeTab === 'guardia' && (
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
                                        Obras Sociales con Cobro Adicional (Discriminado):
                                    </label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                        {adicionalesConfig.map(item => (
                                            <span key={item.id} style={{
                                                background: '#EFF6FF',
                                                border: '1px solid #BFDBFE',
                                                borderRadius: '8px',
                                                padding: '3px 8px',
                                                fontSize: '0.7rem',
                                                fontWeight: 700,
                                                color: '#0D3B66',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}>
                                                <span>{item.obraSocial}</span>
                                                <strong style={{ color: '#059669' }}>{formatCurrency(item.valor)}</strong>
                                                <X size={12} style={{ cursor: 'pointer', color: '#DC2626' }} onClick={() => handleRemoveOS(item.id)} />
                                            </span>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <input
                                            type="text"
                                            placeholder="Obra Social (ej: 005 - OSDE)"
                                            value={nuevaOSNombre}
                                            onChange={(e) => setNuevaOSNombre(e.target.value)}
                                            style={{
                                                flex: 2,
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.72rem',
                                                fontFamily: "'Montserrat', sans-serif"
                                            }}
                                        />
                                        <input
                                            type="number"
                                            placeholder="Monto ($)"
                                            value={nuevoOSValor}
                                            onChange={(e) => setNuevoOSValor(e.target.value)}
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
                                                padding: '4px 10px',
                                                background: '#0D3B66',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '2px'
                                            }}
                                        >
                                            <Plus size={12} /> Agregar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tarjetas de Métricas Resumen */}
                    {activeData && (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: '14px',
                            marginBottom: '20px'
                        }}>
                            <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                    {activeTab === 'guardia' ? 'Médicos Detectados' : 'Instrumentadores'}
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                                    {activeTab === 'guardia' ? activeData.totalPrestadores : activeData.totalInstrumentadores}
                                </div>
                            </div>

                            <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                    {activeTab === 'guardia' ? 'Total Consultas' : 'Total Procedimientos'}
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0D3B66', marginTop: '4px' }}>
                                    {activeTab === 'guardia' ? activeData.totalAtenciones : activeData.totalProcedimientosGlobal}
                                </div>
                            </div>

                            {activeTab === 'guardia' ? (
                                <>
                                    <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                            Facturación Bruta (100%)
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#475569', marginTop: '4px' }}>
                                            {formatCurrency(activeData.totalFacturadoBrutoGlobal || activeData.totalFacturadoGlobal)}
                                        </div>
                                    </div>

                                    <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                            Honorarios Netos ({100 - porcentajeRetencion}%)
                                        </div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
                                            {formatCurrency(activeData.totalHonorariosNetoGlobal)}
                                        </div>
                                    </div>

                                    <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                            Adicionales ({activeData.totalCantidadAdicionalesGlobal})
                                        </div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#7C3AED', marginTop: '4px' }}>
                                            {formatCurrency(activeData.totalAdicionalesGlobal)}
                                        </div>
                                    </div>

                                    <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0D3B66', textTransform: 'uppercase' }}>
                                            Gran Total a Liquidar
                                        </div>
                                        <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0D3B66', marginTop: '4px' }}>
                                            {formatCurrency(activeData.granTotalGlobal)}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                        Gran Total Liquidación
                                    </div>
                                    <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0D3B66', marginTop: '4px' }}>
                                        {formatCurrency(activeData.totalFacturadoGlobal)}
                                    </div>
                                </div>
                            )}
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

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => handleDownloadGeneralPdf()}
                                    style={{
                                        padding: '9px 18px',
                                        background: '#EFF6FF',
                                        color: '#0D3B66',
                                        border: '1.5px solid #BFDBFE',
                                        borderRadius: '10px',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        boxShadow: '0 1px 4px rgba(13,59,102,0.08)'
                                    }}
                                >
                                    <FileText size={16} /> Descargar PDF General Consolidado
                                </button>

                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                    <button
                                        onClick={() => handleDownloadZip()}
                                        disabled={isZipping}
                                        style={{
                                            padding: '9px 20px',
                                            background: 'linear-gradient(135deg, #0D3B66 0%, #1E5799 100%)',
                                            color: '#FFFFFF',
                                            border: 'none',
                                            borderRadius: '10px',
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            cursor: isZipping ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: '0 2px 8px rgba(13,59,102,0.25)'
                                        }}
                                    >
                                        {isZipping ? (
                                            <>
                                                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                                Empaquetando en ZIP ({zipProgress}%)...
                                            </>
                                        ) : (
                                            <>
                                                <Archive size={16} /> Descargar Prestador por Prestador (.zip)
                                            </>
                                        )}
                                    </button>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '3px' }}>
                                        📦 Comprime todos los PDFs individuales en un archivo <strong>.ZIP</strong>
                                    </span>
                                </div>
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
                                        {activeTab === 'guardia' ? (
                                            <>
                                                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#334155', width: '140px' }}>
                                                    Fact. Bruta (100%)
                                                </th>
                                                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#059669', width: '140px' }}>
                                                    Honorarios ({100 - porcentajeRetencion}%)
                                                </th>
                                                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#7C3AED', width: '130px' }}>
                                                    Adicional ($)
                                                </th>
                                            </>
                                        ) : (
                                            <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#334155', width: '150px' }}>
                                                Total Procedimientos
                                            </th>
                                        )}
                                        <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#0D3B66', width: '150px' }}>
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
                                                                style={{ width: '70px', padding: '3px 6px', fontSize: '0.78rem', borderRadius: '6px', border: '1px solid #0D3B66', textAlign: 'center' }}
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
                                                <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#0D3B66' }}>
                                                    {activeTab === 'guardia' ? p.atenciones.length : p.procedimientos.length}
                                                </td>
                                                {activeTab === 'guardia' ? (
                                                    <>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#64748B' }}>
                                                            {formatCurrency(p.totalImporteBruto || p.totalImporte)}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                                                            {formatCurrency(p.totalHonorariosNeto)}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#7C3AED' }}>
                                                            {p.totalMontoAdicional > 0 ? (
                                                                <span title={p.adicionalesDiscriminados?.map(item => `${item.obraSocial}: ${item.cantidad} x ${formatCurrency(item.valorUnitario)}`).join(' | ')}>
                                                                    {formatCurrency(p.totalMontoAdicional)}
                                                                </span>
                                                            ) : '—'}
                                                        </td>
                                                    </>
                                                ) : (
                                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                                                        {formatCurrency(p.totalValor)}
                                                    </td>
                                                )}
                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#0D3B66' }}>
                                                    {formatCurrency(totalFila)}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                        <button
                                                            onClick={() => setPreviewPrestador(p)}
                                                            title="Ver Detalle de Prestaciones y Desglose Discriminado"
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
                                                                background: '#0D3B66',
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
                </>
            )}

            {/* VISTA 3: HISTORIAL DE LIQUIDACIONES */}
            {activeTab === 'historial' && (
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '24px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.04)'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '20px',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                                Bitácora e Historial de Liquidaciones Generadas
                            </h3>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                                Registro histórico para re-descargar informes consolidados o paquetes individuales en modo .ZIP
                            </p>
                        </div>

                        <div style={{ position: 'relative', width: '300px' }}>
                            <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder="Buscar en historial..."
                                value={historialFilter}
                                onChange={(e) => setHistorialFilter(e.target.value)}
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
                    </div>

                    {filteredHistorial.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '48px 20px',
                            color: '#94A3B8',
                            background: '#F8FAFC',
                            borderRadius: '12px',
                            border: '1px dashed #CBD5E1'
                        }}>
                            <FileArchive size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>
                                No hay registros en el historial todavía.
                            </p>
                            <p style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>
                                Al cargar una planilla Excel y procesar liquidaciones, se registrarán automáticamente aquí.
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {filteredHistorial.map((item) => {
                                const isGuardia = item.tipo === 'guardia_pediatrica' || item.tipo === 'guardia';
                                const fechaStr = new Date(item.fechaGeneracion).toLocaleString('es-AR', {
                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit'
                                });

                                return (
                                    <div
                                        key={item.id}
                                        style={{
                                            background: '#F8FAFC',
                                            border: '1px solid #E2E8F0',
                                            borderRadius: '14px',
                                            padding: '18px 22px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            flexWrap: 'wrap',
                                            gap: '16px',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                            <div style={{
                                                width: '42px',
                                                height: '42px',
                                                borderRadius: '12px',
                                                background: isGuardia ? '#EFF6FF' : '#F5F3FF',
                                                color: isGuardia ? '#0D3B66' : '#7C3AED',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                {isGuardia ? <Stethoscope size={20} /> : <Activity size={20} />}
                                            </div>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{
                                                        fontSize: '0.72rem',
                                                        fontWeight: 800,
                                                        textTransform: 'uppercase',
                                                        padding: '2px 8px',
                                                        borderRadius: '6px',
                                                        background: isGuardia ? '#DBEAFE' : '#EDE9FE',
                                                        color: isGuardia ? '#1E40AF' : '#6D28D9'
                                                    }}>
                                                        {isGuardia ? 'Guardia Pediátrica' : 'Instrumentadores'}
                                                    </span>
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                                                        {item.periodo} · Liq. N° {item.numeroLiquidacion}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <span>📅 {fechaStr}</span>
                                                    <span>👤 {item.usuario}</span>
                                                    <span>👥 {item.totalPrestadores} profesionales</span>
                                                    <span>📋 {item.totalAtenciones} prestaciones</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>GRAN TOTAL</div>
                                                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>
                                                    {formatCurrency(item.granTotal)}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <button
                                                    onClick={() => handleCargarDesdeHistorial(item)}
                                                    title="Cargar y abrir esta liquidación en el panel interactivo"
                                                    style={{
                                                        padding: '7px 12px',
                                                        background: '#FFFFFF',
                                                        border: '1px solid #CBD5E1',
                                                        borderRadius: '8px',
                                                        color: '#334155',
                                                        fontSize: '0.78rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <Eye size={13} /> Cargar en Panel
                                                </button>

                                                <button
                                                    onClick={() => handleDownloadGeneralPdf(item.dataSnapshot)}
                                                    title="Re-descargar PDF General Consolidado"
                                                    style={{
                                                        padding: '7px 12px',
                                                        background: '#EFF6FF',
                                                        border: '1px solid #BFDBFE',
                                                        borderRadius: '8px',
                                                        color: '#0D3B66',
                                                        fontSize: '0.78rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <FileText size={13} /> PDF General
                                                </button>

                                                <button
                                                    onClick={() => handleDownloadZip(item.dataSnapshot)}
                                                    title="Re-descargar todos los PDFs individuales en modo .ZIP"
                                                    style={{
                                                        padding: '7px 14px',
                                                        background: 'linear-gradient(135deg, #0D3B66 0%, #1E5799 100%)',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                        color: '#FFFFFF',
                                                        fontSize: '0.78rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        boxShadow: '0 2px 6px rgba(13,59,102,0.2)'
                                                    }}
                                                >
                                                    <Archive size={13} /> Prestador por Prestador (.zip)
                                                </button>

                                                <button
                                                    onClick={() => handleDeleteHistorial(item.id)}
                                                    title="Eliminar registro histórico"
                                                    style={{
                                                        padding: '7px',
                                                        background: '#FEE2E2',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                        color: '#DC2626',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Modal de Vista Previa y Detalle de Atenciones con Desglose Discriminado */}
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
                        maxWidth: '920px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                    }}>
                        {/* Cabecera Modal */}
                        <div style={{
                            padding: '20px 24px',
                            background: '#0D3B66',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#FFFFFF' }}>
                                    {previewPrestador.nombre}
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#B4C8DC' }}>
                                    Matrícula: <strong>{previewPrestador.matricula || '—'}</strong> · Período: {previewPrestador.periodo} · Liquidación: {previewPrestador.liquidacion}
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    onClick={() => handleDownloadIndividualPdf(previewPrestador)}
                                    style={{
                                        padding: '8px 16px',
                                        background: '#3B82F6',
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
                                    <Download size={14} /> Descargar PDF Individual
                                </button>
                                <button
                                    onClick={() => setPreviewPrestador(null)}
                                    style={{
                                        padding: '8px',
                                        background: 'rgba(255,255,255,0.15)',
                                        border: 'none',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        color: '#FFFFFF'
                                    }}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Cuerpo Modal (Lista de Consultas o Procedimientos) */}
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                            {activeTab === 'guardia' ? (
                                <>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginBottom: '16px' }}>
                                        <thead>
                                            <tr style={{ background: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>#</th>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>Fecha</th>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>Paciente</th>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>Obra Social</th>
                                                <th style={{ padding: '8px', textAlign: 'right' }}>Importe Bruto</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewPrestador.atenciones.map((a, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                    <td style={{ padding: '8px', color: '#94A3B8' }}>{i + 1}</td>
                                                    <td style={{ padding: '8px', color: '#64748B' }}>{a.fecha}</td>
                                                    <td style={{ padding: '8px', fontWeight: 600 }}>{a.paciente}</td>
                                                    <td style={{ padding: '8px', color: '#334155' }}>{a.obraSocial}</td>
                                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(a.importe)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {/* Bloque de Desglose Discriminado de Adicionales */}
                                    {previewPrestador.adicionalesDiscriminados?.length > 0 && (
                                        <div style={{
                                            background: '#F5F3FF',
                                            border: '1px solid #DDD6FE',
                                            borderRadius: '12px',
                                            padding: '14px 18px',
                                            marginTop: '10px'
                                        }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#6D28D9', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Tag size={14} /> Desglose Discriminado de Adicionales por Obra Social
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                                                {previewPrestador.adicionalesDiscriminados.map(item => (
                                                    <div key={item.obraSocial} style={{
                                                        background: '#FFFFFF',
                                                        border: '1px solid #E9D5FF',
                                                        borderRadius: '8px',
                                                        padding: '8px 12px',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center'
                                                    }}>
                                                        <div>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1E1B4B' }}>{item.obraSocial}</div>
                                                            <div style={{ fontSize: '0.68rem', color: '#6B7280' }}>{item.cantidad} atenciones × {formatCurrency(item.valorUnitario)}</div>
                                                        </div>
                                                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#7C3AED' }}>
                                                            {formatCurrency(item.subtotal)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
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
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}>
                            <div>
                                {activeTab === 'guardia' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.78rem' }}>
                                        <span style={{ color: '#64748B' }}>
                                            Fact. Bruta: <strong>{formatCurrency(previewPrestador.totalImporteBruto || previewPrestador.totalImporte)}</strong> · Retención ({porcentajeRetencion}%): <span style={{ color: '#DC2626' }}>-{formatCurrency(previewPrestador.montoRetencion)}</span> · Honorarios ({100 - porcentajeRetencion}%): <strong style={{ color: '#059669' }}>{formatCurrency(previewPrestador.totalHonorariosNeto)}</strong>
                                        </span>
                                        {previewPrestador.totalCantidadAdicional > 0 && (
                                            <span style={{ color: '#7C3AED', fontWeight: 700 }}>
                                                Adicionales ({previewPrestador.totalCantidadAdicional} atenciones): {formatCurrency(previewPrestador.totalMontoAdicional)}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0D3B66' }}>
                                Gran Total a Liquidar: {formatCurrency(activeTab === 'guardia' ? previewPrestador.totalGeneralConAdicional : previewPrestador.totalValor)}
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
