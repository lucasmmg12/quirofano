/**
 * reunionesServicioExporters.js
 * Exportadores institucionales oficiales para "Reuniones de Servicio" (Sanatorio Argentino):
 *  1. exportInformesRdir04Excel(informes, servicioNombre) -> Excel (.xlsx) multi-hoja idéntico a RDIR 04 + Instructivo + Fotos
 *  2. exportInformeMensualPptx(informe)                   -> PowerPoint (.pptx) mes por mes con Logo SA + Insights Ejecutivos + Fotos
 *  3. exportRevisionDireccionPptx(revision)               -> PowerPoint (.pptx) ejecutivo de Revisión por la Dirección
 *  4. exportObjetivos2027Excel(objetivos, metaInfo)       -> Excel (.xlsx) idéntico a Propuesta de Objetivos 2027 + Guía Oficial
 */

import { SANATORIO_LOGO_BASE64 } from './sanatorioLogoBase64';
import { formatPeriodoLabel, OBJETIVO_OFICIAL_RDIR04 } from '../services/reunionesServicioService';

const loadExcelJS = async () => (await import('exceljs')).default;
const loadPptxGenJS = async () => (await import('pptxgenjs')).default;

const COLORS = {
    navy: 'FF003B73',
    blue: 'FF1E40AF',
    blueSoft: 'FFEFF6FF',
    blueBorder: 'FFBFDBFE',
    slateDark: 'FF0F172A',
    slateMuted: 'FF475569',
    zebra: 'FFF8FAFC',
    white: 'FFFFFFFF',
    border: 'FFCBD5E1',
    greenBg: 'FFDCFCE7',
    greenTxt: 'FF166534',
    amberBg: 'FFFEF3C7',
    amberTxt: 'FF92400E',
    redBg: 'FFFEE2E2',
    redTxt: 'FF991B1B',
};

function triggerDownloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 300);
}

async function resolveImageDataUrl(foto) {
    if (foto?.dataUrl && foto.dataUrl.startsWith('data:image/')) return foto.dataUrl;
    if (foto?.url && foto.url.startsWith('data:image/')) return foto.url;
    if (!foto?.url) return null;
    try {
        const res = await fetch(foto.url);
        const blob = await res.blob();
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

function styleRangeBorder(ws, rStart, cStart, rEnd, cEnd, borderColor = COLORS.border) {
    for (let r = rStart; r <= rEnd; r++) {
        for (let c = cStart; c <= cEnd; c++) {
            const cell = ws.getCell(r, c);
            cell.border = {
                top: { style: 'thin', color: { argb: borderColor } },
                left: { style: 'thin', color: { argb: borderColor } },
                bottom: { style: 'thin', color: { argb: borderColor } },
                right: { style: 'thin', color: { argb: borderColor } },
            };
        }
    }
}

function addSectionHeader(ws, title, colCount = 9) {
    ws.addRow([]);
    const row = ws.addRow([title]);
    const rIdx = row.number;
    row.height = 24;
    ws.mergeCells(rIdx, 1, rIdx, colCount);
    const c = ws.getCell(rIdx, 1);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.white } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    return rIdx;
}

function addTableHeaderRow(ws, headers) {
    const row = ws.addRow(headers);
    row.height = 22;
    headers.forEach((_, i) => {
        const cell = row.getCell(i + 1);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blueSoft } };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.navy } };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: COLORS.blueBorder } },
            left: { style: 'thin', color: { argb: COLORS.blueBorder } },
            bottom: { style: 'medium', color: { argb: COLORS.blue } },
            right: { style: 'thin', color: { argb: COLORS.blueBorder } },
        };
    });
    return row;
}

function applyStatusBadgeCell(cell, val) {
    const v = String(val || '').toLowerCase();
    if (v.includes('cumplido') || v.includes('mejora') || v.includes('favorable')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.greenBg } };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.greenTxt } };
    } else if (v.includes('deterioro') || v.includes('vencid') || v.includes('riesgo') || v.includes('crític')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redBg } };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.redTxt } };
    } else if (v.includes('curso') || v.includes('parcial') || v.includes('estable')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.amberBg } };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.amberTxt } };
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}

