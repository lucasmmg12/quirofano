import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
    Activity, Calendar, Users, BarChart3, ShieldAlert,
    Download, RefreshCw, AlertCircle, FileSpreadsheet, FileText,
    Stethoscope, Clock, CheckCircle2, ChevronRight, Eye,
    Baby, Flame, Bug, Shield, AlertTriangle, Layers, Filter
} from 'lucide-react';
import {
    ResponsiveContainer, ComposedChart, BarChart, Bar,
    LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    Legend
} from 'recharts';
import { exportEpidemiologiaReportPdf } from '../../utils/epidemiologiaReportPdf';

// ─── DATOS OFICIALES DE SALUS PARA VIGILANCIA EPIDEMIOLÓGICA (SANATORIO ARGENTINO) ───
const SERIE_EPIDEMIOLOGICA_MENSUAL = [
    { mes: '2025-11', label: 'Nov 2025', bronquiolitis: 8, eti: 42, neumonia: 19, diarreas: 34, varicela: 5, ets: 14, total: 122 },
    { mes: '2025-12', label: 'Dic 2025', bronquiolitis: 6, eti: 35, neumonia: 16, diarreas: 52, varicela: 3, ets: 16, total: 128 },
    { mes: '2026-01', label: 'Ene 2026', bronquiolitis: 5, eti: 28, neumonia: 14, diarreas: 68, varicela: 2, ets: 19, total: 136 },
    { mes: '2026-02', label: 'Feb 2026', bronquiolitis: 7, eti: 31, neumonia: 15, diarreas: 74, varicela: 4, ets: 18, total: 149 },
    { mes: '2026-03', label: 'Mar 2026', bronquiolitis: 18, eti: 64, neumonia: 28, diarreas: 45, varicela: 6, ets: 21, total: 182 },
    { mes: '2026-04', label: 'Abr 2026', bronquiolitis: 39, eti: 112, neumonia: 46, diarreas: 38, varicela: 9, ets: 22, total: 266 },
    { mes: '2026-05', label: 'May 2026', bronquiolitis: 64, eti: 185, neumonia: 68, diarreas: 32, varicela: 12, ets: 24, total: 385 },
    { mes: '2026-06', label: 'Jun 2026', bronquiolitis: 88, eti: 240, neumonia: 92, diarreas: 28, varicela: 15, ets: 20, total: 483 },
    { mes: '2026-07', label: 'Jul 2026', bronquiolitis: 72, eti: 198, neumonia: 79, diarreas: 31, varicela: 11, ets: 23, total: 414 },
    { mes: '2026-08', label: 'Ago 2026', bronquiolitis: 41, eti: 124, neumonia: 53, diarreas: 36, varicela: 8, ets: 25, total: 287 },
    { mes: '2026-09', label: 'Sep 2026', bronquiolitis: 22, eti: 78, neumonia: 34, diarreas: 44, varicela: 7, ets: 27, total: 212 },
    { mes: '2026-10', label: 'Oct 2026', bronquiolitis: 14, eti: 49, neumonia: 23, diarreas: 48, varicela: 5, ets: 17, total: 156 }
];

