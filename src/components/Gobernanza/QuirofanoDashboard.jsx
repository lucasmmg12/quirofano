import React, { useState, useMemo } from 'react';
import { 
    Activity, Clock, CheckCircle2, AlertTriangle, 
    Calendar, RefreshCw, TrendingUp, Users,
    BarChart3, Eye, ShieldCheck, ChevronRight,
    Scissors, Stethoscope, Droplets, Building2, Flame, Check,
    AlertCircle, FileText, ArrowUpRight, ArrowDownRight, Layers, UserCheck
} from 'lucide-react';
import {
    ResponsiveContainer,
    ComposedChart,
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend
} from 'recharts';
import './Gobernanza.css';

// ─── DATOS REALES EXTRAÍDOS DE TABLEAU INSTITUCIONAL (SANATORIO ARGENTINO) ───

// Ocupación por Sala (Mayo 2026)
const SALAS_DATA = [
    { sala: 'Qx 1', nombre: 'Quirófano 1 (Mayor / Láser)', cirugias: 142, horas: 326.5, ocupacionPct: 88.4, color: '#1E40AF' },
    { sala: 'Qx 2', nombre: 'Quirófano 2 (Cirugía General)', cirugias: 135, horas: 298.0, ocupacionPct: 84.2, color: '#2563EB' },
    { sala: 'Qx 3', nombre: 'Quirófano 3 (Traumatología / Ortopedia)', cirugias: 128, horas: 284.5, ocupacionPct: 81.5, color: '#3B82F6' },
    { sala: 'Qx 4', nombre: 'Quirófano 4 (Gineco-Obstetricia)', cirugias: 131, horas: 275.0, ocupacionPct: 82.8, color: '#60A5FA' },
    { sala: 'Qx 5 - HdD', nombre: 'Quirófano 5 (Hospital de Día)', cirugias: 82, horas: 164.0, ocupacionPct: 68.3, color: '#059669' },
    { sala: 'Qx 6 - HdD', nombre: 'Quirófano 6 (Endoscopía HdD)', cirugias: 74, horas: 142.5, ocupacionPct: 62.0, color: '#10B981' },
    { sala: 'SALA DE PARTO', nombre: 'Sala de Partos', cirugias: 21, horas: 45.0, ocupacionPct: 45.0, color: '#F59E0B' }
];

// Ranking de Cirujanos (Mayo 2026)
const CIRUJANOS_DATA = [
    { nombre: 'GALVARINI RECABARREN, MARTIN', especialidad: 'Gastroenterología / Endoscopía', programadas: 32, realizadas: 31, suspendidas: 1, pctTotal: 4.79, pctSuspension: 3.1 },
    { nombre: 'PONCE GRANADOS, MARCELO', especialidad: 'Gastroenterología / Endoscopía', programadas: 30, realizadas: 29, suspendidas: 1, pctTotal: 4.48, pctSuspension: 3.3 },
    { nombre: 'GEMPEL, JUAN PABLO', especialidad: 'Cirugía General', programadas: 29, realizadas: 28, suspendidas: 1, pctTotal: 4.33, pctSuspension: 3.4 },
    { nombre: 'KERMAN GADO, JAVIER', especialidad: 'Cirugía General / Laparoscópica', programadas: 24, realizadas: 22, suspendidas: 2, pctTotal: 3.40, pctSuspension: 8.3 },
    { nombre: 'GEMPEL, DIEGO', especialidad: 'Cirugía General', programadas: 19, realizadas: 18, suspendidas: 1, pctTotal: 2.78, pctSuspension: 5.3 },
    { nombre: 'BALMACEDA, RUBEN DARIO', especialidad: 'Ginecología', programadas: 20, realizadas: 18, suspendidas: 2, pctTotal: 2.78, pctSuspension: 10.0 },
    { nombre: 'MUÑOZ CARRATU, MATIAS ALEJANDRO', especialidad: 'Ortopedia y Traumatología', programadas: 19, realizadas: 17, suspendidas: 2, pctTotal: 2.63, pctSuspension: 10.5 },
    { nombre: 'CORTINEZ, ESTEBAN', especialidad: 'Urología', programadas: 18, realizadas: 16, suspendidas: 2, pctTotal: 2.47, pctSuspension: 11.1 },
    { nombre: 'AZURI, WADI', especialidad: 'Urología / Láser', programadas: 18, realizadas: 16, suspendidas: 2, pctTotal: 2.47, pctSuspension: 11.1 },
    { nombre: 'RANEA SENTAGNE, ROBERTO ESTEBAN', especialidad: 'Ginecología', programadas: 15, realizadas: 13, suspendidas: 2, pctTotal: 2.01, pctSuspension: 13.3 },
    { nombre: 'GOMEZ RODRIGO, MARIA SOL', especialidad: 'Fertilidad / Ginecología', programadas: 14, realizadas: 13, suspendidas: 1, pctTotal: 2.01, pctSuspension: 7.1 },
    { nombre: 'ZINI, MIGUEL ERNESTO', especialidad: 'Cirugía General', programadas: 13, realizadas: 12, suspendidas: 1, pctTotal: 1.85, pctSuspension: 7.7 },
    { nombre: 'SALDIVAR OZAN, DANIELA VERONICA', especialidad: 'Cirugía Plástica', programadas: 13, realizadas: 11, suspendidas: 2, pctTotal: 1.70, pctSuspension: 15.4 },
    { nombre: 'MARTI, JUAN JOSE', especialidad: 'Ortopedia y Traumatología', programadas: 12, realizadas: 11, suspendidas: 1, pctTotal: 1.70, pctSuspension: 8.3 },
    { nombre: 'MARINO, JORGE SANTIAGO', especialidad: 'Cirugía Cardiovascular', programadas: 12, realizadas: 11, suspendidas: 1, pctTotal: 1.70, pctSuspension: 8.3 },
    { nombre: 'HERRERO, CARLOS ESTEBAN', especialidad: 'Cirugía Pediátrica', programadas: 12, realizadas: 11, suspendidas: 1, pctTotal: 1.70, pctSuspension: 8.3 },
    { nombre: 'HERRERO ARCHILLA, RAMON AGUEDO', especialidad: 'Cirugía Pediátrica', programadas: 12, realizadas: 11, suspendidas: 1, pctTotal: 1.70, pctSuspension: 8.3 },
    { nombre: 'ANTEQUEDA, PABLO ALEJANDRO', especialidad: 'Cirugía General', programadas: 12, realizadas: 11, suspendidas: 1, pctTotal: 1.70, pctSuspension: 8.3 }
];