// ============================================================================
// 1. EXPORTADOR EXCEL MULTI-HOJA IDÉNTICO A "RDIR 04"
// ============================================================================
export async function exportInformesRdir04Excel(informes = [], servicioNombre = 'Diagnóstico por Imágenes') {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sanatorio Argentino · Gobernanza de Datos';
    wb.created = new Date();

    let logoId = null;
    try {
        logoId = wb.addImage({ base64: SANATORIO_LOGO_BASE64, extension: 'png' });
    } catch (_) { /* ignore */ }

    const sorted = [...informes].sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));

    for (const inf of sorted) {
        const sheetName = formatPeriodoLabel(inf.periodo).slice(0, 31) || inf.periodo;
        const ws = wb.addWorksheet(sheetName, {
            views: [{ showGridLines: true }],
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
        });

        ws.columns = [
            { width: 14 }, // A: N° / Etiqueta
            { width: 36 }, // B: Acción / Indicador / Campo
            { width: 16 }, // C: Unidad / Origen
            { width: 24 }, // D: Meta / Vínculo
            { width: 18 }, // E: Mes ant / Responsable
            { width: 18 }, // F: Mes act / Fecha obj
            { width: 14 }, // G: Variación / Estado
            { width: 15 }, // H: Tendencia
            { width: 44 }, // I: Comentario ejecutivo / Avance / Dificultad
        ];

        // ── ENCABEZADO OFICIAL RDIR 04 ──
        const r1 = ws.addRow(['SANATORIO ARGENTINO\nDIRECCIÓN', '', 'INFORME EJECUTIVO DE SERVICIO', '', '', '', '', 'Registro', inf.codigo_registro || 'RDIR 04']);
        r1.height = 38;
        ws.mergeCells(1, 1, 2, 2);
        ws.mergeCells(1, 3, 2, 7);
        const r2 = ws.addRow(['', '', '', '', '', '', '', 'Versión', 'Vigencia 2026']);
        r2.height = 20;

        styleRangeBorder(ws, 1, 1, 2, 9, COLORS.navy);
        const cOrg = ws.getCell(1, 1);
        cOrg.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.white } };
        cOrg.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.navy } };
        cOrg.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

        const cTit = ws.getCell(1, 3);
        cTit.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
        cTit.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLORS.white } };
        cTit.alignment = { vertical: 'middle', horizontal: 'center' };

        [ws.getCell(1, 8), ws.getCell(2, 8)].forEach(c => {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blueSoft } };
            c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.navy } };
            c.alignment = { vertical: 'middle', horizontal: 'center' };
        });
        [ws.getCell(1, 9), ws.getCell(2, 9)].forEach(c => {
            c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.slateDark } };
            c.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        if (logoId !== null) {
            ws.addImage(logoId, { tl: { col: 0.12, row: 0.15 }, ext: { width: 42, height: 42 } });
        }

        // ── OBJETIVO DEL INFORME ──
        ws.addRow([]);
        const rObjHead = ws.addRow(['OBJETIVO DEL INFORME']);
        ws.mergeCells(rObjHead.number, 1, rObjHead.number, 9);
        rObjHead.height = 20;
        rObjHead.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blueSoft } };
        rObjHead.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.navy } };

        const rObjBody = ws.addRow([inf.objetivo_informe || OBJETIVO_OFICIAL_RDIR04]);
        ws.mergeCells(rObjBody.number, 1, rObjBody.number, 9);
        rObjBody.height = 30;
        rObjBody.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.slateMuted } };
        rObjBody.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        styleRangeBorder(ws, rObjHead.number, 1, rObjBody.number, 9);

        // ── 1. IDENTIFICACIÓN Y RESUMEN EJECUTIVO ──
        addSectionHeader(ws, '1. IDENTIFICACIÓN Y RESUMEN EJECUTIVO', 9);
        const metaRows = [
            ['Servicio', inf.servicio_nombre || servicioNombre, '', '', 'Responsable', inf.responsable || '—', '', '', ''],
            ['Fecha de reunión', inf.fecha_reunion || '—', '', '', 'Participantes', inf.participantes || '—', '', '', ''],
            ['Informe del Mes', `${inf.periodo}-01 (${formatPeriodoLabel(inf.periodo)})`, '', '', 'Tutor', inf.tutor || '—', '', '', ''],
            ['Estado general', inf.estado_general || '—', '', '', '', '', '', '', ''],
        ];
        metaRows.forEach((mr, idx) => {
            const row = ws.addRow(mr);
            row.height = 22;
            const rn = row.number;
            ws.mergeCells(rn, 2, rn, 4);
            if (idx < 3) {
                ws.mergeCells(rn, 6, rn, 9);
                row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebra } };
                row.getCell(5).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.navy } };
                row.getCell(6).font = { name: 'Calibri', size: 10, color: { argb: COLORS.slateDark } };
            } else {
                ws.mergeCells(rn, 2, rn, 9);
                applyStatusBadgeCell(row.getCell(2), inf.estado_general);
                row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
            }
            row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebra } };
            row.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.navy } };
            if (idx < 3) row.getCell(2).font = { name: 'Calibri', size: 10, bold: idx === 0, color: { argb: COLORS.slateDark } };
            styleRangeBorder(ws, rn, 1, rn, 9);
        });

        // Resumen ejecutivo
        const rResLbl = ws.addRow(['Resumen ejecutivo del período']);
        ws.mergeCells(rResLbl.number, 1, rResLbl.number, 9);
        rResLbl.height = 20;
        rResLbl.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blueSoft } };
        rResLbl.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.navy } };

        const resumenTxt = inf.resumen_ejecutivo || 'Sin resumen ejecutivo registrado.';
        const rResVal = ws.addRow([resumenTxt]);
        ws.mergeCells(rResVal.number, 1, rResVal.number, 9);
        const lineEstimate = Math.max(3, Math.ceil(resumenTxt.length / 115) + (resumenTxt.split('\n').length));
        rResVal.height = Math.min(260, lineEstimate * 15);
        rResVal.getCell(1).font = { name: 'Calibri', size: 10, color: { argb: COLORS.slateDark } };
        rResVal.getCell(1).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        styleRangeBorder(ws, rResLbl.number, 1, rResVal.number, 9);

        // Compromisos acordados (si existen)
        if (Array.isArray(inf.compromisos_acordados) && inf.compromisos_acordados.length > 0) {
            ws.addRow([]);
            const rCompSub = ws.addRow(['Compromisos acordados en la reunión']);
            ws.mergeCells(rCompSub.number, 1, rCompSub.number, 9);
            rCompSub.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.blue } };

            addTableHeaderRow(ws, ['N°', 'Compromiso acordado', '', '', '', 'Responsable', '', 'Fecha / Seguimiento', '']);
            const hNum = ws.lastRow.number;
            ws.mergeCells(hNum, 2, hNum, 5);
            ws.mergeCells(hNum, 6, hNum, 7);
            ws.mergeCells(hNum, 8, hNum, 9);

            inf.compromisos_acordados.forEach((c, idx) => {
                const rr = ws.addRow([c.nro || idx + 1, c.compromiso || '', '', '', '', c.responsable || '', '', c.fecha_seguimiento || '', '']);
                const rn = rr.number;
                ws.mergeCells(rn, 2, rn, 5);
                ws.mergeCells(rn, 6, rn, 7);
                ws.mergeCells(rn, 8, rn, 9);
                rr.height = Math.max(22, Math.ceil(String(c.compromiso || '').length / 65) * 15);
                rr.eachCell(cell => {
                    cell.font = { name: 'Calibri', size: 9.5, color: { argb: COLORS.slateDark } };
                    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
                });
                rr.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
                styleRangeBorder(ws, rn, 1, rn, 9);
            });
        }

        // ── 2. SEGUIMIENTO DEL PLAN DE ACCIÓN DE LA REVISIÓN ──
        addSectionHeader(ws, '2. SEGUIMIENTO DEL PLAN DE ACCIÓN DE LA REVISIÓN', 9);
        addTableHeaderRow(ws, ['N°', 'Acción / compromiso', 'Vínculo Bitrix', 'Responsable', 'Fecha objetivo', 'Estado', 'Avance del mes', '', 'Dificultad / desvío']);
        ws.mergeCells(ws.lastRow.number, 7, ws.lastRow.number, 8);

        (inf.plan_accion || []).forEach(pa => {
            const rr = ws.addRow([
                pa.codigo || '',
                pa.accion || '',
                pa.vinculo_bitrix ? 'Abrir tarea Bitrix24' : '—',
                pa.responsable || '',
                pa.fecha_objetivo || '',
                pa.estado || '',
                pa.avance_mes || '',
                '',
                pa.dificultad || '',
            ]);
            const rn = rr.number;
            ws.mergeCells(rn, 7, rn, 8);
            rr.height = Math.max(32, Math.ceil(Math.max(String(pa.avance_mes || '').length, String(pa.accion || '').length) / 42) * 14);
            rr.eachCell(cell => {
                cell.font = { name: 'Calibri', size: 9.5, color: { argb: COLORS.slateDark } };
                cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            });
            rr.getCell(1).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: COLORS.navy } };
            rr.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
            if (pa.vinculo_bitrix) {
                rr.getCell(3).value = { text: 'Ver en Bitrix24', hyperlink: pa.vinculo_bitrix };
                rr.getCell(3).font = { name: 'Calibri', size: 9.5, underline: true, color: { argb: COLORS.blue } };
            }
            applyStatusBadgeCell(rr.getCell(6), pa.estado);
            styleRangeBorder(ws, rn, 1, rn, 9);
        });

        // ── 3. REPORTE DE OPORTUNIDADES DE MEJORA ──
        addSectionHeader(ws, '3. REPORTE DE OPORTUNIDADES DE MEJORA DESDE 01/01/2026 A LA FECHA', 9);
        addTableHeaderRow(ws, ['N°', 'Oportunidad de mejora', '', 'Origen', '', 'Acción adoptada / propuesta', '', 'Responsable', 'Estado']);
        ws.mergeCells(ws.lastRow.number, 2, ws.lastRow.number, 3);
        ws.mergeCells(ws.lastRow.number, 4, ws.lastRow.number, 5);
        ws.mergeCells(ws.lastRow.number, 6, ws.lastRow.number, 7);

        (inf.oportunidades_mejora || []).forEach(om => {
            const rr = ws.addRow([
                om.codigo || '',
                om.oportunidad || '', '',
                om.origen || '', '',
                om.accion_propuesta || '', '',
                om.responsable || '',
                om.estado || '',
            ]);
            const rn = rr.number;
            ws.mergeCells(rn, 2, rn, 3);
            ws.mergeCells(rn, 4, rn, 5);
            ws.mergeCells(rn, 6, rn, 7);
            rr.height = Math.max(30, Math.ceil(String(om.accion_propuesta || '').length / 40) * 14);
            rr.eachCell(cell => {
                cell.font = { name: 'Calibri', size: 9.5, color: { argb: COLORS.slateDark } };
                cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            });
            rr.getCell(1).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: COLORS.navy } };
            rr.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
            applyStatusBadgeCell(rr.getCell(9), om.estado);
            styleRangeBorder(ws, rn, 1, rn, 9);
        });

        // ── 4. INDICADORES DEL SERVICIO ──
        addSectionHeader(ws, '4. INDICADORES DEL SERVICIO', 9);
        addTableHeaderRow(ws, ['Indicador', '', 'Unidad', 'Meta', 'Resultado mes anterior', 'Resultado actual', 'Variación', 'Tendencia', 'Comentario ejecutivo']);
        ws.mergeCells(ws.lastRow.number, 1, ws.lastRow.number, 2);

        (inf.indicadores || []).forEach(ind => {
            const ant = ind.resultado_anterior !== null && ind.resultado_anterior !== '' && ind.resultado_anterior !== undefined ? Number(ind.resultado_anterior) : '—';
            const act = ind.resultado_actual !== null && ind.resultado_actual !== '' && ind.resultado_actual !== undefined ? Number(ind.resultado_actual) : '—';
            const vari = ind.variacion !== null && ind.variacion !== '' && ind.variacion !== undefined ? Number(ind.variacion) : null;

            const rr = ws.addRow([
                ind.indicador || '', '',
                ind.unidad || '',
                ind.meta || '',
                ant,
                act,
                vari !== null && Number.isFinite(vari) ? vari : '—',
                ind.tendencia || '—',
                ind.comentario || '',
            ]);
            const rn = rr.number;
            ws.mergeCells(rn, 1, rn, 2);
            rr.height = Math.max(24, Math.ceil(String(ind.comentario || '').length / 48) * 14);
            rr.eachCell(cell => {
                cell.font = { name: 'Calibri', size: 9.5, color: { argb: COLORS.slateDark } };
                cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            });
            rr.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.slateDark } };
            [3, 5, 6, 7].forEach(ci => { rr.getCell(ci).alignment = { vertical: 'middle', horizontal: 'right' }; });
            if (typeof ant === 'number') rr.getCell(5).numFmt = '#,##0';
            if (typeof act === 'number') {
                rr.getCell(6).numFmt = '#,##0';
                rr.getCell(6).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.navy } };
            }
            if (vari !== null && Number.isFinite(vari)) {
                rr.getCell(7).numFmt = '+0.0%;-0.0%;0.0%';
            }
            applyStatusBadgeCell(rr.getCell(8), ind.tendencia);
            styleRangeBorder(ws, rn, 1, rn, 9);
        });

        // ── 5. NECESIDADES DEL SERVICIO Y DECISIONES DE DIRECCIÓN ──
        addSectionHeader(ws, '5. NECESIDADES DEL SERVICIO Y DECISIONES DE DIRECCIÓN', 9);
        addTableHeaderRow(ws, ['Tipo', 'Necesidad / situación', '', 'Fundamento', '', 'Decisión o apoyo requerido', '', 'Responsable de resolución', '']);
        ws.mergeCells(ws.lastRow.number, 2, ws.lastRow.number, 3);
        ws.mergeCells(ws.lastRow.number, 4, ws.lastRow.number, 5);
        ws.mergeCells(ws.lastRow.number, 6, ws.lastRow.number, 7);
        ws.mergeCells(ws.lastRow.number, 8, ws.lastRow.number, 9);

        const necList = Array.isArray(inf.necesidades_direccion) && inf.necesidades_direccion.length > 0
            ? inf.necesidades_direccion
            : [{ tipo: '—', necesidad: 'Sin requerimientos adicionales escalados en el período.', fundamento: '—', decision_requerida: '—', responsable_resolucion: '—' }];

        necList.forEach(nec => {
            const rr = ws.addRow([
                nec.tipo || 'Apoyo / decisión',
                nec.necesidad || '', '',
                nec.fundamento || '', '',
                nec.decision_requerida || '', '',
                nec.responsable_resolucion || '', '',
            ]);
            const rn = rr.number;
            ws.mergeCells(rn, 2, rn, 3);
            ws.mergeCells(rn, 4, rn, 5);
            ws.mergeCells(rn, 6, rn, 7);
            ws.mergeCells(rn, 8, rn, 9);
            rr.height = 28;
            rr.eachCell(cell => {
                cell.font = { name: 'Calibri', size: 9.5, color: { argb: COLORS.slateDark } };
                cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            });
            styleRangeBorder(ws, rn, 1, rn, 9);
        });

        // Hallazgos / actividades registradas al pie
        if (Array.isArray(inf.hallazgos_notas) && inf.hallazgos_notas.length > 0) {
            ws.addRow([]);
            inf.hallazgos_notas.forEach(hn => {
                const rr = ws.addRow([hn.etiqueta || 'NOTA', hn.texto || '', '', '', '', '', '', '', '']);
                const rn = rr.number;
                ws.mergeCells(rn, 2, rn, 9);
                rr.height = 22;
                rr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.amberBg } };
                rr.getCell(1).font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: COLORS.amberTxt } };
                rr.getCell(2).font = { name: 'Calibri', size: 9.5, color: { argb: COLORS.slateDark } };
                styleRangeBorder(ws, rn, 1, rn, 9);
            });
        }

        // ── 6. ANEXO DE EVIDENCIAS FOTOGRÁFICAS (SI EXISTEN) ──
        if (Array.isArray(inf.fotos) && inf.fotos.length > 0) {
            addSectionHeader(ws, `6. EVIDENCIAS FOTOGRÁFICAS ADJUNTAS (${inf.fotos.length})`, 9);
            for (const foto of inf.fotos) {
                const b64 = await resolveImageDataUrl(foto);
                const capRow = ws.addRow([foto.fecha || inf.periodo, `${foto.titulo || 'Evidencia'}${foto.descripcion ? ' — ' + foto.descripcion : ''}`]);
                ws.mergeCells(capRow.number, 2, capRow.number, 9);
                capRow.height = 20;
                capRow.getCell(1).font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.navy } };
                capRow.getCell(2).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: COLORS.slateDark } };
                styleRangeBorder(ws, capRow.number, 1, capRow.number, 9);

                if (b64) {
                    try {
                        const ext = b64.includes('image/png') ? 'png' : 'jpeg';
                        const imgId = wb.addImage({ base64: b64, extension: ext });
                        const spacerStart = ws.lastRow.number;
                        for (let s = 0; s < 8; s++) {
                            const sr = ws.addRow([]);
                            sr.height = 20;
                        }
                        ws.addImage(imgId, {
                            tl: { col: 1, row: spacerStart },
                            ext: { width: 320, height: 155 }
                        });
                    } catch (_) { /* ignore */ }
                }
            }
        }

        ws.addRow([]);
        const foot = ws.addRow(['Documento de uso mensual para todos los servicios del Sanatorio Argentino.']);
        ws.mergeCells(foot.number, 1, foot.number, 9);
        foot.getCell(1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: COLORS.slateMuted } };
    }

    // ── HOJA FINAL: INSTRUCTIVO DE USO OFICIAL ──
    const wsInst = wb.addWorksheet('Instructivo de Uso');
    wsInst.columns = [{ width: 32 }, { width: 88 }];
    const iHead = wsInst.addRow(['INSTRUCTIVO DE USO – INFORME EJECUTIVO DEL SERVICIO (RDIR 04)', '']);
    wsInst.mergeCells(1, 1, 1, 2);
    iHead.height = 28;
    iHead.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
    iHead.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.white } };
    iHead.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    wsInst.addRow([]);
    addTableHeaderRow(wsInst, ['Aspecto', 'Criterio Institucional']);
    const criterios = [
        ['Periodicidad', 'Mensual, según cronograma de reuniones definido por la Dirección.'],
        ['Responsable de elaboración', 'Jefe o responsable del servicio.'],
        ['Envío previo', 'Presentar a la Dirección antes de la reunión mensual.'],
        ['Ejes obligatorios', 'Plan de Acción de la Revisión; Oportunidades de Mejora; Indicadores del Servicio.'],
        ['Criterio de indicadores', 'Seleccionar indicadores pertinentes a la naturaleza del servicio: producción, calidad, seguridad, eficiencia, experiencia del paciente o resultado económico.'],
    ];
    criterios.forEach(([asp, crit]) => {
        const r = wsInst.addRow([asp, crit]);
        r.height = 24;
        r.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.navy } };
        r.getCell(2).font = { name: 'Calibri', size: 10, color: { argb: COLORS.slateDark } };
        r.getCell(2).alignment = { vertical: 'middle', wrapText: true };
        styleRangeBorder(wsInst, r.number, 1, r.number, 2);
    });

    const buffer = await wb.xlsx.writeBuffer();
    const safeName = String(servicioNombre || 'Servicio').replace(/[^a-zA-Z0-9_-]+/g, '_');
    triggerDownloadBlob(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `RDIR04_Informe_Ejecutivo_${safeName}.xlsx`
    );
}