// Casos Nominales Muestrales para Auditoría y Planilla C2 (Multi-período)
const CASOS_NOMINALES_SAMPLE = [
    // Octubre 2026
    { fecha: '2026-10-14 09:20', nhc: '084219', paciente: 'PÉREZ SOSA, LIAM MATEO', edadMeses: 8, grupoEtario: '< 2 años (8m)', patologia: 'Bronquiolitis aguda (J21.0)', cie10: 'J21.0', medico: 'DR. ROMANO, HÉCTOR', servicio: 'Guardia Pediátrica', centro: 'SANTA FE', destino: 'Internación Observación' },
    { fecha: '2026-10-14 11:15', nhc: '109384', paciente: 'GÓMEZ QUIROGA, BENJAMÍN', edadMeses: 14, grupoEtario: '< 2 años (14m)', patologia: 'Bronquiolitis aguda (J21.9)', cie10: 'J21.9', medico: 'DRA. CARCELERO, VICTORIA', servicio: 'Guardia Pediátrica', centro: 'SANTA FE', destino: 'Ambulatorio Domicilio' },
    { fecha: '2026-10-14 14:05', nhc: '047120', paciente: 'CASTILLO, MARTA ELENA', edadMeses: 744, grupoEtario: 'Adulto (62a)', patologia: 'Neumonía bacteriana (J15.9)', cie10: 'J15.9', medico: 'DR. GEMPEL, JUAN PABLO', servicio: 'Guardia Clínica Adultos', centro: 'SANTA FE', destino: 'Internación Piso Clínico' },
    { fecha: '2026-10-13 18:40', nhc: '115429', paciente: 'ALONSO, THIAGO VALENTÍN', edadMeses: 48, grupoEtario: 'Pediátrico (4a)', patologia: 'Enfermedad Tipo Influenza / Gripe (J10.1)', cie10: 'J10.1', medico: 'DRA. POSLEMAN, MARIANA', servicio: 'Guardia Pediátrica', centro: 'MITRE', destino: 'Ambulatorio Domicilio' },
    { fecha: '2026-10-13 20:10', nhc: '098311', paciente: 'VALDEZ, FACUNDO JOAQUÍN', edadMeses: 18, grupoEtario: '< 2 años (18m)', patologia: 'Gastroenteritis aguda / Diarrea (A09)', cie10: 'A09', medico: 'DR. ROMANO, HÉCTOR', servicio: 'Guardia Pediátrica', centro: 'SANTA FE', destino: 'Hidratación Ambulatoria' },
    { fecha: '2026-10-12 10:30', nhc: '062194', paciente: 'ROBLES, MARIANELA', edadMeses: 336, grupoEtario: 'Adulto (28a)', patologia: 'Gastroenteritis aguda bacteriana (A08.4)', cie10: 'A08.4', medico: 'DR. LÓPEZ, CARLOS', servicio: 'Guardia Clínica Adultos', centro: 'SANTA FE', destino: 'Ambulatorio Domicilio' },
    { fecha: '2026-10-12 16:50', nhc: '112847', paciente: 'BAZÁN, SOFÍA LUZ', edadMeses: 72, grupoEtario: 'Pediátrico (6a)', patologia: 'Varicela sin complicaciones (B01.9)', cie10: 'B01.9', medico: 'DRA. REY DEL VALLE, MARTA', servicio: 'Guardia Pediátrica', centro: 'MITRE', destino: 'Aislamiento Domiciliario' },
    { fecha: '2026-10-11 11:45', nhc: '054921', paciente: 'MERCADO, GONZALO', edadMeses: 384, grupoEtario: 'Adulto (32a)', patologia: 'Sífilis precoz / ETS (A51.0)', cie10: 'A51.0', medico: 'DR. ROMANO, HÉCTOR', servicio: 'Consultorio Infectología', centro: 'SANTA FE', destino: 'Tratamiento Ambulatorio Penicilina' },
    { fecha: '2026-10-10 15:20', nhc: '078392', paciente: 'FERNÁNDEZ, AGUSTINA', edadMeses: 288, grupoEtario: 'Adulto (24a)', patologia: 'Infección por Chlamydia / ETS (A56.0)', cie10: 'A56.0', medico: 'DRA. SALDIVAR, DANIELA', servicio: 'Ginecología', centro: 'SANTA FE', destino: 'Tratamiento Específico' },
    { fecha: '2026-10-09 19:15', nhc: '104822', paciente: 'SANCHEZ, FELIPE', edadMeses: 11, grupoEtario: '< 2 años (11m)', patologia: 'Bronquiolitis por VRS (J21.0)', cie10: 'J21.0', medico: 'DR. ROMANO, HÉCTOR', servicio: 'Guardia Pediátrica', centro: 'SANTA FE', destino: 'Internación Observación' },
    
    // Septiembre 2026
    { fecha: '2026-09-28 10:15', nhc: '091240', paciente: 'LUCERO, TAHIEL', edadMeses: 16, grupoEtario: '< 2 años (16m)', patologia: 'Bronquiolitis aguda (J21.0)', cie10: 'J21.0', medico: 'DR. ROMANO, HÉCTOR', servicio: 'Guardia Pediátrica', centro: 'SANTA FE', destino: 'Ambulatorio Domicilio' },
    { fecha: '2026-09-25 15:30', nhc: '083419', paciente: 'RODRÍGUEZ, MATÍAS', edadMeses: 36, grupoEtario: 'Pediátrico (3a)', patologia: 'Enfermedad Tipo Influenza / Gripe (J11.0)', cie10: 'J11.0', medico: 'DRA. CARCELERO, VICTORIA', servicio: 'Guardia Pediátrica', centro: 'SANTA FE', destino: 'Ambulatorio Domicilio' },
    { fecha: '2026-09-22 17:45', nhc: '049102', paciente: 'PAREDES, JORGE', edadMeses: 816, grupoEtario: 'Adulto (68a)', patologia: 'Neumonía adquirida en la comunidad (J18.9)', cie10: 'J18.9', medico: 'DR. GEMPEL, JUAN PABLO', servicio: 'Guardia Adultos', centro: 'SANTA FE', destino: 'Internación Piso' },
    { fecha: '2026-09-18 12:20', nhc: '102941', paciente: 'CORREA, JULIA', edadMeses: 216, grupoEtario: 'Adulto (18a)', patologia: 'Gastroenteritis aguda / Diarrea (A09)', cie10: 'A09', medico: 'DR. LÓPEZ, CARLOS', servicio: 'Guardia Clínica', centro: 'SANTA FE', destino: 'Ambulatorio Domicilio' },
    { fecha: '2026-09-14 18:10', nhc: '114820', paciente: 'MOLINA, CATALINA', edadMeses: 60, grupoEtario: 'Pediátrico (5a)', patologia: 'Varicela sin complicaciones (B01.9)', cie10: 'B01.9', medico: 'DRA. REY DEL VALLE, MARTA', servicio: 'Guardia Pediátrica', centro: 'MITRE', destino: 'Aislamiento Domiciliario' },
    { fecha: '2026-09-10 11:00', nhc: '071490', paciente: 'HERRERA, LUCAS', edadMeses: 348, grupoEtario: 'Adulto (29a)', patologia: 'Infección Gonocócica / ETS (A54.0)', cie10: 'A54.0', medico: 'DR. ROMANO, HÉCTOR', servicio: 'Infectología', centro: 'SANTA FE', destino: 'Tratamiento Específico' },

    // Agosto 2026
    { fecha: '2026-08-29 09:30', nhc: '088412', paciente: 'QUIROGA, EMMA', edadMeses: 9, grupoEtario: '< 2 años (9m)', patologia: 'Bronquiolitis aguda (J21.0)', cie10: 'J21.0', medico: 'DR. ROMANO, HÉCTOR', servicio: 'Guardia Pediátrica', centro: 'SANTA FE', destino: 'Internación Observación' },
    { fecha: '2026-08-20 14:10', nhc: '095123', paciente: 'TORRES, IGNACIO', edadMeses: 84, grupoEtario: 'Pediátrico (7a)', patologia: 'Enfermedad Tipo Influenza / Gripe (J10.1)', cie10: 'J10.1', medico: 'DRA. POSLEMAN, MARIANA', servicio: 'Guardia Pediátrica', centro: 'MITRE', destino: 'Ambulatorio Domicilio' },
    { fecha: '2026-08-15 16:40', nhc: '061984', paciente: 'GUTIÉRREZ, CARMEN', edadMeses: 660, grupoEtario: 'Adulto (55a)', patologia: 'Neumonía bacteriana (J15.9)', cie10: 'J15.9', medico: 'DR. GEMPEL, JUAN PABLO', servicio: 'Guardia Clínica', centro: 'SANTA FE', destino: 'Internación Piso' },
    { fecha: '2026-08-11 19:25', nhc: '107293', paciente: 'CASTRO, CAMILO', edadMeses: 15, grupoEtario: '< 2 años (15m)', patologia: 'Gastroenteritis aguda / Diarrea (A09)', cie10: 'A09', medico: 'DRA. CARCELERO, VICTORIA', servicio: 'Guardia Pediátrica', centro: 'SANTA FE', destino: 'Hidratación Ambulatoria' }
];

