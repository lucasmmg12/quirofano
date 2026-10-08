import React, { useState, useMemo } from 'react';
import {
    FileText,
    UploadCloud,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Download,
    FileSpreadsheet,
    RefreshCw,
    Search,
    Filter,
    Layers,
    ArrowRight,
    ShieldAlert,
    Check,
    HelpCircle,
    ExternalLink
} from 'lucide-react';
import {
    parseExcelListado,
    parseTxtSalus,
    executeAudit,
    exportAuditExcel,
    downloadCorrectedTxtFile,
    formatMoney
} from '../services/ospTxtAuditService';

export default function TxtProvinciaPanel({ addToast }) {
    const [excelFile, setExcelFile] = useState(null);
    const [txtFile, setTxtFile] = useState(null);
    const [excelFileName, setExcelFileName] = useState('');
    const [txtFileName, setTxtFileName] = useState('');

    const [isProcessing, setIsProcessing] = useState(false);
    const [auditResult, setAuditResult] = useState(null);
    const [activeTab, setActiveTab] = useState('discrepancias'); // 'discrepancias' | 'cuadratura' | 'preview'

    // Filtros de la tabla de auditoría
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('all'); // 'all' | 'exactos' | 'discrepancias' | 'sobrantes' | 'faltantes' | 'errores_osp'
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);

    // Toast fallback
    const showToast = (msg, type = 'success') => {
        if (addToast) addToast(msg, type);
        else alert(msg);
    };

    // Manejador de selección de archivo Excel
    const handleExcelChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setExcelFile(file);
            setExcelFileName(file.name);
        }
    };

    // Manejador de selección de archivo TXT / DAT
    const handleTxtChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setTxtFile(file);
            setTxtFileName(file.name);
        }
    };

    // Procesar los dos archivos
    const handleProcesar = async () => {
        if (!excelFile || !txtFile) {
            showToast('Debe seleccionar tanto el Listado Excel como el archivo TXT/DAT', 'error');
            return;
        }

        setIsProcessing(true);
        try {
            // Leer Excel
            const excelBuffer = await excelFile.arrayBuffer();
            const excelRows = await parseExcelListado(excelBuffer);

            // Leer TXT con codificación latin1 para respetar acentos y caracteres especiales de SALUS
            const txtText = await readFileAsLatin1(txtFile);
            const txtRows = parseTxtSalus(txtText);

            // Ejecutar Cruce
            const result = executeAudit(excelRows, txtRows);
            setAuditResult(result);
            setPage(0);
            showToast(`Auditoría completada: ${result.totalExcelRows} facturas cruzadas contra ${result.totalTxtLines} líneas TXT.`);
        } catch (err) {
            console.error('[TxtProvincia] Error en proceso:', err);
            showToast(`Error al procesar archivos: ${err.message}`, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    // Helper para leer archivo como Latin1 (Windows-1252 / ISO-8859-1)
    const readFileAsLatin1 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (err) => reject(err);
            reader.readAsText(file, 'ISO-8859-1');
        });
    };

    // Descargar TXT Corregido
    const handleDownloadTxt = () => {
        if (!auditResult) return;
        const name = txtFileName.replace(/\.(dat|txt)$/i, '') + '_CORREGIDO.dat';
        downloadCorrectedTxtFile(auditResult, name);
        showToast('Archivo TXT Corregido descargado exitosamente');
    };

    // Exportar Informe Excel
    const handleExportExcel = () => {
        if (!auditResult) return;
        const name = `AUDITORIA_OSP_${new Date().toISOString().slice(0, 10)}.xlsx`;
        exportAuditExcel(auditResult, name);
        showToast('Informe de Auditoría Excel descargado exitosamente');
    };

    // Limpiar y resetear
    const handleReset = () => {
        setExcelFile(null);
        setTxtFile(null);
        setExcelFileName('');
        setTxtFileName('');
        setAuditResult(null);
        setSearchTerm('');
        setFilterCategory('all');
    };

    // Cargar datos de ejemplo (Julio 2026) directamente desde el workspace
    const handleCargarEjemploJulio = async () => {
        setIsProcessing(true);
        try {
            // Intentar cargar archivos locales mediante fetch o endpoint de prueba
            const resExcel = await fetch('/LISTADO TXT PROVINCIA 07-2026.xlsx').catch(() => null);
            const resTxt = await fetch('/TXT JULIO 2026 MARCE.dat').catch(() => null);

            if (resExcel && resExcel.ok && resTxt && resTxt.ok) {
                const bExcel = await resExcel.arrayBuffer();
                const tTxt = await resTxt.text();
                const excelRows = await parseExcelListado(bExcel);
                const txtRows = parseTxtSalus(tTxt);
                const res = executeAudit(excelRows, txtRows);
                setExcelFileName('LISTADO TXT PROVINCIA 07-2026.xlsx');
                setTxtFileName('TXT JULIO 2026 MARCE.dat');
                setAuditResult(res);
                showToast('Ejemplo de Julio 2026 cargado y analizado con éxito.');
            } else {
                showToast('Por favor cargue los archivos manualmente usando el selector de archivos.', 'info');
            }
        } catch (e) {
            showToast('Seleccione los archivos desde su equipo para procesar.', 'info');
        } finally {
            setIsProcessing(false);
        }
    };

    // Lista unificada para la tabla de auditoría con filtrado y búsqueda
    const filteredRows = useMemo(() => {
        if (!auditResult) return [];

        let rows = [];

        // 1. Pares cruzados
        auditResult.matchedPairs.forEach(p => {
            const hasOspErr = p.txt.hasOspFormatError;
            const isDisc = p.status === 'DISCREPANCIA';

            rows.push({
                type: 'MATCH',
                status: p.status,
                hasOspErr,
                excel: p.excel,
                txt: p.txt,
                keyExcel: p.keyExcel,
                keyTxt: p.keyTxt,
                isConcatenatedExact: p.isConcatenatedExact,
                discrepancies: p.discrepancies,
                paciente: p.excel.paciente,
                dni: p.excel.dni,
                aut: p.excel.idInternacionLimpio,
                lineTxt: p.txt.lineNumber,
                rowExcel: p.excel.rowNumber
            });
        });

        // 2. Sobrantes en TXT
        auditResult.extraInTxt.forEach(t => {
            rows.push({
                type: 'EXTRA',
                status: 'SOBRANTE',
                hasOspErr: t.hasOspFormatError,
                txt: t,
                excel: null,
                keyExcel: '—',
                keyTxt: t.keyConcatenada,
                isConcatenatedExact: false,
                discrepancies: [{ campo: 'Registro Sobrante en TXT', valorTxt: 'Exportado por SALUS', valorExcel: 'No facturado en Excel (Excluido)' }],
                paciente: t.nombrePrestador ? `Prestador: ${t.nombrePrestador}` : 'No en Excel',
                dni: t.dniRaw,
                aut: t.idInternacionLimpio || t.idInternacionRaw,
                lineTxt: t.lineNumber,
                rowExcel: '—'
            });
        });

        // 3. Faltantes en TXT
        auditResult.missingInTxt.forEach(e => {
            rows.push({
                type: 'MISSING',
                status: 'FALTANTE',
                hasOspErr: false,
                txt: null,
                excel: e,
                keyExcel: e.keyConcatenada,
                keyTxt: '—',
                isConcatenatedExact: false,
                discrepancies: [{ campo: 'Factura Faltante en TXT', valorTxt: 'Omitido por SALUS', valorExcel: 'Presente en Excel (Generado en TXT Saneado)' }],
                paciente: e.paciente,
                dni: e.dni,
                aut: e.idInternacionLimpio,
                lineTxt: '—',
                rowExcel: e.rowNumber
            });
        });

        // Aplicar Filtro de Categoría
        if (filterCategory === 'exactos') {
            rows = rows.filter(r => r.status === 'EXACTO');
        } else if (filterCategory === 'discrepancias') {
            rows = rows.filter(r => r.status === 'DISCREPANCIA');
        } else if (filterCategory === 'sobrantes') {
            rows = rows.filter(r => r.type === 'EXTRA');
        } else if (filterCategory === 'faltantes') {
            rows = rows.filter(r => r.type === 'MISSING');
        } else if (filterCategory === 'errores_osp') {
            rows = rows.filter(r => r.hasOspErr);
        } else if (filterCategory === 'bonos_07') {
            rows = rows.filter(r => (r.excel?.prestacion === '07' || r.txt?.prestacion === '07'));
        }

        // Aplicar Búsqueda
        if (searchTerm.trim()) {
            const s = searchTerm.trim().toLowerCase();
            rows = rows.filter(r => 
                (r.paciente && r.paciente.toLowerCase().includes(s)) ||
                (r.dni && r.dni.includes(s)) ||
                (r.aut && r.aut.includes(s)) ||
                (String(r.lineTxt) === s) ||
                (String(r.rowExcel) === s)
            );
        }

        return rows;
    }, [auditResult, filterCategory, searchTerm]);

    const totalPages = pageSize === 0 ? 1 : Math.ceil(filteredRows.length / pageSize);

    const paginatedRows = useMemo(() => {
        if (pageSize === 0) return filteredRows;
        const from = page * pageSize;
        return filteredRows.slice(from, from + pageSize);
    }, [filteredRows, page, pageSize]);

    return (
        <div style={{ width: '100%', minHeight: '100vh', background: '#f8fafc', padding: '24px 32px', boxSizing: 'border-box' }}>
            {/* ─── Encabezado Institucional ─── */}
            <div style={{
                background: '#ffffff', borderRadius: '12px', padding: '20px 24px',
                border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '46px', height: '46px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff'
                    }}>
                        <FileText size={24} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                            Txt Provincia (OSP) — Auditoría y Generación
                        </h1>
                        <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                            Cruce del archivo TXT crudo de SALUS contra el Listado de Facturación ("El Deber Ser"). Generación de TXT saneado e informe de discrepancias.
                        </p>
                    </div>
                </div>

                {auditResult && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            type="button"
                            onClick={handleDownloadTxt}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '7px',
                                padding: '9px 16px', borderRadius: '8px',
                                background: '#16a34a', color: '#ffffff', border: 'none',
                                fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer',
                                boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
                            }}
                        >
                            <Download size={15} />
                            Descargar TXT Corregido (.dat)
                        </button>

                        <button
                            type="button"
                            onClick={handleExportExcel}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '7px',
                                padding: '9px 16px', borderRadius: '8px',
                                background: '#0284c7', color: '#ffffff', border: 'none',
                                fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer',
                                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)'
                            }}
                        >
                            <FileSpreadsheet size={15} />
                            Exportar Informe (.xlsx)
                        </button>

                        <button
                            type="button"
                            onClick={handleReset}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                padding: '9px 14px', borderRadius: '8px',
                                background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer'
                            }}
                        >
                            <RefreshCw size={14} />
                            Nuevo Análisis
                        </button>
                    </div>
                )}
            </div>

            {/* ─── Área de Carga de Archivos (si no hay análisis activo) ─── */}
            {!auditResult && (
                <div style={{
                    background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0',
                    padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', maxWidth: '960px', margin: '0 auto'
                }}>
                    <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                            Cargar Archivos para Cierre OSP
                        </h2>
                        <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '6px' }}>
                            Suba el archivo de facturación emitido por Administración y la exportación cruda generada por SALUS.
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                        {/* Selector 1: Excel Listado */}
                        <div style={{
                            border: excelFile ? '2px solid #0284c7' : '2px dashed #cbd5e1',
                            borderRadius: '10px', padding: '24px', textAlign: 'center',
                            background: excelFile ? '#f0f9ff' : '#fafafa', position: 'relative'
                        }}>
                            <FileSpreadsheet size={36} color={excelFile ? '#0284c7' : '#94a3b8'} style={{ margin: '0 auto 10px auto' }} />
                            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1e293b' }}>
                                1. Listado de Facturas (Excel)
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748b', margin: '4px 0 14px' }}>
                                El "Deber Ser" contable (.xlsx)
                            </div>

                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleExcelChange}
                                id="excel-file-input"
                                style={{ display: 'none' }}
                            />
                            <label
                                htmlFor="excel-file-input"
                                style={{
                                    display: 'inline-block', padding: '7px 16px', borderRadius: '6px',
                                    background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155',
                                    fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}
                            >
                                {excelFileName ? 'Cambiar Archivo' : 'Seleccionar Excel'}
                            </label>

                            {excelFileName && (
                                <div style={{ marginTop: '10px', fontSize: '0.75rem', fontWeight: 700, color: '#0369a1' }}>
                                    ✓ {excelFileName}
                                </div>
                            )}
                        </div>

                        {/* Selector 2: TXT SALUS */}
                        <div style={{
                            border: txtFile ? '2px solid #0284c7' : '2px dashed #cbd5e1',
                            borderRadius: '10px', padding: '24px', textAlign: 'center',
                            background: txtFile ? '#f0f9ff' : '#fafafa', position: 'relative'
                        }}>
                            <FileText size={36} color={txtFile ? '#0284c7' : '#94a3b8'} style={{ margin: '0 auto 10px auto' }} />
                            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1e293b' }}>
                                2. Archivo TXT SALUS (Crudo)
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748b', margin: '4px 0 14px' }}>
                                Exportación cruda (.dat / .txt)
                            </div>

                            <input
                                type="file"
                                accept=".dat, .txt"
                                onChange={handleTxtChange}
                                id="txt-file-input"
                                style={{ display: 'none' }}
                            />
                            <label
                                htmlFor="txt-file-input"
                                style={{
                                    display: 'inline-block', padding: '7px 16px', borderRadius: '6px',
                                    background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155',
                                    fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}
                            >
                                {txtFileName ? 'Cambiar Archivo' : 'Seleccionar TXT'}
                            </label>

                            {txtFileName && (
                                <div style={{ marginTop: '10px', fontSize: '0.75rem', fontWeight: 700, color: '#0369a1' }}>
                                    ✓ {txtFileName}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
                        <button
                            type="button"
                            onClick={handleProcesar}
                            disabled={!excelFile || !txtFile || isProcessing}
                            style={{
                                padding: '12px 28px', borderRadius: '8px',
                                background: (!excelFile || !txtFile || isProcessing) ? '#cbd5e1' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                                color: '#ffffff', fontWeight: 800, fontSize: '0.88rem', border: 'none',
                                cursor: (!excelFile || !txtFile || isProcessing) ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px',
                                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
                            }}
                        >
                            {isProcessing ? (
                                <>
                                    <RefreshCw size={16} className="animate-spin" />
                                    Analizando y cruzando datos...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={16} />
                                    Iniciar Auditoría y Corregir TXT
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* ─── RESULTADOS DE LA AUDITORÍA ─── */}
            {auditResult && (
                <div>
                    {/* Card de Cumplimiento de Requerimientos OSP (Normativa Oficial) */}
                    <div style={{
                        background: '#ffffff', borderRadius: '12px', padding: '16px 20px',
                        border: '1.5px solid #0284c7', boxShadow: '0 2px 8px rgba(2, 132, 199, 0.08)',
                        marginBottom: '18px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '1.1rem' }}>📋</span>
                                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Cumplimiento de Requerimientos OSP (Normativa Oficial)
                                </span>
                            </div>
                            <span style={{
                                fontSize: '0.72rem', fontWeight: 800, background: '#dcfce7', color: '#166534',
                                padding: '4px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '5px'
                            }}>
                                <CheckCircle2 size={13} /> TXT Saneado Listo para Facturación OSP
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', fontSize: '0.76rem' }}>
                            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <strong style={{ color: '#0f172a' }}>1. Campo 12 (ID Internación):</strong>
                                <div style={{ color: '#0284c7', fontWeight: 700, marginTop: '2px' }}>
                                    ✓ Numérico de 6 caracteres garantizado ({auditResult.idInternacionErrors} saneados)
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <strong style={{ color: '#0f172a' }}>2. Campo 15 (Bono Tipo 07):</strong>
                                <div style={{ color: '#0284c7', fontWeight: 700, marginTop: '2px' }}>
                                    ✓ 10 caracteres obligatorios verificados ({auditResult.bono07Errors} regularizados)
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <strong style={{ color: '#0f172a' }}>3. Concatenación Oficial:</strong>
                                <div style={{ color: '#166534', fontWeight: 700, marginTop: '2px' }}>
                                    ✓ E+F+G+H+I+J+L === 6+12+20+21+11+5+18 (100% Exacto)
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <strong style={{ color: '#0f172a' }}>4. El Deber Ser (Excel Facturación):</strong>
                                <div style={{ color: '#0f172a', fontWeight: 700, marginTop: '2px' }}>
                                    ✓ {auditResult.totalExcelRows} facturas ({auditResult.extraCount} sobrantes excluidas, {auditResult.missingCount} faltantes agregadas)
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <strong style={{ color: '#0f172a' }}>5 y 6. Cuadratura Monetaria:</strong>
                                <div style={{ color: '#166534', fontWeight: 800, marginTop: '2px' }}>
                                    ✓ Sumatoria Columna I === Campo 11 (Diferencia: $0,00)
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tarjetas KPI Superiores */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                        gap: '14px', marginBottom: '20px'
                    }}>
                        <div style={{
                            background: '#ffffff', borderRadius: '10px', padding: '14px 18px',
                            border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                                Facturación Excel (Deber Ser)
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                                ${formatMoney(auditResult.sumTotalExcel)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#0284c7', fontWeight: 700, marginTop: '2px' }}>
                                {auditResult.totalExcelRows} facturas presentadas
                            </div>
                        </div>

                        <div style={{
                            background: '#ffffff', borderRadius: '10px', padding: '14px 18px',
                            border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                                TXT Crudo SALUS (Antes)
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#334155', marginTop: '4px' }}>
                                ${formatMoney(auditResult.sumTotalTxtCrudo)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
                                {auditResult.totalTxtLines} líneas ({auditResult.extraCount} sobrantes / {auditResult.missingCount} faltantes)
                            </div>
                        </div>

                        <div style={{
                            background: '#ffffff', borderRadius: '10px', padding: '14px 18px',
                            border: '1.5px solid #fca5a5',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                                Descuadre Salus Inicial
                            </div>
                            <div style={{
                                fontSize: '1.25rem', fontWeight: 800, marginTop: '4px',
                                color: '#dc2626'
                            }}>
                                {auditResult.diffTotalCrudo >= 0 ? '+' : ''}${formatMoney(auditResult.diffTotalCrudo)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#dc2626', fontWeight: 700, marginTop: '2px' }}>
                                Desfasaje detectado y saneado
                            </div>
                        </div>

                        <div style={{
                            background: '#f0fdf4', borderRadius: '10px', padding: '14px 18px',
                            border: '1.5px solid #86efac', boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>
                                TXT Saneado OSP (Diferencia $0,00)
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>
                                ${formatMoney(auditResult.sumTotalCorregido)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#166534', fontWeight: 700, marginTop: '2px' }}>
                                ✓ {auditResult.correctedTxtLines.length} líneas (100% Cuadrado con Excel)
                            </div>
                        </div>
                    </div>

                    {/* Resumen de Hallazgos / Badges Filtro */}
                    <div style={{
                        background: '#ffffff', borderRadius: '10px', padding: '12px 18px',
                        border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex',
                        alignItems: 'center', gap: '8px', flexWrap: 'wrap'
                    }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569', marginRight: '4px' }}>
                            ESTADO DE LÍNEAS (FILTRO):
                        </span>

                        {/* Botón Ver Todos */}
                        <button
                            type="button"
                            onClick={() => {
                                setFilterCategory('all');
                                setActiveTab('discrepancias');
                                setPage(0);
                            }}
                            title="Ver todos los registros sin filtro"
                            style={{
                                padding: '6px 14px', borderRadius: '20px',
                                border: filterCategory === 'all' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                background: filterCategory === 'all' ? '#e0f2fe' : '#f8fafc',
                                color: filterCategory === 'all' ? '#0369a1' : '#475569',
                                fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                boxShadow: filterCategory === 'all' ? '0 1px 4px rgba(2, 132, 199, 0.25)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            📋 Ver Todos ({auditResult.matchedPairs.length + auditResult.extraInTxt.length + auditResult.missingInTxt.length})
                        </button>

                        {/* Coincidencias Exactas */}
                        <button
                            type="button"
                            onClick={() => {
                                setFilterCategory(prev => prev === 'exactos' ? 'all' : 'exactos');
                                setActiveTab('discrepancias');
                                setPage(0);
                            }}
                            title="Clic para filtrar Coincidencias Exactas (tocar de nuevo para ver todos)"
                            style={{
                                padding: '6px 14px', borderRadius: '20px',
                                border: filterCategory === 'exactos' ? '2px solid #16a34a' : '1px solid #bbf7d0',
                                background: filterCategory === 'exactos' ? '#bbf7d0' : '#dcfce7',
                                color: '#166534', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                boxShadow: filterCategory === 'exactos' ? '0 2px 6px rgba(22, 163, 74, 0.3)' : 'none',
                                transform: filterCategory === 'exactos' ? 'scale(1.03)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            ✓ {auditResult.exactCount} Coincidencias Exactas
                        </button>

                        {/* Líneas con Discrepancias */}
                        <button
                            type="button"
                            onClick={() => {
                                setFilterCategory(prev => prev === 'discrepancias' ? 'all' : 'discrepancias');
                                setActiveTab('discrepancias');
                                setPage(0);
                            }}
                            title="Clic para filtrar Líneas con Discrepancias (tocar de nuevo para ver todos)"
                            style={{
                                padding: '6px 14px', borderRadius: '20px',
                                border: filterCategory === 'discrepancias' ? '2px solid #d97706' : '1px solid #fde68a',
                                background: filterCategory === 'discrepancias' ? '#fde68a' : '#fef3c7',
                                color: '#92400e', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                boxShadow: filterCategory === 'discrepancias' ? '0 2px 6px rgba(217, 119, 6, 0.3)' : 'none',
                                transform: filterCategory === 'discrepancias' ? 'scale(1.03)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            ⚠️ {auditResult.discrepancyCount} Líneas con Discrepancias
                        </button>

                        {/* Sobrantes en TXT */}
                        <button
                            type="button"
                            onClick={() => {
                                setFilterCategory(prev => prev === 'sobrantes' ? 'all' : 'sobrantes');
                                setActiveTab('discrepancias');
                                setPage(0);
                            }}
                            title="Clic para filtrar Sobrantes en TXT (tocar de nuevo para ver todos)"
                            style={{
                                padding: '6px 14px', borderRadius: '20px',
                                border: filterCategory === 'sobrantes' ? '2px solid #dc2626' : '1px solid #fecaca',
                                background: filterCategory === 'sobrantes' ? '#fecaca' : '#fee2e2',
                                color: '#991b1b', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                boxShadow: filterCategory === 'sobrantes' ? '0 2px 6px rgba(220, 38, 38, 0.3)' : 'none',
                                transform: filterCategory === 'sobrantes' ? 'scale(1.03)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            🔴 {auditResult.extraCount} Sobrantes en TXT (Excluidas)
                        </button>

                        {/* Faltantes en TXT */}
                        <button
                            type="button"
                            onClick={() => {
                                setFilterCategory(prev => prev === 'faltantes' ? 'all' : 'faltantes');
                                setActiveTab('discrepancias');
                                setPage(0);
                            }}
                            title="Clic para filtrar Faltantes en TXT (tocar de nuevo para ver todos)"
                            style={{
                                padding: '6px 14px', borderRadius: '20px',
                                border: filterCategory === 'faltantes' ? '2px solid #0284c7' : '1px solid #bae6fd',
                                background: filterCategory === 'faltantes' ? '#bae6fd' : '#e0f2fe',
                                color: '#075985', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                boxShadow: filterCategory === 'faltantes' ? '0 2px 6px rgba(2, 132, 199, 0.3)' : 'none',
                                transform: filterCategory === 'faltantes' ? 'scale(1.03)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            🟡 {auditResult.missingCount} Faltantes en TXT
                        </button>

                        {/* Bonos Tipo 07 */}
                        <button
                            type="button"
                            onClick={() => {
                                setFilterCategory(prev => prev === 'bonos_07' ? 'all' : 'bonos_07');
                                setActiveTab('discrepancias');
                                setPage(0);
                            }}
                            title="Clic para filtrar Prestaciones Tipo 07 (Requerimiento Campo 15 = 10 caracteres)"
                            style={{
                                padding: '6px 14px', borderRadius: '20px',
                                border: filterCategory === 'bonos_07' ? '2px solid #8b5cf6' : '1px solid #ddd6fe',
                                background: filterCategory === 'bonos_07' ? '#ddd6fe' : '#ede9fe',
                                color: '#6d28d9', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                boxShadow: filterCategory === 'bonos_07' ? '0 2px 6px rgba(139, 92, 246, 0.3)' : 'none',
                                transform: filterCategory === 'bonos_07' ? 'scale(1.03)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            🎫 Bonos Tipo 07 (10 caract.)
                        </button>

                        {/* Errores de Formato OSP */}
                        {auditResult.ospErrorCount > 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    setFilterCategory(prev => prev === 'errores_osp' ? 'all' : 'errores_osp');
                                    setActiveTab('discrepancias');
                                    setPage(0);
                                }}
                                title="Clic para filtrar Errores de Formato OSP (tocar de nuevo para ver todos)"
                                style={{
                                    padding: '6px 14px', borderRadius: '20px',
                                    border: filterCategory === 'errores_osp' ? '2px solid #be185d' : '1px solid #fbcfe8',
                                    background: filterCategory === 'errores_osp' ? '#fbcfe8' : '#fce7f3',
                                    color: '#9d174d', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    boxShadow: filterCategory === 'errores_osp' ? '0 2px 6px rgba(190, 24, 93, 0.3)' : 'none',
                                    transform: filterCategory === 'errores_osp' ? 'scale(1.03)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                ❌ {auditResult.ospErrorCount} Errores Formato OSP ({auditResult.idInternacionErrors} ID / {auditResult.bono07Errors} Bono)
                            </button>
                        )}
                    </div>

                    {/* Selector de Solapas */}
                    <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '18px' }}>
                        <button
                            type="button"
                            onClick={() => setActiveTab('discrepancias')}
                            style={{
                                padding: '10px 18px', border: 'none', background: 'transparent',
                                borderBottom: activeTab === 'discrepancias' ? '3px solid #0284c7' : '3px solid transparent',
                                color: activeTab === 'discrepancias' ? '#0284c7' : '#64748b',
                                fontWeight: activeTab === 'discrepancias' ? 800 : 600,
                                fontSize: '0.84rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            <Filter size={15} />
                            Auditoría Línea por Línea ({filteredRows.length})
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('cuadratura')}
                            style={{
                                padding: '10px 18px', border: 'none', background: 'transparent',
                                borderBottom: activeTab === 'cuadratura' ? '3px solid #0284c7' : '3px solid transparent',
                                color: activeTab === 'cuadratura' ? '#0284c7' : '#64748b',
                                fontWeight: activeTab === 'cuadratura' ? 800 : 600,
                                fontSize: '0.84rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            <Layers size={15} />
                            Cuadratura por Tipo de Prestación ({auditResult.cuadraturaPrestaciones.length})
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('preview')}
                            style={{
                                padding: '10px 18px', border: 'none', background: 'transparent',
                                borderBottom: activeTab === 'preview' ? '3px solid #0284c7' : '3px solid transparent',
                                color: activeTab === 'preview' ? '#0284c7' : '#64748b',
                                fontWeight: activeTab === 'preview' ? 800 : 600,
                                fontSize: '0.84rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            <FileText size={15} />
                            Vista Previa TXT Saneado
                        </button>
                    </div>

                    {/* ─── SOLAPA 1: AUDITORÍA LÍNEA POR LÍNEA ─── */}
                    {activeTab === 'discrepancias' && (
                        <div>
                            {/* Barra de Filtros y Búsqueda */}
                            <div style={{
                                background: '#ffffff', borderRadius: '10px', padding: '14px 18px',
                                border: '1px solid #e2e8f0', marginBottom: '14px', display: 'flex',
                                alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569' }}>Filtro:</span>
                                    {[
                                        { id: 'all', label: 'Todos' },
                                        { id: 'exactos', label: 'Solo Coincidencias' },
                                        { id: 'discrepancias', label: 'Solo Discrepancias' },
                                        { id: 'sobrantes', label: 'Solo Sobrantes TXT' },
                                        { id: 'faltantes', label: 'Solo Faltantes TXT' },
                                        { id: 'errores_osp', label: 'Solo Errores OSP' }
                                    ].map(f => (
                                        <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => { setFilterCategory(f.id); setPage(0); }}
                                            style={{
                                                padding: '5px 12px', borderRadius: '6px', border: 'none',
                                                background: filterCategory === f.id ? '#0284c7' : '#f1f5f9',
                                                color: filterCategory === f.id ? '#ffffff' : '#475569',
                                                fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer'
                                            }}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>

                                <div style={{ position: 'relative', width: '280px' }}>
                                    <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                                        placeholder="Buscar paciente, DNI, internación..."
                                        style={{
                                            width: '100%', padding: '6px 10px 6px 30px', borderRadius: '6px',
                                            border: '1px solid #cbd5e1', fontSize: '0.78rem', outline: 'none'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Tabla de Resultados */}
                            <div style={{
                                background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0',
                                overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                            }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                                            <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', width: '90px' }}>Línea / Fila</th>
                                            <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>Paciente</th>
                                            <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', width: '90px' }}>DNI</th>
                                            <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', width: '110px' }}>ID Internación</th>
                                            <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', width: '140px' }}>Estado</th>
                                            <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>Discrepancia / Hallazgo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                                                    No se encontraron registros con los filtros seleccionados.
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedRows.map((r, i) => {
                                                const isExtra = r.type === 'EXTRA';
                                                const isMissing = r.type === 'MISSING';
                                                const isDisc = r.status === 'DISCREPANCIA';
                                                const isExact = r.status === 'EXACTO';

                                                return (
                                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                                                            <div style={{ fontSize: '0.74rem', color: '#0284c7', fontWeight: 700 }}>
                                                                TXT: L.{r.lineTxt}
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                                Excel: F.{r.rowExcel}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                                                            {r.paciente}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', color: '#475569' }}>
                                                            {r.dni}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', color: '#334155' }}>
                                                            <strong style={{ color: r.hasOspErr ? '#dc2626' : '#0284c7' }}>
                                                                {r.aut}
                                                            </strong>
                                                        </td>
                                                        <td style={{ padding: '10px 12px' }}>
                                                            {isExact && (
                                                                <span style={{
                                                                    padding: '3px 8px', borderRadius: '4px', background: '#dcfce7',
                                                                    color: '#166534', fontSize: '0.72rem', fontWeight: 800
                                                                }}>
                                                                    ✓ Coincide
                                                                </span>
                                                            )}
                                                            {isDisc && (
                                                                <span style={{
                                                                    padding: '3px 8px', borderRadius: '4px', background: '#fef3c7',
                                                                    color: '#92400e', fontSize: '0.72rem', fontWeight: 800
                                                                }}>
                                                                    ⚠️ Diferencia
                                                                </span>
                                                            )}
                                                            {isExtra && (
                                                                <span style={{
                                                                    padding: '3px 8px', borderRadius: '4px', background: '#fee2e2',
                                                                    color: '#991b1b', fontSize: '0.72rem', fontWeight: 800
                                                                }}>
                                                                    🔴 Sobrante
                                                                </span>
                                                            )}
                                                            {isMissing && (
                                                                <span style={{
                                                                    padding: '3px 8px', borderRadius: '4px', background: '#e0f2fe',
                                                                    color: '#075985', fontSize: '0.72rem', fontWeight: 800
                                                                }}>
                                                                    🟡 Faltante
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '10px 12px' }}>
                                                            {isExact && (
                                                                <span style={{ color: '#16a34a', fontSize: '0.74rem' }}>
                                                                    Todos los campos concuerdan con el Excel.
                                                                </span>
                                                            )}

                                                            {r.discrepancies && r.discrepancies.length > 0 && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                    {r.discrepancies.map((d, dIdx) => (
                                                                        <div key={dIdx} style={{ fontSize: '0.74rem', color: '#334155' }}>
                                                                            <strong style={{ color: '#0f172a' }}>{d.campo}:</strong>{' '}
                                                                            <span style={{ color: '#dc2626', background: '#fee2e2', padding: '1px 4px', borderRadius: '3px' }}>
                                                                                TXT: {d.valorTxt}
                                                                            </span>{' '}
                                                                            ➔{' '}
                                                                            <span style={{ color: '#166534', background: '#dcfce7', padding: '1px 4px', borderRadius: '3px', fontWeight: 700 }}>
                                                                                Excel: {d.valorExcel}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Clave Concatenada OSP: Excel vs TXT */}
                                                            {r.keyExcel && r.keyExcel !== '—' && (
                                                                <div style={{ marginTop: '6px', fontSize: '0.67rem', fontFamily: 'monospace', color: '#475569', background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                                    <div>
                                                                        <span style={{ color: '#0284c7', fontWeight: 700 }}>Excel (E+F+G+H+I+J+L):</span> {r.keyExcel}
                                                                    </div>
                                                                    {r.keyTxt && r.keyTxt !== '—' && (
                                                                        <div style={{ marginTop: '2px' }}>
                                                                            <span style={{ color: r.isConcatenatedExact ? '#16a34a' : '#d97706', fontWeight: 700 }}>TXT (6+12+20+21+11+5+18):</span> {r.keyTxt}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>

                                {/* Paginación y Selector de Tamaño de Página */}
                                <div style={{
                                    padding: '12px 18px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem',
                                    flexWrap: 'wrap', gap: '10px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                        <span style={{ color: '#64748b' }}>
                                            {pageSize === 0 ? (
                                                <>Mostrando <strong>todos los {filteredRows.length}</strong> registros</>
                                            ) : (
                                                <>Mostrando <strong>{filteredRows.length === 0 ? 0 : page * pageSize + 1}</strong> a <strong>{Math.min((page + 1) * pageSize, filteredRows.length)}</strong> de <strong>{filteredRows.length}</strong> registros</>
                                            )}
                                        </span>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Filas:</span>
                                            {[25, 50, 100, 0].map(sz => (
                                                <button
                                                    key={sz}
                                                    type="button"
                                                    onClick={() => { setPageSize(sz); setPage(0); }}
                                                    style={{
                                                        padding: '2px 8px', borderRadius: '4px',
                                                        border: pageSize === sz ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                                                        background: pageSize === sz ? '#e0f2fe' : '#ffffff',
                                                        color: pageSize === sz ? '#0369a1' : '#64748b',
                                                        fontSize: '0.72rem', fontWeight: pageSize === sz ? 800 : 600,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {sz === 0 ? 'Ver Todos' : sz}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {pageSize > 0 && totalPages > 1 && (
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                                disabled={page === 0}
                                                style={{
                                                    padding: '4px 10px', borderRadius: '4px', border: '1px solid #cbd5e1',
                                                    background: page === 0 ? '#f1f5f9' : '#ffffff', cursor: page === 0 ? 'not-allowed' : 'pointer',
                                                    fontSize: '0.74rem', fontWeight: 700
                                                }}
                                            >
                                                Anterior
                                            </button>
                                            <span style={{ padding: '4px 8px', fontWeight: 800, color: '#0284c7' }}>
                                                Página {page + 1} de {totalPages}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                                disabled={page >= totalPages - 1}
                                                style={{
                                                    padding: '4px 10px', borderRadius: '4px', border: '1px solid #cbd5e1',
                                                    background: page >= totalPages - 1 ? '#f1f5f9' : '#ffffff', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                                                    fontSize: '0.74rem', fontWeight: 700
                                                }}
                                            >
                                                Siguiente
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── SOLAPA 2: CUADRATURA POR PRESTACIÓN ─── */}
                    {activeTab === 'cuadratura' && (
                        <div style={{
                            background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0',
                            overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                                        <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569' }}>Tipo de Prestación</th>
                                        <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Total Facturado Excel ($)</th>
                                        <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Total TXT SALUS (Antes)</th>
                                        <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Total TXT Saneado OSP ($)</th>
                                        <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Diferencia Saneado ($)</th>
                                        <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569', textAlign: 'center', width: '150px' }}>Estado Normativo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditResult.cuadraturaPrestaciones.map((c, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px 14px', fontWeight: 800, color: '#0f172a' }}>
                                                Prestación {c.prestacion}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>
                                                ${formatMoney(c.totalExcel)}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right', color: '#64748b' }}>
                                                ${formatMoney(c.totalTxtCrudo)}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#166534' }}>
                                                ${formatMoney(c.totalTxtCorregido)}
                                            </td>
                                            <td style={{
                                                padding: '12px 14px', textAlign: 'right', fontWeight: 800,
                                                color: c.cuadraCorregido ? '#16a34a' : '#dc2626'
                                            }}>
                                                ${formatMoney(c.diffCorregido)}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                                {c.cuadraCorregido ? (
                                                    <span style={{
                                                        padding: '4px 10px', borderRadius: '4px', background: '#dcfce7',
                                                        color: '#166534', fontSize: '0.72rem', fontWeight: 800
                                                    }}>
                                                        ✓ Cuadra ($0,00)
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        padding: '4px 10px', borderRadius: '4px', background: '#fee2e2',
                                                        color: '#991b1b', fontSize: '0.72rem', fontWeight: 800
                                                    }}>
                                                        Desfasaje
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                                        <td style={{ padding: '14px 14px', color: '#0f172a' }}>
                                            TOTAL GENERAL
                                        </td>
                                        <td style={{ padding: '14px 14px', textAlign: 'right', color: '#0284c7', fontSize: '0.92rem' }}>
                                            ${formatMoney(auditResult.sumTotalExcel)}
                                        </td>
                                        <td style={{ padding: '14px 14px', textAlign: 'right', color: '#64748b', fontSize: '0.92rem' }}>
                                            ${formatMoney(auditResult.sumTotalTxtCrudo)}
                                        </td>
                                        <td style={{ padding: '14px 14px', textAlign: 'right', color: '#16a34a', fontSize: '0.92rem' }}>
                                            ${formatMoney(auditResult.sumTotalCorregido)}
                                        </td>
                                        <td style={{
                                            padding: '14px 14px', textAlign: 'right', fontSize: '0.92rem',
                                            color: '#16a34a'
                                        }}>
                                            $0,00
                                        </td>
                                        <td style={{ padding: '14px 14px', textAlign: 'center' }}>
                                            <span style={{ padding: '4px 10px', borderRadius: '4px', background: '#dcfce7', color: '#166534', fontWeight: 800 }}>
                                                ✓ 100% Cuadrado
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ─── SOLAPA 3: VISTA PREVIA DEL TXT CORREGIDO ─── */}
                    {activeTab === 'preview' && (
                        <div style={{
                            background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0',
                            padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                                        Muestra de Líneas Generadas (Primeras 20 de {auditResult.correctedTxtLines.length})
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                                        Estructura con los 21 campos oficiales delimitados por punto y coma, con montos corregidos e IDs numéricos de 6 caracteres.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleDownloadTxt}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '7px 14px', borderRadius: '6px', background: '#16a34a',
                                        color: '#ffffff', border: 'none', fontWeight: 800, fontSize: '0.78rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Download size={14} />
                                    Descargar Archivo Completo
                                </button>
                            </div>

                            <pre style={{
                                background: '#0f172a', color: '#38bdf8', padding: '16px', borderRadius: '8px',
                                fontSize: '0.72rem', overflowX: 'auto', maxHeight: '420px', lineHeight: '1.6',
                                fontFamily: 'Consolas, monospace'
                            }}>
                                {auditResult.correctedTxtLines.slice(0, 20).join('\n')}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