// ============================================================================
// 2. EXPORTADOR POWERPOINT (.PPTX) MES POR MES CON LOGO E INSIGHTS SA
// ============================================================================
function addInstitutionalSlideFrame(pptx, slide, { title, subtitle, periodoLabel, servicioNombre, pageNum }) {
    slide.background = { color: 'F8FAFC' };
    // Barra superior Azul Institucional Sanatorio Argentino
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.92, fill: { color: '003B73' } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.92, w: 13.33, h: 0.06, fill: { color: '0284C7' } });

    // Tarjeta blanca con Logo Oficial SA
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.35, y: 0.13, w: 0.66, h: 0.66, rectRadius: 0.08, fill: { color: 'FFFFFF' } });
    slide.addImage({ data: SANATORIO_LOGO_BASE64, x: 0.41, y: 0.19, w: 0.54, h: 0.54 });

    slide.addText(title, {
        x: 1.15, y: 0.14, w: 8.8, h: 0.4,
        fontSize: 17, bold: true, color: 'FFFFFF', fontFace: 'Calibri'
    });
    slide.addText(subtitle || `${servicioNombre} · Período ${periodoLabel} · Registro RDIR 04`, {
        x: 1.15, y: 0.51, w: 8.8, h: 0.28,
        fontSize: 10.5, color: 'BFDBFE', fontFace: 'Calibri'
    });

    // Pill derecha período
    slide.addShape(pptx.ShapeType.roundRect, { x: 10.75, y: 0.24, w: 2.2, h: 0.42, rectRadius: 0.12, fill: { color: '1E40AF' }, line: { color: '60A5FA', width: 1 } });
    slide.addText(periodoLabel.toUpperCase(), {
        x: 10.75, y: 0.24, w: 2.2, h: 0.42,
        fontSize: 10.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: 'Calibri'
    });

    // Pie institucional
    slide.addShape(pptx.ShapeType.line, { x: 0.4, y: 7.1, w: 12.53, h: 0, line: { color: 'CBD5E1', width: 0.75 } });
    slide.addText('SANATORIO ARGENTINO · DIRECCIÓN MÉDICA Y GOBERNANZA DE DATOS · REUNIONES DE SERVICIO', {
        x: 0.4, y: 7.15, w: 10, h: 0.25, fontSize: 8.5, bold: true, color: '64748B', fontFace: 'Calibri'
    });
    if (pageNum) {
        slide.addText(`Diapositiva ${pageNum}`, {
            x: 11.2, y: 7.15, w: 1.7, h: 0.25, fontSize: 8.5, color: '64748B', align: 'right', fontFace: 'Calibri'
        });
    }
}