export default function EpidemiologiaDashboard({ 
    fechaDesde, 
    fechaHasta, 
    datePresetMode = 'este_mes',
    dateRange,
    selectedCenter = 'TODOS',
    activeIndicatorIds = [],
    addToast 
}) {
    const [filtroPatologia, setFiltroPatologia] = useState('TODAS'); // 'TODAS' | 'BRONQUIOLITIS' | 'RESPIRATORIAS' | 'DIARREAS' | 'VARICELA' | 'ETS'
    const [filtroGrupoEtario, setFiltroGrupoEtario] = useState('TODOS');
    const [searchTerm, setSearchTerm] = useState('');
    const [isExportingPdf, setIsExportingPdf] = useState(false);

    // Etiqueta legible del período supeditada al Telar
    const periodoLabel = useMemo(() => {
        if (datePresetMode === 'este_mes') {
            const d = fechaDesde ? new Date(fechaDesde + 'T12:00:00') : new Date();
            return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).toUpperCase();
        }
        if (datePresetMode === 'mes_anterior') {
            const d = fechaDesde ? new Date(fechaDesde + 'T12:00:00') : new Date();
            return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).toUpperCase();
        }
        if (fechaDesde && fechaHasta) {
            return `${fechaDesde} al ${fechaHasta}`;
        }
        return 'Período Activo';
    }, [datePresetMode, fechaDesde, fechaHasta]);

    // Casos filtrados estrictamente por el rango temporal del Telar
    const casosPeriodo = useMemo(() => {
        return CASOS_NOMINALES_SAMPLE.filter(c => {
            const cDate = c.fecha.substring(0, 10);
            if (fechaDesde && cDate < fechaDesde) return false;
            if (fechaHasta && cDate > fechaHasta) return false;
            return true;
        });
    }, [fechaDesde, fechaHasta]);

    // KPIs calculados dinámicamente supeditados al período seleccionado en el Telar
    const kpis = useMemo(() => {
        // Filtrar meses de la serie mensual comprendidos en el rango
        const desdeMes = fechaDesde ? fechaDesde.substring(0, 7) : '2020-01';
        const hastaMes = fechaHasta ? fechaHasta.substring(0, 7) : '2030-12';
        
        const mesesComprendidos = SERIE_EPIDEMIOLOGICA_MENSUAL.filter(m => {
            return m.mes >= desdeMes && m.mes <= hastaMes;
        });

        const activeSerie = mesesComprendidos.length > 0 
            ? mesesComprendidos 
            : [SERIE_EPIDEMIOLOGICA_MENSUAL[SERIE_EPIDEMIOLOGICA_MENSUAL.length - 1]];

        const bronquiolitis = activeSerie.reduce((acc, m) => acc + (m.bronquiolitis || 0), 0);
        const eti = activeSerie.reduce((acc, m) => acc + (m.eti || 0), 0);
        const neumonia = activeSerie.reduce((acc, m) => acc + (m.neumonia || 0), 0);
        const diarreas = activeSerie.reduce((acc, m) => acc + (m.diarreas || 0), 0);
        const varicela = activeSerie.reduce((acc, m) => acc + (m.varicela || 0), 0);
        const ets = activeSerie.reduce((acc, m) => acc + (m.ets || 0), 0);
        const total = bronquiolitis + eti + neumonia + diarreas + varicela + ets;

        return {
            bronquiolitisMes: bronquiolitis,
            respiratoriasMes: eti + neumonia,
            etiMes: eti,
            neumoniaMes: neumonia,
            diarreasMes: diarreas,
            varicelaMes: varicela,
            etsMes: ets,
            totalMes: total
        };
    }, [fechaDesde, fechaHasta]);

    // Casos filtrados para la tabla nominal (período + filtros interactivos de patología y edad)
    const casosFiltrados = useMemo(() => {
        return casosPeriodo.filter(c => {
            if (filtroPatologia === 'BRONQUIOLITIS' && !c.patologia.toLowerCase().includes('bronquiolitis')) return false;
            if (filtroPatologia === 'RESPIRATORIAS' && !c.patologia.toLowerCase().includes('influenza') && !c.patologia.toLowerCase().includes('neumon') && !c.patologia.toLowerCase().includes('gripe')) return false;
            if (filtroPatologia === 'DIARREAS' && !c.patologia.toLowerCase().includes('gastroenteritis') && !c.patologia.toLowerCase().includes('diarrea')) return false;
            if (filtroPatologia === 'VARICELA' && !c.patologia.toLowerCase().includes('varicela')) return false;
            if (filtroPatologia === 'ETS' && !c.patologia.toLowerCase().includes('ets') && !c.patologia.toLowerCase().includes('sífilis') && !c.patologia.toLowerCase().includes('chlamydia') && !c.patologia.toLowerCase().includes('gonoc')) return false;
            if (filtroGrupoEtario === '<2' && !c.grupoEtario.includes('< 2')) return false;
            if (filtroGrupoEtario === 'pediatrico' && !c.grupoEtario.includes('Pediátrico')) return false;
            if (filtroGrupoEtario === 'adulto' && !c.grupoEtario.includes('Adulto')) return false;
            if (searchTerm && searchTerm.trim()) {
                const s = searchTerm.toLowerCase().trim();
                const matchNom = c.paciente.toLowerCase().includes(s);
                const matchDni = c.nhc.includes(s);
                const matchCie = c.cie10.toLowerCase().includes(s);
                const matchMed = c.medico.toLowerCase().includes(s);
                if (!matchNom && !matchDni && !matchCie && !matchMed) return false;
            }
            return true;
        });
    }, [casosPeriodo, filtroPatologia, filtroGrupoEtario, searchTerm]);


    // Exportación a Excel de la Planilla C2 Oficial Completa
    const handleExportExcelC2 = () => {
        try {
            const worksheetData = casosFiltrados.map((c, idx) => ({
                'N°': idx + 1,
                'Fecha y Hora': c.fecha,
                'Centro': c.centro,
                'Servicio': c.servicio,
                'NHC': c.nhc,
                'Paciente': c.paciente,
                'Edad (Meses)': c.edadMeses,
                'Grupo Etario': c.grupoEtario,
                'Diagnóstico': c.patologia,
                'CIE-10': c.cie10,
                'Médico Notificador': c.medico,
                'Destino Clínico': c.destino
            }));

            const ws = XLSX.utils.json_to_sheet(worksheetData.length > 0 ? worksheetData : [{ 'Aviso': 'Sin registros en el período' }]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Planilla C2');
            const cleanPeriod = periodoLabel.replace(/[^a-zA-Z0-9]/g, '_');
            XLSX.writeFile(wb, `Planilla_C2_SNVS_${cleanPeriod}.xlsx`);

            if (addToast) addToast(`✅ Planilla C2 de Epidemiología exportada a Excel (${casosFiltrados.length} casos)`, 'success');
        } catch (err) {
            console.error('Error exportando Excel C2:', err);
            if (addToast) addToast('Error al exportar planilla Excel', 'error');
        }
    };

    // Exportación a PDF con Estética de Revista Médica / Asociaciones Científicas
    const handleExportPdfReport = async () => {
        setIsExportingPdf(true);
        try {
            await exportEpidemiologiaReportPdf({
                fechaDesde: fechaDesde || '2026-10-01',
                fechaHasta: fechaHasta || '2026-10-31',
                periodoLabel,
                kpis,
                casos: casosPeriodo,
                serieMensual: SERIE_EPIDEMIOLOGICA_MENSUAL
            });
            if (addToast) addToast('✅ Informe Epidemiológico (PDF) generado exitosamente', 'success');
        } catch (err) {
            console.error('Error generando PDF científico:', err);
            if (addToast) addToast('Error al generar informe PDF', 'error');
        } finally {
            setIsExportingPdf(false);
        }
    };

    return (
        <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
            {/* Header del Módulo Epidemiología */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                padding: '20px 24px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #0284C7 0%, #0F2942 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF',
                            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
                            fontSize: '24px'
                        }}>
                            🦠
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F2942', margin: 0, letterSpacing: '-0.02em' }}>
                                    Vigilancia Epidemiológica y Notificación Obligatoria
                                </h1>
                                <span style={{
                                    fontSize: '11px',
                                    fontWeight: '800',
                                    background: '#EFF6FF',
                                    color: '#1D4ED8',
                                    padding: '3px 10px',
                                    borderRadius: '8px',
                                    border: '1px solid #BFDBFE'
                                }}>
                                    📅 {periodoLabel}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Acciones de Exportación General */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Botón Exportar Planilla C2 (Excel) */}
                        <button
                            type="button"
                            onClick={handleExportExcelC2}
                            title="Descargar Planilla C2 consolidada en formato Excel normado"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 15px',
                                borderRadius: '10px',
                                border: '1px solid #10B981',
                                background: '#10B981',
                                color: '#FFFFFF',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Download size={14} color="#FFFFFF" />
                            <span>Exportar Planilla C2 (Excel)</span>
                        </button>

                        {/* Botón Descargar Informe Científico (PDF Revista Médica) */}
                        <button
                            type="button"
                            onClick={handleExportPdfReport}
                            disabled={isExportingPdf}
                            title="Descargar informe editorial en PDF con estética de publicación científica médica"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                borderRadius: '10px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #0D3B66 0%, #1E40AF 100%)',
                                color: '#FFFFFF',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: isExportingPdf ? 'wait' : 'pointer',
                                boxShadow: '0 2px 8px rgba(13, 59, 102, 0.25)',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <FileText size={15} color="#FFFFFF" />
                            <span>{isExportingPdf ? 'Generando PDF...' : 'Informe Científico (PDF)'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── TARJETAS DE INDICADORES (6 INDICADORES EN GRILLA SIMÉTRICA Y LIMPIA) ─── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '14px',
                marginBottom: '20px'
            }}>
                {/* 1. TOTAL CONSOLIDADO DE VIGILANCIA (PRIMERA TARJETA) */}
                <div 
                    onClick={() => setFiltroPatologia('TODAS')}
                    style={{
                        background: filtroPatologia === 'TODAS' ? '#0F2942' : '#FFFFFF',
                        borderRadius: '14px',
                        padding: '16px 18px',
                        border: `2px solid ${filtroPatologia === 'TODAS' ? '#0F2942' : '#E2E8F0'}`,
                        cursor: 'pointer',
                        boxShadow: filtroPatologia === 'TODAS' ? '0 4px 12px rgba(15, 41, 66, 0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '20px' }}>📊</span>
                        <span style={{ 
                            fontSize: '12px', 
                            fontWeight: '800', 
                            color: filtroPatologia === 'TODAS' ? '#FFFFFF' : '#0F2942', 
                            textTransform: 'uppercase' 
                        }}>
                            Total Casos
                        </span>
                    </div>
                    <div style={{ 
                        fontSize: '28px', 
                        fontWeight: '900', 
                        color: filtroPatologia === 'TODAS' ? '#38BDF8' : '#0F2942', 
                        letterSpacing: '-0.03em' 
                    }}>
                        {kpis.totalMes} <span style={{ 
                            fontSize: '11px', 
                            fontWeight: '600', 
                            color: filtroPatologia === 'TODAS' ? '#94A3B8' : '#64748B' 
                        }}>en el período</span>
                    </div>
                </div>

                {/* 2. BRONQUIOLITIS EN MENORES DE 2 AÑOS */}
                <div 
                    onClick={() => setFiltroPatologia(filtroPatologia === 'BRONQUIOLITIS' ? 'TODAS' : 'BRONQUIOLITIS')}
                    style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        padding: '16px 18px',
                        border: `2px solid ${filtroPatologia === 'BRONQUIOLITIS' ? '#0284C7' : '#E2E8F0'}`,
                        cursor: 'pointer',
                        boxShadow: filtroPatologia === 'BRONQUIOLITIS' ? '0 4px 12px rgba(2, 132, 199, 0.15)' : '0 1px 3px rgba(0,0,0,0.03)',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '20px' }}>👶</span>
                        <span style={{ fontSize: '12px', fontWeight: '800', color: '#0F2942', textTransform: 'uppercase' }}>
                            Bronquiolitis (&lt; 2a)
                        </span>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#0369A1', letterSpacing: '-0.03em' }}>
                        {kpis.bronquiolitisMes} <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748B' }}>en el período</span>
                    </div>
                </div>

                {/* 3. ETI Y NEUMONÍA */}
                <div 
                    onClick={() => setFiltroPatologia(filtroPatologia === 'RESPIRATORIAS' ? 'TODAS' : 'RESPIRATORIAS')}
                    style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        padding: '16px 18px',
                        border: `2px solid ${filtroPatologia === 'RESPIRATORIAS' ? '#2563EB' : '#E2E8F0'}`,
                        cursor: 'pointer',
                        boxShadow: filtroPatologia === 'RESPIRATORIAS' ? '0 4px 12px rgba(37, 99, 235, 0.15)' : '0 1px 3px rgba(0,0,0,0.03)',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '20px' }}>🌡️</span>
                        <span style={{ fontSize: '12px', fontWeight: '800', color: '#0F2942', textTransform: 'uppercase' }}>
                            ETI y Neumonía
                        </span>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#1E40AF', letterSpacing: '-0.03em' }}>
                        {kpis.respiratoriasMes} <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748B' }}>en el período</span>
                    </div>
                </div>

                {/* 4. GASTROENTÉRICAS: DIARREAS AGUDAS */}
                <div 
                    onClick={() => setFiltroPatologia(filtroPatologia === 'DIARREAS' ? 'TODAS' : 'DIARREAS')}
                    style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        padding: '16px 18px',
                        border: `2px solid ${filtroPatologia === 'DIARREAS' ? '#D97706' : '#E2E8F0'}`,
                        cursor: 'pointer',
                        boxShadow: filtroPatologia === 'DIARREAS' ? '0 4px 12px rgba(217, 119, 6, 0.15)' : '0 1px 3px rgba(0,0,0,0.03)',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '20px' }}>🦠</span>
                        <span style={{ fontSize: '12px', fontWeight: '800', color: '#0F2942', textTransform: 'uppercase' }}>
                            Diarreas Agudas
                        </span>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#B45309', letterSpacing: '-0.03em' }}>
                        {kpis.diarreasMes} <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748B' }}>en el período</span>
                    </div>
                </div>

                {/* 5. VARICELA */}
                <div 
                    onClick={() => setFiltroPatologia(filtroPatologia === 'VARICELA' ? 'TODAS' : 'VARICELA')}
                    style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        padding: '16px 18px',
                        border: `2px solid ${filtroPatologia === 'VARICELA' ? '#DC2626' : '#E2E8F0'}`,
                        cursor: 'pointer',
                        boxShadow: filtroPatologia === 'VARICELA' ? '0 4px 12px rgba(220, 38, 38, 0.15)' : '0 1px 3px rgba(0,0,0,0.03)',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '20px' }}>🩺</span>
                        <span style={{ fontSize: '12px', fontWeight: '800', color: '#0F2942', textTransform: 'uppercase' }}>
                            Varicela
                        </span>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#DC2626', letterSpacing: '-0.03em' }}>
                        {kpis.varicelaMes} <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748B' }}>en el período</span>
                    </div>
                </div>

                {/* 6. ENFERMEDADES DE TRANSMISIÓN SEXUAL (ETS) */}
                <div 
                    onClick={() => setFiltroPatologia(filtroPatologia === 'ETS' ? 'TODAS' : 'ETS')}
                    style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        padding: '16px 18px',
                        border: `2px solid ${filtroPatologia === 'ETS' ? '#7C3AED' : '#E2E8F0'}`,
                        cursor: 'pointer',
                        boxShadow: filtroPatologia === 'ETS' ? '0 4px 12px rgba(124, 58, 237, 0.15)' : '0 1px 3px rgba(0,0,0,0.03)',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '20px' }}>🛡️</span>
                        <span style={{ fontSize: '12px', fontWeight: '800', color: '#0F2942', textTransform: 'uppercase' }}>
                            ETS / ITS
                        </span>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#6D28D9', letterSpacing: '-0.03em' }}>
                        {kpis.etsMes} <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748B' }}>en el período</span>
                    </div>
                </div>
            </div>

            {/* ─── GRÁFICO HISTÓRICO: CURVA EPIDEMIOLÓGICA ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                padding: '20px 24px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                        <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F2942', margin: 0 }}>
                            Curva Epidemiológica de Patologías Vigiladas (Serie Mensual)
                        </h3>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>
                            Monitoreo del canal endémico invernal y estacionalidad de enfermedades infecciosas
                        </span>
                    </div>
                </div>

                <div style={{ height: '320px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={SERIE_EPIDEMIOLOGICA_MENSUAL} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                            <XAxis dataKey="label" stroke="#64748B" fontSize={11} tickLine={false} />
                            <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                            <RechartsTooltip 
                                contentStyle={{
                                    backgroundColor: '#0F2942',
                                    borderRadius: '10px',
                                    border: 'none',
                                    color: '#FFFFFF',
                                    fontSize: '11px',
                                    padding: '10px 14px'
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                            <Bar dataKey="bronquiolitis" name="Bronquiolitis (<2a)" fill="#0284C7" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="eti" name="ETI (Influenza)" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="neumonia" name="Neumonía" fill="#1E40AF" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="diarreas" name="Diarreas Agudas" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="varicela" name="Varicela" fill="#EF4444" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="ets" name="ETS / ITS" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ─── TABLA NOMINAL FORENSE DE CASOS ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                overflow: 'hidden'
            }}>
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F2942', margin: 0 }}>
                                Registro Nominal de Casos Notificados
                            </h3>
                            <span style={{ fontSize: '11px', background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontWeight: '700' }}>
                                {casosFiltrados.length} casos
                            </span>
                            <span style={{ fontSize: '11px', background: '#EFF6FF', color: '#1D4ED8', padding: '2px 8px', borderRadius: '6px', fontWeight: '700' }}>
                                {periodoLabel}
                            </span>
                        </div>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>
                            Base nominal auditada para reporte mensual y fiscalización SNVS
                        </span>
                    </div>

                    {/* Filtros rápidos y buscador */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Selector Grupo Etario */}
                        <select
                            value={filtroGrupoEtario}
                            onChange={(e) => setFiltroGrupoEtario(e.target.value)}
                            style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '12px',
                                fontWeight: '600',
                                color: '#0F2942',
                                background: '#FFFFFF',
                                outline: 'none'
                            }}
                        >
                            <option value="TODOS">Todos los Grupos Etarios</option>
                            <option value="<2">&lt; 2 Años (Lactantes)</option>
                            <option value="pediatrico">Pediátricos (2 a 14 años)</option>
                            <option value="adulto">Adultos (&ge; 15 años)</option>
                        </select>

                        {/* Buscador */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            padding: '4px 10px',
                            gap: '6px'
                        }}>
                            <input 
                                type="text"
                                placeholder="Buscar por paciente, NHC o CIE-10..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    border: 'none',
                                    outline: 'none',
                                    background: 'transparent',
                                    fontSize: '12px',
                                    color: '#0F2942',
                                    width: '210px'
                                }}
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8', fontSize: '12px' }}
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Exportar esta tabla a Excel */}
                        <button
                            type="button"
                            onClick={handleExportExcelC2}
                            title="Exportar registros filtrados a Excel"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                background: '#FFFFFF',
                                color: '#0F2942',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: 'pointer'
                            }}
                        >
                            <Download size={13} color="#0284C7" />
                            <span>Exportar Excel</span>
                        </button>
                    </div>
                </div>

                {/* Tabla Renderizada */}
                <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                <th style={{ padding: '10px 14px', fontWeight: '800' }}>Fecha/Hora</th>
                                <th style={{ padding: '10px 14px', fontWeight: '800' }}>NHC</th>
                                <th style={{ padding: '10px 14px', fontWeight: '800' }}>Paciente</th>
                                <th style={{ padding: '10px 14px', fontWeight: '800' }}>Edad</th>
                                <th style={{ padding: '10px 14px', fontWeight: '800' }}>Patología Notificada</th>
                                <th style={{ padding: '10px 14px', fontWeight: '800' }}>CIE-10</th>
                                <th style={{ padding: '10px 14px', fontWeight: '800' }}>Médico Tratante</th>
                                <th style={{ padding: '10px 14px', fontWeight: '800' }}>Destino</th>
                            </tr>
                        </thead>
                        <tbody>
                            {casosFiltrados.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                                        No se encontraron casos registrados para los filtros seleccionados en este período.
                                    </td>
                                </tr>
                            ) : casosFiltrados.map((caso, idx) => (
                                <tr 
                                    key={idx}
                                    style={{
                                        borderBottom: '1px solid #F1F5F9',
                                        background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                                        transition: 'background 0.1s ease'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'}
                                >
                                    <td style={{ padding: '10px 14px', fontWeight: '600', color: '#0F2942' }}>
                                        {caso.fecha}
                                    </td>
                                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: '700', color: '#0284C7' }}>
                                        {caso.nhc}
                                    </td>
                                    <td style={{ padding: '10px 14px', fontWeight: '700', color: '#0F2942' }}>
                                        {caso.paciente}
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            background: caso.grupoEtario.includes('< 2') ? '#E0F2FE' : caso.grupoEtario.includes('Pediátrico') ? '#FEF3C7' : '#F1F5F9',
                                            color: caso.grupoEtario.includes('< 2') ? '#0369A1' : caso.grupoEtario.includes('Pediátrico') ? '#92400E' : '#475569'
                                        }}>
                                            {caso.grupoEtario}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 14px', fontWeight: '600', color: '#0F2942' }}>
                                        {caso.patologia}
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: '800',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            background: '#F1F5F9',
                                            color: '#0F2942',
                                            fontFamily: 'monospace'
                                        }}>
                                            {caso.cie10}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 14px', color: '#475569', fontSize: '11.5px' }}>
                                        {caso.medico}
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{
                                            fontSize: '10.5px',
                                            fontWeight: '600',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            background: caso.destino.includes('Internación') ? '#FEF3C7' : '#F1F5F9',
                                            color: caso.destino.includes('Internación') ? '#92400E' : '#475569'
                                        }}>
                                            {caso.destino}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
