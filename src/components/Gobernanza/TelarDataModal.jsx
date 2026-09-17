import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
    X, FileSpreadsheet, FileText, Search, Download, BarChart2, List, 
    Filter, ArrowUp, ArrowDown, ArrowUpDown, Calendar, CheckSquare, 
    Square, RotateCcw, Check, Users, BedDouble 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function formatEsDate(isoStr) {
    if (!isoStr) return '-';
    try {
        const clean = isoStr.split('T')[0];
        const [y, m, d] = clean.split('-');
        if (y && m && d) return `${d}/${m}/${y}`;
        return isoStr;
    } catch {
        return isoStr;
    }
}

export default function TelarDataModal({ 
    indicator, 
    onClose, 
    dateFilter = {}, 
    activeFilters = {}, 
    rawData = [] 
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState(() => (indicator?.chartData && indicator.chartData.length > 0 ? 'chart_summary' : 'detailed'));
    
    // Modo de vista para días camas: 'admisiones' (deduplicado por paciente) vs 'censal' (días pernoctados)
    const [ocupacionViewMode, setOcupacionViewMode] = useState('admisiones');

    // Estado para filtros de columna estilo Excel: { [colKey]: Set<string> }
    const [columnFilters, setColumnFilters] = useState({});
    const [openFilterCol, setOpenFilterCol] = useState(null);
    const [colFilterSearch, setColFilterSearch] = useState('');
    const popoverRef = useRef(null);

    // Estado para ordenamiento de columnas estilo Excel: { key: string, direction: 'asc' | 'desc' }
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    // Cerrar popover de filtro al hacer clic afuera
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target)) {
                setOpenFilterCol(null);
                setColFilterSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Determinar si los datos son de Peticiones Diagnósticas o de Admisiones Clínicas
    const isPeticiones = useMemo(() => {
        if (indicator?.dataType === 'peticiones') return true;
        if (!rawData || rawData.length === 0) return false;
        const sample = rawData[0];
        return !!(sample.estudio || sample.prestacion || sample.modalidad || sample.id_peticion);
    }, [indicator, rawData]);

    const isKpiDiasOcupados = indicator?.id === 'kpi_dias_ocupados';

    // 1. Datos Agregados del Gráfico / Cuadro Resumen
    const aggregatedData = useMemo(() => {
        if (indicator?.chartData && Array.isArray(indicator.chartData) && indicator.chartData.length > 0) {
            return indicator.chartData.map((item, idx) => {
                const label = item.label || item.name || item.mes || item.box || item.especialidad || `Elemento ${idx + 1}`;
                const value = item.value != null ? item.value : (item.count != null ? item.count : (item.total != null ? item.total : 0));
                const pct = item.pct || item.porcentaje || null;
                return {
                    label,
                    value,
                    pct: pct ? `${pct}%` : null,
                    extra: item.extra || item.origen || ''
                };
            });
        }

        // Si es una tarjeta sin chartData previo, armamos el cuadro cuantitativo agrupado por categoría/especialidad
        if (rawData && rawData.length > 0) {
            const counts = {};
            let total = 0;
            rawData.forEach(r => {
                const cat = r.especialidad || r.habitacion || r.modalidad || r.servicio || 'General';
                counts[cat] = (counts[cat] || 0) + 1;
                total++;
            });
            return Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 15)
                .map(([cat, val]) => ({
                    label: cat,
                    value: val,
                    pct: total > 0 ? `${((val / total) * 100).toFixed(1)}%` : null,
                    extra: ''
                }));
        }

        return [];
    }, [indicator, rawData]);

    // 2. Mapeo de Registros Nominales Detallados
    const tableData = useMemo(() => {
        if (!rawData || rawData.length === 0) return [];
        
        if (isPeticiones) {
            return rawData.map(r => {
                let fSolicitud = '-';
                if (r.fecha_solicitud || r.fecha) {
                    fSolicitud = formatEsDate(r.fecha_solicitud || r.fecha);
                }
                const estudioLimpio = (r.estudio || r.prestacion || '-').replace(/<[^>]+>/g, '').trim();

                return {
                    id: r.id_peticion || r.numero_peticion || r.id || '-',
                    fecha: fSolicitud,
                    habitacion: r.habitacion || (r.cama ? `Cama ${r.cama}` : 'UCI / BOX'),
                    paciente: r.paciente || (r.id_paciente ? `ID ${r.id_paciente}` : '-'),
                    nhc: r.nhc || '-',
                    estudio: estudioLimpio,
                    modalidad: r.modalidad || 'Laboratorio',
                    origen: r.origen_gobernanza || r.origen || 'UCI',
                    solicitante: r.solicitante || r.medico || '-'
                };
            });
        }

        // Mapeo de Admisiones / Ocupación
        let sourceData = rawData;
        // Si el usuario eligió vista 'admisiones' o no es el KPI de días camas, deduplicamos por internación
        if (!isKpiDiasOcupados || ocupacionViewMode === 'admisiones') {
            const seen = new Map();
            rawData.forEach(r => {
                const key = r.numero_admision || r.id_admision || r.id;
                if (key && !seen.has(key)) {
                    seen.set(key, r);
                }
            });
            sourceData = Array.from(seen.values());
        }

        return sourceData.map(r => {
            let diasEstancia = '-';
            if (r.fecha_ingreso && r.fecha_alta) {
                const dIng = new Date(r.fecha_ingreso);
                const dAlt = new Date(r.fecha_alta);
                const ingStr = `${dIng.getFullYear()}-${String(dIng.getMonth() + 1).padStart(2, '0')}-${String(dIng.getDate()).padStart(2, '0')}`;
                const altStr = `${dAlt.getFullYear()}-${String(dAlt.getMonth() + 1).padStart(2, '0')}-${String(dAlt.getDate()).padStart(2, '0')}`;
                if (ingStr === altStr) {
                    diasEstancia = 1;
                } else {
                    const diffDays = Math.round((new Date(altStr) - new Date(ingStr)) / (1000 * 60 * 60 * 24));
                    diasEstancia = Math.max(1, diffDays);
                }
            } else if (r.fecha_ingreso) {
                const dIng = new Date(r.fecha_ingreso);
                const now = new Date();
                const ingStr = `${dIng.getFullYear()}-${String(dIng.getMonth() + 1).padStart(2, '0')}-${String(dIng.getDate()).padStart(2, '0')}`;
                const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const diffDays = Math.round((new Date(nowStr) - new Date(ingStr)) / (1000 * 60 * 60 * 24));
                diasEstancia = `${Math.max(1, diffDays)} (activo)`;
            }

            const fIng = formatEsDate(r.fecha_ingreso);
            let fAlt = 'Internado Activo';
            if (r.fecha_alta) {
                fAlt = formatEsDate(r.fecha_alta);
            }

            const fOcup = formatEsDate(r.fecha_ocupacion);

            return {
                id: r.numero_admision || r.id_admision || '-',
                fechaOcupacion: fOcup,
                habitacion: r.habitacion || (r.servicio === 'UCI' ? 'BOX' : '222-229'),
                paciente: r.paciente || '-',
                nhc: r.nhc || '-',
                edad: r.edad ?? '-',
                especialidad: r.especialidad || '-',
                fechaIngreso: fIng,
                fechaAlta: fAlt,
                diasEstancia,
                procedencia: r.procedencia || '-',
                motivoAlta: r.motivo_de_alta || 'Internado Activo',
                cliente: r.cliente || 'Particular'
            };
        });
    }, [rawData, isPeticiones, isKpiDiasOcupados, ocupacionViewMode]);

    // Columnas según tipo de datos y modo
    const tableColumns = useMemo(() => {
        if (isPeticiones) {
            return [
                { key: 'fecha', label: 'Fecha Solicitud' },
                { key: 'habitacion', label: 'Cama / Box' },
                { key: 'paciente', label: 'Paciente' },
                { key: 'nhc', label: 'NHC' },
                { key: 'estudio', label: 'Estudio / Prueba' },
                { key: 'modalidad', label: 'Modalidad' },
                { key: 'origen', label: 'Origen' },
                { key: 'solicitante', label: 'Médico Solicitante' }
            ];
        }

        const cols = [];
        if (isKpiDiasOcupados && ocupacionViewMode === 'censal') {
            cols.push({ key: 'fechaOcupacion', label: 'Día Censo' });
        }
        cols.push(
            { key: 'id', label: 'N° Admisión' },
            { key: 'habitacion', label: 'Habitación / Box' },
            { key: 'paciente', label: 'Paciente' },
            { key: 'nhc', label: 'NHC' },
            { key: 'edad', label: 'Edad' },
            { key: 'especialidad', label: 'Especialidad' },
            { key: 'fechaIngreso', label: 'Ingreso' },
            { key: 'fechaAlta', label: 'Alta' },
            { key: 'diasEstancia', label: 'Estancia Acumulada' },
            { key: 'motivoAlta', label: 'Motivo Egreso' },
            { key: 'cliente', label: 'Financiador' }
        );
        return cols;
    }, [isPeticiones, isKpiDiasOcupados, ocupacionViewMode]);

    // Extraer valores únicos por columna para los filtros de Excel
    const columnUniqueValues = useMemo(() => {
        const map = {};
        tableColumns.forEach(col => {
            const counts = {};
            tableData.forEach(row => {
                const val = row[col.key] != null ? String(row[col.key]).trim() : '(Vacío)';
                counts[val] = (counts[val] || 0) + 1;
            });
            map[col.key] = Object.entries(counts)
                .map(([val, count]) => ({ val, count }))
                .sort((a, b) => a.val.localeCompare(b.val, undefined, { numeric: true, sensitivity: 'base' }));
        });
        return map;
    }, [tableData, tableColumns]);

    // Filtrar y ordenar la tabla completa según:
    // 1. Buscador global
    // 2. Filtros de cada columna estilo Excel
    // 3. Ordenamiento de columna
    const filteredTableData = useMemo(() => {
        let list = tableData;

        // 1. Buscador global
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase().trim();
            list = list.filter(row => 
                Object.values(row).some(val => String(val).toLowerCase().includes(q))
            );
        }

        // 2. Filtros de cada columna estilo Excel
        const activeCols = Object.keys(columnFilters);
        if (activeCols.length > 0) {
            list = list.filter(row => {
                return activeCols.every(colKey => {
                    const selectedVals = columnFilters[colKey];
                    if (!selectedVals || selectedVals.size === 0) return true;
                    const rowVal = row[colKey] != null ? String(row[colKey]).trim() : '(Vacío)';
                    return selectedVals.has(rowVal);
                });
            });
        }

        // 3. Ordenamiento estilo Excel
        if (sortConfig.key) {
            const { key, direction } = sortConfig;
            list = [...list].sort((a, b) => {
                let vA = a[key];
                let vB = b[key];
                if (vA == null) vA = '';
                if (vB == null) vB = '';
                // Numérico si ambos son números válidos
                const nA = Number(vA);
                const nB = Number(vB);
                if (!isNaN(nA) && !isNaN(nB) && String(vA).trim() !== '' && String(vB).trim() !== '') {
                    return direction === 'asc' ? nA - nB : nB - nA;
                }
                const sA = String(vA).toLowerCase();
                const sB = String(vB).toLowerCase();
                return direction === 'asc' ? sA.localeCompare(sB) : sB.localeCompare(sA);
            });
        }

        return list;
    }, [tableData, searchTerm, columnFilters, sortConfig]);

    // Manejadores de Filtro de Columna Excel
    const handleToggleColumnValue = (colKey, val) => {
        setColumnFilters(prev => {
            const currentSet = prev[colKey] ? new Set(prev[colKey]) : new Set(columnUniqueValues[colKey]?.map(x => x.val) || []);
            if (currentSet.has(val)) {
                currentSet.delete(val);
            } else {
                currentSet.add(val);
            }
            // Si tiene todos los valores posibles, podemos remover el filtro de esa columna
            const allVals = columnUniqueValues[colKey] || [];
            if (currentSet.size === allVals.length) {
                const next = { ...prev };
                delete next[colKey];
                return next;
            }
            return { ...prev, [colKey]: currentSet };
        });
    };

    const handleSelectAllColumnValues = (colKey) => {
        setColumnFilters(prev => {
            const next = { ...prev };
            delete next[colKey];
            return next;
        });
    };

    const handleDeselectAllColumnValues = (colKey) => {
        setColumnFilters(prev => ({
            ...prev,
            [colKey]: new Set()
        }));
    };

    const handleClearColumnFilter = (colKey) => {
        setColumnFilters(prev => {
            const next = { ...prev };
            delete next[colKey];
            return next;
        });
    };

    const handleClearAllColumnFilters = () => {
        setColumnFilters({});
        setSortConfig({ key: null, direction: 'asc' });
        setSearchTerm('');
    };

    const handleSortColumn = (colKey, direction) => {
        setSortConfig({ key: colKey, direction });
    };

    const activeFilterCount = Object.keys(columnFilters).length;

    // Exportar a Excel (.xlsx) con Tabulación Real y Filtros Respetados
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();
        const safeLabel = (indicator?.label || 'Auditoria').replace(/[^a-zA-Z0-9_-]/g, '_');

        // 1. Hoja de Resumen Agregado (si aplica)
        if (aggregatedData.length > 0) {
            const aggExport = aggregatedData.map(item => ({
                'Categoría / Eje': item.label,
                'Cantidad / Valor': item.value,
                'Porcentaje': item.pct || '—'
            }));
            const wsAgg = XLSX.utils.json_to_sheet(aggExport);
            wsAgg['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }];
            XLSX.utils.book_append_sheet(wb, wsAgg, "Resumen_Grafico");
        }

        // 2. Hoja de Registros Nominales Detallados
        const exportNominal = filteredTableData.map(row => {
            const obj = {};
            tableColumns.forEach(c => {
                obj[c.label] = row[c.key];
            });
            return obj;
        });

        const wsDetail = XLSX.utils.json_to_sheet(exportNominal);
        wsDetail['!cols'] = tableColumns.map(() => ({ wch: 22 }));
        XLSX.utils.book_append_sheet(wb, wsDetail, isPeticiones ? "Peticiones_Estudios" : "Admisiones_Detalle");

        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Sanatorio_Argentino_${safeLabel}_${dateStr}.xlsx`);
    };

    // Exportar a PDF
    const handleExportPDF = () => {
        const doc = new jsPDF('landscape');
        const primaryColor = [13, 59, 102]; // #0D3B66

        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 297, 18, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('SANATORIO ARGENTINO — GOBERNANZA CLÍNICA Y AUDITORÍA', 14, 12);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Fecha Emisión: ${new Date().toLocaleDateString('es-AR')}`, 280, 12, { align: 'right' });

        doc.setTextColor(30, 41, 59);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text(indicator?.label || 'Detalle del Indicador', 14, 26);
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        
        const periodStr = dateFilter?.fechaDesde && dateFilter?.fechaHasta 
            ? `Período: ${formatEsDate(dateFilter.fechaDesde)} al ${formatEsDate(dateFilter.fechaHasta)}`
            : '';
        doc.text(`Sector: ${indicator?.sector || 'Cuidados Críticos (UCI)'} | ${periodStr} | Total registros: ${filteredTableData.length}`, 14, 31);

        const head = [tableColumns.map(c => c.label)];
        const body = filteredTableData.slice(0, 200).map(row => tableColumns.map(c => row[c.key]));

        autoTable(doc, {
            head: head,
            body: body,
            startY: 35,
            theme: 'grid',
            headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
            styles: { fontSize: 7, cellPadding: 2 },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });

        const safeLabel = (indicator?.label || 'Auditoria').replace(/[^a-zA-Z0-9_-]/g, '_');
        doc.save(`Sanatorio_Argentino_${safeLabel}.pdf`);
    };

    // Renderizar Popover flotante estilo Excel para una columna
    const renderExcelFilterPopover = (colKey, colLabel, colIdx = 0) => {
        if (openFilterCol !== colKey) return null;

        const allValues = columnUniqueValues[colKey] || [];
        const currentSet = columnFilters[colKey];
        const isAllSelected = !currentSet;

        const filteredList = allValues.filter(item => 
            item.val.toLowerCase().includes(colFilterSearch.toLowerCase())
        );

        // Alineación inteligente: Si es de las primeras columnas, alinear a la izquierda para no salirse de la pantalla.
        // Si es de las últimas 2 columnas, alinear a la derecha.
        const isNearRight = colIdx >= tableColumns.length - 2;
        const alignmentStyle = isNearRight ? { right: 0, left: 'auto' } : { left: 0, right: 'auto' };

        return (
            <div
                ref={popoverRef}
                style={{
                    position: 'absolute',
                    top: '100%',
                    ...alignmentStyle,
                    marginTop: '4px',
                    zIndex: 9999,
                    width: '270px',
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: '10px',
                    boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.22), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    fontSize: '0.78rem',
                    color: '#334155'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header del Popover Excel */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>
                    <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.8rem' }}>
                        Filtro: {colLabel}
                    </span>
                    <button
                        onClick={() => setOpenFilterCol(null)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8', padding: '2px' }}
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Acciones de Ordenamiento */}
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                        onClick={() => handleSortColumn(colKey, 'asc')}
                        style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            padding: '4px 6px', borderRadius: '5px',
                            border: sortConfig.key === colKey && sortConfig.direction === 'asc' ? '1px solid #2563EB' : '1px solid #E2E8F0',
                            background: sortConfig.key === colKey && sortConfig.direction === 'asc' ? '#EFF6FF' : '#F8FAFC',
                            color: sortConfig.key === colKey && sortConfig.direction === 'asc' ? '#1E40AF' : '#475569',
                            fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer'
                        }}
                    >
                        <ArrowUp size={12} /> Ordenar A-Z
                    </button>
                    <button
                        onClick={() => handleSortColumn(colKey, 'desc')}
                        style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            padding: '4px 6px', borderRadius: '5px',
                            border: sortConfig.key === colKey && sortConfig.direction === 'desc' ? '1px solid #2563EB' : '1px solid #E2E8F0',
                            background: sortConfig.key === colKey && sortConfig.direction === 'desc' ? '#EFF6FF' : '#F8FAFC',
                            color: sortConfig.key === colKey && sortConfig.direction === 'desc' ? '#1E40AF' : '#475569',
                            fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer'
                        }}
                    >
                        <ArrowDown size={12} /> Ordenar Z-A
                    </button>
                </div>

                {/* Buscador de valores dentro de la columna */}
                <div style={{ position: 'relative' }}>
                    <Search size={13} color="#94A3B8" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        type="text"
                        placeholder="Buscar en valores..."
                        value={colFilterSearch}
                        onChange={(e) => setColFilterSearch(e.target.value)}
                        style={{
                            width: '100%', padding: '4px 8px 4px 26px', borderRadius: '5px',
                            border: '1px solid #CBD5E1', fontSize: '0.74rem', outline: 'none'
                        }}
                    />
                </div>

                {/* Acciones Rápidas (Seleccionar todo / Deseleccionar todo) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px', fontSize: '0.7rem', color: '#1E40AF' }}>
                    <button
                        onClick={() => handleSelectAllColumnValues(colKey)}
                        style={{ border: 'none', background: 'transparent', color: '#2563EB', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                    >
                        (Seleccionar todo)
                    </button>
                    <button
                        onClick={() => handleDeselectAllColumnValues(colKey)}
                        style={{ border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer', padding: 0 }}
                    >
                        (Deseleccionar todo)
                    </button>
                </div>

                {/* Lista Scrolleable de Valores con Checkbox */}
                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px', border: '1px solid #F1F5F9', padding: '4px', borderRadius: '6px', background: '#FAFAFA' }}>
                    {filteredList.length === 0 ? (
                        <span style={{ color: '#94A3B8', fontSize: '0.72rem', textAlign: 'center', padding: '8px' }}>
                            Sin coincidencias
                        </span>
                    ) : (
                        filteredList.map(({ val, count }) => {
                            const isChecked = isAllSelected ? true : currentSet.has(val);
                            return (
                                <label
                                    key={val}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '3px 6px', borderRadius: '4px', cursor: 'pointer',
                                        background: isChecked ? '#EFF6FF' : 'transparent',
                                        userSelect: 'none'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => handleToggleColumnValue(colKey, val)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <span style={{ fontSize: '0.72rem', color: '#1E293B', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={val}>
                                            {val}
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B', marginLeft: '6px' }}>
                                        ({count})
                                    </span>
                                </label>
                            );
                        })
                    )}
                </div>

                {/* Pie del Popover */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '6px' }}>
                    {currentSet && (
                        <button
                            onClick={() => handleClearColumnFilter(colKey)}
                            style={{
                                border: 'none', background: 'transparent', color: '#DC2626',
                                fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer'
                            }}
                        >
                            Borrar filtro
                        </button>
                    )}
                    <button
                        onClick={() => setOpenFilterCol(null)}
                        style={{
                            marginLeft: 'auto', padding: '3px 10px', borderRadius: '5px',
                            background: '#1E40AF', color: '#FFFFFF', border: 'none',
                            fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer'
                        }}
                    >
                        Listo
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 11000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px', animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                background: '#FFFFFF', borderRadius: '16px', width: '96%', maxWidth: '1280px',
                height: '90vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
                border: '1px solid #CBD5E1',
                overflow: 'hidden'
            }}>
                
                {/* ─── HEADER DEL MODAL CON INDICADOR DE PERÍODO ─── */}
                <div style={{
                    padding: '16px 24px', borderBottom: '1px solid #E2E8F0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#F8FAFC', flexWrap: 'wrap', gap: '12px'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '7px', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileSpreadsheet size={22} color="#1E40AF" />
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                                        {indicator?.label || 'Datos Tabulados del Gráfico'}
                                    </h2>
                                    {/* Insignia Destacada del Período */}
                                    {dateFilter?.fechaDesde && dateFilter?.fechaHasta && (
                                        <div style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                                            background: '#EFF6FF', border: '1px solid #93C5FD',
                                            padding: '3px 10px', borderRadius: '20px',
                                            fontSize: '0.74rem', fontWeight: 700, color: '#1E40AF'
                                        }}>
                                            <Calendar size={13} />
                                            <span>Período: {formatEsDate(dateFilter.fechaDesde)} al {formatEsDate(dateFilter.fechaHasta)}</span>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', fontSize: '0.75rem', color: '#64748B', flexWrap: 'wrap' }}>
                                    <span>Sector: <strong>{indicator?.sector || activeFilters?.sector || 'Cuidados Críticos (UCI)'}</strong></span>
                                    {activeFilters?.uciSubNivel && activeFilters.uciSubNivel !== 'CONSOLIDADO' && (
                                        <span>• Subnivel: <strong>{activeFilters.uciSubNivel}</strong></span>
                                    )}
                                    {activeFilters?.boxFiltro && (
                                        <span>• Box: <strong>{activeFilters.boxFiltro}</strong></span>
                                    )}
                                    <span>• <strong>{filteredTableData.length}</strong> registros cargados</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            onClick={handleExportExcel}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 16px', borderRadius: '8px',
                                border: '1px solid #16A34A', background: '#16A34A',
                                color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 700,
                                cursor: 'pointer', boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)'
                            }}
                            title="Exportar archivo Excel (.xlsx) con los filtros aplicados"
                        >
                            <Download size={15} />
                            Exportar Excel (.xlsx)
                        </button>

                        <button
                            onClick={handleExportPDF}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 14px', borderRadius: '8px',
                                border: '1px solid #0D3B66', background: '#0D3B66',
                                color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            <FileText size={15} />
                            PDF
                        </button>

                        <button 
                            onClick={onClose}
                            style={{
                                background: '#FFFFFF', border: '1px solid #CBD5E1', width: '34px', height: '34px',
                                borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: '#64748B', marginLeft: '6px'
                            }}
                            title="Cerrar ventana"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* ─── BARRA DE CONTROLES: TABS + BUSCADOR + SELECTOR DE MODO DÍAS CAMAS ─── */}
                <div style={{
                    padding: '8px 24px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px'
                }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {aggregatedData.length > 0 && (
                            <button
                                onClick={() => setActiveTab('chart_summary')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 14px', borderRadius: '6px',
                                    background: activeTab === 'chart_summary' ? '#EFF6FF' : 'transparent',
                                    border: activeTab === 'chart_summary' ? '1px solid #93C5FD' : '1px solid transparent',
                                    color: activeTab === 'chart_summary' ? '#1E40AF' : '#64748B',
                                    fontWeight: activeTab === 'chart_summary' ? 700 : 500,
                                    fontSize: '0.8rem', cursor: 'pointer'
                                }}
                            >
                                <BarChart2 size={15} /> Cuadro Resumen ({aggregatedData.length})
                            </button>
                        )}
                        <button
                            onClick={() => setActiveTab('detailed')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '6px 14px', borderRadius: '6px',
                                background: activeTab === 'detailed' ? '#EFF6FF' : 'transparent',
                                border: activeTab === 'detailed' ? '1px solid #93C5FD' : '1px solid transparent',
                                color: activeTab === 'detailed' ? '#1E40AF' : '#64748B',
                                fontWeight: activeTab === 'detailed' ? 700 : 500,
                                fontSize: '0.8rem', cursor: 'pointer'
                            }}
                        >
                            <List size={15} /> Registros Detallados ({filteredTableData.length})
                        </button>

                        {/* Toggle de Modo para Días Camas Ocupados: Días Cama vs Admisiones Únicas */}
                        {isKpiDiasOcupados && activeTab === 'detailed' && (
                            <div style={{
                                display: 'inline-flex', background: '#F1F5F9',
                                border: '1px solid #CBD5E1', borderRadius: '8px', padding: '2px', marginLeft: '8px'
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setOcupacionViewMode('censal')}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        padding: '4px 10px', borderRadius: '6px', border: 'none',
                                        background: ocupacionViewMode === 'censal' ? '#1E40AF' : 'transparent',
                                        color: ocupacionViewMode === 'censal' ? '#FFFFFF' : '#475569',
                                        fontSize: '0.74rem', fontWeight: ocupacionViewMode === 'censal' ? 700 : 500,
                                        cursor: 'pointer'
                                    }}
                                    title="Muestra cada día pernoctado como fila individual censal"
                                >
                                    <BedDouble size={13} /> Días Cama (Censo Diario)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOcupacionViewMode('admisiones')}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        padding: '4px 10px', borderRadius: '6px', border: 'none',
                                        background: ocupacionViewMode === 'admisiones' ? '#1E40AF' : 'transparent',
                                        color: ocupacionViewMode === 'admisiones' ? '#FFFFFF' : '#475569',
                                        fontSize: '0.74rem', fontWeight: ocupacionViewMode === 'admisiones' ? 700 : 500,
                                        cursor: 'pointer'
                                    }}
                                    title="Muestra una sola fila por paciente/internación acumulada"
                                >
                                    <Users size={13} /> Pacientes Únicos
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Buscador Global */}
                    <div style={{ position: 'relative', width: '300px' }}>
                        <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Buscar en registros..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%', padding: '6px 10px 6px 30px', borderRadius: '6px',
                                border: '1px solid #CBD5E1', fontSize: '0.8rem', outline: 'none'
                            }}
                        />
                    </div>
                </div>

                {/* ─── BARRA DE ESTADO DE FILTROS ACTIVOS ESTILO EXCEL ─── */}
                {activeTab === 'detailed' && (activeFilterCount > 0 || sortConfig.key || searchTerm) && (
                    <div style={{
                        padding: '6px 24px', background: '#EFF6FF', borderBottom: '1px solid #DBEAFE',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Filter size={12} /> Filtros Excel aplicados:
                            </span>
                            {Object.entries(columnFilters).map(([colKey, setVals]) => {
                                const colDef = tableColumns.find(c => c.key === colKey);
                                const label = colDef?.label || colKey;
                                return (
                                    <div
                                        key={colKey}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            background: '#FFFFFF', border: '1px solid #BFDBFE',
                                            borderRadius: '4px', padding: '2px 8px', fontSize: '0.7rem', color: '#1E3A8A'
                                        }}
                                    >
                                        <strong>{label}:</strong> {setVals.size} seleccionado{setVals.size !== 1 ? 's' : ''}
                                        <button
                                            onClick={() => handleClearColumnFilter(colKey)}
                                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8', padding: 0 }}
                                            title="Eliminar este filtro"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                );
                            })}
                            {sortConfig.key && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#FFFFFF', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '2px 8px', fontSize: '0.7rem', color: '#1E3A8A' }}>
                                    <strong>Orden:</strong> {tableColumns.find(c => c.key === sortConfig.key)?.label || sortConfig.key} ({sortConfig.direction === 'asc' ? 'Ascendente' : 'Descendente'})
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                Mostrando <strong>{filteredTableData.length}</strong> de {tableData.length} registros
                            </span>
                            <button
                                onClick={handleClearAllColumnFilters}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                    border: 'none', background: 'transparent', color: '#DC2626',
                                    fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                <RotateCcw size={11} /> Limpiar todos los filtros
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── CONTENIDO PRINCIPAL: RESUMEN GRÁFICO O TABLA DETALLADA CON FILTROS EXCEL ─── */}
                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: 0, position: 'relative' }}>
                    
                    {/* TAB 1: RESUMEN DEL GRÁFICO */}
                    {activeTab === 'chart_summary' && aggregatedData.length > 0 ? (
                        <div style={{ padding: '20px 24px' }}>
                            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                                    Desglose Cuantitativo por Categoría:
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                    Total: {aggregatedData.reduce((acc, c) => acc + (Number(c.value) || 0), 0).toLocaleString('es-AR')}
                                </span>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#475569' }}>
                                        <th style={{ padding: '10px 14px', fontWeight: 700 }}>Categoría / Box / Eje</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Cantidad / Solicitudes</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Porcentaje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {aggregatedData.map((row, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>
                                                {row.label}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1E40AF', textAlign: 'right' }}>
                                                {Number(row.value).toLocaleString('es-AR')}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#10B981', textAlign: 'right' }}>
                                                {row.pct || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        /* TAB 2: REGISTROS DETALLADOS (TABLA AUDITORÍA CON FILTROS EXCEL EN CADA COLUMNA) */
                        filteredTableData.length === 0 ? (
                            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8' }}>
                                No se encontraron registros coincidentes con los filtros seleccionados.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#F8FAFC', zIndex: 10 }}>
                                    <tr style={{ borderBottom: '2px solid #CBD5E1' }}>
                                        {tableColumns.map((col, colIdx) => {
                                            const isFiltered = !!columnFilters[col.key];
                                            const isSorted = sortConfig.key === col.key;
                                            return (
                                                <th 
                                                    key={col.key} 
                                                    style={{ 
                                                        padding: '10px 12px', 
                                                        color: isFiltered ? '#1E40AF' : '#475569', 
                                                        fontWeight: 700, 
                                                        whiteSpace: 'nowrap',
                                                        position: 'relative',
                                                        background: isFiltered ? '#EFF6FF' : '#F8FAFC'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                                        <span 
                                                            onClick={() => handleSortColumn(col.key, isSorted && sortConfig.direction === 'asc' ? 'desc' : 'asc')}
                                                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                            title="Clic para ordenar esta columna"
                                                        >
                                                            {col.label}
                                                            {isSorted ? (
                                                                sortConfig.direction === 'asc' ? <ArrowUp size={12} color="#1E40AF" /> : <ArrowDown size={12} color="#1E40AF" />
                                                            ) : null}
                                                        </span>

                                                        {/* Botón Filtro Excel (Embudo) */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setOpenFilterCol(openFilterCol === col.key ? null : col.key);
                                                                setColFilterSearch('');
                                                            }}
                                                            style={{
                                                                border: isFiltered ? '1px solid #2563EB' : '1px solid #CBD5E1',
                                                                background: isFiltered ? '#2563EB' : '#FFFFFF',
                                                                color: isFiltered ? '#FFFFFF' : '#64748B',
                                                                borderRadius: '4px',
                                                                padding: '2px 4px',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}
                                                            title={`Filtrar columna ${col.label} (Estilo Excel)`}
                                                        >
                                                            <Filter size={11} />
                                                        </button>
                                                    </div>

                                                    {/* Popover flotante del filtro Excel */}
                                                    {renderExcelFilterPopover(col.key, col.label, colIdx)}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTableData.map((row, idx) => (
                                        <tr 
                                            key={idx} 
                                            style={{ 
                                                borderBottom: '1px solid #F1F5F9',
                                                background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'
                                            }}
                                        >
                                            {tableColumns.map(col => {
                                                const val = row[col.key];
                                                if (col.key === 'fechaOcupacion') {
                                                    return (
                                                        <td key={col.key} style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                                            <span style={{ background: '#FEF3C7', border: '1px solid #FDE68A', padding: '2px 6px', borderRadius: '4px', fontSize: '0.74rem', fontWeight: 700, color: '#92400E' }}>
                                                                {val}
                                                            </span>
                                                        </td>
                                                    );
                                                }
                                                if (col.key === 'habitacion') {
                                                    return (
                                                        <td key={col.key} style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                                            <span style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '2px 8px', borderRadius: '4px', fontSize: '0.74rem', fontWeight: 700, color: '#1E40AF' }}>
                                                                {val}
                                                            </span>
                                                        </td>
                                                    );
                                                }
                                                if (col.key === 'modalidad') {
                                                    return (
                                                        <td key={col.key} style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                                            <span style={{
                                                                padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
                                                                background: val === 'Imágenes' ? '#FAF5FF' : '#F0FDF4',
                                                                color: val === 'Imágenes' ? '#7E22CE' : '#15803D'
                                                            }}>
                                                                {val}
                                                            </span>
                                                        </td>
                                                    );
                                                }
                                                if (col.key === 'paciente') {
                                                    return (
                                                        <td key={col.key} style={{ padding: '8px 12px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                                                            {val}
                                                        </td>
                                                    );
                                                }
                                                if (col.key === 'id') {
                                                    return (
                                                        <td key={col.key} style={{ padding: '8px 12px', fontWeight: 700, color: '#2563EB', whiteSpace: 'nowrap' }}>
                                                            {val}
                                                        </td>
                                                    );
                                                }
                                                return (
                                                    <td key={col.key} style={{ padding: '8px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                                                        {val}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )
                    )}
                </div>

                {/* ─── FOOTER ─── */}
                <div style={{
                    padding: '12px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                        Datos obtenidos directamente de SALUS SQL Server ({isPeticiones ? 'calidad_peticiones_estudios / VLISE' : 'calidad_admisiones_ocupacion'})
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '6px 18px', borderRadius: '6px', border: '1px solid #CBD5E1',
                            background: '#FFFFFF', color: '#334155', fontWeight: 600, fontSize: '0.8rem',
                            cursor: 'pointer'
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