function buildAutoInsightsForMonth(inf) {
    if (Array.isArray(inf.insights_clave) && inf.insights_clave.filter(Boolean).length > 0) {
        return inf.insights_clave.filter(Boolean);
    }
    const insights = [];
    const inds = (inf.indicadores || []).filter(i => Number.isFinite(Number(i.resultado_actual)) && Number(i.resultado_actual) > 0);
    const totalProd = inds.filter(i => (i.unidad || '').toLowerCase().includes('cant') || (i.unidad || '').toLowerCase().includes('pac')).reduce((s, i) => s + Number(i.resultado_actual), 0);
    if (totalProd > 0) {
        insights.push(`Volumen consolidado del mes: ${totalProd.toLocaleString('es-AR')} prestaciones/eventos registrados en indicadores principales.`);
    }
    const mejoras = inds.filter(i => i.tendencia === 'Mejora');
    if (mejoras.length > 0) {
        const top = [...mejoras].sort((a, b) => (Number(b.variacion) || 0) - (Number(a.variacion) || 0))[0];
        const pctTxt = Number.isFinite(Number(top.variacion)) ? ` (+${(Number(top.variacion) * 100).toFixed(1)}%)` : '';
        insights.push(`${mejoras.length} indicador(es) en tendencia de Mejora, liderados por ${top.indicador}${pctTxt}.`);
    }
    const deterioros = inds.filter(i => i.tendencia === 'Deterioro');
    if (deterioros.length > 0) {
        insights.push(`Foco de atención operativa sobre ${deterioros.map(d => d.indicador).join(', ')} con variación negativa en el período.`);
    }
    const cumplidos = (inf.plan_accion || []).filter(p => String(p.estado || '').toLowerCase().includes('cumplido')).length;
    const totalPa = (inf.plan_accion || []).length;
    if (totalPa > 0) {
        insights.push(`Seguimiento del Plan de Acción: ${cumplidos} de ${totalPa} compromisos en estado Cumplido y ${totalPa - cumplidos} en ejecución activa.`);
    }
    return insights.length > 0 ? insights : ['Informe ejecutivo mensual registrado conforme al estándar institucional RDIR 04.'];
}