// Ranking de Especialidades
const ESPECIALIDADES_DATA = [
    { nombre: 'CIRUGIA GENERAL', cant: 153, pct: 23.6, color: '#1E40AF' },
    { nombre: 'GINECOLOGIA', cant: 146, pct: 22.6, color: '#2563EB' },
    { nombre: 'OBSTETRICIA', cant: 131, pct: 20.2, color: '#3B82F6' },
    { nombre: 'GASTROENTEROLOGIA', cant: 49, pct: 7.6, color: '#059669' },
    { nombre: 'FERTILIDAD', cant: 41, pct: 6.3, color: '#10B981' },
    { nombre: 'ORTOPEDIA / TRAUMATOLOGIA', cant: 38, pct: 5.9, color: '#D97706' },
    { nombre: 'UROLOGIA', cant: 33, pct: 5.1, color: '#F59E0B' },
    { nombre: 'CIRUGIA PEDIATRICA', cant: 24, pct: 3.7, color: '#8B5CF6' },
    { nombre: 'CIRUGIA PLASTICA', cant: 23, pct: 3.6, color: '#EC4899' },
    { nombre: 'OTORRINOLARINGOLOGIA', cant: 4, pct: 0.6, color: '#64748B' },
    { nombre: 'CIRUGIA CARDIOVASCULAR', cant: 4, pct: 0.6, color: '#DC2626' },
    { nombre: 'CIRUGIA MAXILOFACIAL', cant: 1, pct: 0.2, color: '#94A3B8' }
];

// Ranking por Obras Sociales
const OBRAS_SOCIALES_DATA = [
    { nombre: '001 - PROVINCIA (OSP)', cant: 269, pct: 41.6, color: '#1E40AF' },
    { nombre: '005 - OSDE BINARIO', cant: 83, pct: 12.8, color: '#2563EB' },
    { nombre: 'PARTICULAR', cant: 55, pct: 8.5, color: '#3B82F6' },
    { nombre: '135 - JERARQUICOS SALUD', cant: 49, pct: 7.6, color: '#059669' },
    { nombre: '004 - DAMSU', cant: 34, pct: 5.3, color: '#10B981' },
    { nombre: '121 - SWISS MEDICAL S.A.', cant: 30, pct: 4.6, color: '#D97706' },
    { nombre: '200 - ASOCIACION MUTUAL SANCOR', cant: 26, pct: 4.0, color: '#F59E0B' },
    { nombre: '237 - OSPE - OBRA SOCIAL PETROLEROS', cant: 15, pct: 2.3, color: '#8B5CF6' },
    { nombre: '065 - OMINT S.A.', cant: 14, pct: 2.2, color: '#EC4899' },
    { nombre: '076 - MEDIFE ASOCIACION CIVIL', cant: 12, pct: 1.9, color: '#64748B' },
    { nombre: '631 - SANCOR SALUD PLANES', cant: 6, pct: 0.9, color: '#0284C7' },
    { nombre: '644 - OSSACRA', cant: 5, pct: 0.8, color: '#475569' }
];

// Catálogo Oficial Numerado de Motivos de Suspensión (Tableau 1..13)
const MOTIVOS_SUSPENSION_OFICIAL = [
    { codigo: 1, motivo: '1. Cx Reprogramada', cantidad: 20, pct: 8.0, color: '#3B82F6', tipo: 'OPERATIVO' },
    { codigo: 2, motivo: '2. No autorizada por Obra social', cantidad: 54, pct: 21.6, color: '#EF4444', tipo: 'FINANCIADOR' },
    { codigo: 3, motivo: '3. Ya fue realizado', cantidad: 8, pct: 3.2, color: '#10B981', tipo: 'ADMINISTRATIVO' },
    { codigo: 4, motivo: '4. Paciente enfermo', cantidad: 31, pct: 12.4, color: '#F59E0B', tipo: 'CLINICO' },
    { codigo: 5, motivo: '5. Paciente sin prequirúrgicos', cantidad: 1, pct: 0.4, color: '#8B5CF6', tipo: 'CLINICO' },
    { codigo: 6, motivo: '6. Paciente sin ayuno', cantidad: 14, pct: 5.6, color: '#EC4899', tipo: 'PREPARACION' },
    { codigo: 7, motivo: '7. Otro motivo de paciente', cantidad: 61, pct: 24.4, color: '#1E40AF', tipo: 'PACIENTE' },
    { codigo: 8, motivo: '8. Otro motivo de cirujanos', cantidad: 13, pct: 5.2, color: '#0D9488', tipo: 'CIRUJANO' },
    { codigo: 9, motivo: '9. Motivos económicos', cantidad: 14, pct: 5.6, color: '#D97706', tipo: 'ADMINISTRATIVO' },
    { codigo: 10, motivo: '10. Ortopedia / Prótesis', cantidad: 10, pct: 4.0, color: '#6366F1', tipo: 'PROVEEDOR' },
    { codigo: 13, motivo: '13. Otros (técnicos/edilicios)', cantidad: 4, pct: 1.6, color: '#64748B', tipo: 'INFRAESTRUCTURA' }
];

// Matriz Histórica de Suspensiones Enero-Mayo
const MOTIVOS_SUSPENSION_DATA = [
    { motivo: 'Otros motivos paciente', total: 122, pct: 27, ene: 20, feb: 21, mar: 24, abr: 21, may: 36, tipo: 'PACIENTE' },
    { motivo: 'Ya fue realizada', total: 82, pct: 18, ene: 14, feb: 16, mar: 21, abr: 20, may: 11, tipo: 'ADMINISTRATIVO' },
    { motivo: 'No autorizada por obra social', total: 75, pct: 17, ene: 12, feb: 17, mar: 5, abr: 16, may: 25, tipo: 'FINANCIADOR' },
    { motivo: 'Motivos Económicos', total: 35, pct: 8, ene: 4, feb: 7, mar: 9, abr: 7, may: 8, tipo: 'PACIENTE' },
    { motivo: 'NULL (Sin especificar)', total: 32, pct: 7, ene: 1, feb: 7, mar: 11, abr: 9, may: 4, tipo: 'DESVIO' },
    { motivo: 'Paciente enfermo', total: 32, pct: 7, ene: 4, feb: 4, mar: 1, abr: 12, may: 11, tipo: 'CLINICO' },
    { motivo: 'Reprogramada', total: 29, pct: 6, ene: 5, feb: 3, mar: 7, abr: 9, may: 5, tipo: 'GESTION' },
    { motivo: 'Otros motivos cirujano', total: 21, pct: 5, ene: 3, feb: 5, mar: 4, abr: 5, may: 4, tipo: 'CIRUJANO' },
    { motivo: 'Ortopedia (Prótesis)', total: 14, pct: 3, ene: 2, feb: 2, mar: 2, abr: 4, may: 4, tipo: 'PROVEEDOR' },
    { motivo: 'Paciente sin prequirúrgicos', total: 3, pct: 1, ene: 0, feb: 0, mar: 0, abr: 0, may: 3, tipo: 'CLINICO' },
    { motivo: 'Paciente sin el ayuno correspondiente', total: 2, pct: 0, ene: 1, feb: 0, mar: 1, abr: 0, may: 0, tipo: 'PACIENTE' }
];

// 👶 Demografía de Pacientes (Pico Materno-Ginecológico Sanatorio Argentino)
const EDADES_PACIENTES_DATA = [
    { rango: '0 - 9', edad: '0', cantidad: 339, color: '#38BDF8' },
    { rango: '10 - 19', edad: '10', cantidad: 494, color: '#0EA5E9' },
    { rango: '20 - 29', edad: '20', cantidad: 1429, color: '#0284C7' },
    { rango: '30 - 39', edad: '30', cantidad: 2980, color: '#1E40AF', pico: true }, // PICO SANATORIO ARGENTINO
    { rango: '40 - 49', edad: '40', cantidad: 1772, color: '#2563EB' },
    { rango: '50 - 59', edad: '50', cantidad: 1103, color: '#3B82F6' },
    { rango: '60 - 69', edad: '60', cantidad: 777, color: '#60A5FA' },
    { rango: '70 - 79', edad: '70', cantidad: 595, color: '#93C5FD' },
    { rango: '80 - 89', edad: '80', cantidad: 202, color: '#CBD5E1' },
    { rango: '90+', edad: '90', cantidad: 8, color: '#94A3B8' }
];

