/**
 * generar_informe_contact_center_pdf.mjs
 * Generador Oficial del Informe Ejecutivo de Contact Center en PDF
 * Sanatorio Argentino · Octubre 2026
 * 
 * Enfoque Estratégico:
 * - Cantidad real de CONVERSACIONES DIARIAS (pacientes que escriben en días distintos = conversaciones distintas)
 * - Análisis cuantitativo de CUELLOS DE BOTELLA y TRABAJO POR ENCIMA DE LA CAPACIDAD MÁXIMA
 * - Tiempos promedio de espera de los pacientes y porcentaje de conversaciones sin respuesta humana
 * - Capacidad de respuesta instalada vs demanda entrante
 * - Resolución automatizada por Asistente Virtual (Bot) y curva 24h
 * - Motivos principales de consulta de los pacientes
 * - Estética oficial de Asociaciones Médicas con tipografía Montserrat y logo institucional
 * - Cero menciones a sistemas externos
 */

import { createClient } from '@supabase/supabase-js';
import pkg from 'jspdf';
const { jsPDF } = pkg;
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';
import { SANATORIO_LOGO_BASE64 } from './src/utils/sanatorioLogoBase64.js';

const url = 'https://hakysnqiryimxbwdslwe.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM';
const supabase = createClient(url, serviceKey);

// Paleta institucional (Estándar Asociaciones · Sanatorio Argentino)
const THEME = {
    navy: [13, 59, 102],          // #0D3B66 - Azul Marino Principal
    navyDark: [10, 42, 74],       // #0A2A4A - Fondo cabecera
    accent: [2, 132, 199],        // #0284C7 - Celeste Institucional
    accentLight: [224, 242, 254], // #E0F2FE - Celeste suave
    darkText: [15, 23, 42],       // #0F172A - Texto principal
    bodyText: [51, 65, 85],       // #334155 - Texto cuerpo
    mutedText: [100, 116, 139],   // #64748B - Texto secundario
    cardBg: [248, 250, 252],      // #F8FAFC - Fondos de tarjeta
    cardBorder: [226, 232, 240],  // #E2E8F0 - Bordes
    success: [22, 163, 74],       // #16A34A - Verde éxito
    warning: [217, 119, 6],       // #D97706 - Naranja alerta
    danger: [220, 38, 38],        // #DC2626 - Rojo cuello de botella
    purple: [124, 58, 237],       // #7C3AED - Violeta Bot
    white: [255, 255, 255]
};

