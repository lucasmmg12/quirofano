import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
    Activity, Calendar, Users, BarChart3, ShieldAlert,
    Download, RefreshCw, AlertCircle,
    Stethoscope, Clock, CheckCircle2, ChevronRight, Eye,
    Baby, Flame, Bug, Shield, AlertTriangle, Layers, Filter
} from 'lucide-react';
import {
    ResponsiveContainer, ComposedChart, BarChart, Bar,
    LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    Legend
} from 'recharts';

// ─── DATOS OFICIALES DE SALUS PARA VIGILANCIA EPIDEMIOLÓGICA (SANATORIO ARGENTINO) ───
// Datos mensuales consolidados (2025 - 2026) según CIE-10 en TABLEAU_Diagnosticos y motivo consulta

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
    { mes: '2026-10', label: 'Oct 2026 (En Curso)', bronquiolitis: 14, eti: 49, neumonia: 23, diarreas: 48, varicela: 5, ets: 17, total: 156 }
];

// Desglose por Centro (Mayo 2026 a Octubre 2026)
const CENTROS_EPIDEMIOLOGIA = {
    'TODOS': { bronquiolitis: 384, eti: 1086, neumonia: 468, diarreas: 530, varicela: 87, ets: 246 },
    'SANTA FE': { bronquiolitis: 268, eti: 742, neumonia: 318, diarreas: 355, varicela: 58, ets: 182 },
    'MITRE': { bronquiolitis: 116, eti: 344, neumonia: 150, diarreas: 175, varicela: 29, ets: 64 }
};

// Casos Nominales Muestrales para Auditoría y Planilla C2
const CASOS_NOMINALES_SAMPLE = [
    { fecha: '2026-10-14 09:20', nhc: '084219', paciente: 'PÉREZ SOSA, LIAM MATEO', edadMeses: 8, grupoEtario: '< 2 años (8m)', patologia: 'Bronquiolitis aguda (J21.0)', cie10: 'J21.0', medico: 'DR. ROMANO, HÉCTOR', servicio: 'Guardia Pediátrica', centro: 'SANTA FE', destino: 'Internación Observación' },
    { fecha: '2026-10-14 11:15', nhc: '109384', paciente: 'GÓMEZ QUIROGA, BENJAMÍN', edadMeses: 14, grupoEtario: '< 2 años (14m)', patologia: 'Bronquiolitis aguda (J21.9)', cie10: 'J21.9', medico: 'DRA. CARCELERO, VICTORIA', servicio: 'Guardia Pediátrica', centro: 'SANTA FE', destino: 'Ambulatorio Domicilio' },
    { fecha: '2026-10-14 14:05', nhc: '047120', paciente: 'CASTILLO, MARTA ELENA', edadMeses: 744, grupoEtario: 'Adulto (62a)', patologia: 'Neumonía bacteriana (J15.9)', cie10: 'J15.9', medico: 'DR. GEMPEL, JUAN PABLO', servicio: 'Guardia Clínica Adultos', centro: 'SANTA FE', destino: 'Internación Piso Clínico' },
    { fecha: '2026-10-13 18:40', nhc: '115429', paciente: 'ALONSO, THIAGO VALENTÍN', edadMeses: 48, grupoEtario: 'Pediátrico (4a)', patologia: 'Enfermedad Tipo Influenza / Gripe (J10.1)', cie10: 'J10.1', medico: 'DRA. POSLEMAN, MARIANA', servicio: 'Guardia Pediátrica', centro: 'MITRE', destino: 'Ambulatorio Domicilio' },
    { fecha: '2026-10-13 20:10', nhc: '098311', paciente: 'VALDEZ, FACUNDO JOAQUÍN', edadMeses: 18, grupoEtario: '< 2 años (18m)', patologia: 'Gastroenteritis aguda / Diarrea (A09)', cie10: 'A09', medico: 'DR. ROMANO, HÉCTOR', servicio: 'Guardia Pediátrica', centro: 'SANTA FE', destino: 'Hidratación Ambulatoria' },
    { fecha: '2026-10-12 10:30', nhc: '062194', paciente: 'ROBLES, MARIANELA', edadMeses: 336, grupoEtario: 'Adulto (28a)', patologia: 'Gastroenteritis aguda bacteriana (A08.4)', cie10: 'A08.4', medico: 'DR. LÓPEZ, CARLOS', servicio: 'Guardia Clínica Adultos', centro: 'SANTA FE', destino: 'Ambulatorio Domicilio' },
    { fecha: '2026-10-12 16:50', nhc: '112847', paciente: 'BAZÁN, SOFÍA LUZ', edadMeses: 72, grupoEtario: 'Pediátrico (6a)', patologia: 'Varicela sin complicaciones (B01.9)', cie10: 'B01.9', medico: 'DRA. REY DEL VALLE, MARTA', servicio: 'Guardia Pediátrica', centro: 'MITRE', destino: 'Aislamiento Domiciliario' },
    { fecha: '2026-10-11 11:45', nhc: '054921', paciente: 'MERCADO, GONZALO', edadMeses: 384, grupoEtario: 'Adulto (32a)', patologia: 'Sífilis precoz / ETS (A51.0)', cie10: 'A51.0', medico: 'DR. ROMANO, HÉCTOR', servicio: 'Consultorio Infectología', centro: 'SANTA FE', destino: 'Tratamiento Ambulatorio Penicilina' },
    { fecha: '2026-10-10 15:20', nhc: '078392', paciente: 'FERNÁNDEZ, AGUSTINA', edadMeses: 288, grupoEtario: 'Adulto (24a)', patologia: 'Infección por Chlamydia / ETS (A56.0)', cie10: 'A56.0', medico: 'DRA. SALDIVAR, DANIELA', servicio: 'Ginecología', centro: 'SANTA FE', destino: 'Tratamiento Específico' },
    { fecha: '2026-10-09 19:15', nhc: '104822', paciente: 'SANCHEZ, FELIPE', edadMeses: 11, grupoEtario: '< 2 años (11m)', patologia: 'Bronquiolitis por VRS (J21.0)', cie10: 'J21.0', medico: 'DR. ROMANO, HÉCTOR', servicio: 'Guardia Pediátrica', centro: 'SANTA FE', destino: 'Internación Observación' }
];