// Nomenclador Quirúrgico: Top Cirugías Realizadas
const TOP_PROCEDIMIENTOS_REALIZADOS = [
    { nombre: '(CX) CESAREA', cantidad: 2113, especialidad: 'Obstetricia', participacion: '31.2%' },
    { nombre: '(CX) HISTEROSCOPIA QUIRURGICA', cantidad: 723, especialidad: 'Ginecología', participacion: '10.7%' },
    { nombre: '(CX) FIBROENDOSCOPIA DIGESTIVA', cantidad: 547, especialidad: 'Gastroenterología', participacion: '8.1%' },
    { nombre: '(CX) COLECISTECTOMIA LAPAROSCOPICA', cantidad: 449, especialidad: 'Cirugía General', participacion: '6.6%' },
    { nombre: '(CX) PARTO NORMAL', cantidad: 234, especialidad: 'Obstetricia', participacion: '3.5%' },
    { nombre: '(CX) RASPADO UTERINO TERAPEUTICO', cantidad: 206, especialidad: 'Ginecología', participacion: '3.0%' },
    { nombre: '(CX) LAPAROSCOPIA QUIRURGICA GINEC.', cantidad: 192, especialidad: 'Ginecología', participacion: '2.8%' },
    { nombre: '(CX) HISTERECTOMIA C/S ANEXECTOMIA', cantidad: 189, especialidad: 'Ginecología', participacion: '2.8%' }
];

// Top Procedimientos Suspendidos
const TOP_PROCEDIMIENTOS_SUSPENDIDOS = [
    { nombre: '(CX) CESAREA', suspendidas: 306, realizadas: 2113, tasaSuspension: '12.6%' },
    { nombre: '(CX) HISTEROSCOPIA QUIRURGICA', suspendidas: 252, realizadas: 723, tasaSuspension: '25.8%' },
    { nombre: '(CX) COLECISTECTOMIA LAPAROSCOPICA', suspendidas: 138, realizadas: 449, tasaSuspension: '23.5%' },
    { nombre: '(CX) FIBROENDOSCOPIA DIGESTIVA ALTA', suspendidas: 110, realizadas: 547, tasaSuspension: '16.7%' },
    { nombre: '(CX) VASECTOMIA', suspendidas: 85, realizadas: 145, tasaSuspension: '36.9%' },
    { nombre: '(CX) LAPAROSCOPIA EN OVARIO/UTERO', suspendidas: 74, realizadas: 192, tasaSuspension: '27.8%' },
    { nombre: '(CX) SAFENECTOMIA UNI O BILATERAL', suspendidas: 60, realizadas: 128, tasaSuspension: '31.9%' },
    { nombre: '(CX) CUADRANTECTOMIA / TUMORECTOMIA', suspendidas: 50, realizadas: 115, tasaSuspension: '30.3%' },
    { nombre: '(CX) SAFENECTOMIA INTERNA / EXTERNA', suspendidas: 49, realizadas: 104, tasaSuspension: '32.0%' },
    { nombre: '(CX) HISTERECTOMIA C/S ANEXECTOMIA', suspendidas: 48, realizadas: 189, tasaSuspension: '20.2%' }
];

// Cirugías por Especialidad Acumulado Anual
const ESPECIALIDADES_ACUMULADO = [
    { especialidad: 'GINECOLOGIA', cantidad: 4796, pct: 54.4 },
    { especialidad: 'CIRUGIA GENERAL', cantidad: 1830, pct: 20.8 },
    { especialidad: 'GASTROENTEROLOGIA', cantidad: 854, pct: 9.7 },
    { especialidad: 'UROLOGIA', cantidad: 552, pct: 6.3 },
    { especialidad: 'CIRUGIA PEDIATRICA', cantidad: 430, pct: 4.9 },
    { especialidad: 'ORTOPEDIA / TRAUMATOLOGIA', cantidad: 398, pct: 4.5 },
    { especialidad: 'FERTILIDAD', cantidad: 387, pct: 4.4 },
    { especialidad: 'CIRUGIA PLASTICA', cantidad: 217, pct: 2.5 },
    { especialidad: 'OTORRINOLARINGOLOGIA', cantidad: 86, pct: 1.0 },
    { especialidad: 'CIRUGIA MAXILOFACIAL', cantidad: 67, pct: 0.8 },
    { especialidad: 'NEUROCIRUGIA', cantidad: 37, pct: 0.4 },
    { especialidad: 'CIRUGIA CARDIOVASCULAR', cantidad: 33, pct: 0.4 },
    { especialidad: 'CARDIOLOGIA', cantidad: 7, pct: 0.1 },
    { especialidad: 'GASTROENTEROLOGIA INFANTIL', cantidad: 2, pct: 0.02 },
    { especialidad: 'DERMATOLOGIA', cantidad: 1, pct: 0.01 }
];

// 🚨 Asistencia de Cirugías: Programadas (Presente) vs URGENCIA
const TENDENCIA_ASISTENCIA_DATA = [
    { mes: '2025-01', presentes: 462, urgencias: 55, total: 517 },
    { mes: '2025-02', presentes: 554, urgencias: 49, total: 603 },
    { mes: '2025-03', presentes: 543, urgencias: 46, total: 589 },
    { mes: '2025-04', presentes: 609, urgencias: 52, total: 661 },
    { mes: '2025-05', presentes: 646, urgencias: 76, total: 722 },
    { mes: '2025-06', presentes: 569, urgencias: 51, total: 620 },
    { mes: '2025-07', presentes: 682, urgencias: 61, total: 743 },
    { mes: '2025-08', presentes: 713, urgencias: 54, total: 767 },
    { mes: '2025-09', presentes: 666, urgencias: 38, total: 704 },
    { mes: '2025-10', presentes: 619, urgencias: 58, total: 677 },
    { mes: '2025-11', presentes: 595, urgencias: 41, total: 636 },
    { mes: '2025-12', presentes: 610, urgencias: 37, total: 647 },
    { mes: '2026-01', presentes: 516, urgencias: 52, total: 568 },
    { mes: '2026-02', presentes: 560, urgencias: 38, total: 598 },
    { mes: '2026-03', presentes: 595, urgencias: 52, total: 647 }
];