export async function exportInformeMensualPptx(informe) {
    const PptxGenJS = await loadPptxGenJS();
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
    pptx.author = 'Sanatorio Argentino · Gobernanza de Datos';
    pptx.company = 'Sanatorio Argentino';
    const periodoLabel = formatPeriodoLabel(informe.periodo);
    const servicio = informe.servicio_nombre || 'Servicio';
    pptx.title = `Reunión de Servicio - ${servicio} - ${periodoLabel}`;

    // ── SLIDE 1: PORTADA INSTITUCIONAL SANATORIO ARGENTINO ──
    const s1 = pptx.addSlide();
    s1.background = { color: '003B73' };
    s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: '003B73' } });
    s1.addShape(pptx.ShapeType.rect, { x: 8.9, y: 0, w: 4.43, h: 7.5, fill: { color: '0D2E57' } });
    s1.addShape(pptx.ShapeType.rect, { x: 0, y: 6.85, w: 13.33, h: 0.14, fill: { color: '0284C7' } });

    // Tarjeta Logo SA
    s1.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 0.75, w: 1.25, h: 1.25, rectRadius: 0.14, fill: { color: 'FFFFFF' } });
    s1.addImage({ data: SANATORIO_LOGO_BASE64, x: 0.92, y: 0.87, w: 1.01, h: 1.01 });

    s1.addText('SANATORIO ARGENTINO · DIRECCIÓN', {
        x: 2.25, y: 0.92, w: 6.4, h: 0.35, fontSize: 13, bold: true, color: '93C5FD', charSpacing: 1.5, fontFace: 'Calibri'
    });
    s1.addText('REUNIÓN MENSUAL DE SERVICIO · RDIR 04', {
        x: 2.25, y: 1.3, w: 6.4, h: 0.35, fontSize: 11, color: 'E0F2FE', fontFace: 'Calibri'
    });

    s1.addText(servicio, {
        x: 0.8, y: 2.55, w: 7.8, h: 1.1, fontSize: 34, bold: true, color: 'FFFFFF', fontFace: 'Calibri'
    });
    s1.addText(`Informe Ejecutivo Mensual — ${periodoLabel}`, {
        x: 0.8, y: 3.65, w: 7.8, h: 0.55, fontSize: 20, bold: true, color: '38BDF8', fontFace: 'Calibri'
    });

    // Semáforo Estado General
    s1.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 4.5, w: 5.6, h: 0.58, rectRadius: 0.12, fill: { color: '065F46' }, line: { color: '34D399', width: 1.2 } });
    s1.addText(`ESTADO GENERAL: ${(informe.estado_general || 'Favorable').toUpperCase()}`, {
        x: 0.95, y: 4.5, w: 5.3, h: 0.58, fontSize: 11.5, bold: true, color: 'FFFFFF', valign: 'middle', fontFace: 'Calibri'
    });

    // Ficha derecha de metadatos
    s1.addShape(pptx.ShapeType.roundRect, { x: 9.25, y: 1.25, w: 3.6, h: 4.9, rectRadius: 0.16, fill: { color: 'FFFFFF' } });
    const fichaItems = [
        ['PERÍODO EVALUADO', periodoLabel],
        ['RESPONSABLE DEL SERVICIO', informe.responsable || '—'],
        ['TUTOR DE DIRECCIÓN', informe.tutor || '—'],
        ['FECHA DE REUNIÓN', informe.fecha_reunion || 'Pendiente'],
        ['PARTICIPANTES', informe.participantes || '—'],
    ];
    fichaItems.forEach(([lbl, val], idx) => {
        const yBase = 1.52 + idx * 0.9;
        s1.addText(lbl, { x: 9.5, y: yBase, w: 3.1, h: 0.24, fontSize: 8.5, bold: true, color: '1E40AF', fontFace: 'Calibri' });
        s1.addText(String(val), { x: 9.5, y: yBase + 0.23, w: 3.1, h: 0.5, fontSize: 10.5, bold: idx === 0, color: '0F172A', valign: 'top', fontFace: 'Calibri' });
    });

    // ── SLIDE 2: INSIGHTS DEL MES & RESUMEN EJECUTIVO ──
    const s2 = pptx.addSlide();
    addInstitutionalSlideFrame(pptx, s2, {
        title: '1. Insights Clave del Mes y Síntesis Ejecutiva',
        periodoLabel, servicioNombre: servicio, pageNum: 2
    });

    const indsNumeric = (informe.indicadores || []).filter(i => Number.isFinite(Number(i.resultado_actual)) && Number(i.resultado_actual) > 0);
    const totalVol = indsNumeric
        .filter(i => (i.unidad || '').toLowerCase().includes('cant') || (i.unidad || '').toLowerCase().includes('pac'))
        .reduce((s, i) => s + Number(i.resultado_actual), 0);
    const cantMejora = (informe.indicadores || []).filter(i => i.tendencia === 'Mejora').length;
    const paActivos = (informe.plan_accion || []).length;
    const omActivas = (informe.oportunidades_mejora || []).length;

    const kpiCards = [
        { lbl: 'PRODUCCIÓN CONSOLIDADA', val: totalVol > 0 ? totalVol.toLocaleString('es-AR') : `${indsNumeric.length} KPIs`, sub: `Prestaciones en ${periodoLabel}`, col: '003B73' },
        { lbl: 'INDICADORES EN MEJORA', val: `${cantMejora} / ${(informe.indicadores || []).length}`, sub: 'Evolución mensual positiva', col: '059669' },
        { lbl: 'PLANES DE ACCIÓN (PA)', val: String(paActivos), sub: 'Compromisos estratégicos activos', col: '0284C7' },
        { lbl: 'OPORTUNIDADES (OM)', val: String(omActivas), sub: 'Frentes de mejora continua', col: '7C3AED' },
    ];
    kpiCards.forEach((k, idx) => {
        const x = 0.4 + idx * 3.18;
        s2.addShape(pptx.ShapeType.roundRect, { x, y: 1.2, w: 3.0, h: 1.22, rectRadius: 0.1, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 } });
        s2.addShape(pptx.ShapeType.rect, { x, y: 1.2, w: 0.09, h: 1.22, fill: { color: k.col } });
        s2.addText(k.lbl, { x: x + 0.2, y: 1.28, w: 2.7, h: 0.24, fontSize: 8.5, bold: true, color: '64748B', fontFace: 'Calibri' });
        s2.addText(k.val, { x: x + 0.2, y: 1.52, w: 2.7, h: 0.5, fontSize: 21, bold: true, color: k.col, fontFace: 'Calibri' });
        s2.addText(k.sub, { x: x + 0.2, y: 2.04, w: 2.7, h: 0.26, fontSize: 9, color: '475569', fontFace: 'Calibri' });
    });

    // Columna izquierda: Insights Clave del Mes
    s2.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 2.62, w: 6.1, h: 4.3, rectRadius: 0.12, fill: { color: 'FFFFFF' }, line: { color: 'BFDBFE', width: 1.2 } });
    s2.addShape(pptx.ShapeType.rect, { x: 0.4, y: 2.62, w: 6.1, h: 0.42, fill: { color: 'EFF6FF' } });
    s2.addText(`INSIGHTS EJECUTIVOS — ${periodoLabel.toUpperCase()}`, {
        x: 0.6, y: 2.65, w: 5.7, h: 0.35, fontSize: 11, bold: true, color: '003B73', fontFace: 'Calibri'
    });

    const insights = buildAutoInsightsForMonth(informe);
    const insightParas = insights.slice(0, 5).map(txt => ({
        text: txt,
        options: { bullet: { type: 'bullet', code: '25CF' }, paraSpaceAfter: 10, fontSize: 11, color: '0F172A' }
    }));
    s2.addText(insightParas, { x: 0.6, y: 3.15, w: 5.7, h: 3.6, valign: 'top', fontFace: 'Calibri' });

    // Columna derecha: Resumen Ejecutivo
    s2.addShape(pptx.ShapeType.roundRect, { x: 6.7, y: 2.62, w: 6.23, h: 4.3, rectRadius: 0.12, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 } });
    s2.addShape(pptx.ShapeType.rect, { x: 6.7, y: 2.62, w: 6.23, h: 0.42, fill: { color: 'F1F5F9' } });
    s2.addText('RESUMEN EJECUTIVO DE LA REUNIÓN', {
        x: 6.9, y: 2.65, w: 5.8, h: 0.35, fontSize: 11, bold: true, color: '0F172A', fontFace: 'Calibri'
    });
    const cleanResumen = String(informe.resumen_ejecutivo || 'Sin resumen ejecutivo cargado.').replace(/\*\*/g, '').slice(0, 980);
    s2.addText(cleanResumen, {
        x: 6.9, y: 3.15, w: 5.85, h: 3.6, fontSize: 9.8, color: '334155', valign: 'top', fontFace: 'Calibri', lineSpacingMultiple: 1.15
    });

    // ── SLIDE 3: TABLERO DE INDICADORES DEL SERVICIO ──
    const s3 = pptx.addSlide();
    addInstitutionalSlideFrame(pptx, s3, {
        title: '2. Evaluación de Indicadores del Servicio',
        periodoLabel, servicioNombre: servicio, pageNum: 3
    });

    const indRows = [
        [
            { text: 'Indicador', options: { bold: true, color: 'FFFFFF', fill: '003B73' } },
            { text: 'Meta', options: { bold: true, color: 'FFFFFF', fill: '003B73' } },
            { text: 'Mes Ant.', options: { bold: true, color: 'FFFFFF', fill: '003B73', align: 'right' } },
            { text: 'Actual', options: { bold: true, color: 'FFFFFF', fill: '003B73', align: 'right' } },
            { text: 'Variación', options: { bold: true, color: 'FFFFFF', fill: '003B73', align: 'right' } },
            { text: 'Tendencia', options: { bold: true, color: 'FFFFFF', fill: '003B73', align: 'center' } },
            { text: 'Lectura / Comentario Ejecutivo', options: { bold: true, color: 'FFFFFF', fill: '003B73' } },
        ]
    ];

    (informe.indicadores || []).slice(0, 9).forEach((ind, idx) => {
        const bg = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
        const antTxt = ind.resultado_anterior !== null && ind.resultado_anterior !== undefined && ind.resultado_anterior !== ''
            ? Number(ind.resultado_anterior).toLocaleString('es-AR') : '—';
        const actTxt = ind.resultado_actual !== null && ind.resultado_actual !== undefined && ind.resultado_actual !== ''
            ? Number(ind.resultado_actual).toLocaleString('es-AR') : '—';
        const vNum = ind.variacion !== null && ind.variacion !== undefined && ind.variacion !== '' ? Number(ind.variacion) : NaN;
        const varTxt = Number.isFinite(vNum) ? `${vNum >= 0 ? '+' : ''}${(vNum * 100).toFixed(1)}%` : '—';

        const tend = ind.tendencia || '—';
        const tFill = tend === 'Mejora' ? 'DCFCE7' : tend === 'Deterioro' ? 'FEE2E2' : 'E0F2FE';
        const tCol = tend === 'Mejora' ? '166534' : tend === 'Deterioro' ? '991B1B' : '1E40AF';

        indRows.push([
            { text: ind.indicador || '', options: { bold: true, color: '0F172A', fill: bg } },
            { text: ind.meta || '—', options: { color: '475569', fill: bg } },
            { text: antTxt, options: { color: '475569', fill: bg, align: 'right' } },
            { text: actTxt, options: { bold: true, color: '003B73', fill: bg, align: 'right' } },
            { text: varTxt, options: { bold: true, color: tCol, fill: bg, align: 'right' } },
            { text: tend, options: { bold: true, color: tCol, fill: tFill, align: 'center' } },
            { text: (ind.comentario || '—').slice(0, 130), options: { color: '334155', fill: bg } },
        ]);
    });

    s3.addTable(indRows, {
        x: 0.4, y: 1.2, w: 12.53,
        colW: [2.45, 1.65, 1.05, 1.05, 1.05, 1.15, 4.13],
        fontSize: 9.2,
        fontFace: 'Calibri',
        border: { type: 'solid', pt: 0.5, color: 'CBD5E1' },
        valign: 'middle',
        rowH: 0.48,
    });

    // ── SLIDE 4: PLAN DE ACCIÓN Y OPORTUNIDADES DE MEJORA ──
    const s4 = pptx.addSlide();
    addInstitutionalSlideFrame(pptx, s4, {
        title: '3. Plan de Acción (PA) y Oportunidades de Mejora (OM)',
        periodoLabel, servicioNombre: servicio, pageNum: 4
    });

    const paRows = [
        [
            { text: 'Cód.', options: { bold: true, color: 'FFFFFF', fill: '003B73' } },
            { text: 'Compromiso del Plan de Acción', options: { bold: true, color: 'FFFFFF', fill: '003B73' } },
            { text: 'Estado', options: { bold: true, color: 'FFFFFF', fill: '003B73', align: 'center' } },
            { text: 'Avance registrado en el mes', options: { bold: true, color: 'FFFFFF', fill: '003B73' } },
        ]
    ];
    (informe.plan_accion || []).slice(0, 5).forEach(pa => {
        const isOk = String(pa.estado || '').toLowerCase().includes('cumplido');
        paRows.push([
            { text: pa.codigo || '', options: { bold: true, color: '003B73', fill: 'FFFFFF' } },
            { text: (pa.accion || '').slice(0, 120), options: { bold: true, color: '0F172A', fill: 'FFFFFF' } },
            { text: pa.estado || 'En curso', options: { bold: true, color: isOk ? '166534' : '92400E', fill: isOk ? 'DCFCE7' : 'FEF3C7', align: 'center' } },
            { text: (pa.avance_mes || '').slice(0, 190), options: { color: '334155', fill: 'FFFFFF' } },
        ]);
    });
    s4.addText('SEGUIMIENTO DEL PLAN DE ACCIÓN DE LA REVISIÓN', {
        x: 0.4, y: 1.12, w: 12, h: 0.28, fontSize: 10.5, bold: true, color: '003B73', fontFace: 'Calibri'
    });
    s4.addTable(paRows, {
        x: 0.4, y: 1.42, w: 12.53,
        colW: [0.9, 3.8, 1.3, 6.53],
        fontSize: 8.8, fontFace: 'Calibri',
        border: { type: 'solid', pt: 0.5, color: 'CBD5E1' }, valign: 'middle'
    });

    const omRows = [
        [
            { text: 'Cód.', options: { bold: true, color: 'FFFFFF', fill: '1E40AF' } },
            { text: 'Oportunidad de Mejora', options: { bold: true, color: 'FFFFFF', fill: '1E40AF' } },
            { text: 'Acción adoptada / propuesta', options: { bold: true, color: 'FFFFFF', fill: '1E40AF' } },
            { text: 'Responsable', options: { bold: true, color: 'FFFFFF', fill: '1E40AF' } },
        ]
    ];
    (informe.oportunidades_mejora || []).slice(0, 4).forEach(om => {
        omRows.push([
            { text: om.codigo || '', options: { bold: true, color: '1E40AF', fill: 'F8FAFC' } },
            { text: (om.oportunidad || '').slice(0, 115), options: { bold: true, color: '0F172A', fill: 'FFFFFF' } },
            { text: (om.accion_propuesta || '').slice(0, 175), options: { color: '334155', fill: 'FFFFFF' } },
            { text: om.responsable || '', options: { color: '475569', fill: 'FFFFFF' } },
        ]);
    });
    s4.addText('OPORTUNIDADES DE MEJORA ACTIVAS', {
        x: 0.4, y: 4.35, w: 12, h: 0.28, fontSize: 10.5, bold: true, color: '1E40AF', fontFace: 'Calibri'
    });
    s4.addTable(omRows, {
        x: 0.4, y: 4.65, w: 12.53,
        colW: [0.9, 3.8, 5.63, 2.2],
        fontSize: 8.8, fontFace: 'Calibri',
        border: { type: 'solid', pt: 0.5, color: 'CBD5E1' }, valign: 'middle'
    });

    // ── SLIDE 5: COMPROMISOS Y DECISIONES DE DIRECCIÓN ──
    const hasCompOrDec = (informe.compromisos_acordados?.length || 0) > 0 || (informe.necesidades_direccion?.length || 0) > 0 || (informe.hallazgos_notas?.length || 0) > 0;
    let nextPage = 5;
    if (hasCompOrDec) {
        const s5 = pptx.addSlide();
        addInstitutionalSlideFrame(pptx, s5, {
            title: '4. Compromisos Acordados y Decisiones de Dirección',
            periodoLabel, servicioNombre: servicio, pageNum: nextPage++
        });

        s5.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 1.22, w: 6.15, h: 5.65, rectRadius: 0.12, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 } });
        s5.addText('COMPROMISOS Y ACTIVIDADES DEL PERÍODO', {
            x: 0.6, y: 1.35, w: 5.75, h: 0.32, fontSize: 11, bold: true, color: '003B73', fontFace: 'Calibri'
        });
        const compBullets = [
            ...(informe.compromisos_acordados || []).slice(0, 7).map(c => `${c.compromiso} (${c.responsable || 'Servicio'})`),
            ...(informe.hallazgos_notas || []).map(h => `[${h.etiqueta}] ${h.texto}`),
        ];
        const compText = compBullets.length > 0
            ? compBullets.map(t => ({ text: t.slice(0, 150), options: { bullet: true, paraSpaceAfter: 7, fontSize: 9.5, color: '1E293B' } }))
            : [{ text: 'Sin compromisos operativos adicionales registrados en este mes.', options: { fontSize: 10, color: '64748B' } }];
        s5.addText(compText, { x: 0.6, y: 1.75, w: 5.75, h: 4.9, valign: 'top', fontFace: 'Calibri' });

        s5.addShape(pptx.ShapeType.roundRect, { x: 6.78, y: 1.22, w: 6.15, h: 5.65, rectRadius: 0.12, fill: { color: 'FFFFFF' }, line: { color: 'BFDBFE', width: 1.2 } });
        s5.addText('APOYO Y DECISIONES REQUERIDAS A DIRECCIÓN', {
            x: 6.98, y: 1.35, w: 5.75, h: 0.32, fontSize: 11, bold: true, color: '1E40AF', fontFace: 'Calibri'
        });
        const necBullets = (informe.necesidades_direccion || []).map(n =>
            `${n.necesidad}\n→ Decisión requerida: ${n.decision_requerida || 'Evaluación Dirección'} (${n.responsable_resolucion || 'Dirección'})`
        );
        const necText = necBullets.length > 0
            ? necBullets.map(t => ({ text: t, options: { bullet: true, paraSpaceAfter: 10, fontSize: 9.8, color: '0F172A' } }))
            : [{ text: 'No se escalaron requerimientos adicionales de decisión institucional en este corte mensual.', options: { fontSize: 10, color: '64748B' } }];
        s5.addText(necText, { x: 6.98, y: 1.75, w: 5.75, h: 4.9, valign: 'top', fontFace: 'Calibri' });
    }

    // ── SLIDES ADICIONALES: EVIDENCIAS FOTOGRÁFICAS DEL MES (2 POR SLIDE) ──
    if (Array.isArray(informe.fotos) && informe.fotos.length > 0) {
        for (let i = 0; i < informe.fotos.length; i += 2) {
            const pair = informe.fotos.slice(i, i + 2);
            const sf = pptx.addSlide();
            addInstitutionalSlideFrame(pptx, sf, {
                title: 'Evidencias Fotográficas e Infraestructura del Período',
                periodoLabel, servicioNombre: servicio, pageNum: nextPage++
            });

            for (let j = 0; j < pair.length; j++) {
                const foto = pair[j];
                const x = j === 0 ? 0.5 : 6.85;
                sf.addShape(pptx.ShapeType.roundRect, { x, y: 1.3, w: 5.95, h: 5.5, rectRadius: 0.12, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 } });
                const b64 = await resolveImageDataUrl(foto);
                if (b64) {
                    sf.addImage({ data: b64, x: x + 0.25, y: 1.5, w: 5.45, h: 4.0, sizing: { type: 'contain', w: 5.45, h: 4.0 } });
                }
                sf.addText(foto.titulo || 'Registro fotográfico', {
                    x: x + 0.25, y: 5.65, w: 5.45, h: 0.35, fontSize: 11.5, bold: true, color: '003B73', fontFace: 'Calibri'
                });
                sf.addText(foto.descripcion || `Fecha: ${foto.fecha || periodoLabel}`, {
                    x: x + 0.25, y: 6.0, w: 5.45, h: 0.65, fontSize: 9.5, color: '475569', valign: 'top', fontFace: 'Calibri'
                });
            }
        }
    }

    const safeServ = String(servicio).replace(/[^a-zA-Z0-9_-]+/g, '_');
    await pptx.writeFile({ fileName: `Presentacion_Insights_${safeServ}_${informe.periodo}.pptx` });
}

