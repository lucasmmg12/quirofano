import sql from 'mssql';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, 'sync-server/.env') });

const SQL_CONFIG = {
    server: process.env.SALUS_HOST || '128.223.16.29',
    port: parseInt(process.env.SALUS_PORT || '2450', 10),
    user: process.env.SALUS_USER || 'SalusConsulta',
    password: process.env.SALUS_PASSWORD || 'ConsultaSALUS1234',
    database: process.env.SALUS_DATABASE || 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 60000,
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
    pool: { max: 2, min: 0, idleTimeoutMillis: 30000 }
};

const COHORTE_CYMIN_SEP_2026 = [
    { nombre: 'LOPEZ IVANA', dni: '38074427', fechaCymin: '2026-08-31', evento: 'CESAREA' },
    { nombre: 'MORALES MAISA', dni: '41701243', fechaCymin: '2026-09-01', evento: 'CESAREA' },
    { nombre: 'ALANIZ YESICA', dni: '32840181', fechaCymin: '2026-09-02', evento: 'PARTO FM' },
    { nombre: 'GUTIERREZ ANDREA', dni: '31642431', fechaCymin: '2026-09-02', evento: 'CESAREA' },
    { nombre: 'ACIAR VIRGINIA', dni: '40962636', fechaCymin: '2026-09-03', evento: 'CESAREA' },
    { nombre: 'VARAS ELIANA', dni: '30590793', fechaCymin: '2026-09-03', evento: 'CESAREA' },
    { nombre: 'OLIVENCIA ROCIO', dni: '39995733', fechaCymin: '2026-09-06', evento: 'CESAREA' },
    { nombre: 'CARBAJAL CINTIA', dni: '33648811', fechaCymin: '2026-09-07', evento: 'CESAREA' },
    { nombre: 'ALANIS LOURDES', dni: '46407121', fechaCymin: '2026-09-08', evento: 'CESAREA' },
    { nombre: 'REINOSO MAIRA', dni: '39008108', fechaCymin: '2026-09-09', evento: 'CESAREA' },
    { nombre: 'GREGORIO VERONICA', dni: '35922785', fechaCymin: '2026-09-10', evento: 'PARTO' },
    { nombre: 'CASTRO SILVINA', dni: '32689050', fechaCymin: '2026-09-10', evento: 'CESAREA' },
    { nombre: 'LOPEZ AINARA', dni: '49799161', fechaCymin: '2026-09-15', evento: 'CESAREA' },
    { nombre: 'METOLA LISET', dni: '48688295', fechaCymin: '2026-09-16', evento: 'PARTO' },
    { nombre: 'BRIZUELA MIA', dni: '47620533', fechaCymin: '2026-09-17', evento: 'CESAREA' },
    { nombre: 'RAMIREZ PRISCILA', dni: '36250628', fechaCymin: '2026-09-21', evento: 'CESAREA' },
    { nombre: 'ANDRADA MICAELA', dni: '41014324', fechaCymin: '2026-09-22', evento: 'CESAREA' },
    { nombre: 'GODOY GEMMA', dni: '39954429', fechaCymin: '2026-09-23', evento: 'CESAREA' },
    { nombre: 'MONTERO FLORENCIA', dni: '43376709', fechaCymin: '2026-09-24', evento: 'CESAREA' },
    { nombre: 'ZABALA MELINA', dni: '40995779', fechaCymin: '2026-09-25', evento: 'CESAREA' },
    { nombre: 'GOYOCHEA IRIS', dni: '43058717', fechaCymin: '2026-09-26', evento: 'CESAREA' },
    { nombre: 'SANCHEZ ROCIO', dni: '39792701', fechaCymin: '2026-09-27', evento: 'PARTO' },
    { nombre: 'TELLO LUDMILA', dni: '43689686', fechaCymin: '2026-09-28', evento: 'CESAREA' },
    { nombre: 'LUNA ROMINA', dni: '41683340', fechaCymin: '2026-09-28', evento: 'PARTO' },
    { nombre: 'MORENO VALERIA', dni: '35509400', fechaCymin: '2026-09-29', evento: 'CESAREA' }
];