// Responsables Médicos: Presentes vs Urgencia (Tableau)
const RESPONSABLES_URGENCIA_DATA = [
    { cirujano: 'PONCE GRANADOS, MARCELO', presentes: 535, urgencias: 3, total: 538, pctUrg: 0.6 },
    { cirujano: 'GALVARINI RECABARREN, MARTIN', presentes: 368, urgencias: 5, total: 373, pctUrg: 1.3 },
    { cirujano: 'GEMPEL, JUAN PABLO', presentes: 352, urgencias: 10, total: 362, pctUrg: 2.8 },
    { cirujano: 'KERMAN CABO, JAVIER', presentes: 210, urgencias: 3, total: 213, pctUrg: 1.4 },
    { cirujano: 'SALDIVAR OZAN, DANIELA VERO..', presentes: 192, urgencias: 50, total: 242, pctUrg: 20.7, nota: 'Líder en Absorción de Guardia/Urgencia' },
    { cirujano: 'MUÑOZ CARRATU, MATIAS ALEJ..', presentes: 179, urgencias: 1, total: 180, pctUrg: 0.6 },
    { cirujano: 'AZURI, WADI', presentes: 171, urgencias: 10, total: 181, pctUrg: 5.5 },
    { cirujano: 'BALMACEDA, RUBEN DARIO', presentes: 169, urgencias: 5, total: 174, pctUrg: 2.9 },
    { cirujano: 'AFFRONTI, LEONARDO', presentes: 169, urgencias: 7, total: 176, pctUrg: 4.0 },
    { cirujano: 'GEMPEL, DIEGO', presentes: 164, urgencias: 5, total: 169, pctUrg: 3.0 },
    { cirujano: 'ZINI, MIGUEL ERNESTO', presentes: 147, urgencias: 7, total: 154, pctUrg: 4.5 },
    { cirujano: 'HERRERO, CARLOS ESTEBAN', presentes: 147, urgencias: 5, total: 152, pctUrg: 3.3 },
    { cirujano: 'SCARSO, CARLOS NELSON', presentes: 139, urgencias: 2, total: 141, pctUrg: 1.4 },
    { cirujano: 'BUTELER GORANSKY, MARIA AG..', presentes: 133, urgencias: 2, total: 135, pctUrg: 1.5 },
    { cirujano: 'MARINO, JORGE SANTIAGO', presentes: 125, urgencias: 10, total: 135, pctUrg: 7.4 },
    { cirujano: 'ZALAZAR, MARCELO ANDRES', presentes: 119, urgencias: 1, total: 120, pctUrg: 0.8 },
    { cirujano: 'MEDARD, PABLO DANIEL', presentes: 112, urgencias: 3, total: 115, pctUrg: 2.6 }
];

// Ciclo de Vida General de Cirugías
const CICLO_VIDA_KPIS = {
    totalRealizadas: 5618,
    totalReprogramadas: 587,
    totalSuspendidas: 306,
    tasaSuspensionNeta: '5,17%'
};

// Productividad de Equipos
const EQUIPOS_DATA = {
    circulantes: [
        { nombre: 'VILLEGAS CORTEZ, DAYANA JANET', cant: 181 },
        { nombre: 'GOMEZ, MICAELA NAHIR', cant: 167 },
        { nombre: 'OVIEDO, AGOSTINA MILAGRO', cant: 162 },
        { nombre: 'CACERES, MARIA CRISTINA', cant: 161 },
        { nombre: 'RAMIREZ BASINAY, CELINA MARI...', cant: 148 },
        { nombre: 'RUARTE, ANA LOURDES', cant: 140 },
        { nombre: 'FLORES, CAMILA MARIA DEL CIELO', cant: 119 },
        { nombre: 'HERRMANN, PAULA MICAELA', cant: 115 },
        { nombre: 'GUARDIA CASTILLO, GEMMA MAR...', cant: 112 },
        { nombre: 'MUÑOZ, JULIETA ANALIA', cant: 102 }
    ],
    tecnicosAnestesia: [
        { nombre: 'FERRA, PATRICIA YAEL', cant: 232 },
        { nombre: 'RIVERO RUIZ, NANCY LILIANA', cant: 219 },
        { nombre: 'HERRERA ESCRIVA, JOSE FRA...', cant: 217 },
        { nombre: 'FERNANDEZ, EDUARDO SAM...', cant: 216 },
        { nombre: 'RIVEROS DIAZ, NOEMI DEL V...', cant: 193 },
        { nombre: 'ALMAGRO, MELINA', cant: 182 },
        { nombre: 'JOFRE, LUDMILA ORIANA', cant: 156 },
        { nombre: 'LUNA, MELISA ELIANA', cant: 155 }
    ],
    anestesistas: [
        { nombre: 'MONTILLA DEL PIF, GONZALO (Grupo)', cant: 227, grupo: 'Planta' },
        { nombre: 'QUIROGA, JORGE ALEJAND... (Grupo)', cant: 179, grupo: 'Planta' },
        { nombre: 'CASANOVA, MARCELO (Grupo)', cant: 176, grupo: 'Planta' },
        { nombre: 'MARTINEZ, ALFREDO OSCAR (Grupo)', cant: 166, grupo: 'Planta' },
        { nombre: 'ORELLANO, FASSAEL (Grupo)', cant: 159, grupo: 'Planta' },
        { nombre: 'SZRETTER, ALBERTO FEDER... (Grupo)', cant: 117, grupo: 'Planta' },
        { nombre: 'SOTARELLO, PATRICIO (Guardia)', cant: 97, grupo: 'Guardia' },
        { nombre: 'SCHIAVI GUERRERO, GUIDO... (Guardia)', cant: 80, grupo: 'Guardia' },
        { nombre: 'VARAS BERESVIL, PEDRO B... (Guardia)', cant: 77, grupo: 'Guardia' }
    ],
    instrumentadores: [
        { nombre: 'SANTAMARIA, GRACIELA HELENA', cant: 178 },
        { nombre: 'CASTRO, ANA DE BELEN', cant: 169 },
        { nombre: 'VERA, GRACIELA LAURA', cant: 137 },
        { nombre: 'ROLLIN FABIANA', cant: 134 },
        { nombre: 'SILVA, JOSE ALFREDO', cant: 128 },
        { nombre: 'PEREZ, TALIA GISELLE', cant: 121 },
        { nombre: 'RODRIGUEZ OVIEDO, GISELA EVELIN', cant: 107 },
        { nombre: 'DIAZ, MARIA BELEN', cant: 103 }
    ]
};

// Evolución Interanual Quirófano Central vs Hospital de Día (2022 - 2026)
const INTERANUAL_DATA = [
    { mes: 'Ene', a2022: 439, a2023: 548, a2024: 587, a2025: 533, a2026: 603, central2026: 523, hdd2026: 80 },
    { mes: 'Feb', a2022: 611, a2023: 657, a2024: 542, a2025: 637, a2026: 645, central2026: 498, hdd2026: 147 },
    { mes: 'Mar', a2022: 781, a2023: 752, a2024: 660, a2025: 601, a2026: 679, central2026: 514, hdd2026: 165 },
    { mes: 'Abr', a2022: 705, a2023: 729, a2024: 587, a2025: 682, a2026: 672, central2026: 510, hdd2026: 162 },
    { mes: 'May', a2022: 748, a2023: 773, a2024: 664, a2025: 749, a2026: 673, central2026: 500, hdd2026: 173 },
    { mes: 'Jun', a2022: 689, a2023: 762, a2024: 606, a2025: 643, a2026: 662, central2026: 539, hdd2026: 123 },
    { mes: 'Jul', a2022: 726, a2023: 779, a2024: 681, a2025: 699, a2026: 697, central2026: 541, hdd2026: 156 },
    { mes: 'Ago', a2022: 765, a2023: 824, a2024: 721, a2025: 788, a2026: 678, central2026: 502, hdd2026: 176 },
    { mes: 'Sep', a2022: 688, a2023: 794, a2024: 679, a2025: 741, a2026: 646, central2026: 498, hdd2026: 148 },
    { mes: 'Oct', a2022: 723, a2023: 803, a2024: 723, a2025: 760, a2026: 72, central2026: 55, hdd2026: 17 }
];