// ============================================================================
// 3. EXPORTADOR PPTX DE REVISIÓN POR LA DIRECCIÓN
// ============================================================================
export async function exportRevisionDireccionPptx(revision) {
    if (!revision) return;
    const PptxGenJS = await loadPptxGenJS();
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    const servicio = revision.servicio_nombre || 'Servicio';
    const per = revision.periodo_evaluado || 'Período Evaluado';

    // Slide 1: Portada
    const s1 = pptx.addSlide();
    s1.background = { color: '003B73' };
    s1.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 0.8, w: 1.2, h: 1.2, rectRadius: 0.14, fill: { color: 'FFFFFF' } });
    s1.addImage({ data: SANATORIO_LOGO_BASE64, x: 0.9, y: 0.9, w: 1.0, h: 1.0 });
    s1.addText('SANATORIO ARGENTINO · DIRECCIÓN', { x: 2.2, y: 1.05, w: 9, h: 0.4, fontSize: 14, bold: true, color: '93C5FD', fontFace: 'Calibri' });
    s1.addText(`REVISIÓN POR LA DIRECCIÓN\n${servicio.toUpperCase()}`, { x: 0.8, y: 2.5, w: 11.5, h: 1.6, fontSize: 32, bold: true, color: 'FFFFFF', fontFace: 'Calibri' });
    s1.addText(`Período evaluado: ${per}`, { x: 0.8, y: 4.3, w: 9, h: 0.5, fontSize: 18, color: '38BDF8', bold: true, fontFace: 'Calibri' });
    s1.addText(revision.sintesis_ejecutiva || '', { x: 0.8, y: 5.05, w: 11.7, h: 1.8, fontSize: 11, color: 'E2E8F0', fontFace: 'Calibri' });

    // Slide 2: Resultado General del Período
    const s2 = pptx.addSlide();
    addInstitutionalSlideFrame(pptx, s2, { title: 'Resultado General del Período — Lectura de Dirección', periodoLabel: per, servicioNombre: servicio, pageNum: 2 });
    const rgRows = [[
        { text: 'Eje / Compromiso', options: { bold: true, color: 'FFFFFF', fill: '003B73' } },
        { text: 'Estado de Cierre', options: { bold: true, color: 'FFFFFF', fill: '003B73', align: 'center' } },
        { text: 'Avance Observado', options: { bold: true, color: 'FFFFFF', fill: '003B73' } },
        { text: 'Lectura de Dirección', options: { bold: true, color: 'FFFFFF', fill: '003B73' } },
    ]];
    (revision.resultados_generales || []).forEach(r => {
        rgRows.push([
            { text: `${r.codigo}. ${r.eje}`, options: { bold: true, color: '0F172A', fill: 'FFFFFF' } },
            { text: r.estado_cierre || '', options: { bold: true, color: '1E40AF', fill: 'EFF6FF', align: 'center' } },
            { text: r.avance_observado || '', options: { color: '334155', fill: 'FFFFFF' } },
            { text: r.lectura_direccion || '', options: { color: '0F172A', fill: 'F8FAFC' } },
        ]);
    });
    s2.addTable(rgRows, { x: 0.4, y: 1.25, w: 12.53, colW: [2.8, 1.6, 3.9, 4.23], fontSize: 9.5, fontFace: 'Calibri', border: { type: 'solid', pt: 0.5, color: 'CBD5E1' } });

    // Slide 3: Conclusión, Logros y Alertas
    const s3 = pptx.addSlide();
    addInstitutionalSlideFrame(pptx, s3, { title: 'Logros, Alertas al Cierre y Conclusión de Dirección', periodoLabel: per, servicioNombre: servicio, pageNum: 3 });
    s3.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 1.2, w: 6.1, h: 3.9, rectRadius: 0.1, fill: { color: 'FFFFFF' }, line: { color: 'A7F3D0', width: 1.2 } });
    s3.addText('PRINCIPALES LOGROS DEL PERÍODO', { x: 0.6, y: 1.32, w: 5.7, h: 0.3, fontSize: 10.5, bold: true, color: '065F46', fontFace: 'Calibri' });
    s3.addText((revision.logros_periodo || []).slice(0, 7).map(t => ({ text: t, options: { bullet: true, fontSize: 9.3, paraSpaceAfter: 5, color: '1E293B' } })), { x: 0.6, y: 1.68, w: 5.7, h: 3.3, valign: 'top', fontFace: 'Calibri' });

    s3.addShape(pptx.ShapeType.roundRect, { x: 6.75, y: 1.2, w: 6.18, h: 3.9, rectRadius: 0.1, fill: { color: 'FFFFFF' }, line: { color: 'FDE68A', width: 1.2 } });
    s3.addText('PENDIENTES Y ALERTAS AL CIERRE', { x: 6.95, y: 1.32, w: 5.8, h: 0.3, fontSize: 10.5, bold: true, color: '92400E', fontFace: 'Calibri' });
    s3.addText((revision.pendientes_alertas || []).slice(0, 7).map(t => ({ text: t, options: { bullet: true, fontSize: 9.3, paraSpaceAfter: 5, color: '1E293B' } })), { x: 6.95, y: 1.68, w: 5.8, h: 3.3, valign: 'top', fontFace: 'Calibri' });

    s3.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 5.25, w: 12.53, h: 1.65, rectRadius: 0.1, fill: { color: 'EFF6FF' }, line: { color: '93C5FD', width: 1 } });
    s3.addText(`CONCLUSIÓN DE DIRECCIÓN: ${revision.conclusion_direccion || ''}`, { x: 0.6, y: 5.35, w: 12.1, h: 1.45, fontSize: 9.5, bold: true, color: '003B73', valign: 'middle', fontFace: 'Calibri' });

    const safeServ = String(servicio).replace(/[^a-zA-Z0-9_-]+/g, '_');
    await pptx.writeFile({ fileName: `Revision_Direccion_${safeServ}.pptx` });
}