export default function EpidemiologiaDashboard({ 
    selectedMonth, 
    dateRange, 
    selectedCenter = 'TODOS',
    onCenterChange,
    addToast 
}) {
    const [centro, setCentro] = useState(selectedCenter);
    const [filtroPatologia, setFiltroPatologia] = useState('TODAS'); // 'TODAS' | 'BRONQUIOLITIS' | 'RESPIRATORIAS' | 'DIARREAS' | 'VARICELA' | 'ETS'
    const [filtroGrupoEtario, setFiltroGrupoEtario] = useState('TODOS');
    const [searchTerm, setSearchTerm] = useState('');

    const handleCentroChange = (newCentro) => {
        setCentro(newCentro);
        if (onCenterChange) onCenterChange(newCentro);
    };

    // KPIs calculados para el período seleccionado
    const kpis = useMemo(() => {
        const cData = CENTROS_EPIDEMIOLOGIA[centro] || CENTROS_EPIDEMIOLOGIA['TODOS'];
        const ultMes = SERIE_EPIDEMIOLOGICA_MENSUAL[SERIE_EPIDEMIOLOGICA_MENSUAL.length - 1];

        return {
            bronquiolitisMes: ultMes.bronquiolitis,
            bronquiolitisTotal: cData.bronquiolitis,
            respiratoriasMes: ultMes.eti + ultMes.neumonia,
            etiMes: ultMes.eti,
            neumoniaMes: ultMes.neumonia,
            diarreasMes: ultMes.diarreas,
            diarreasTotal: cData.diarreas,
            varicelaMes: ultMes.varicela,
            varicelaTotal: cData.varicela,
            etsMes: ultMes.ets,
            etsTotal: cData.ets,
            totalCasosMes: ultMes.total
        };
    }, [centro]);

    // Casos filtrados para la tabla nominal
    const casosFiltrados = useMemo(() => {
        return CASOS_NOMINALES_SAMPLE.filter(c => {
            if (centro !== 'TODOS' && c.centro !== centro) return false;
            if (filtroPatologia === 'BRONQUIOLITIS' && !c.patologia.toLowerCase().includes('bronquiolitis')) return false;
            if (filtroPatologia === 'RESPIRATORIAS' && !c.patologia.toLowerCase().includes('influenza') && !c.patologia.toLowerCase().includes('neumon')) return false;
            if (filtroPatologia === 'DIARREAS' && !c.patologia.toLowerCase().includes('gastroenteritis') && !c.patologia.toLowerCase().includes('diarrea')) return false;
            if (filtroPatologia === 'VARICELA' && !c.patologia.toLowerCase().includes('varicela')) return false;
            if (filtroPatologia === 'ETS' && !c.patologia.toLowerCase().includes('ets') && !c.patologia.toLowerCase().includes('sífilis') && !c.patologia.toLowerCase().includes('chlamydia')) return false;
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
    }, [centro, filtroPatologia, filtroGrupoEtario, searchTerm]);

    // Exportación a Excel para Planilla C2 (SNVS / Ministerio de Salud)
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

            const ws = XLSX.utils.json_to_sheet(worksheetData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Planilla C2 Epidemiología');
            XLSX.writeFile(wb, `Planilla_C2_Epidemiologia_Romano_${centro}_${new Date().toISOString().slice(0, 10)}.xlsx`);

            if (addToast) {
                addToast('✅ Planilla C2 de Epidemiología exportada a Excel exitosamente', 'success');
            }
        } catch (err) {
            console.error('Error exportando Excel:', err);
            if (addToast) addToast('Error al exportar planilla Excel', 'error');
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
                            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F2942', margin: 0, letterSpacing: '-0.02em' }}>
                                Vigilancia Epidemiológica y Notificación Obligatoria
                            </h1>
                        </div>
                    </div>

                    {/* Acciones */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Botón Exportar Planilla C2 */}
                        <button
                            onClick={handleExportExcelC2}
                            title="Descargar Planilla C2 en formato Excel normado"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                borderRadius: '10px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                color: '#FFFFFF',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Download size={14} />
                            <span>Exportar Planilla C2</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 5 Tarjetas Clínicas de Patologías Solicitadas por Romano */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '14px',
                marginBottom: '20px'
            }}>
                {/* 1. BRONQUIOLITIS EN MENORES DE 2 AÑOS */}
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '20px' }}>🫁</span>
                            <span style={{ fontSize: '12px', fontWeight: '800', color: '#0F2942', textTransform: 'uppercase' }}>
                                Bronquiolitis
                            </span>
                        </div>
                        <span style={{ fontSize: '11px', background: '#EFF6FF', color: '#1D4ED8', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                            &lt; 2 Años
                        </span>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#0284C7', letterSpacing: '-0.03em' }}>
                        {kpis.bronquiolitisMes} <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748B' }}>casos este mes</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px' }}>
                        Total acumulado: <strong>{kpis.bronquiolitisTotal}</strong> casos registrados
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#0369A1', marginTop: '4px', fontWeight: '600' }}>
                        CIE-10: J21.0 (VRS), J21.9
                    </div>
                </div>

                {/* 2. ETI Y NEUMONÍA */}
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '20px' }}>🌡️</span>
                            <span style={{ fontSize: '12px', fontWeight: '800', color: '#0F2942', textTransform: 'uppercase' }}>
                                ETI y Neumonía
                            </span>
                        </div>
                        <span style={{ fontSize: '11px', background: '#EFF6FF', color: '#2563EB', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                            Respiratorias
                        </span>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#1E40AF', letterSpacing: '-0.03em' }}>
                        {kpis.respiratoriasMes} <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748B' }}>este mes</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px' }}>
                        ETI (Influenza): <strong>{kpis.etiMes}</strong> | Neumonía: <strong>{kpis.neumoniaMes}</strong>
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#2563EB', marginTop: '4px', fontWeight: '600' }}>
                        CIE-10: J10-J18, J09
                    </div>
                </div>

                {/* 3. GASTROENTÉRICAS: DIARREAS AGUDAS */}
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '20px' }}>🦠</span>
                            <span style={{ fontSize: '12px', fontWeight: '800', color: '#0F2942', textTransform: 'uppercase' }}>
                                Diarreas Agudas
                            </span>
                        </div>
                        <span style={{ fontSize: '11px', background: '#FEF3C7', color: '#B45309', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                            Gastroentéricas
                        </span>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#B45309', letterSpacing: '-0.03em' }}>
                        {kpis.diarreasMes} <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748B' }}>este mes</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px' }}>
                        Total acumulado: <strong>{kpis.diarreasTotal}</strong> episodios
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#D97706', marginTop: '4px', fontWeight: '600' }}>
                        CIE-10: A09, A08, K52
                    </div>
                </div>

                {/* 4. VARICELA */}
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '20px' }}>🩺</span>
                            <span style={{ fontSize: '12px', fontWeight: '800', color: '#0F2942', textTransform: 'uppercase' }}>
                                Varicela
                            </span>
                        </div>
                        <span style={{ fontSize: '11px', background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                            Inmunoprevenible
                        </span>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#DC2626', letterSpacing: '-0.03em' }}>
                        {kpis.varicelaMes} <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748B' }}>este mes</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px' }}>
                        Total acumulado: <strong>{kpis.varicelaTotal}</strong> casos
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#DC2626', marginTop: '4px', fontWeight: '600' }}>
                        CIE-10: B01, B01.9
                    </div>
                </div>

                {/* 5. ENFERMEDADES DE TRANSMISIÓN SEXUAL (ETS) */}
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '20px' }}>🛡️</span>
                            <span style={{ fontSize: '12px', fontWeight: '800', color: '#0F2942', textTransform: 'uppercase' }}>
                                ETS / ITS
                            </span>
                        </div>
                        <span style={{ fontSize: '11px', background: '#F3E8FF', color: '#7C3AED', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                            Transmisión Sexual
                        </span>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#7C3AED', letterSpacing: '-0.03em' }}>
                        {kpis.etsMes} <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748B' }}>este mes</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px' }}>
                        Total acumulado: <strong>{kpis.etsTotal}</strong> asistencias
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#7C3AED', marginTop: '4px', fontWeight: '600' }}>
                        CIE-10: A50-A64 (Sífilis, Gonorrea, Clamidia)
                    </div>
                </div>
            </div>

            {/* Gráficos de Curva Epidemiológica y Distribución */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
                gap: '16px',
                marginBottom: '20px'
            }}>
                {/* Gráfico 1: Evolución Temporal Mensual */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '20px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F2942', margin: 0 }}>
                                Curva Epidemiológica Mensual (CIE-10 SALUS)
                            </h3>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>
                                Tendencia estacional y brotes por grupo patológico
                            </span>
                        </div>
                    </div>
                    <div style={{ width: '100%', height: '280px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={SERIE_EPIDEMIOLOGICA_MENSUAL}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                                <RechartsTooltip 
                                    contentStyle={{ background: '#0F2942', borderRadius: '8px', color: '#FFFFFF', border: 'none', fontSize: '12px' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <Area type="monotone" dataKey="eti" name="ETI (Influenza)" fill="#BAE6FD" stroke="#0284C7" strokeWidth={2} />
                                <Line type="monotone" dataKey="bronquiolitis" name="Bronquiolitis (<2a)" stroke="#DC2626" strokeWidth={3} dot={{ r: 4 }} />
                                <Bar dataKey="diarreas" name="Diarreas Agudas" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                                <Line type="monotone" dataKey="ets" name="ETS / ITS" stroke="#7C3AED" strokeWidth={2} strokeDasharray="4 4" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Gráfico 2: Distribución por Grupo Etario y Patología */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '20px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F2942', margin: 0 }}>
                                Proporción Etaria de Notificaciones
                            </h3>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>
                                Lactantes (&lt;24 meses), Pediátricos (2 a 14 años) y Adultos (≥15 años)
                            </span>
                        </div>
                    </div>
                    <div style={{ width: '100%', height: '280px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[
                                { patologia: 'Bronquiolitis', lactantes: 100, pediatricos: 0, adultos: 0 },
                                { patologia: 'ETI / Gripe', lactantes: 18, pediatricos: 48, adultos: 34 },
                                { patologia: 'Neumonía', lactantes: 14, pediatricos: 32, adultos: 54 },
                                { patologia: 'Diarreas', lactantes: 28, pediatricos: 36, adultos: 36 },
                                { patologia: 'Varicela', lactantes: 8, pediatricos: 82, adultos: 10 },
                                { patologia: 'ETS / ITS', lactantes: 0, pediatricos: 1, adultos: 99 }
                            ]}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                <XAxis dataKey="patologia" tick={{ fontSize: 11, fill: '#64748B' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} unit="%" />
                                <RechartsTooltip 
                                    contentStyle={{ background: '#0F2942', borderRadius: '8px', color: '#FFFFFF', border: 'none', fontSize: '12px' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <Bar dataKey="lactantes" name="% Lactantes (<2a)" stackId="a" fill="#0284C7" />
                                <Bar dataKey="pediatricos" name="% Pediátricos (2-14a)" stackId="a" fill="#38BDF8" />
                                <Bar dataKey="adultos" name="% Adultos (≥15a)" stackId="a" fill="#0F2942" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Tabla Nominal de Casos y Auditoría Forense */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                overflow: 'hidden'
            }}>
                {/* Header de la Tabla con Buscador y Filtros */}
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
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                background: '#FFFFFF',
                                fontSize: '12px',
                                color: '#334155',
                                outline: 'none'
                            }}
                        >
                            <option value="TODOS">Todas las edades</option>
                            <option value="<2">Menores de 2 años</option>
                            <option value="pediatrico">Pediátricos (2-14a)</option>
                            <option value="adulto">Adultos (≥15a)</option>
                        </select>

                        {/* Buscador */}
                        <input
                            type="text"
                            placeholder="Buscar paciente, NHC, CIE-10..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '12px',
                                outline: 'none',
                                width: '220px'
                            }}
                        />
                    </div>
                </div>

                {/* Tabla de Datos */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: '700' }}>
                                <th style={{ padding: '10px 14px' }}>Fecha Visita</th>
                                <th style={{ padding: '10px 14px' }}>Centro</th>
                                <th style={{ padding: '10px 14px' }}>NHC</th>
                                <th style={{ padding: '10px 14px' }}>Paciente</th>
                                <th style={{ padding: '10px 14px' }}>Grupo Etario</th>
                                <th style={{ padding: '10px 14px' }}>Patología & CIE-10</th>
                                <th style={{ padding: '10px 14px' }}>Médico Tratante</th>
                                <th style={{ padding: '10px 14px' }}>Destino Post-Atención</th>
                            </tr>
                        </thead>
                        <tbody>
                            {casosFiltrados.map((caso, i) => (
                                <tr 
                                    key={i} 
                                    style={{ 
                                        borderBottom: '1px solid #F1F5F9',
                                        background: i % 2 === 0 ? '#FFFFFF' : '#FBFDFF',
                                        transition: 'background 0.1s ease'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#F0F9FF'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? '#FFFFFF' : '#FBFDFF'}
                                >
                                    <td style={{ padding: '10px 14px', color: '#64748B', whiteSpace: 'nowrap' }}>
                                        {caso.fecha}
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{
                                            fontSize: '10.5px',
                                            fontWeight: '700',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            background: caso.centro === 'SANTA FE' ? '#EFF6FF' : '#F0FDF4',
                                            color: caso.centro === 'SANTA FE' ? '#1D4ED8' : '#15803D'
                                        }}>
                                            {caso.centro}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 14px', fontWeight: '700', color: '#0F2942' }}>
                                        {caso.nhc}
                                    </td>
                                    <td style={{ padding: '10px 14px', fontWeight: '800', color: '#0F2942' }}>
                                        {caso.paciente}
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            color: caso.grupoEtario.includes('< 2') ? '#DC2626' : '#475569'
                                        }}>
                                            {caso.grupoEtario}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <div style={{ fontWeight: '700', color: '#0F2942' }}>
                                            {caso.patologia}
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 14px', color: '#334155' }}>
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