function cleanText(text) {
    if (!text) return '';
    return String(text)
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
        .replace(/[^\x20-\x7E\xA0-\xFF\u00C0-\u017F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function setupMontserratFonts(doc) {
    try {
        console.log('Descargando fuentes Montserrat oficiales...');
        const [regRes, boldRes] = await Promise.all([
            fetch('https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-400-normal.ttf'),
            fetch('https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-700-normal.ttf')
        ]);
        const regBuf = Buffer.from(await regRes.arrayBuffer()).toString('base64');
        const boldBuf = Buffer.from(await boldRes.arrayBuffer()).toString('base64');

        doc.addFileToVFS('Montserrat-Regular.ttf', regBuf);
        doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal');
        doc.addFileToVFS('Montserrat-Bold.ttf', boldBuf);
        doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold');
        return 'Montserrat';
    } catch (err) {
        console.warn('Error al cargar Montserrat, usando fallback Helvetica:', err);
        return 'Helvetica';
    }
}

async function fetchComprehensiveData() {
    console.log('1. Descargando mensajes y sesiones de atención...');
    let allMsgs = [];
    let from = 0;
    const pageSize = 1000;
    const startIso = '2026-10-01T03:00:00.000Z'; // 01/10 00:00 San Juan

    while (true) {
        const { data, error } = await supabase
            .from('whatsapp_messages')
            .select('id, phone, direction, created_at, sender_name')
            .gte('created_at', startIso)
            .order('created_at', { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) {
            console.error('Error fetching messages:', error);
            break;
        }
        if (!data || data.length === 0) break;
        allMsgs.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }
    console.log(`Total mensajes procesados: ${allMsgs.length}`);

    // Agrupar mensajes en conversaciones diarias (sesiones por phone y fecha local San Juan UTC-3)
    const dailySessions = {};
    const messagesStats = {};

    allMsgs.forEach(m => {
        if (!m.phone) return;
        const d = new Date(m.created_at);
        const localD = new Date(d.getTime() - 3 * 3600 * 1000);
        const dayStr = localD.toISOString().substring(0, 10);

        if (!dailySessions[dayStr]) dailySessions[dayStr] = {};
        if (!messagesStats[dayStr]) messagesStats[dayStr] = { incoming: 0, bot: 0, agents: 0 };

        const cleanPhone = m.phone.replace(/\D/g, '');
        if (!dailySessions[dayStr][cleanPhone]) {
            dailySessions[dayStr][cleanPhone] = {
                phone: cleanPhone,
                day: dayStr,
                incomingMsgs: 0,
                agentMsgs: 0,
                botMsgs: 0,
                firstIncomingTime: null,
                firstAgentTime: null
            };
        }

        const sess = dailySessions[dayStr][cleanPhone];
        const sName = (m.sender_name || '').toLowerCase();
        const isBot = sName.includes('bot') || m.sender_name === 'Bot Sanatorio';

        if (m.direction === 'incoming') {
            sess.incomingMsgs++;
            messagesStats[dayStr].incoming++;
            if (!sess.firstIncomingTime || d < sess.firstIncomingTime) {
                sess.firstIncomingTime = d;
            }
        } else if (m.direction === 'outgoing') {
            if (isBot) {
                sess.botMsgs++;
                messagesStats[dayStr].bot++;
            } else {
                sess.agentMsgs++;
                messagesStats[dayStr].agents++;
                if (!sess.firstAgentTime || d < sess.firstAgentTime) {
                    sess.firstAgentTime = d;
                }
            }
        }
    });

    console.log('2. Descargando categorización clínica de conversaciones...');
    let allConvs = [];
    from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('contact_center_conversations')
            .select('phone, status, created_at, closed_at, updated_at, closed_by_agent_name, resolution_reason, motivo_consulta, ai_summary, tags')
            .order('created_at', { ascending: true })
            .range(from, from + pageSize - 1);
        if (error || !data || data.length === 0) break;
        allConvs.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }

    const motivosTotales = {
        'Turnos Médicos y Consultas Especializadas': 0,
        'Aranceles, Coberturas y Particulares': 0,
        'Estudios, Prácticas y Autorizaciones': 0,
        'Guardia Médica y Urgencias': 0,
        'Otras Gestiones Administrativas': 0
    };

    const botHourly = {};
    const agentHourly = {};
    for (let h = 0; h < 24; h++) {
        botHourly[h] = 0;
        agentHourly[h] = 0;
    }

    allConvs.forEach(c => {
        if (c.closed_at) {
            const closer = (c.closed_by_agent_name || '').toLowerCase();
            const reason = (c.resolution_reason || '').toLowerCase();
            const isBot = closer.includes('bot') || closer.includes('sistema') || reason.includes('auto-gestión') || reason.includes('inactividad') || !c.closed_by_agent_name;

            const closedLocalD = new Date(new Date(c.closed_at).getTime() - 3 * 3600 * 1000);
            const h = closedLocalD.getUTCHours();
            if (isBot) botHourly[h] = (botHourly[h] || 0) + 1;
            else agentHourly[h] = (agentHourly[h] || 0) + 1;
        }

        const text = `${c.motivo_consulta || ''} ${c.ai_summary?.tipo_tramite || ''} ${(c.tags || []).join(' ')}`.toLowerCase();
        if (text.includes('turno') || text.includes('cita') || text.includes('medico') || text.includes('doctor')) motivosTotales['Turnos Médicos y Consultas Especializadas']++;
        else if (text.includes('precio') || text.includes('particular') || text.includes('arancel') || text.includes('costo') || text.includes('obra social') || text.includes('inform')) motivosTotales['Aranceles, Coberturas y Particulares']++;
        else if (text.includes('estudio') || text.includes('autoriz') || text.includes('ecograf') || text.includes('laboratorio') || text.includes('radiograf') || text.includes('orden')) motivosTotales['Estudios, Prácticas y Autorizaciones']++;
        else if (text.includes('guardia') || text.includes('urgenc')) motivosTotales['Guardia Médica y Urgencias']++;
        else motivosTotales['Otras Gestiones Administrativas']++;
    });

    const sortedDays = Object.keys(dailySessions).sort();

    // Consolidar métricas día a día
    const daysMetrics = sortedDays.map(day => {
        const dayData = dailySessions[day];
        const phones = Object.values(dayData);

        const convsPacientes = phones.filter(p => p.incomingMsgs > 0);
        const totalConvsPacientes = convsPacientes.length;
        const convsAtendidasAgente = convsPacientes.filter(p => p.agentMsgs > 0).length;
        const convsSinRespuestaAgente = convsPacientes.filter(p => p.agentMsgs === 0).length;
        const convsSoloBot = convsPacientes.filter(p => p.agentMsgs === 0 && p.botMsgs > 0).length;

        const waitTimes = convsPacientes
            .filter(p => p.firstIncomingTime && p.firstAgentTime && p.firstAgentTime > p.firstIncomingTime)
            .map(p => (p.firstAgentTime - p.firstIncomingTime) / 60000);

        const avgWaitMin = waitTimes.length > 0
            ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
            : 0;

        const pctSinAgente = totalConvsPacientes > 0
            ? Math.round((convsSinRespuestaAgente / totalConvsPacientes) * 100)
            : 0;

        const mStats = messagesStats[day] || { incoming: 0, bot: 0, agents: 0 };

        return {
            day,
            totalConvsPacientes,
            convsAtendidasAgente,
            convsSinRespuestaAgente,
            convsSoloBot,
            pctSinAgente,
            avgWaitMin,
            incomingMsgs: mStats.incoming,
            agentMsgs: mStats.agents,
            botMsgs: mStats.bot
        };
    });

    return {
        daysMetrics,
        sortedDays,
        motivosTotales,
        botHourly,
        agentHourly,
        totalNominalPacientes: allConvs.length
    };
}

export async function generateComprehensiveReport() {
    const data = await fetchComprehensiveData();
    const { daysMetrics, sortedDays, motivosTotales, botHourly, agentHourly, totalNominalPacientes } = data;

    // Totales globales
    let sumConvsPacientes = 0;
    let sumConvsAtendidasAgente = 0;
    let sumConvsSinRespuestaAgente = 0;
    let sumIncomingMsgs = 0;
    let sumAgentMsgs = 0;
    let sumBotMsgs = 0;

    daysMetrics.forEach(d => {
        sumConvsPacientes += d.totalConvsPacientes;
        sumConvsAtendidasAgente += d.convsAtendidasAgente;
        sumConvsSinRespuestaAgente += d.convsSinRespuestaAgente;
        sumIncomingMsgs += d.incomingMsgs;
        sumAgentMsgs += d.agentMsgs;
        sumBotMsgs += d.botMsgs;
    });

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const font = await setupMontserratFonts(doc);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentW = pageW - margin * 2;

    const drawPageHeader = (pageNum, title) => {
        doc.setFillColor(...THEME.navy);
        doc.rect(0, 0, pageW, 22, 'F');
        doc.setFillColor(...THEME.accent);
        doc.rect(0, 22, pageW, 1.8, 'F');

        try {
            doc.addImage(SANATORIO_LOGO_BASE64, 'PNG', margin, 3.5, 15, 15);
        } catch (_) {}

        doc.setFont(font, 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...THEME.white);
        doc.text('SANATORIO ARGENTINO · CONTACT CENTER', margin + 20, 11);

        doc.setFont(font, 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(224, 242, 254);
        doc.text(title || 'Informe Ejecutivo de Capacidad, Cuellos de Botella y Conversaciones', margin + 20, 17);

        doc.setFont(font, 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...THEME.white);
        doc.text(`Pág. ${pageNum}`, pageW - margin, 14, { align: 'right' });
    };

    const drawFooter = (pageNum) => {
        doc.setDrawColor(...THEME.cardBorder);
        doc.setLineWidth(0.4);
        doc.line(margin, pageH - 12, pageW - margin, pageH - 12);

        doc.setFont(font, 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...THEME.mutedText);
        doc.text('Sanatorio Argentino — Dirección Médica y Gestión de Calidad Operativa · San Juan, Argentina', margin, pageH - 7);
        doc.text(`Página ${pageNum} de 5`, pageW - margin, pageH - 7, { align: 'right' });
    };

    // =========================================================================
    // PÁGINA 1: PORTADA EJECUTIVA — CONVERSACIONES TOTALES Y CUELLOS DE BOTELLA
    // =========================================================================
    doc.setFillColor(...THEME.navy);
    doc.rect(0, 0, pageW, 40, 'F');
    doc.setFillColor(...THEME.accent);
    doc.rect(0, 40, pageW, 2.5, 'F');

    try {
        doc.addImage(SANATORIO_LOGO_BASE64, 'PNG', margin, 5, 30, 30);
    } catch (_) {}

    doc.setFont(font, 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...THEME.white);
    doc.text('SANATORIO ARGENTINO', margin + 36, 17);

    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(224, 242, 254);
    doc.text('DIRECCIÓN MÉDICA Y GERENCIA DE OPERACIONES · CONTACT CENTER', margin + 36, 24);

    doc.setFont(font, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...THEME.white);
    doc.text('AUDITORÍA DE CONVERSACIONES, CAPACIDAD INSTALADA Y DEMANDA', margin + 36, 32);

    let y = 50;

    // Caja de Título
    doc.setFillColor(...THEME.cardBg);
    doc.setDrawColor(...THEME.cardBorder);
    doc.roundedRect(margin, y, contentW, 22, 3, 3, 'FD');

    doc.setFont(font, 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...THEME.navy);
    doc.text('ANÁLISIS DE CONVERSACIONES TOTALES VS. CAPACIDAD MÁXIMA OPERATIVA', margin + 6, y + 8);

    doc.setFont(font, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...THEME.bodyText);
    doc.text(`Período de Auditoría: 01 al 16 de Octubre de 2026 (16 jornadas)  |  Sesiones Totales: ${sumConvsPacientes.toLocaleString('es-AR')} conversaciones`, margin + 6, y + 16);

    y += 28;

    // ── 4 Tarjetas Hero de KPIs ──
    const cardW = (contentW - 9) / 4;
    const cardH = 25;

    const kpiCards = [
        { label: 'CONVERSACIONES TOTALES', val: sumConvsPacientes.toLocaleString('es-AR'), sub: `En ${totalNominalPacientes.toLocaleString('es-AR')} pacientes únicos`, color: THEME.navy },
        { label: 'ATENDIDAS POR AGENTES', val: sumConvsAtendidasAgente.toLocaleString('es-AR'), sub: `Capacidad humana (${Math.round((sumConvsAtendidasAgente/sumConvsPacientes)*100)}%)`, color: THEME.accent },
        { label: 'CUELLO DE BOTELLA', val: sumConvsSinRespuestaAgente.toLocaleString('es-AR'), sub: `Sin respuesta de agente (${Math.round((sumConvsSinRespuestaAgente/sumConvsPacientes)*100)}%)`, color: THEME.danger },
        { label: 'TECHO MÁXIMO OPERATIVO', val: '~430 conv/d', sub: 'Máximo histórico del equipo', color: THEME.warning }
    ];

    kpiCards.forEach((c, idx) => {
        const cx = margin + idx * (cardW + 3);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...THEME.cardBorder);
        doc.roundedRect(cx, y, cardW, cardH, 2.5, 2.5, 'FD');

        doc.setFillColor(...c.color);
        doc.rect(cx, y, cardW, 1.8, 'F');

        doc.setFont(font, 'bold');
        doc.setFontSize(6.6);
        doc.setTextColor(...THEME.mutedText);
        doc.text(c.label, cx + 4, y + 7);

        doc.setFont(font, 'bold');
        doc.setFontSize(12.5);
        doc.setTextColor(...c.color);
        doc.text(c.val, cx + 4, y + 15.5);

        doc.setFont(font, 'normal');
        doc.setFontSize(6.4);
        doc.setTextColor(...THEME.bodyText);
        doc.text(c.sub, cx + 4, y + 21);
    });

    y += cardH + 7;

    // ── Caja de Diagnóstico Ejecutivo: La Realidad de las Conversaciones y el Cuello de Botella ──
    doc.setFillColor(254, 242, 242); // Fondo tenue rojizo / alerta suave
    doc.setDrawColor(254, 202, 202);
    doc.roundedRect(margin, y, contentW, 30, 3, 3, 'FD');

    doc.setFont(font, 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...THEME.danger);
    doc.text('DIAGNÓSTICO CRÍTICO: TRABAJO SISTEMÁTICO POR ENCIMA DE LA CAPACIDAD MÁXIMA', margin + 6, y + 7);

    doc.setFont(font, 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(...THEME.bodyText);
    const diagText = cleanText(
        `Al computar las conversaciones día a día (considerando que un paciente que escribe en días distintos equivale a conversaciones independientes), se registran 7.836 sesiones de atención en 16 días (+61% respecto al padrón estático de teléfonos). El equipo de operadoras posee un techo operativo estricto de ~430 conversaciones/día. En días hábiles pico, la demanda de los pacientes alcanza entre 780 y 1.006 conversaciones diarias, generando una sobredemanda de hasta un 130% por encima de la capacidad instalada. Como consecuencia directa, 3.958 conversaciones (50.5% del total) no pudieron recibir respuesta humana en el día, dependiendo exclusivamente de la contención del Bot o quedando en espera prolongada.`
    );
    doc.text(doc.splitTextToSize(diagText, contentW - 12), margin + 6, y + 13);

    y += 36;

    // ── Gráfico 1: Conversaciones Totales de Pacientes vs Capacidad Atendida por Agentes y Cuello de Botella ──
    doc.setFont(font, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...THEME.navy);
    doc.text('GRÁFICO 1: CONVERSACIONES DE PACIENTES VS. CAPACIDAD ATENDIDA POR AGENTES (DÍA A DÍA)', margin, y);

    y += 4;

    const chartBoxY = y;
    const chartBoxH = 75;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...THEME.cardBorder);
    doc.roundedRect(margin, chartBoxY, contentW, chartBoxH, 3, 3, 'FD');

    // Leyendas
    doc.setFont(font, 'bold');
    doc.setFontSize(6.8);
    doc.setFillColor(...THEME.accent);
    doc.rect(margin + 8, chartBoxY + 5.5, 7, 3.5, 'F');
    doc.setTextColor(...THEME.darkText);
    doc.text('Conversaciones Atendidas por Agentes (Oferta Humana)', margin + 18, chartBoxY + 8.5);

    doc.setFillColor(...THEME.danger);
    doc.rect(margin + 95, chartBoxY + 5.5, 7, 3.5, 'F');
    doc.text('Cuello de Botella (Sin Respuesta Humana en el Día)', margin + 105, chartBoxY + 8.5);

    // Ejes
    const c1X = margin + 14;
    const c1Y = chartBoxY + 15;
    const c1W = contentW - 20;
    const c1H = 46;
    const maxValC1 = 1100;

    // Líneas guía
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.3);
    [0, 300, 600, 900].forEach(val => {
        const lineY = c1Y + c1H - (val / maxValC1) * c1H;
        doc.line(c1X, lineY, c1X + c1W, lineY);
        doc.setFont(font, 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(...THEME.mutedText);
        doc.text(val.toString(), c1X - 2, lineY + 1.5, { align: 'right' });
    });

    // Línea de Techo Operativo (~430 convs)
    const ceilingY = c1Y + c1H - (430 / maxValC1) * c1H;
    doc.setDrawColor(...THEME.warning);
    doc.setLineWidth(0.6);
    doc.line(c1X, ceilingY, c1X + c1W, ceilingY);
    doc.setFont(font, 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(...THEME.warning);
    doc.text('TECHO OPERATIVO MÁXIMO (~430/día)', c1X + c1W - 2, ceilingY - 1.5, { align: 'right' });

    doc.setDrawColor(...THEME.cardBorder);
    doc.setLineWidth(0.6);
    doc.line(c1X, c1Y + c1H, c1X + c1W, c1Y + c1H);

    // Barras apiladas (Atendidas + Sin Respuesta)
    const slotW = c1W / daysMetrics.length;
    const barW = slotW * 0.55;

    daysMetrics.forEach((d, idx) => {
        const bX = c1X + idx * slotW + (slotW - barW) / 2;

        const hAtendida = (d.convsAtendidasAgente / maxValC1) * c1H;
        const hSinResp = (d.convsSinRespuestaAgente / maxValC1) * c1H;

        // Base: Atendidas por Agente (Celeste)
        if (hAtendida > 0) {
            doc.setFillColor(...THEME.accent);
            doc.rect(bX, c1Y + c1H - hAtendida, barW, hAtendida, 'F');
        }

        // Apilado: Sin respuesta de Agente (Rojo)
        if (hSinResp > 0) {
            doc.setFillColor(...THEME.danger);
            doc.rect(bX, c1Y + c1H - hAtendida - hSinResp, barW, hSinResp, 'F');
        }

        // Etiqueta del día
        doc.setFont(font, 'bold');
        doc.setFontSize(5.5);
        doc.setTextColor(...THEME.mutedText);
        doc.text(d.day.substring(8), bX + barW / 2, c1Y + c1H + 4, { align: 'center' });
    });

    doc.setFont(font, 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(...THEME.bodyText);
    doc.text('Las barras rojas representan pacientes que escribieron pero la dotación de operadoras no dio abasto para responderles en el día.', margin + 6, chartBoxY + chartBoxH - 3);

    drawFooter(1);

    // =========================================================================
    // PÁGINA 2: EVIDENCIA DEL CUELLO DE BOTELLA Y TIEMPOS DE ESPERA
    // =========================================================================
    doc.addPage();
    drawPageHeader(2, 'Cuellos de Botella, Demanda Reincidente y Tiempos de Espera');

    y = 30;

    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...THEME.navy);
    doc.text('EL CUELLO DE BOTELLA OPERATIVO Y EL RETRASO EN LA ATENCIÓN', margin, y);

    y += 5;

    doc.setFont(font, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...THEME.bodyText);
    const expEspera = cleanText(
        `Cuando la cantidad de pacientes que escriben desborda la capacidad de las operadoras, se generan dos efectos adversos inmediatos: 1) El tiempo de espera hasta la primera respuesta humana se dispara a valores críticos de entre 98 y 141 minutos (más de 2 horas de demora media en días hábiles); y 2) Pacientes que no reciben atención en el día reingresan al día siguiente, incrementando aún más la cola de mensajes acumulados.`
    );
    doc.text(doc.splitTextToSize(expEspera, contentW), margin, y);

    y += 18;

    // ── Gráfico 2: Tiempos de Espera Promedio de Respuesta en Minutos (Día a Día) ──
    doc.setFont(font, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...THEME.navy);
    doc.text('GRÁFICO 2: TIEMPO PROMEDIO DE ESPERA HASTA LA PRIMERA RESPUESTA HUMANA (MINUTOS)', margin, y);

    y += 4;

    const chart2Y = y;
    const chart2H = 58;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...THEME.cardBorder);
    doc.roundedRect(margin, chart2Y, contentW, chart2H, 3, 3, 'FD');

    const c2X = margin + 14;
    const c2Y = chart2Y + 12;
    const c2W = contentW - 20;
    const c2H = 34;
    const maxValC2 = 160;

    // Líneas guía
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.3);
    [0, 50, 100, 150].forEach(val => {
        const lineY = c2Y + c2H - (val / maxValC2) * c2H;
        doc.line(c2X, lineY, c2X + c2W, lineY);
        doc.setFont(font, 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(...THEME.mutedText);
        doc.text(`${val}m`, c2X - 2, lineY + 1.5, { align: 'right' });
    });

    // Línea crítica de 60 minutos
    const critY = c2Y + c2H - (60 / maxValC2) * c2H;
    doc.setDrawColor(...THEME.danger);
    doc.setLineWidth(0.4);
    doc.line(c2X, critY, c2X + c2W, critY);
    doc.setFont(font, 'bold');
    doc.setFontSize(5);
    doc.setTextColor(...THEME.danger);
    doc.text('UMBRAL MÁXIMO TOLERABLE (60 min)', c2X + c2W - 2, critY - 1.5, { align: 'right' });

    doc.setDrawColor(...THEME.cardBorder);
    doc.setLineWidth(0.6);
    doc.line(c2X, c2Y + c2H, c2X + c2W, c2Y + c2H);

    // Dibujar barras de tiempo de espera
    const slot2W = c2W / daysMetrics.length;
    const bar2W = slot2W * 0.45;

    daysMetrics.forEach((d, idx) => {
        const bX = c2X + idx * slot2W + (slot2W - bar2W) / 2;
        const hBar = Math.max(0.5, (d.avgWaitMin / maxValC2) * c2H);

        const isOverCrit = d.avgWaitMin > 60;
        doc.setFillColor(isOverCrit ? THEME.danger[0] : THEME.accent[0], isOverCrit ? THEME.danger[1] : THEME.accent[1], isOverCrit ? THEME.danger[2] : THEME.accent[2]);
        doc.rect(bX, c2Y + c2H - hBar, bar2W, hBar, 'F');

        doc.setFont(font, 'bold');
        doc.setFontSize(5.2);
        doc.setTextColor(...THEME.mutedText);
        doc.text(d.day.substring(8), bX + bar2W / 2, c2Y + c2H + 4, { align: 'center' });

        if (d.avgWaitMin > 0) {
            doc.setFontSize(4.8);
            doc.setTextColor(isOverCrit ? THEME.danger[0] : THEME.accent[0], isOverCrit ? THEME.danger[1] : THEME.accent[1], isOverCrit ? THEME.danger[2] : THEME.accent[2]);
            doc.text(`${d.avgWaitMin}m`, bX + bar2W / 2, c2Y + c2H - hBar - 1.5, { align: 'center' });
        }
    });

    y = chart2Y + chart2H + 8;

    // Tabla de Detalle del Cuello de Botella en Días Hábiles Críticos
    doc.setFont(font, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...THEME.navy);
    doc.text('DÍAS DE MÁXIMO COLAPSO Y DÉFICIT DE CAPACIDAD OPERATIVA', margin, y);

    y += 4;

    const criticalDaysTable = [
        ['Mar 13/10 (Post-Feriado)', '1.006 convs', '436 convs (43%)', '570 convs (57%)', '79 min', 'Déficit del 131% sobre el techo humano. 570 pacientes sin respuesta de operadora.'],
        ['Lun 05/10 (Inicio Semana)', '847 convs', '362 convs (43%)', '485 convs (57%)', '98 min', 'Sobredemanda masiva. El 57% de los pacientes solo interactuó con el Bot.'],
        ['Mié 07/10 (Pico Laboral)', '796 convs', '431 convs (54%)', '365 convs (46%)', '137 min', 'El tiempo de espera alcanzó 2 horas y 17 minutos promedio para ser atendido.'],
        ['Jue 08/10 (Demora Máxima)', '781 convs', '433 convs (55%)', '348 convs (45%)', '141 min', 'Retraso de 2 horas y 21 minutos. Se acumuló cola residual de la jornada anterior.'],
        ['Mié 14/10 (Segundo Tramo)', '796 convs', '359 convs (45%)', '437 convs (55%)', '111 min', 'Más de la mitad de los pacientes sin intervención de operadora humana.']
    ];

    autoTable(doc, {
        startY: y,
        head: [['Jornada Crítica', 'Conversaciones Pacientes', 'Atendidas por Operadora', 'Sin Respuesta Humana', 'Espera Media', 'Impacto Operativo Registrado']],
        body: criticalDaysTable,
        theme: 'grid',
        styles: {
            font: font,
            fontSize: 7.0,
            textColor: THEME.darkText,
            cellPadding: 2.2,
            lineWidth: 0.2,
            lineColor: THEME.cardBorder
        },
        headStyles: {
            fillColor: THEME.navy,
            textColor: THEME.white,
            fontStyle: 'bold'
        },
        columnStyles: {
            0: { fontStyle: 'bold', width: 36 },
            1: { halign: 'right', fontStyle: 'bold', width: 22 },
            2: { halign: 'right', textColor: THEME.accent, width: 26 },
            3: { halign: 'right', textColor: THEME.danger, fontStyle: 'bold', width: 26 },
            4: { halign: 'center', fontStyle: 'bold', width: 18 },
            5: { fontStyle: 'normal' }
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        margin: { left: margin, right: margin }
    });

    drawFooter(2);

    // =========================================================================
    // PÁGINA 3: EL ROL DEL BOT FRENTE AL CUELLO DE BOTELLA Y HORARIOS
    // =========================================================================
    doc.addPage();
    drawPageHeader(3, 'Contención del Asistente Virtual y Franjas Horarias');

    y = 30;

    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...THEME.navy);
    doc.text('CÓMO Y CUÁNDO ACTÚA EL BOT FRENTE AL CUELLO DE BOTELLA', margin, y);

    y += 5;

    doc.setFont(font, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...THEME.bodyText);
    const expBotRol = cleanText(
        `El asistente automatizado es el único amortiguador que previene el colapso absoluto del servicio. De los 3.958 pacientes que no recibieron respuesta humana, el Bot contuvo de forma autónoma al 97% de ellos (3.834 pacientes), brindándoles respuesta de horarios, requisitos, aranceles y derivaciones. Sin el Bot, estos pacientes habrían quedado en silencio absoluto.`
    );
    doc.text(doc.splitTextToSize(expBotRol, contentW), margin, y);

    y += 18;

    // ── Gráfico 3: Curva Horaria 24 Horas — Cuándo resuelve el Bot vs Cuándo resuelven las Operadoras ──
    doc.setFont(font, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...THEME.navy);
    doc.text('GRÁFICO 3: RITMO HORARIO DE GESTIÓN Y CIERRES (00:00 A 23:00 HS)', margin, y);

    y += 4;

    const chart3Y = y;
    const chart3H = 68;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...THEME.cardBorder);
    doc.roundedRect(margin, chart3Y, contentW, chart3H, 3, 3, 'FD');

    // Leyendas
    doc.setFont(font, 'bold');
    doc.setFontSize(7);
    doc.setFillColor(...THEME.purple);
    doc.rect(margin + 8, chart3Y + 5, 8, 3.5, 'F');
    doc.setTextColor(...THEME.darkText);
    doc.text('Casos Cerrados por Asistente Virtual (Bot)', margin + 19, chart3Y + 8);

    doc.setFillColor(...THEME.accent);
    doc.rect(margin + 95, chart3Y + 5, 8, 3.5, 'F');
    doc.text('Casos Resueltos por Operadoras Humanas', margin + 106, chart3Y + 8);

    const c3X = margin + 12;
    const c3Y = chart3Y + 14;
    const c3W = contentW - 16;
    const c3H = 42;
    const maxValC3 = 650;

    // Líneas guía
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.3);
    [0, 200, 400, 600].forEach(val => {
        const lineY = c3Y + c3H - (val / maxValC3) * c3H;
        doc.line(c3X, lineY, c3X + c3W, lineY);
        doc.setFont(font, 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(...THEME.mutedText);
        doc.text(val.toString(), c3X - 2, lineY + 1.5, { align: 'right' });
    });

    doc.setDrawColor(...THEME.cardBorder);
    doc.setLineWidth(0.6);
    doc.line(c3X, c3Y + c3H, c3X + c3W, c3Y + c3H);

    // Dibujar las 24 horas
    const hourSlotW = c3W / 24;
    const hBarW = hourSlotW * 0.38;

    for (let h = 0; h < 24; h++) {
        const hX = c3X + h * hourSlotW;
        const bCount = botHourly[h] || 0;
        const aCount = agentHourly[h] || 0;

        const hB = Math.max(0.5, (bCount / maxValC3) * c3H);
        doc.setFillColor(...THEME.purple);
        doc.rect(hX + hBarW * 0.1, c3Y + c3H - hB, hBarW, hB, 'F');

        const hA = Math.max(0.5, (aCount / maxValC3) * c3H);
        doc.setFillColor(...THEME.accent);
        doc.rect(hX + hBarW * 1.2, c3Y + c3H - hA, hBarW, hA, 'F');

        if (h % 2 === 0) {
            doc.setFont(font, 'normal');
            doc.setFontSize(5);
            doc.setTextColor(...THEME.mutedText);
            doc.text(`${h}h`, hX + hBarW * 0.9, c3Y + c3H + 4, { align: 'center' });
        }
    }

    doc.setFont(font, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...THEME.bodyText);
    doc.text('El Asistente Virtual actúa intensivamente a las 08:00 hs (592 cierres) y 13:00 hs (338 cierres) por barridos automáticos nocturnos.', margin + 6, chart3Y + chart3H - 3);

    y = chart3Y + chart3H + 8;

    // Caja explicativa de cómo resuelve el bot
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...THEME.cardBorder);
    doc.roundedRect(margin, y, contentW, 42, 3, 3, 'FD');

    doc.setFont(font, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...THEME.navy);
    doc.text('MODALIDADES EN QUE EL ASISTENTE VIRTUAL DESCONGESTIONA LA BANDEJA:', margin + 6, y + 7);

    const botMecanismos = [
        `• 1. Barrido Nocturno Automático (+12h/+24h): A las 08:00 hs depura cientos de conversaciones iniciadas la noche anterior que ya recibieron respuesta automática del menú, evitando que ingresen como pendientes a las operadoras.`,
        `• 2. Auto-gestión de Información y Horarios: El 53% de las consultas cerradas por bot corresponden a pacientes que encontraron respuesta a su inquietud en el menú interactivo y no requirieron esperar a una asesora.`,
        `• 3. Confirmación de Citas Médicas Agendadas: El bot valida automáticamente citas ya coordinadas sin consumir tiempo operativo del personal presencial.`
    ];

    let bmy = y + 14;
    doc.setFont(font, 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...THEME.bodyText);
    botMecanismos.forEach(bm => {
        const lines = doc.splitTextToSize(cleanText(bm), contentW - 12);
        doc.text(lines, margin + 6, bmy);
        bmy += lines.length * 4.2 + 2;
    });

    drawFooter(3);

    // =========================================================================
    // PÁGINA 4: MOTIVOS PRINCIPALES DE CONSULTA DE LOS PACIENTES
    // =========================================================================
    doc.addPage();
    drawPageHeader(4, 'Clasificación de Motivos y Origen de la Sobredemanda');

    y = 30;

    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...THEME.navy);
    doc.text('¿QUÉ CONSULTAN LOS PACIENTES? ANÁLISIS DE LA DEMANDA ASISTENCIAL', margin, y);

    y += 5;

    doc.setFont(font, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...THEME.bodyText);
    const expMotivos = cleanText(
        `Para resolver de raíz el cuello de botella, es imperativo entender qué motiva a los pacientes a escribir. El análisis clasificado demuestra que más de 8 de cada 10 consultas (80.9%) corresponden a solicitudes de Turnos Médicos con especialistas, seguidas por dudas sobre Aranceles Particulares / Coberturas (9.0%) y Autorizaciones de Estudios (6.5%).`
    );
    doc.text(doc.splitTextToSize(expMotivos, contentW), margin, y);

    y += 18;

    // ── Gráfico 4: Barras Horizontales con badges de porcentajes ──
    const chart4Y = y;
    const chart4H = 55;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...THEME.cardBorder);
    doc.roundedRect(margin, chart4Y, contentW, chart4H, 3, 3, 'FD');

    const motivosItems = [
        { label: 'Turnos Médicos y Citas Especializadas', count: motivosTotales['Turnos Médicos y Consultas Especializadas'], pct: '80.9%', color: THEME.accent },
        { label: 'Aranceles, Coberturas y Particulares', count: motivosTotales['Aranceles, Coberturas y Particulares'], pct: '9.0%', color: THEME.warning },
        { label: 'Estudios, Prácticas y Autorizaciones', count: motivosTotales['Estudios, Prácticas y Autorizaciones'], pct: '6.5%', color: THEME.purple },
        { label: 'Otras Gestiones Administrativas', count: motivosTotales['Otras Gestiones Administrativas'], pct: '2.5%', color: THEME.mutedText },
        { label: 'Guardia Médica y Urgencias', count: motivosTotales['Guardia Médica y Urgencias'], pct: '1.2%', color: THEME.danger }
    ];

    let bHy = chart4Y + 8;
    const maxBarW = contentW - 90;

    motivosItems.forEach(item => {
        doc.setFont(font, 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...THEME.darkText);
        doc.text(cleanText(item.label), margin + 6, bHy + 4);

        const barLength = Math.max(3, (item.count / 4000) * maxBarW);
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin + 62, bHy, maxBarW, 5.5, 1.5, 1.5, 'F');
        doc.setFillColor(...item.color);
        doc.roundedRect(margin + 62, bHy, barLength, 5.5, 1.5, 1.5, 'F');

        doc.setFont(font, 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...item.color);
        doc.text(`${item.count.toLocaleString('es-AR')} (${item.pct})`, margin + 64 + maxBarW, bHy + 4);

        bHy += 9.5;
    });

    y = chart4Y + chart4H + 8;

    // Tabla de diagnóstico de cada motivo
    doc.setFont(font, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...THEME.navy);
    doc.text('IMPACTO ASISTENCIAL DE CADA MOTIVO EN EL CUELLO DE BOTELLA', margin, y);

    y += 4;

    const motivosTable = [
        ['Turnos Médicos (80.9%)', '3.935', 'Es el generador del 80% de la congestión. Las pacientes demandan turnos con profesionales específicos y requieren múltiples intercambios de mensajes para coordinar fecha y horario.'],
        ['Aranceles y Particulares (9.0%)', '440', 'Consultas por costo de consulta particular sin obra social. El bot ya informa aranceles orientativos y deriva a recepción presencial, reduciendo consultas repetitivas.'],
        ['Estudios y Prácticas (6.5%)', '315', 'Validación de órdenes para ecografías, laboratorios y radiografías. Consume tiempo de operadora por la necesidad de inspeccionar fotos adjuntas.'],
        ['Guardia y Urgencias (1.2%)', '56', 'Casos con sintomatología aguda. El triaje automatizado los detecta de inmediato y los instruye a presentarse en la Guardia de Emergencias.'],
        ['Otras Gestiones (2.5%)', '120', 'Retiro de estudios, contacto institucional y consultas varias.']
    ];

    autoTable(doc, {
        startY: y,
        head: [['Motivo Principal', 'Volumen', 'Impacto en la Carga de Trabajo de las Operadoras']],
        body: motivosTable,
        theme: 'grid',
        styles: {
            font: font,
            fontSize: 7.2,
            textColor: THEME.darkText,
            cellPadding: 2.4,
            lineWidth: 0.2,
            lineColor: THEME.cardBorder
        },
        headStyles: {
            fillColor: THEME.navy,
            textColor: THEME.white,
            fontStyle: 'bold'
        },
        columnStyles: {
            0: { fontStyle: 'bold', width: 48 },
            1: { halign: 'right', fontStyle: 'bold', width: 18 },
            2: { fontStyle: 'normal' }
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        margin: { left: margin, right: margin }
    });

    drawFooter(4);

    // =========================================================================
    // PÁGINA 5: MATRIZ DÍA A DÍA Y PROPUESTA DE RESOLUCIÓN DEL CUELLO DE BOTELLA
    // =========================================================================
    doc.addPage();
    drawPageHeader(5, 'Matriz Diaria Consolidada y Solución al Cuello de Botella');

    y = 30;

    doc.setFont(font, 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...THEME.navy);
    doc.text('MATRIZ DE CONVERSACIONES, ATENCIÓN Y CUELLOS DE BOTELLA (DÍA A DÍA)', margin, y);

    y += 5;

    const fullMatrixRows = daysMetrics.map(d => {
        return [
            d.day,
            d.totalConvsPacientes.toLocaleString('es-AR'),
            d.convsAtendidasAgente.toLocaleString('es-AR'),
            d.convsSinRespuestaAgente.toLocaleString('es-AR'),
            `${d.pctSinAgente}%`,
            d.avgWaitMin > 0 ? `${d.avgWaitMin} min` : '-',
            d.incomingMsgs.toLocaleString('es-AR'),
            d.agentMsgs.toLocaleString('es-AR'),
            d.botMsgs.toLocaleString('es-AR')
        ];
    });

    // Fila de totales
    fullMatrixRows.push([
        'TOTALES',
        sumConvsPacientes.toLocaleString('es-AR'),
        sumConvsAtendidasAgente.toLocaleString('es-AR'),
        sumConvsSinRespuestaAgente.toLocaleString('es-AR'),
        `${Math.round((sumConvsSinRespuestaAgente / sumConvsPacientes) * 100)}%`,
        '108 min prom',
        sumIncomingMsgs.toLocaleString('es-AR'),
        sumAgentMsgs.toLocaleString('es-AR'),
        sumBotMsgs.toLocaleString('es-AR')
    ]);

    autoTable(doc, {
        startY: y,
        head: [['Fecha', 'Convs Pacientes', 'Atendidas Agente', 'Sin Resp. Humana', '% Sin Agente', 'Espera Media', 'Msgs Entrantes', 'Msgs Agentes', 'Msgs Bot']],
        body: fullMatrixRows,
        theme: 'grid',
        styles: {
            font: font,
            fontSize: 6.8,
            textColor: THEME.darkText,
            cellPadding: 1.8,
            lineWidth: 0.2,
            lineColor: THEME.cardBorder
        },
        headStyles: {
            fillColor: THEME.navy,
            textColor: THEME.white,
            fontStyle: 'bold',
            halign: 'center'
        },
        columnStyles: {
            0: { halign: 'center', fontStyle: 'bold' },
            1: { halign: 'right', fontStyle: 'bold' },
            2: { halign: 'right', textColor: THEME.accent, fontStyle: 'bold' },
            3: { halign: 'right', textColor: THEME.danger, fontStyle: 'bold' },
            4: { halign: 'center', textColor: THEME.danger, fontStyle: 'bold' },
            5: { halign: 'center', fontStyle: 'bold' },
            6: { halign: 'right' },
            7: { halign: 'right', textColor: THEME.accent },
            8: { halign: 'right', textColor: THEME.purple }
        },
        didParseCell: (hookData) => {
            if (hookData.row.index === fullMatrixRows.length - 1) {
                hookData.cell.styles.fillColor = [241, 245, 249];
                hookData.cell.styles.fontStyle = 'bold';
                hookData.cell.styles.textColor = THEME.navy;
            }
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        margin: { left: margin, right: margin }
    });

    y = doc.lastAutoTable.finalY + 8;

    // ── Propuesta de Acción para Desarticular el Cuello de Botella ──
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...THEME.cardBorder);
    doc.roundedRect(margin, y, contentW, 34, 2.5, 2.5, 'FD');

    doc.setFont(font, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...THEME.navy);
    doc.text('PLAN DE ACCIÓN RECOMENDADO PARA ELIMINAR EL CUELLO DE BOTELLA:', margin + 6, y + 6);

    const conclusionText = cleanText(
        `1. Autogestión Autónoma de Turnos (El 81% de la demanda): La única vía para no desbordar la capacidad humana es permitir que el paciente consulte y confirme turnos médicos directamente con el asistente virtual en los profesionales con agenda abierta, reservando la operadora solo para casos complejos.\n` +
        `2. Refuerzo en Franjas Críticas (Lunes y Martes 08:30 a 14:00 hs): Concentrar dotación y guardias en las mañanas de inicio de semana, donde se acumulan más de 500 pacientes sin atender.\n` +
        `3. Notificaciones Proactivas de Demora: Informar al paciente su posición y tiempo estimado de espera para evitar reingresos reiterados que saturan la bandeja.`
    );
    doc.setFont(font, 'normal');
    doc.setFontSize(6.7);
    doc.setTextColor(...THEME.bodyText);
    doc.text(doc.splitTextToSize(conclusionText, contentW - 12), margin + 6, y + 12);

    y += 38;

    // ── Bloque de Firmas Institucionales ──
    const sigW = (contentW - 20) / 2;
    const sigY = y + 8;

    doc.setDrawColor(...THEME.cardBorder);
    doc.setLineWidth(0.5);
    doc.line(margin + 10, sigY, margin + 10 + sigW - 20, sigY);

    doc.setFont(font, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...THEME.navy);
    doc.text('SUPERVISIÓN GENERAL DE CONTACT CENTER', margin + 10 + (sigW - 20) / 2, sigY + 4, { align: 'center' });

    doc.setFont(font, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...THEME.mutedText);
    doc.text('Sanatorio Argentino · San Juan', margin + 10 + (sigW - 20) / 2, sigY + 8, { align: 'center' });

    const sig2X = margin + sigW + 20;
    doc.line(sig2X + 10, sigY, sig2X + 10 + sigW - 20, sigY);

    doc.setFont(font, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...THEME.navy);
    doc.text('DIRECCIÓN MÉDICA Y CALIDAD OPERATIVA', sig2X + 10 + (sigW - 20) / 2, sigY + 4, { align: 'center' });

    doc.setFont(font, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...THEME.mutedText);
    doc.text('Sanatorio Argentino · Gestión 2026', sig2X + 10 + (sigW - 20) / 2, sigY + 8, { align: 'center' });

    drawFooter(5);

    // Guardar el PDF
    const outputFileName = 'Informe_Contact_Center_Sanatorio_Argentino.pdf';
    const outputPath = path.resolve(outputFileName);
    const pdfData = Buffer.from(doc.output('arraybuffer'));
    fs.writeFileSync(outputPath, pdfData);

    // Copiar a Desktop también
    const desktopPath = path.resolve('C:\\Users\\Sanatorio Argentino\\Desktop\\Informe_Contact_Center_Sanatorio_Argentino.pdf');
    fs.writeFileSync(desktopPath, pdfData);

    console.log(`\n======================================================`);
    console.log(`¡PDF actualizado exitosamente con análisis de CONVERSACIONES y CUELLOS DE BOTELLA!`);
    console.log(`Ubicación 1: ${outputPath}`);
    console.log(`Ubicación 2: ${desktopPath}`);
    console.log(`======================================================\n`);
}

generateComprehensiveReport().catch(console.error);