// ============================================================================
// 4. EXPORTADOR EXCEL DE PROPUESTA DE OBJETIVOS 2027 (FORMATO OFICIAL)
// ============================================================================
export async function exportObjetivos2027Excel(objetivos = [], { servicioNombre = 'Diagnóstico por Imágenes', responsable = '', anio = 2027 } = {}) {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sanatorio Argentino · Gobernanza de Datos';

    const ws = wb.addWorksheet(`Propuesta Objetivos ${anio}`, {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    ws.columns = [
        { width: 6 },  // N°
        { width: 32 }, // Objetivo propuesto
        { width: 30 }, // Situación de partida
        { width: 28 }, // Resultado esperado
        { width: 24 }, // Indicador
        { width: 28 }, // Fórmula
        { width: 24 }, // Meta
        { width: 14 }, // Plazo
        { width: 24 }, // Responsable
        { width: 42 }, // Principales acciones
        { width: 32 }, // Necesidades de apoyo
        { width: 14 }, // Estado / % Avance
    ];

    const r1 = ws.addRow([`SANATORIO ARGENTINO - PROPUESTA DE OBJETIVOS ${anio}`]);
    ws.mergeCells(1, 1, 1, 12);
    r1.height = 28;
    r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
    r1.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: COLORS.white } };
    r1.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    const r2 = ws.addRow([`Período: noviembre ${anio - 1} - octubre ${anio} | Completar entre 3 y 5 objetivos priorizados por servicio`]);
    ws.mergeCells(2, 1, 2, 12);
    r2.height = 20;
    r2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blueSoft } };
    r2.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.navy } };

    ws.addRow([]);
    ws.addRow(['Servicio / Sector', servicioNombre, '', '', 'Responsable', responsable || objetivos[0]?.responsable || '', '', '', 'Fecha presentación', objetivos[0]?.fecha_presentacion || 'Noviembre 2026']);
    ws.mergeCells(4, 2, 4, 4);
    ws.mergeCells(4, 6, 4, 8);
    ws.mergeCells(4, 10, 4, 12);
    styleRangeBorder(ws, 4, 1, 4, 12);
    ws.getCell(4, 1).font = { bold: true, color: { argb: COLORS.navy } };
    ws.getCell(4, 5).font = { bold: true, color: { argb: COLORS.navy } };
    ws.getCell(4, 9).font = { bold: true, color: { argb: COLORS.navy } };

    ws.addRow([]);
    addTableHeaderRow(ws, [
        'N°',
        `Objetivo propuesto ${anio}`,
        'Situación de partida / Línea de base',
        'Resultado esperado',
        'Indicador',
        'Fórmula / forma de medición',
        `Meta ${anio}`,
        'Plazo',
        'Responsable',
        'Principales acciones',
        'Necesidades de apoyo / inversión',
        'Avance Actual'
    ]);

    // Fila guía oficial del documento original
    const guideRow = ws.addRow([
        '',
        `¿Qué cambio prioritario quiere lograr el servicio en ${anio}?`,
        '¿Cómo estamos hoy? Incluir dato, situación o problema concreto.',
        '¿Qué debería haber cambiado al finalizar el período?',
        '¿Con qué dato verificaremos si avanzamos?',
        '¿Cómo se calcula o de dónde se obtiene el indicador?',
        '¿A qué valor o resultado queremos llegar?',
        '¿Cuándo debe estar cumplido?',
        '¿Quién responde por el seguimiento?',
        '¿Qué 3-5 acciones principales harán posible el objetivo?',
        '¿Qué necesita el servicio de Dirección u otras áreas?',
        'Estado / %'
    ]);
    guideRow.height = 28;
    guideRow.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebra } };
        c.font = { name: 'Calibri', size: 8.5, italic: true, color: { argb: COLORS.slateMuted } };
        c.alignment = { vertical: 'middle', wrapText: true };
    });
    styleRangeBorder(ws, guideRow.number, 1, guideRow.number, 12);

    objetivos.forEach((obj, idx) => {
        const accionesTxt = (obj.acciones_principales || [])
            .map((a, i) => `${i + 1}) [${a.completada ? '✓' : ' '}] ${a.texto}`)
            .join('\n');
        const rr = ws.addRow([
            obj.orden || idx + 1,
            obj.objetivo || '',
            obj.linea_base || '',
            obj.resultado_esperado || '',
            obj.indicador || '',
            obj.formula_medicion || '',
            obj.meta || '',
            obj.plazo || '',
            obj.responsable || '',
            accionesTxt,
            obj.necesidades_apoyo || '',
            `${obj.estado || 'En ejecución'} (${obj.progreso_pct || 0}%)`
        ]);
        rr.height = Math.max(54, ((obj.acciones_principales || []).length + 1) * 15);
        rr.eachCell(c => {
            c.font = { name: 'Calibri', size: 9.5, color: { argb: COLORS.slateDark } };
            c.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        });
        rr.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
        rr.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.navy } };
        applyStatusBadgeCell(rr.getCell(12), obj.estado);
        styleRangeBorder(ws, rr.number, 1, rr.number, 12);
    });

    // Segunda pestaña: Guía Oficial "Cómo Completar"
    const wsGuia = wb.addWorksheet('Cómo Completar');
    wsGuia.columns = [{ width: 28 }, { width: 38 }, { width: 44 }, { width: 44 }];
    addTableHeaderRow(wsGuia, ['Campo', 'Qué debe completar', 'Ejemplo institucional', 'Recomendación']);
    const guiaData = [
        [`Objetivo propuesto ${anio}`, 'Un cambio prioritario que el servicio quiere lograr.', 'Reducir el tiempo de primera respuesta del Contact Center.', 'Usar verbo de acción: reducir, aumentar, implementar, mejorar, consolidar.'],
        ['Situación de partida / Línea de base', 'Dato o situación actual desde donde se parte.', 'Octubre 2026: 1 h 12 min de tiempo promedio de primera respuesta.', 'Evitar frases generales como "hay demoras"; incluir un dato si existe.'],
        ['Resultado esperado', 'Cómo debería verse el servicio si se cumple el objetivo.', 'Menor espera y menor acumulación de consultas pendientes.', 'Describir el efecto, no repetir la meta.'],
        ['Indicador', 'Dato que mostrará si el objetivo mejora.', 'Tiempo promedio de primera respuesta.', 'Elegir pocos indicadores y que puedan medirse mensualmente.'],
        ['Fórmula / forma de medición', 'Cálculo y fuente de información.', 'Minutos totales hasta primera respuesta / contactos respondidos.', 'La fórmula debe poder repetirse siempre de la misma forma.'],
        [`Meta ${anio}`, 'Valor concreto a alcanzar.', '≤ 30 minutos.', 'Debe permitir saber claramente si se cumplió o no.'],
        ['Plazo', 'Fecha o trimestre de cumplimiento.', '30/06/2027.', 'Si hay etapas, indicar la fecha de la meta final.'],
        ['Responsable', 'Persona que hará seguimiento y rendirá avances.', 'Responsable del Servicio.', 'No colocar solo "el equipo"; debe existir un responsable principal.'],
        ['Principales acciones', 'Entre 3 y 5 acciones indispensables.', '1) Analizar demanda. 2) Ajustar dotación. 3) Definir SLA.', 'No transformar esta columna en una lista extensa de tareas.'],
        ['Necesidades de apoyo / inversión', 'Recursos o decisiones que el servicio no puede resolver solo.', 'Apoyo de TYS para automatización y eventual refuerzo.', 'Si no requiere apoyo, indicar "No requiere".'],
    ];
    guiaData.forEach(rowVals => {
        const r = wsGuia.addRow(rowVals);
        r.height = 26;
        r.eachCell((c, i) => {
            c.font = { name: 'Calibri', size: 9.5, bold: i === 1, color: { argb: i === 1 ? COLORS.navy : COLORS.slateDark } };
            c.alignment = { vertical: 'middle', wrapText: true };
        });
        styleRangeBorder(wsGuia, r.number, 1, r.number, 4);
    });

    const buffer = await wb.xlsx.writeBuffer();
    const safeName = String(servicioNombre).replace(/[^a-zA-Z0-9_-]+/g, '_');
    triggerDownloadBlob(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `Propuesta_Objetivos_${anio}_${safeName}.xlsx`
    );
}