// Matriz de Bloques Quirúrgicos
const BLOQUES_DATA = [
    { cirujano: 'Dr. Matías Muñoz Carratú', quirofano: 'Qx 1', dia: 'Miércoles', horario: '08:00 - 13:00 (5h)', horasMes: 21.6, horasUso: 17.5, horasOciosas: 4.1, ocupacionPct: 81.0, estado7dias: 'COMPLETO', alerta: false },
    { cirujano: 'Dr. Marcelo Ponce', quirofano: 'HdD (Qx 6)', dia: 'Lunes', horario: '08:00 - 12:30 (4.5h)', horasMes: 19.5, horasUso: 18.0, horasOciosas: 1.5, ocupacionPct: 92.3, estado7dias: 'COMPLETO', alerta: false },
    { cirujano: 'Dr. Martín Galvarini', quirofano: 'HdD (Qx 6)', dia: 'Viernes', horario: '08:00 - 13:00 (5h)', horasMes: 21.6, horasUso: 20.0, horasOciosas: 1.6, ocupacionPct: 92.6, estado7dias: 'COMPLETO', alerta: false },
    { cirujano: 'Dr. Wadi Azuri', quirofano: 'Qx 1 (Láser)', dia: 'Sábado', horario: '08:00 - 13:00 (5h)', horasMes: 21.6, horasUso: 15.0, horasOciosas: 6.6, ocupacionPct: 69.4, estado7dias: 'PARCIAL', alerta: true },
    { cirujano: 'Cirugía Cardiovascular', quirofano: 'Qx 1', dia: 'Jueves', horario: '07:00 - 16:00 (9h)', horasMes: 39.0, horasUso: 31.5, horasOciosas: 7.5, ocupacionPct: 80.8, estado7dias: 'COMPLETO', alerta: false },
    { cirujano: 'Dr. Diego Gempel', quirofano: 'Qx 2', dia: 'Martes', horario: '08:00 - 14:00 (6h)', horasMes: 26.0, horasUso: 21.0, horasOciosas: 5.0, ocupacionPct: 80.8, estado7dias: 'COMPLETO', alerta: false },
    { cirujano: 'Dra. Daniela Saldivar Ozán', quirofano: 'Qx 4', dia: 'Lunes', horario: '14:00 - 20:00 (6h)', horasMes: 26.0, horasUso: 16.0, horasOciosas: 10.0, ocupacionPct: 61.5, estado7dias: 'LIBERADO_24H', alerta: true }
];