async function generarReporteExcel() {
    console.log('--- GENERADOR DE REPORTE EXCEL DE TRAZABILIDAD CIMYN 2026 ---');
    const dnis = COHORTE_CYMIN_SEP_2026.map(p => `'${p.dni}'`).join(',');

    const pool = await sql.connect(SQL_CONFIG);
    console.log('Conexión con SQL Server SALUS exitosa.');

    const query = `
        SELECT 
            [idVisita],
            [IdPaciente],
            [Paciente],
            LTRIM(RTRIM(REPLACE(REPLACE([NIF], '.', ''), ' ', ''))) AS DNI,
            [Visita_Especialidad] AS Especialidad,
            [Responsable] AS Medico,
            CONVERT(VARCHAR(10), [Fecha Visita], 120) AS FechaVisita,
            [Hora Inicio Visita Formato Texto] AS HoraVisita,
            [Tipo Visita] AS TipoVisita,
            [Agenda],
            [Centro],
            [Cliente] AS ObraSocial,
            [Asistencia],
            [Motivo_Ausencia],
            [EstadoReprogramacion]
        FROM [SALUS].[dbo].[VLISE_Visitas]
        WHERE [Fecha Visita] >= '2026-01-01'
          AND [Fecha Visita] <= '2026-12-31'
          AND LTRIM(RTRIM(REPLACE(REPLACE([NIF], '.', ''), ' ', ''))) IN (${dnis})
        ORDER BY [Fecha Visita] ASC, [Hora Inicio Visita Formato Texto] ASC
    `;

    const res = await pool.request().query(query);
    const todasVisitas = res.recordset;
    await pool.close();
    console.log(`Visitas encontradas en 2026: ${todasVisitas.length}`);

    // Agrupar visitas por DNI
    const visitasPorDni = {};
    todasVisitas.forEach(v => {
        if (!visitasPorDni[v.DNI]) visitasPorDni[v.DNI] = [];
        visitasPorDni[v.DNI].push(v);
    });

    // Crear libro Excel
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sanatorio Argentino - Grow Labs';
    wb.lastModifiedBy = 'Sanatorio Argentino';
    wb.created = new Date();
    wb.modified = new Date();

    // ─────────────────────────────────────────────────────────────
    // 1. HOJA ÍNDICE / RESUMEN GENERAL
    // ─────────────────────────────────────────────────────────────
    const wsIndice = wb.addWorksheet('Indice', {
        views: [{ showGridLines: true }]
    });

    // Fila 1: Título Principal
    wsIndice.mergeCells('A1:L1');
    const titleCell = wsIndice.getCell('A1');
    titleCell.value = 'GRÁFICOS INDIVIDUALES POR PACIENTE · CIMYN 2026';
    titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2D6A4F' } // Verde institucional oscuro
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    wsIndice.getRow(1).height = 32;

    // Fila 2: Subtítulo
    wsIndice.mergeCells('A2:L2');
    const subCell = wsIndice.getCell('A2');
    const pacsConActividad = COHORTE_CYMIN_SEP_2026.filter(p => (visitasPorDni[p.dni] || []).length > 0).length;
    subCell.value = `Archivo base: ${todasVisitas.length} registros · ${pacsConActividad} pacientes con actividad en 2026 (Cohorte de 25 nacimientos en Sanatorio CIMYN - Septiembre 2026)`;
    subCell.font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF1F2937' } };
    subCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD8F3DC' } // Verde pastel muy suave
    };
    subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    wsIndice.getRow(2).height = 22;

    // Fila 3: Encabezados de Tabla
    const headers = [
        'Paciente',
        'DNI',
        'Evento CIMYN',
        'Registros',
        'Presentes',
        'Aus. just.',
        'Aus. injust.',
        'Sin clasificar',
        'Adherencia',
        'Tipo principal',
        'Primera visita',
        'Última visita',
        'Ir a hoja'
    ];
    wsIndice.getRow(3).values = headers;
    wsIndice.getRow(3).height = 26;
    wsIndice.getRow(3).eachCell((cell) => {
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1B4332' } // Verde oscuro profundo
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            bottom: { style: 'medium', color: { argb: 'FF111827' } },
            right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
    });

    // Mapeo para nombres válidos de hojas de Excel (máx 31 caracteres y sin caracteres prohibidos)
    const sheetNameMap = new Map();
    COHORTE_CYMIN_SEP_2026.forEach(p => {
        let clean = p.nombre.replace(/[\\/*?:[\]]/g, '').trim();
        if (clean.length > 28) clean = clean.substring(0, 28);
        sheetNameMap.set(p.dni, clean);
    });

    // Cargar filas de datos en el Índice
    let rowIdx = 4;
    COHORTE_CYMIN_SEP_2026.forEach(p => {
        const vList = visitasPorDni[p.dni] || [];
        const cant = vList.length;
        const presentes = vList.filter(v => v.Asistencia === 'Presente').length;
        const ausJust = vList.filter(v => v.Asistencia && v.Asistencia.toLowerCase().includes('justifica') && !v.Asistencia.toLowerCase().includes('injustifica')).length;
        const ausInjust = vList.filter(v => v.Asistencia && v.Asistencia.toLowerCase().includes('injustifica')).length;
        const sinClasif = cant - presentes - ausJust - ausInjust;

        // Tipo principal
        const tipoCounts = {};
        vList.forEach(v => {
            const t = v.TipoVisita || 'S/D';
            tipoCounts[t] = (tipoCounts[t] || 0) + 1;
        });
        const tipoPrincipal = Object.entries(tipoCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || '-';

        const fechas = vList.map(v => v.FechaVisita).sort();
        const primeraVisita = fechas[0] || '-';
        const ultimaVisita = fechas[fechas.length - 1] || '-';

        const totalConAsist = presentes + ausJust + ausInjust;
        const adherenciaNum = totalConAsist > 0 ? (presentes / totalConAsist) : null;
        const adherenciaStr = adherenciaNum !== null ? `${(adherenciaNum * 100).toFixed(1)}%` : '-';

        const sheetName = sheetNameMap.get(p.dni);

        const row = wsIndice.getRow(rowIdx);
        row.values = [
            p.nombre,
            p.dni,
            `${p.evento} (${p.fechaCymin})`,
            cant,
            presentes,
            ausJust,
            ausInjust,
            sinClasif,
            adherenciaStr,
            tipoPrincipal,
            primeraVisita,
            ultimaVisita,
            cant > 0 ? 'Abrir' : '-'
        ];
        row.height = 20;

        // Estilos de celda
        row.eachCell((cell, colNum) => {
            cell.font = { name: 'Segoe UI', size: 9.5 };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };

            // Alineación según tipo
            if (colNum === 1 || colNum === 10) {
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
            } else {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            }

            // Alternar color de fila
            if (rowIdx % 2 === 0) {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF9FAFB' }
                };
            }

            // Si no tuvo visitas en 2026, pintar fila en tono grisáceo suave
            if (cant === 0) {
                cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF9CA3AF' } };
            }
        });

        // Enlace "Abrir"
        if (cant > 0) {
            const linkCell = row.getCell(13);
            linkCell.value = {
                text: 'Abrir',
                hyperlink: `#'${sheetName}'!A1`
            };
            linkCell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF1D4ED8' }, underline: true, bold: true };
        }

        rowIdx++;
    });

    // Auto-ajustar anchos de columna de la hoja Índice
    wsIndice.columns = [
        { width: 28 }, // Paciente
        { width: 13 }, // DNI
        { width: 25 }, // Evento CIMYN
        { width: 12 }, // Registros
        { width: 12 }, // Presentes
        { width: 12 }, // Aus. just.
        { width: 12 }, // Aus. injust.
        { width: 14 }, // Sin clasificar
        { width: 14 }, // Adherencia
        { width: 42 }, // Tipo principal
        { width: 15 }, // Primera visita
        { width: 15 }, // Última visita
        { width: 12 }  // Ir a hoja
    ];

    // ─────────────────────────────────────────────────────────────
    // 2. HOJAS INDIVIDUALES POR PACIENTE CON ACTIVIDAD EN 2026
    // ─────────────────────────────────────────────────────────────
    COHORTE_CYMIN_SEP_2026.forEach(p => {
        const vList = visitasPorDni[p.dni] || [];
        if (vList.length === 0) return; // Solo hojas para pacientes con registros

        const sheetName = sheetNameMap.get(p.dni);
        const ws = wb.addWorksheet(sheetName, {
            views: [{ showGridLines: true }]
        });

        // Encabezado Paciente
        ws.mergeCells('A1:E1');
        const hCell = ws.getCell('A1');
        hCell.value = `Paciente: ${p.nombre}`;
        hCell.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FF0F172A' } };
        hCell.alignment = { vertical: 'middle', horizontal: 'left' };

        // Botón / Hipervínculo Volver al Índice
        ws.mergeCells('F1:H1');
        const backCell = ws.getCell('F1');
        backCell.value = {
            text: '← Volver al Índice',
            hyperlink: "#'Indice'!A1"
        };
        backCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1D4ED8' }, underline: true };
        backCell.alignment = { vertical: 'middle', horizontal: 'right' };
        ws.getRow(1).height = 28;

        // Cálculo de KPIs de la paciente
        const cant = vList.length;
        const presentes = vList.filter(v => v.Asistencia === 'Presente').length;
        const sobreturnos = vList.filter(v => v.TipoVisita && v.TipoVisita.toLowerCase().includes('sobreturno')).length;
        const urgencias = vList.filter(v => (v.TipoVisita && v.TipoVisita.toLowerCase().includes('urgencia')) || (v.Asistencia && v.Asistencia.toLowerCase().includes('urgencia'))).length;
        const internado = vList.filter(v => v.Asistencia && v.Asistencia.toLowerCase().includes('internad')).length;
        const ausJust = vList.filter(v => v.Asistencia && v.Asistencia.toLowerCase().includes('justifica') && !v.Asistencia.toLowerCase().includes('injustifica')).length;
        const ausInjust = vList.filter(v => v.Asistencia && v.Asistencia.toLowerCase().includes('injustifica')).length;
        const suspendidas = vList.filter(v => v.Asistencia && v.Asistencia.toLowerCase().includes('suspendid')).length;
        const cxSusp24h = vList.filter(v => v.Asistencia && v.Asistencia.toLowerCase().includes('24h')).length;
        const sinClasif = cant - presentes - ausJust - ausInjust - suspendidas;

        const totalConAsist = presentes + ausJust + ausInjust;
        const adherenciaStr = totalConAsist > 0 ? `${((presentes / totalConAsist) * 100).toFixed(1)}%` : '-';

        const fechas = vList.map(v => v.FechaVisita).sort();
        const primeraVisita = fechas[0] || '-';
        const ultimaVisita = fechas[fechas.length - 1] || '-';

        const tipoCounts = {};
        vList.forEach(v => {
            const t = v.TipoVisita || 'S/D';
            tipoCounts[t] = (tipoCounts[t] || 0) + 1;
        });
        const tipoPrincipal = Object.entries(tipoCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || '-';

        // TABLA DE INDICADORES (A3:B17)
        ws.getCell('A3').value = 'Indicador';
        ws.getCell('B3').value = 'Valor';
        [ws.getCell('A3'), ws.getCell('B3')].forEach(c => {
            c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
            c.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
            c.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        const kpis = [
            ['Registros totales', cant],
            ['Presentes', presentes],
            ['Sobreturnos', sobreturnos],
            ['Urgencias', urgencias],
            ['Internado', internado],
            ['Ausencias justificadas', ausJust],
            ['Ausencias injustificadas', ausInjust],
            ['Suspendidas', suspendidas],
            ['CX suspendida 24h', cxSusp24h],
            ['Sin clasificar', sinClasif],
            ['Adherencia', adherenciaStr],
            ['Primera visita', primeraVisita],
            ['Última visita', ultimaVisita],
            ['Tipo principal', tipoPrincipal],
            ['Parto/Cesárea en CIMYN', `${p.evento} (${p.fechaCymin})`]
        ];

        kpis.forEach((kpi, idx) => {
            const r = ws.getRow(4 + idx);
            r.values = [kpi[0], kpi[1]];
            r.height = 19;
            r.getCell(1).font = { name: 'Segoe UI', size: 9 };
            r.getCell(2).font = { name: 'Segoe UI', size: 9, bold: true };
            r.getCell(1).border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin' }, right: { style: 'thin' } };
            r.getCell(2).border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin' }, right: { style: 'thin' } };
            r.getCell(2).alignment = { horizontal: 'center' };
        });

        // ─────────────────────────────────────────────────────────────
        // TABLA CRONOLÓGICA DE VISITAS
        // ─────────────────────────────────────────────────────────────
        const tableStartRow = 21;
        ws.mergeCells(`A${tableStartRow}:H${tableStartRow}`);
        const tTitle = ws.getCell(`A${tableStartRow}`);
        tTitle.value = `Detalle Cronológico de Visitas y Consultas en Sanatorio Argentino (Año 2026)`;
        tTitle.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        tTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }; // Azul institucional
        tTitle.alignment = { vertical: 'middle', indent: 1 };
        ws.getRow(tableStartRow).height = 24;

        const detailHeaders = [
            'Fecha Visita',
            'Hora',
            'Asistencia',
            'Tipo Visita',
            'Visita_Especialidad',
            'Responsable (Médico)',
            'Agenda',
            'Centro / Sede',
            'Obra Social',
            'Motivo Ausencia'
        ];

        const headerRow = ws.getRow(tableStartRow + 1);
        headerRow.values = detailHeaders;
        headerRow.height = 24;
        headerRow.eachCell(c => {
            c.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; // Azul pastel suave
            c.border = { top: { style: 'thin' }, bottom: { style: 'medium', color: { argb: 'FF1E40AF' } }, left: { style: 'thin' }, right: { style: 'thin' } };
            c.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        let detailRowIdx = tableStartRow + 2;
        vList.forEach(v => {
            const dr = ws.getRow(detailRowIdx);
            dr.values = [
                v.FechaVisita,
                v.HoraVisita || '-',
                v.Asistencia || 'Sin dato',
                v.TipoVisita || '-',
                v.Especialidad || '-',
                v.Medico || '-',
                v.Agenda || '-',
                v.Centro || '-',
                v.ObraSocial || '-',
                v.Motivo_Ausencia || '-'
            ];
            dr.height = 19;
            dr.eachCell((c, cIdx) => {
                c.font = { name: 'Segoe UI', size: 9 };
                c.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                };

                if (cIdx === 1 || cIdx === 2 || cIdx === 3 || cIdx === 8) {
                    c.alignment = { vertical: 'middle', horizontal: 'center' };
                } else {
                    c.alignment = { vertical: 'middle', horizontal: 'left' };
                }

                // Resaltar Asistencia
                if (cIdx === 3) {
                    if (v.Asistencia === 'Presente') {
                        c.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF15803D' } }; // Verde
                    } else if (v.Asistencia && v.Asistencia.toLowerCase().includes('injustifica')) {
                        c.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFB91C1C' } }; // Rojo
                    }
                }
            });
            detailRowIdx++;
        });

        // Configuración de anchos de columna para la hoja individual
        ws.columns = [
            { width: 14 }, // Fecha
            { width: 10 }, // Hora
            { width: 22 }, // Asistencia
            { width: 38 }, // Tipo Visita
            { width: 22 }, // Especialidad
            { width: 32 }, // Responsable
            { width: 28 }, // Agenda
            { width: 18 }, // Centro
            { width: 25 }, // Obra Social
            { width: 28 }  // Motivo Ausencia
        ];
    });

    // Guardar archivo en las dos ubicaciones clave
    const projectFilePath = resolve(__dirname, 'Reporte_Trazabilidad_Partos_CIMYN_2026.xlsx');
    const desktopPath = 'C:\\Users\\Sanatorio Argentino\\Desktop\\Reporte_Trazabilidad_Partos_CIMYN_2026.xlsx';

    await wb.xlsx.writeFile(projectFilePath);
    console.log(`Archivo generado exitosamente en proyecto: ${projectFilePath}`);

    try {
        await wb.xlsx.writeFile(desktopPath);
        console.log(`Copia generada exitosamente en el Escritorio: ${desktopPath}`);
    } catch (e) {
        console.warn('No se pudo escribir directamente en el Escritorio:', e.message);
    }

    console.log('\nPROCESO FINALIZADO CON ÉXITO.');
}

generarReporteExcel().catch(console.error);