export default function QuirofanoDashboard() {
    const [activeTab, setActiveTab] = useState('resumen');
    const [searchCirujano, setSearchCirujano] = useState('');

    const filteredCirujanos = useMemo(() => {
        if (!searchCirujano.trim()) return CIRUJANOS_DATA;
        return CIRUJANOS_DATA.filter(c => 
            c.nombre.toLowerCase().includes(searchCirujano.toLowerCase()) ||
            c.especialidad.toLowerCase().includes(searchCirujano.toLowerCase())
        );
    }, [searchCirujano]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', paddingBottom: '30px' }}>
            
            {/* 1. HEADER INSTITUCIONAL CON KPIs MAESTROS */}
            <div style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #0284C7 100%)',
                borderRadius: '16px',
                padding: '24px 28px',
                color: '#FFFFFF',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                            <span style={{ background: 'rgba(255,255,255,0.18)', padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                Gobernanza de Datos · Sanatorio Argentino
                            </span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>Mapeo Tableau + Relevamiento Operativo</span>
                        </div>
                        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, letterSpacing: '-0.5px' }}>
                            Centro Quirúrgico · Producción, Demografía y Capacidad
                        </h1>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', opacity: 0.9 }}>
                            Quirófano Central (Qx 1-4) · Hospital de Día (Qx 5-6) · Bloques Médicos · Urgencias vs Electivas · Trazabilidad de Suspensión
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10B981', color: '#6EE7B7', padding: '6px 14px', borderRadius: '10px', fontSize: '0.80rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CheckCircle2 size={16} /> 7 Salas Operativas Activas
                        </span>
                    </div>
                </div>

                {/* KPI CARDS ENCABEZADO */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(8px)', borderRadius: '12px', padding: '14px 16px', border: '1px solid rgba(255,255,255,0.15)' }}>
                        <div style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                            Cirugías Realizadas (Período)
                        </div>
                        <div style={{ fontSize: '1.85rem', fontWeight: 900 }}>5.618</div>
                        <div style={{ fontSize: '0.74rem', color: '#A7F3D0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <TrendingUp size={13} /> + 587 Reprogramadas Concretadas
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(8px)', borderRadius: '12px', padding: '14px 16px', border: '1px solid rgba(255,255,255,0.15)' }}>
                        <div style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                            Tasa de Suspensión Neta
                        </div>
                        <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#FCD34D' }}>5,17%</div>
                        <div style={{ fontSize: '0.74rem', opacity: 0.85, marginTop: '2px' }}>
                            306 cancelaciones netas s/ 6.511 turnos
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(8px)', borderRadius: '12px', padding: '14px 16px', border: '1px solid rgba(255,255,255,0.15)' }}>
                        <div style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                            Pico Etario Pacientes (Años)
                        </div>
                        <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#67E8F9' }}>20 - 40</div>
                        <div style={{ fontSize: '0.74rem', opacity: 0.85, marginTop: '2px' }}>
                            4.409 pacientes (50.3% del total Qx)
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(8px)', borderRadius: '12px', padding: '14px 16px', border: '1px solid rgba(255,255,255,0.15)' }}>
                        <div style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                            Urgencias Quirúrgicas / Mes
                        </div>
                        <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#FCA5A5' }}>50 - 76</div>
                        <div style={{ fontSize: '0.74rem', color: '#FCA5A5', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <Flame size={13} /> Presión no programada activa
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. PESTAÑAS DE NAVEGACIÓN TÉCNICA */}
            <div style={{
                display: 'flex',
                background: '#F1F5F9',
                padding: '4px',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                gap: '4px',
                overflowX: 'auto'
            }}>
                {[
                    { id: 'resumen', label: '📊 Tablero Principal (Tableau Plus)', icon: BarChart3 },
                    { id: 'demografia', label: '👶 Demografía & Procedimientos', icon: Stethoscope },
                    { id: 'urgencias', label: '🚨 Urgencias vs Electivas', icon: Flame },
                    { id: 'suspensiones', label: '🚫 Detalle de Suspendidas (Causales 1..13)', icon: AlertTriangle },
                    { id: 'bloques', label: '⏱️ Bloques Quirúrgicos & Alertas 7d', icon: Clock },
                    { id: 'equipos', label: '👥 Equipos & Colaboradores', icon: Users },
                    { id: 'interanual', label: '📈 Evolución Interanual (2022-2026)', icon: TrendingUp },
                    { id: 'hemoterapia', label: '🩸 Hemoterapia & Soporte IntraQx', icon: Droplets }
                ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '9px',
                                border: 'none',
                                background: isActive ? '#FFFFFF' : 'transparent',
                                color: isActive ? '#0F172A' : '#64748B',
                                fontWeight: isActive ? 800 : 600,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Icon size={15} color={isActive ? '#0284C7' : '#94A3B8'} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* PESTAÑA 1: TABLERO PRINCIPAL (TABLEAU PLUS) */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'resumen' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Gráfico 1: Ocupación por Sala */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                    Ocupación Quirúrgica por Sala (Mayo 2026)
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    Capacidad instalada, volumen de partes quirúrgicos y porcentaje de ocupación sobre ventana horaria 07:00 a 21:00 hs.
                                </p>
                            </div>
                            <span style={{ fontSize: '0.78rem', background: '#F1F5F9', color: '#475569', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
                                7 Quirófanos en Paralelo
                            </span>
                        </div>

                        <div style={{ height: '300px', width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={SALAS_DATA} layout="vertical" margin={{ top: 5, right: 30, left: 70, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                                    <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                                    <YAxis type="category" dataKey="sala" tick={{ fontSize: 12, fontWeight: 700 }} />
                                    <RechartsTooltip 
                                        formatter={(val, name, item) => [
                                            `${val}% (${item.payload.cirugias} cirugías · ${item.payload.horas} hs)`,
                                            'Ocupación Efectiva'
                                        ]}
                                    />
                                    <Bar dataKey="ocupacionPct" radius={[0, 8, 8, 0]}>
                                        {SALAS_DATA.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Rankings Triples: Cirujanos, Especialidad y Financiador */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
                        
                        {/* Ranking Cirujanos con Tasa de Suspensión */}
                        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                                    Ranking Cirujanos (Top 18)
                                </h3>
                                <input
                                    type="text"
                                    placeholder="Buscar cirujano..."
                                    value={searchCirujano}
                                    onChange={e => setSearchCirujano(e.target.value)}
                                    style={{
                                        fontSize: '0.75rem',
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid #CBD5E1',
                                        outline: 'none',
                                        width: '140px'
                                    }}
                                />
                            </div>

                            <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #CBD5E1', color: '#475569', textAlign: 'left' }}>
                                            <th style={{ padding: '8px' }}>Cirujano</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>Cx</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>% Total</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>% Susp.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCirujanos.map((c, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '8px', fontWeight: 700, color: '#0F172A' }}>
                                                    <div>{c.nombre}</div>
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 400 }}>{c.especialidad}</div>
                                                </td>
                                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#1E40AF' }}>{c.realizadas}</td>
                                                <td style={{ padding: '8px', textAlign: 'right' }}>{c.pctTotal}%</td>
                                                <td style={{ padding: '8px', textAlign: 'right' }}>
                                                    <span style={{
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        fontWeight: 800,
                                                        fontSize: '0.70rem',
                                                        background: c.pctSuspension > 12 ? '#FEE2E2' : c.pctSuspension > 7 ? '#FEF3C7' : '#DCFCE7',
                                                        color: c.pctSuspension > 12 ? '#DC2626' : c.pctSuspension > 7 ? '#D97706' : '#15803D'
                                                    }}>
                                                        {c.pctSuspension}%
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Ranking Especialidades */}
                        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                                Cirugías por Especialidad
                            </h3>
                            <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #CBD5E1', color: '#475569', textAlign: 'left' }}>
                                            <th style={{ padding: '8px' }}>Especialidad</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>Cant Cx</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>% Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ESPECIALIDADES_DATA.map((e, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '8px', fontWeight: 700, color: '#0F172A' }}>{e.nombre}</td>
                                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800 }}>{e.cant}</td>
                                                <td style={{ padding: '8px', textAlign: 'right', color: '#2563EB', fontWeight: 800 }}>{e.pct}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Ranking Financiador (Obra Social) */}
                        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                                Demanda por Obra Social
                            </h3>
                            <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #CBD5E1', color: '#475569', textAlign: 'left' }}>
                                            <th style={{ padding: '8px' }}>Obra Social</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>Cant Cx</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>% Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {OBRAS_SOCIALES_DATA.map((o, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '8px', fontWeight: 700, color: '#0F172A' }}>{o.nombre}</td>
                                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800 }}>{o.cant}</td>
                                                <td style={{ padding: '8px', textAlign: 'right', color: '#059669', fontWeight: 800 }}>{o.pct}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* PESTAÑA 2: DEMOGRAFÍA & PROCEDIMIENTOS (EDADES + NOMENCLADOR) */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'demografia' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Pirámide de Edades de Pacientes */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                    Distribución Etaria de Pacientes Quirúrgicos
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    Pico materno-infantil y ginecológico: El 50,3% de los pacientes tienen entre 20 y 40 años (2.980 en la franja de 30 a 39 años).
                                </p>
                            </div>
                            <span style={{ fontSize: '0.75rem', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', padding: '4px 10px', borderRadius: '6px', fontWeight: 800 }}>
                                9.709 Pacientes Totales Mapeados
                            </span>
                        </div>

                        <div style={{ height: '300px', width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={EDADES_PACIENTES_DATA} margin={{ top: 15, right: 20, left: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="rango" tick={{ fontSize: 12, fontWeight: 700 }} />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <RechartsTooltip formatter={(val) => [`${val} pacientes`, 'Volumen Quirúrgico']} />
                                    <Bar dataKey="cantidad" radius={[8, 8, 0, 0]}>
                                        {EDADES_PACIENTES_DATA.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.pico ? '#1E40AF' : entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Comparativa Top Procedimientos Realizados vs Suspendidos */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
                        
                        {/* Top Realizadas */}
                        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                                    Top Procedimientos Realizados
                                </h3>
                                <span style={{ fontSize: '0.70rem', color: '#15803D', background: '#DCFCE7', padding: '3px 8px', borderRadius: '4px', fontWeight: 800 }}>
                                    Cesárea Líder: 2.113 Cx
                                </span>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #CBD5E1', color: '#475569', textAlign: 'left' }}>
                                        <th style={{ padding: '8px' }}>Procedimiento Agenda</th>
                                        <th style={{ padding: '8px', textAlign: 'right' }}>Cant Cx</th>
                                        <th style={{ padding: '8px', textAlign: 'right' }}>% Producción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {TOP_PROCEDIMIENTOS_REALIZADOS.map((p, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '8px', fontWeight: 700, color: '#0F172A' }}>
                                                <div>{p.nombre}</div>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 400 }}>{p.especialidad}</div>
                                            </td>
                                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 900, color: '#1E40AF' }}>{p.cantidad}</td>
                                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{p.participacion}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Top Suspendidas */}
                        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#DC2626' }}>
                                    Top Procedimientos con Suspensión
                                </h3>
                                <span style={{ fontSize: '0.70rem', color: '#DC2626', background: '#FEE2E2', padding: '3px 8px', borderRadius: '4px', fontWeight: 800 }}>
                                    Vulnerabilidad Quirúrgica
                                </span>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #CBD5E1', color: '#475569', textAlign: 'left' }}>
                                        <th style={{ padding: '8px' }}>Procedimiento</th>
                                        <th style={{ padding: '8px', textAlign: 'right' }}>Susp.</th>
                                        <th style={{ padding: '8px', textAlign: 'right' }}>Tasa Susp.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {TOP_PROCEDIMIENTOS_SUSPENDIDOS.map((p, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '8px', fontWeight: 700, color: '#0F172A' }}>{p.nombre}</td>
                                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 900, color: '#DC2626' }}>{p.suspendidas}</td>
                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                <span style={{ background: '#FEF3C7', color: '#B45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                                    {p.tasaSuspension}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* PESTAÑA 3: URGENCIAS VS ELECTIVAS */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'urgencias' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Gráfico Mensual Asistencia Visita: Presentes vs URGENCIA */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                    Asistencia Quirúrgica: Programadas (Presente) vs. URGENCIA
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    Mapeo mensual de ingresos no programados de guardia compitiendo contra bloques de quirófano central.
                                </p>
                            </div>
                            <span style={{ fontSize: '0.75rem', background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626', padding: '4px 10px', borderRadius: '6px', fontWeight: 800 }}>
                                Promedio: 53.6 Urgencias / Mes
                            </span>
                        </div>

                        <div style={{ height: '320px', width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={TENDENCIA_ASISTENCIA_DATA} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <RechartsTooltip />
                                    <Legend />
                                    <Bar dataKey="presentes" name="Programadas (Presentes)" stackId="a" fill="#F59E0B" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="urgencias" name="URGENCIAS" stackId="a" fill="#DC2626" radius={[4, 4, 0, 0]} />
                                    <Line type="monotone" dataKey="total" name="Total Cirugías" stroke="#1E40AF" strokeWidth={2.5} dot={{ r: 3 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Cirujanos Responsables en Urgencias */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                    Cirujanos Responsables de Asistencia de Urgencia
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    Concentración de casos no programados por profesional y necesidad de reserva de anestesia de guardia.
                                </p>
                            </div>
                        </div>

                        <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#334155', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 12px' }}>Cirujano Responsable</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Presente (Electiva)</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>URGENCIA</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total Cx</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>% Urgencia</th>
                                        <th style={{ padding: '10px 12px' }}>Observación Operativa</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {RESPONSABLES_URGENCIA_DATA.map((r, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0', background: r.urgencias >= 10 ? '#FEF2F2' : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0F172A' }}>{r.cirujano}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#D97706' }}>{r.presentes}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: '#DC2626' }}>{r.urgencias}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>{r.total}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: r.pctUrg > 10 ? '#DC2626' : '#64748B' }}>
                                                {r.pctUrg}%
                                            </td>
                                            <td style={{ padding: '10px 12px', fontSize: '0.70rem', color: r.nota ? '#DC2626' : '#64748B', fontWeight: r.nota ? 800 : 400 }}>
                                                {r.nota || 'Guardia Pasiva'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* PESTAÑA 4: DETALLE DE SUSPENDIDAS (CAUSALES 1..13) */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'suspensiones' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Alerta de Calidad del Dato */}
                    <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                <AlertTriangle size={22} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#92400E' }}>
                                    Catálogo Oficial Sanatorio Argentino de Motivos (1 al 13)
                                </h4>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#B45309' }}>
                                    Regla de gobernanza: Se prohibió el causal ciego `NULL` (que llegó a 11 en Marzo) para exigir clasificación obligatoria en SALUS.
                                </p>
                            </div>
                        </div>
                        <span style={{ fontSize: '0.74rem', background: '#FEF3C7', color: '#92400E', padding: '4px 10px', borderRadius: '6px', fontWeight: 800, border: '1px solid #FCD34D' }}>
                            Auditado: Mayo 2026
                        </span>
                    </div>

                    {/* Gráfico de Barras Horizontales con los 11 Motivos Codificados */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ margin: '0 0 14px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                            Distribución de Suspensiones por Motivo Codificado (Tableau)
                        </h3>
                        <div style={{ height: '360px', width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={MOTIVOS_SUSPENSION_OFICIAL} layout="vertical" margin={{ top: 5, right: 30, left: 160, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                                    <XAxis type="number" tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="motivo" tick={{ fontSize: 11, fontWeight: 700 }} />
                                    <RechartsTooltip formatter={(val, name, item) => [`${val} casos (${item.payload.pct}%)`, 'Suspensiones']} />
                                    <Bar dataKey="cantidad" radius={[0, 6, 6, 0]}>
                                        {MOTIVOS_SUSPENSION_OFICIAL.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Matriz Mensual de Suspensiones */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                    Matriz Histórica de Suspensiones por Mes (Enero a Mayo)
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    Heatmap de frecuencias: Detección de picos en Mayo (36 por paciente y 25 por falta de autorización de Obra Social).
                                </p>
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#334155', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 12px' }}>NomMotivo</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total Susp.</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>% Total</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Enero</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Febrero</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Marzo</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Abril</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Mayo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {MOTIVOS_SUSPENSION_DATA.map((m, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0F172A' }}>{m.motivo}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: '#1E40AF' }}>{m.total}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#D97706' }}>{m.pct}%</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>{m.ene}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>{m.feb}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>{m.mar}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>{m.abr}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, background: m.may > 20 ? '#FEF2F2' : 'transparent', color: m.may > 20 ? '#DC2626' : '#0F172A' }}>
                                                {m.may}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* PESTAÑA 5: BLOQUES QUIRÚRGICOS & ALERTAS DE 7 DÍAS */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'bloques' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                <Clock size={22} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#166534' }}>
                                    Regla de Negocio Sanatorial: Ventana de Liberación a 7 Días
                                </h4>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#14532D' }}>
                                    Todo bloque sin ocupar con 7 días de anticipación activa alerta automática para Majo/Laura y liberación a cola general.
                                </p>
                            </div>
                        </div>
                        <span style={{ fontSize: '0.74rem', background: '#DC2626', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontWeight: 800 }}>
                            2 Alertas Activas para esta Semana
                        </span>
                    </div>

                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ margin: '0 0 14px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                            Matriz de Ocupación de Bloques vs. Horas Ociosas
                        </h3>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#334155', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 12px' }}>Cirujano / Servicio</th>
                                        <th style={{ padding: '10px 12px' }}>Sala</th>
                                        <th style={{ padding: '10px 12px' }}>Día y Franja</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Hs Mes</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Hs Uso</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Hs Ociosas</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>% Ocupación</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Alerta 7d</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {BLOQUES_DATA.map((b, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0', background: b.alerta ? '#FFFBEB' : '#FFFFFF' }}>
                                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0F172A' }}>{b.cirujano}</td>
                                            <td style={{ padding: '10px 12px', fontWeight: 800, color: '#1E40AF' }}>{b.quirofano}</td>
                                            <td style={{ padding: '10px 12px', color: '#475569' }}>{b.dia} · {b.horario}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>{b.horasMes}h</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#15803D' }}>{b.horasUso}h</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: b.horasOciosas > 5 ? '#DC2626' : '#64748B' }}>
                                                {b.horasOciosas}h
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900 }}>
                                                {b.ocupacionPct}%
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                {b.alerta ? (
                                                    <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '3px 8px', borderRadius: '4px', fontWeight: 800, fontSize: '0.70rem' }}>
                                                        LIBERAR
                                                    </span>
                                                ) : (
                                                    <span style={{ background: '#DCFCE7', color: '#15803D', padding: '3px 8px', borderRadius: '4px', fontWeight: 800, fontSize: '0.70rem' }}>
                                                        CONFIRMADO
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* PESTAÑA 6: EQUIPOS & COLABORADORES */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'equipos' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                    
                    {/* Circulantes */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Users size={18} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>Circulantes</h3>
                                <p style={{ margin: 0, fontSize: '0.70rem', color: '#64748B' }}>Personal de enfermería de sala</p>
                            </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                            <tbody>
                                {EQUIPOS_DATA.circulantes.map((c, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td style={{ padding: '6px 4px', fontWeight: 700, color: '#0F172A' }}>{c.nombre}</td>
                                        <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 900, color: '#1E40AF' }}>{c.cant}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Técnicos de Anestesia */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F0FDF4', color: '#15803D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Activity size={18} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>Técnicos de Anestesia</h3>
                                <p style={{ margin: 0, fontSize: '0.70rem', color: '#64748B' }}>Asistencia en inducción y monitoreo</p>
                            </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                            <tbody>
                                {EQUIPOS_DATA.tecnicosAnestesia.map((t, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td style={{ padding: '6px 4px', fontWeight: 700, color: '#0F172A' }}>{t.nombre}</td>
                                        <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 900, color: '#15803D' }}>{t.cant}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Anestesistas */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Stethoscope size={18} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>Anestesistas</h3>
                                <p style={{ margin: 0, fontSize: '0.70rem', color: '#64748B' }}>Grupo Anestésico (Planta vs Guardia)</p>
                            </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                            <tbody>
                                {EQUIPOS_DATA.anestesistas.map((a, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td style={{ padding: '6px 4px', fontWeight: 700, color: '#0F172A' }}>{a.nombre}</td>
                                        <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 900, color: a.grupo === 'Guardia' ? '#DC2626' : '#D97706' }}>{a.cant}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Instrumentadores */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FDF2F8', color: '#DB2777', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Scissors size={18} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>Instrumentadores Quirúrgicos</h3>
                                <p style={{ margin: 0, fontSize: '0.70rem', color: '#64748B' }}>Instrumentación en mesa estéril</p>
                            </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                            <tbody>
                                {EQUIPOS_DATA.instrumentadores.map((i, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td style={{ padding: '6px 4px', fontWeight: 700, color: '#0F172A' }}>{i.nombre}</td>
                                        <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 900, color: '#DB2777' }}>{i.cant}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* PESTAÑA 7: EVOLUCIÓN INTERANUAL (2022-2026) */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'interanual' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                    Curvas de Producción Quirúrgica Interanual (2022 a 2026)
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    Evolución del volumen mensual de cirugías comparando las 5 temporadas operativas consecutivas.
                                </p>
                            </div>
                        </div>

                        <div style={{ height: '320px', width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={INTERANUAL_DATA} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                                    <YAxis domain={[400, 900]} tick={{ fontSize: 12 }} />
                                    <RechartsTooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="a2022" name="2022" stroke="#0D9488" strokeWidth={2} dot={{ r: 2 }} />
                                    <Line type="monotone" dataKey="a2023" name="2023" stroke="#16A34A" strokeWidth={2} dot={{ r: 2 }} />
                                    <Line type="monotone" dataKey="a2024" name="2024" stroke="#EAB308" strokeWidth={2} dot={{ r: 2 }} />
                                    <Line type="monotone" dataKey="a2025" name="2025" stroke="#9333EA" strokeWidth={2} dot={{ r: 2 }} />
                                    <Line type="monotone" dataKey="a2026" name="2026" stroke="#2563EB" strokeWidth={3.5} dot={{ r: 4 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ margin: '0 0 14px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                            Desglose 2026: Quirófano Central vs. Hospital de Día (HdD)
                        </h3>
                        <div style={{ height: '240px', width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={INTERANUAL_DATA} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <RechartsTooltip />
                                    <Legend />
                                    <Bar dataKey="central2026" name="Quirófano Central (Qx 1-4)" fill="#1E40AF" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="hdd2026" name="Hospital de Día (Qx 5-6)" fill="#10B981" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* PESTAÑA 8: HEMOTERAPIA & SOPORTE INTRAQX */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'hemoterapia' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
                    
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Droplets size={20} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                                    Protocolo Hemoterapia: Paciente Agrupado
                                </h4>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                    Relevamiento Dr. Sota / UTI / Quirófano Central
                                </p>
                            </div>
                        </div>

                        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '14px' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#991B1B', marginBottom: '6px' }}>
                                Regla de Disponibilidad en Heladera Qx
                            </div>
                            <p style={{ fontSize: '0.75rem', color: '#7F1D1D', margin: 0, lineHeight: 1.4 }}>
                                Toda cirugía cardiovascular mayor, nefrectomía o trauma complejo exige por protocolo <strong>2 unidades de glóbulos rojos listas en la heladera de quirófano</strong> antes del inicio de anestesia.
                            </p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.76rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                                <span style={{ color: '#475569' }}>Pacientes Agrupados con Reserva:</span>
                                <strong style={{ color: '#0F172A' }}>13 cirugías / mes</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                                <span style={{ color: '#475569' }}>Transfusiones Efectivas Administradas:</span>
                                <strong style={{ color: '#DC2626' }}>4 pacientes (30.7%)</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                                <span style={{ color: '#475569' }}>Unidades Retornadas a Banco de Sangre:</span>
                                <strong style={{ color: '#15803D' }}>18 unidades (sin pérdida de cadena)</strong>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#F0F9FF', color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Flame size={20} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                                    Servicios de Soporte en Quirófano
                                </h4>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                    Intensificador de imágenes (Rayos X), laboratorio y congelación
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>
                                    Intensificador de Imágenes (Arco en C)
                                </div>
                                <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>
                                    En colecistectomías laparoscópicas para colangiografías intraoperatorias. El técnico radiólogo queda asentado en foja para facturar a la obra social y justificar horas en el servicio de imágenes.
                                </p>
                                <div style={{ marginTop: '8px', fontSize: '0.74rem', fontWeight: 800, color: '#0369A1' }}>
                                    Horas acumuladas mes: 86.4 hs · 42 cirugías asistidas
                                </div>
                            </div>

                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>
                                    Peticiones Intraoperatorias de Laboratorio
                                </div>
                                <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>
                                    Circuito estandarizado digitalmente: quirófano genera la petición, laboratorio recibe la alerta inmediata en su sistema y extrae la muestra en sala con resultado en historia clínica.
                                </p>
                                <div style={{ marginTop: '8px', fontSize: '0.74rem', fontWeight: 800, color: '#15803D' }}>
                                    Tiempo promedio de respuesta analítica: 18 min
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            )}

        </div>
    );
}
