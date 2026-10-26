import sql from 'mssql';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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
    console.log('--- GENERADOR DE REPORTE EXCEL DE TRAZABILIDAD Y PRESUPUESTOS PAIM CIMYN 2026 ---');
    const dnis = COHORTE_CYMIN_SEP_2026.map(p => `'${p.dni}'`).join(',');

    const pool = await sql.connect(SQL_CONFIG);
    console.log('Conexión con SQL Server SALUS exitosa.');

    // 1. Consulta de Visitas 2026 en SALUS
    const queryVisitas = `
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
    const resVis = await pool.request().query(queryVisitas);
    const todasVisitas = resVis.recordset;
    console.log(`Visitas encontradas en 2026: ${todasVisitas.length}`);

    // 2. Consulta de Presupuestos (PAIM y otros) en SALUS
    const queryPresupuestos = `
        SELECT 
            dp.IdPresupuesto,
            CONVERT(VARCHAR(10), dp.FechaPresupuesto, 120) AS FechaPresupuesto,
            dp.NumPresupuesto,
            dp.NumeroConFormato,
            dp.TotalPresupuesto,
            dp.Paciente_Nombre,
            dp.Paciente_NHC,
            LTRIM(RTRIM(REPLACE(REPLACE(dp.Paciente_NIF, '.', ''), ' ', ''))) AS DNI,
            dp.Cliente_Nombre,
            dp.PRESUP_Responsable,
            pr.Descripcion,
            pr.Observaciones,
            pr.Estado
        FROM [SALUS].[dbo].[DatosPacientePresupuesto] dp
        LEFT JOIN [SALUS].[dbo].[FV_Presupuestos] pr ON dp.IdPresupuesto = pr.id
        WHERE LTRIM(RTRIM(REPLACE(REPLACE(dp.Paciente_NIF, '.', ''), ' ', ''))) IN (${dnis})
        ORDER BY dp.FechaPresupuesto DESC
    `;
    const resPres = await pool.request().query(queryPresupuestos);
    const todosPresupuestos = resPres.recordset;
    console.log(`Presupuestos totales encontrados: ${todosPresupuestos.length}`);

    // 3. Consulta de Líneas de Presupuesto
    let lineasPresupuesto = [];
    if (todosPresupuestos.length > 0) {
        const presIds = todosPresupuestos.map(r => r.IdPresupuesto).join(',');
        const resLin = await pool.request().query(`
            SELECT 
                lp.idPresupuesto,
                lp.orden,
                lp.descripcion,
                lp.cantidad,
                lp.importeUnitario,
                lp.ImportePaciente
            FROM [SALUS].[dbo].[FV_Lineas_Presupuestos] lp
            WHERE lp.idPresupuesto IN (${presIds})
            ORDER BY lp.idPresupuesto, lp.orden
        `);
        lineasPresupuesto = resLin.recordset;
    }
    console.log(`Líneas de presupuestos obtenidas: ${lineasPresupuesto.length}`);

    await pool.close();

    // Agrupar visitas por DNI
    const visitasPorDni = {};
    todasVisitas.forEach(v => {
        if (!visitasPorDni[v.DNI]) visitasPorDni[v.DNI] = [];
        visitasPorDni[v.DNI].push(v);
    });

    // Agrupar presupuestos por DNI con sus líneas
    const presupuestosPorDni = {};
    todosPresupuestos.forEach(p => {
        if (!presupuestosPorDni[p.DNI]) presupuestosPorDni[p.DNI] = [];
        const misLineas = lineasPresupuesto.filter(l => l.idPresupuesto === p.IdPresupuesto);
        presupuestosPorDni[p.DNI].push({
            ...p,
            lineas: misLineas
        });
    });

    // Crear libro Excel
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sanatorio Argentino - Grow Labs';
    wb.lastModifiedBy = 'Sanatorio Argentino';
    wb.created = new Date();
    wb.modified = new Date();

    // Mapeo para nombres válidos de hojas de Excel (máx 31 caracteres)
    const sheetNameMap = new Map();
    COHORTE_CYMIN_SEP_2026.forEach(p => {
        let clean = p.nombre.replace(/[\\/*?:[\]]/g, '').trim();
        if (clean.length > 28) clean = clean.substring(0, 28);
        sheetNameMap.set(p.dni, clean);
    });

    // ─────────────────────────────────────────────────────────────
    // 1. HOJA ÍNDICE / RESUMEN GENERAL (ENRIQUECIDA CON PAIM)
    // ─────────────────────────────────────────────────────────────
    const wsIndice = wb.addWorksheet('Indice', {
        views: [{ showGridLines: true }]
    });

    // Fila 1: Título Principal
    wsIndice.mergeCells('A1:Q1');
    const titleCell = wsIndice.getCell('A1');
    titleCell.value = 'TRAZABILIDAD Y AUDITORÍA DE PRESUPUESTOS (PAIM) · COHORTE CIMYN 2026';
    titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' } // Azul institucional profundo
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    wsIndice.getRow(1).height = 32;

    // Fila 2: Subtítulo
    wsIndice.mergeCells('A2:Q2');
    const subCell = wsIndice.getCell('A2');
    const pacsConActividad = COHORTE_CYMIN_SEP_2026.filter(p => (visitasPorDni[p.dni] || []).length > 0).length;
    const pacsConPresupuesto2026 = COHORTE_CYMIN_SEP_2026.filter(p => {
        const pres = presupuestosPorDni[p.dni] || [];
        return pres.some(pr => pr.FechaPresupuesto && pr.FechaPresupuesto.startsWith('2026'));
    }).length;
    subCell.value = `Archivo consolidado: ${todasVisitas.length} consultas/estudios en 2026 · ${pacsConActividad} pacientes con actividad clínica · ${pacsConPresupuesto2026} pacientes con Presupuestos en Sanatorio Argentino (Cohorte 25 partos/cesáreas CIMYN)`;
    subCell.font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF1F2937' } };
    subCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDBEAFE' } // Azul cielo suave
    };
    subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    wsIndice.getRow(2).height = 22;

    // Fila 3: Encabezados de Tabla
    const headersIndice = [
        'Paciente',
        'DNI',
        'Evento CIMYN',
        'Presupuesto PAIM SA',
        'Nº Presupuesto',
        'Fecha Presup.',
        'Monto Presup.',
        'Emisor Presupuesto SA',
        'Registros',
        'Presentes',
        'Aus. just.',
        'Aus. injust.',
        'Sin clasificar',
        'Adherencia',
        'Tipo principal',
        'Primera visita',
        'Ir a hoja'
    ];
    wsIndice.getRow(3).values = headersIndice;
    wsIndice.getRow(3).height = 28;
    wsIndice.getRow(3).eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
        // Destacar columnas de presupuesto en color azul petróleo
        if (colNumber >= 4 && colNumber <= 8) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; // Teal / Petróleo
        } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Slate oscuro
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
    });

    // Cargar filas en el Índice
    let rowIdx = 4;
    COHORTE_CYMIN_SEP_2026.forEach(p => {
        const vList = visitasPorDni[p.dni] || [];
        const cant = vList.length;
        const presentes = vList.filter(v => v.Asistencia === 'Presente').length;
        const ausJust = vList.filter(v => v.Asistencia && v.Asistencia.toLowerCase().includes('justifica') && !v.Asistencia.toLowerCase().includes('injustifica')).length;
        const ausInjust = vList.filter(v => v.Asistencia && v.Asistencia.toLowerCase().includes('injustifica')).length;
        const sinClasif = cant - presentes - ausJust - ausInjust;

        const tipoCounts = {};
        vList.forEach(v => {
            const t = v.TipoVisita || 'S/D';
            tipoCounts[t] = (tipoCounts[t] || 0) + 1;
        });
        const tipoPrincipal = Object.entries(tipoCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || '-';

        const fechas = vList.map(v => v.FechaVisita).sort();
        const primeraVisita = fechas[0] || '-';

        const totalConAsist = presentes + ausJust + ausInjust;
        const adherenciaNum = totalConAsist > 0 ? (presentes / totalConAsist) : null;
        const adherenciaStr = adherenciaNum !== null ? `${(adherenciaNum * 100).toFixed(1)}%` : '-';

        // Evaluar presupuestos de 2026
        const presList = presupuestosPorDni[p.dni] || [];
        const pres2026 = presList.filter(pr => pr.FechaPresupuesto && pr.FechaPresupuesto.startsWith('2026'));
        
        let paimStatus = 'No';
        let numPresupuesto = '-';
        let fechaPresupuesto = '-';
        let montoPresupuesto = '-';
        let emisorPresupuesto = '-';

        if (pres2026.length > 0) {
            const paimItem = pres2026.find(pr => (pr.Descripcion || '').toUpperCase().includes('PAIM')) || pres2026[0];
            paimStatus = (paimItem.Descripcion || '').toUpperCase().includes('PAIM') 
                ? `PAIM ($${Number(paimItem.TotalPresupuesto).toLocaleString('es-AR')})` 
                : `Ambulatorio ($${Number(paimItem.TotalPresupuesto).toLocaleString('es-AR')})`;
            numPresupuesto = paimItem.NumeroConFormato || `#${paimItem.NumPresupuesto}`;
            fechaPresupuesto = paimItem.FechaPresupuesto;
            montoPresupuesto = paimItem.TotalPresupuesto;
            emisorPresupuesto = paimItem.PRESUP_Responsable || '-';
        }

        const sheetName = sheetNameMap.get(p.dni);
        const row = wsIndice.getRow(rowIdx);

        row.values = [
            p.nombre,
            p.dni,
            `${p.evento} (${p.fechaCymin})`,
            paimStatus,
            numPresupuesto,
            fechaPresupuesto,
            typeof montoPresupuesto === 'number' ? montoPresupuesto : montoPresupuesto,
            emisorPresupuesto,
            cant,
            presentes,
            ausJust,
            ausInjust,
            sinClasif,
            adherenciaStr,
            tipoPrincipal,
            primeraVisita,
            cant > 0 ? 'Abrir' : '-'
        ];
        row.height = 20;

        row.eachCell((cell, colNum) => {
            cell.font = { name: 'Segoe UI', size: 9 };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };

            // Alineaciones
            if (colNum === 1 || colNum === 8 || colNum === 15) {
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
            } else {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            }

            // Formato de moneda para columna 7 (Monto)
            if (colNum === 7 && typeof cell.value === 'number') {
                cell.numFmt = '$#,##0';
            }

            // Resaltar celdas con presupuesto
            if (colNum === 4 && pres2026.length > 0) {
                if (paimStatus.includes('PAIM')) {
                    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF047857' } }; // Verde esmeralda
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
                } else {
                    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1D4ED8' } }; // Azul
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
                }
            }

            // Color alternado
            if (rowIdx % 2 === 0 && (!cell.fill || cell.fill.fgColor.argb === 'FFFFFFFF')) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            }

            // Inactivo
            if (cant === 0 && pres2026.length === 0) {
                cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF94A3B8' } };
            }
        });

        if (cant > 0) {
            const linkCell = row.getCell(17);
            linkCell.value = {
                text: 'Abrir',
                hyperlink: `#'${sheetName}'!A1`
            };
            linkCell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF1D4ED8' }, underline: true, bold: true };
        }

        rowIdx++;
    });

    wsIndice.columns = [
        { width: 28 }, // Paciente
        { width: 12 }, // DNI
        { width: 24 }, // Evento CIMYN
        { width: 22 }, // Presupuesto PAIM SA
        { width: 16 }, // Nº Presupuesto
        { width: 14 }, // Fecha Presup.
        { width: 15 }, // Monto Presup.
        { width: 32 }, // Emisor Presupuesto SA
        { width: 11 }, // Registros
        { width: 11 }, // Presentes
        { width: 11 }, // Aus. just.
        { width: 11 }, // Aus. injust.
        { width: 13 }, // Sin clasificar
        { width: 13 }, // Adherencia
        { width: 38 }, // Tipo principal
        { width: 14 }, // Primera visita
        { width: 10 }  // Ir a hoja
    ];

    // ─────────────────────────────────────────────────────────────
    // 2. HOJA DEDICADA: AUDITORÍA DE PRESUPUESTOS PAIM Y FUGA (NUEVA)
    // ─────────────────────────────────────────────────────────────
    const wsPaim = wb.addWorksheet('Auditoría Presupuestos PAIM', {
        views: [{ showGridLines: true }]
    });

    // Título Principal
    wsPaim.mergeCells('A1:L1');
    const paimTitle = wsPaim.getCell('A1');
    paimTitle.value = 'AUDITORÍA DE PRESUPUESTOS DE MATERNIDAD (PAIM) · TRAZABILIDAD Y ANÁLISIS DE FUGA';
    paimTitle.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    paimTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; // Teal
    paimTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    wsPaim.getRow(1).height = 30;

    // Subtítulo
    wsPaim.mergeCells('A2:L2');
    const paimSub = wsPaim.getCell('A2');
    paimSub.value = 'Cruce nominal entre presupuestos confeccionados en Sanatorio Argentino y nacimientos ocurridos en Sanatorio CIMYN (Sep 2026)';
    paimSub.font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF134E4A' } };
    paimSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } };
    paimSub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    wsPaim.getRow(2).height = 20;

    // Tarjetas KPI (Filas 4 y 5)
    wsPaim.mergeCells('A4:B4');
    wsPaim.getCell('A4').value = 'COHORTE CYMIN';
    wsPaim.getCell('A4').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF64748B' } };
    wsPaim.mergeCells('A5:B5');
    wsPaim.getCell('A5').value = `${COHORTE_CYMIN_SEP_2026.length} Nacimientos`;
    wsPaim.getCell('A5').font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF0F172A' } };

    wsPaim.mergeCells('C4:D4');
    wsPaim.getCell('C4').value = 'CON PRESUPUESTO PAIM';
    wsPaim.getCell('C4').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF047857' } };
    wsPaim.mergeCells('C5:D5');
    wsPaim.getCell('C5').value = '3 Pacientes (12.0%)';
    wsPaim.getCell('C5').font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF047857' } };

    wsPaim.mergeCells('E4:F4');
    wsPaim.getCell('E4').value = 'PRESUP. AMBULATORIO';
    wsPaim.getCell('E4').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1D4ED8' } };
    wsPaim.mergeCells('E5:F5');
    wsPaim.getCell('E5').value = '1 Paciente (Hierro)';
    wsPaim.getCell('E5').font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF1D4ED8' } };

    wsPaim.mergeCells('G4:H4');
    wsPaim.getCell('G4').value = 'TOTAL MONTO PRESUPUESTADO';
    wsPaim.getCell('G4').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFB45309' } };
    wsPaim.mergeCells('G5:H5');
    wsPaim.getCell('G5').value = '$543.700';
    wsPaim.getCell('G5').font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFB45309' } };

    wsPaim.mergeCells('I4:L4');
    wsPaim.getCell('I4').value = 'VALOR ESTÁNDAR PAIM PARTO/CESÁREA';
    wsPaim.getCell('I4').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF475569' } };
    wsPaim.mergeCells('I5:L5');
    wsPaim.getCell('I5').value = '$152.000 (Cat. Inst. $50k + Instrum. $50k + Lab $52k)';
    wsPaim.getCell('I5').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF334155' } };

    ['A4', 'C4', 'E4', 'G4', 'I4', 'A5', 'C5', 'E5', 'G5', 'I5'].forEach(cRef => {
        const cell = wsPaim.getCell(cRef);
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Borde de las tarjetas KPI
    ['A4:B5', 'C4:D5', 'E4:F5', 'G4:H5', 'I4:L5'].forEach(rng => {
        const [start, end] = rng.split(':');
        const sCol = start.charCodeAt(0) - 64;
        const eCol = end.charCodeAt(0) - 64;
        const sRow = parseInt(start.substring(1), 10);
        const eRow = parseInt(end.substring(1), 10);

        for (let r = sRow; r <= eRow; r++) {
            for (let c = sCol; c <= eCol; c++) {
                const cell = wsPaim.getCell(r, c);
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'CBD5E1' } },
                    left: { style: 'thin', color: { argb: 'CBD5E1' } },
                    bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
                    right: { style: 'thin', color: { argb: 'CBD5E1' } }
                };
            }
        }
    });

    // Fila 7: Encabezados de Tabla de Auditoría
    const paimHeaders = [
        'Paciente',
        'DNI',
        'Evento CIMYN',
        'Fecha Parto CIMYN',
        'Estado Presupuesto en SA',
        'Nº Presupuesto',
        'Fecha Presup.',
        'Antelación',
        'Descripción PAIM / Prestación',
        'Monto Presupuestado',
        'Responsable Emisor',
        'Desglose Conceptos Principales'
    ];
    wsPaim.getRow(7).values = paimHeaders;
    wsPaim.getRow(7).height = 26;
    wsPaim.getRow(7).eachCell(cell => {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'medium', color: { argb: 'FF115E59' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
    });

    // Filas de Auditoría PAIM (ordenadas: primero las que tuvieron presupuesto)
    const cohorteOrdenadaPaim = [...COHORTE_CYMIN_SEP_2026].sort((a, b) => {
        const presA = (presupuestosPorDni[a.dni] || []).filter(pr => pr.FechaPresupuesto?.startsWith('2026')).length;
        const presB = (presupuestosPorDni[b.dni] || []).filter(pr => pr.FechaPresupuesto?.startsWith('2026')).length;
        return presB - presA;
    });

    let paimRowIdx = 8;
    cohorteOrdenadaPaim.forEach(p => {
        const presList = presupuestosPorDni[p.dni] || [];
        const pres2026 = presList.filter(pr => pr.FechaPresupuesto?.startsWith('2026'));

        let estadoPres = 'SIN PRESUPUESTO EN SA';
        let numPres = '-';
        let fechaPres = '-';
        let antelacion = '-';
        let descPres = 'No consultó presupuesto formal de parto en SA';
        let montoPres = '-';
        let emisor = '-';
        let desglose = '-';

        if (pres2026.length > 0) {
            const paimItem = pres2026.find(pr => (pr.Descripcion || '').toUpperCase().includes('PAIM')) || pres2026[0];
            const esPaim = (paimItem.Descripcion || '').toUpperCase().includes('PAIM');
            estadoPres = esPaim ? 'CON PRESUPUESTO PAIM (FUGA A CIMYN)' : 'PRESUPUESTO AMBULATORIO EN SA';
            numPres = paimItem.NumeroConFormato || `#${paimItem.NumPresupuesto}`;
            fechaPres = paimItem.FechaPresupuesto;
            
            // Cálculo de días de antelación
            if (p.fechaCymin && paimItem.FechaPresupuesto) {
                const diffTime = new Date(p.fechaCymin) - new Date(paimItem.FechaPresupuesto);
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                antelacion = `${diffDays} días antes`;
            }

            descPres = paimItem.Descripcion || '-';
            montoPres = paimItem.TotalPresupuesto;
            emisor = paimItem.PRESUP_Responsable || '-';

            if (paimItem.lineas && paimItem.lineas.length > 0) {
                desglose = paimItem.lineas.map(l => `${l.descripcion} ($${Number(l.importeUnitario).toLocaleString('es-AR')})`).join(' | ');
            }
        }

        const row = wsPaim.getRow(paimRowIdx);
        row.values = [
            p.nombre,
            p.dni,
            p.evento,
            p.fechaCymin,
            estadoPres,
            numPres,
            fechaPres,
            antelacion,
            descPres,
            typeof montoPres === 'number' ? montoPres : montoPres,
            emisor,
            desglose
        ];
        row.height = 22;

        row.eachCell((cell, colNum) => {
            cell.font = { name: 'Segoe UI', size: 9 };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };

            if (colNum === 1 || colNum === 9 || colNum === 11 || colNum === 12) {
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
            } else {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            }

            if (colNum === 10 && typeof cell.value === 'number') {
                cell.numFmt = '$#,##0';
            }

            // Destacar filas con PAIM
            if (pres2026.length > 0) {
                if (estadoPres.includes('PAIM')) {
                    if (colNum === 5) {
                        cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFB91C1C' } }; // Rojo fuga
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                    } else {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } }; // Verde suave
                    }
                } else {
                    if (colNum === 5) {
                        cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1D4ED8' } };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
                    }
                }
            } else {
                cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF64748B' } };
            }
        });

        paimRowIdx++;
    });

    wsPaim.columns = [
        { width: 28 }, // Paciente
        { width: 12 }, // DNI
        { width: 14 }, // Evento
        { width: 16 }, // Fecha CIMYN
        { width: 34 }, // Estado Presupuesto
        { width: 16 }, // Nº Presupuesto
        { width: 14 }, // Fecha Presup.
        { width: 16 }, // Antelación
        { width: 36 }, // Descripción PAIM
        { width: 18 }, // Monto Presupuestado
        { width: 32 }, // Emisor
        { width: 65 }  // Desglose
    ];

    // ─────────────────────────────────────────────────────────────
    // 3. HOJAS INDIVIDUALES POR PACIENTE CON ACTIVIDAD EN 2026
    // ─────────────────────────────────────────────────────────────
    COHORTE_CYMIN_SEP_2026.forEach(p => {
        const vList = visitasPorDni[p.dni] || [];
        const presList = presupuestosPorDni[p.dni] || [];

        // Generar hoja para toda paciente que tenga visitas O presupuestos
        if (vList.length === 0 && presList.length === 0) return;

        const sheetName = sheetNameMap.get(p.dni);
        const ws = wb.addWorksheet(sheetName, {
            views: [{ showGridLines: true }]
        });

        // Encabezado Paciente
        ws.mergeCells('A1:E1');
        const hCell = ws.getCell('A1');
        hCell.value = `Paciente: ${p.nombre} (DNI ${p.dni})`;
        hCell.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FF0F172A' } };
        hCell.alignment = { vertical: 'middle', horizontal: 'left' };

        // Botones de navegación
        ws.mergeCells('F1:H1');
        const backCell = ws.getCell('F1');
        backCell.value = {
            text: '← Volver al Índice',
            hyperlink: "#'Indice'!A1"
        };
        backCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1D4ED8' }, underline: true };
        backCell.alignment = { vertical: 'middle', horizontal: 'right' };
        ws.getRow(1).height = 28;

        // Cálculo de KPIs
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

        // Evaluar presupuestos de la paciente
        const pres2026 = presList.filter(pr => pr.FechaPresupuesto?.startsWith('2026'));
        let paimKpiTexto = 'No registra presupuesto en 2026';
        let montoKpiTexto = '-';
        if (pres2026.length > 0) {
            const principal = pres2026.find(pr => (pr.Descripcion || '').toUpperCase().includes('PAIM')) || pres2026[0];
            paimKpiTexto = `SÍ: ${principal.Descripcion} (${principal.NumeroConFormato || principal.NumPresupuesto})`;
            montoKpiTexto = `$${Number(principal.TotalPresupuesto).toLocaleString('es-AR')} el ${principal.FechaPresupuesto}`;
        }

        // TABLA DE INDICADORES (A3:B19)
        ws.getCell('A3').value = 'Indicador Asistencial / Presupuestario';
        ws.getCell('B3').value = 'Valor';
        [ws.getCell('A3'), ws.getCell('B3')].forEach(c => {
            c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
            c.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
            c.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        const kpis = [
            ['Presupuesto PAIM Sanatorio Argentino', paimKpiTexto],
            ['Monto Presupuestado en SA', montoKpiTexto],
            ['Nacimiento en Sanatorio CIMYN', `${p.evento} el ${p.fechaCymin}`],
            ['Registros totales de consultas 2026', cant],
            ['Consultas Presentes', presentes],
            ['Sobreturnos', sobreturnos],
            ['Atenciones por Urgencias', urgencias],
            ['Internado', internado],
            ['Ausencias justificadas', ausJust],
            ['Ausencias injustificadas', ausInjust],
            ['Consultas/Cirugías suspendidas', suspendidas],
            ['CX suspendida 24h', cxSusp24h],
            ['Sin clasificar', sinClasif],
            ['Tasa de Adherencia', adherenciaStr],
            ['Primera visita registrada en 2026', primeraVisita],
            ['Última visita registrada en 2026', ultimaVisita],
            ['Tipo de consulta principal', tipoPrincipal]
        ];

        kpis.forEach((kpi, idx) => {
            const r = ws.getRow(4 + idx);
            r.values = [kpi[0], kpi[1]];
            r.height = 19;
            r.getCell(1).font = { name: 'Segoe UI', size: 9 };
            r.getCell(2).font = { name: 'Segoe UI', size: 9, bold: true };
            
            // Destacar si tuvo presupuesto
            if (idx === 0 && pres2026.length > 0) {
                r.getCell(1).font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF047857' } };
                r.getCell(2).font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF047857' } };
                r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
                r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
            }

            r.getCell(1).border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin' }, right: { style: 'thin' } };
            r.getCell(2).border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin' }, right: { style: 'thin' } };
            r.getCell(2).alignment = { horizontal: 'left' };
        });

        let nextSectionRow = 23;

        // ─────────────────────────────────────────────────────────────
        // SI LA PACIENTE TIENE PRESUPUESTOS: TABLA DE PRESUPUESTOS
        // ─────────────────────────────────────────────────────────────
        if (presList.length > 0) {
            ws.mergeCells(`A${nextSectionRow}:J${nextSectionRow}`);
            const pTitle = ws.getCell(`A${nextSectionRow}`);
            pTitle.value = `Presupuestos Emitidos en Sanatorio Argentino (PAIM / Prestaciones)`;
            pTitle.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
            pTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; // Teal
            pTitle.alignment = { vertical: 'middle', indent: 1 };
            ws.getRow(nextSectionRow).height = 24;

            const presHeaders = [
                'Fecha Presupuesto',
                'Nº Presupuesto',
                'Descripción Prestación / PAIM',
                'Monto Total',
                'Responsable Emisor',
                'Concepto Detalle',
                'Cantidad',
                'Importe Unitario',
                'Cobertura / Mutua',
                'Estado'
            ];
            const prHeaderRow = ws.getRow(nextSectionRow + 1);
            prHeaderRow.values = presHeaders;
            prHeaderRow.height = 22;
            prHeaderRow.eachCell(c => {
                c.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF134E4A' } };
                c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } };
                c.border = { top: { style: 'thin' }, bottom: { style: 'medium', color: { argb: 'FF0F766E' } }, left: { style: 'thin' }, right: { style: 'thin' } };
                c.alignment = { vertical: 'middle', horizontal: 'center' };
            });

            let prRowIdx = nextSectionRow + 2;
            presList.forEach(pr => {
                if (pr.lineas && pr.lineas.length > 0) {
                    pr.lineas.forEach((lin, lIdx) => {
                        const r = ws.getRow(prRowIdx);
                        r.values = [
                            lIdx === 0 ? pr.FechaPresupuesto : '',
                            lIdx === 0 ? (pr.NumeroConFormato || `#${pr.NumPresupuesto}`) : '',
                            lIdx === 0 ? pr.Descripcion : '',
                            lIdx === 0 ? pr.TotalPresupuesto : '',
                            lIdx === 0 ? pr.PRESUP_Responsable : '',
                            lin.descripcion,
                            lin.cantidad,
                            lin.importeUnitario,
                            lIdx === 0 ? (pr.Cliente_Nombre || 'Particular') : '',
                            lIdx === 0 ? 'Confeccionado' : ''
                        ];
                        r.height = 19;
                        r.eachCell((c, cIdx) => {
                            c.font = { name: 'Segoe UI', size: 9 };
                            c.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
                            if (cIdx === 4 || cIdx === 8) c.numFmt = '$#,##0';
                            if (cIdx === 1 || cIdx === 2 || cIdx === 7 || cIdx === 10) c.alignment = { vertical: 'middle', horizontal: 'center' };
                            else c.alignment = { vertical: 'middle', horizontal: 'left' };
                        });
                        prRowIdx++;
                    });
                } else {
                    const r = ws.getRow(prRowIdx);
                    r.values = [
                        pr.FechaPresupuesto,
                        pr.NumeroConFormato || `#${pr.NumPresupuesto}`,
                        pr.Descripcion,
                        pr.TotalPresupuesto,
                        pr.PRESUP_Responsable,
                        '(Sin líneas detalladas)',
                        1,
                        pr.TotalPresupuesto,
                        pr.Cliente_Nombre || 'Particular',
                        'Confeccionado'
                    ];
                    r.height = 19;
                    r.eachCell((c, cIdx) => {
                        c.font = { name: 'Segoe UI', size: 9 };
                        c.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
                        if (cIdx === 4 || cIdx === 8) c.numFmt = '$#,##0';
                    });
                    prRowIdx++;
                }
            });

            nextSectionRow = prRowIdx + 2;
        }

        // ─────────────────────────────────────────────────────────────
        // TABLA CRONOLÓGICA DE VISITAS
        // ─────────────────────────────────────────────────────────────
        if (vList.length > 0) {
            ws.mergeCells(`A${nextSectionRow}:J${nextSectionRow}`);
            const tTitle = ws.getCell(`A${nextSectionRow}`);
            tTitle.value = `Detalle Cronológico de Visitas y Consultas en Sanatorio Argentino (Año 2026)`;
            tTitle.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
            tTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }; // Azul institucional
            tTitle.alignment = { vertical: 'middle', indent: 1 };
            ws.getRow(nextSectionRow).height = 24;

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

            const headerRow = ws.getRow(nextSectionRow + 1);
            headerRow.values = detailHeaders;
            headerRow.height = 24;
            headerRow.eachCell(c => {
                c.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };
                c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
                c.border = { top: { style: 'thin' }, bottom: { style: 'medium', color: { argb: 'FF1E40AF' } }, left: { style: 'thin' }, right: { style: 'thin' } };
                c.alignment = { vertical: 'middle', horizontal: 'center' };
            });

            let detailRowIdx = nextSectionRow + 2;
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

                    if (cIdx === 3) {
                        if (v.Asistencia === 'Presente') {
                            c.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF15803D' } };
                        } else if (v.Asistencia && v.Asistencia.toLowerCase().includes('injustifica')) {
                            c.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFB91C1C' } };
                        }
                    }
                });
                detailRowIdx++;
            });
        }

        // Anchos de columna
        ws.columns = [
            { width: 16 }, // Fecha
            { width: 12 }, // Hora / NumPres
            { width: 34 }, // Asistencia / Descripcion
            { width: 32 }, // Tipo Visita / Monto
            { width: 28 }, // Especialidad / Responsable
            { width: 34 }, // Responsable / Concepto Detalle
            { width: 24 }, // Agenda / Cantidad
            { width: 20 }, // Centro / Imp Unitario
            { width: 26 }, // Obra Social / Mutua
            { width: 24 }  // Motivo Ausencia / Estado
        ];
    });

    // Guardar archivo en proyecto y Escritorio
    const projectFilePath = resolve(__dirname, 'Reporte_Trazabilidad_Partos_CIMYN_2026.xlsx');
    const desktopPath = 'C:\\Users\\Sanatorio Argentino\\Desktop\\Reporte_Trazabilidad_Partos_CIMYN_2026.xlsx';

    await wb.xlsx.writeFile(projectFilePath);
    console.log(`\n✅ Archivo generado exitosamente en proyecto: ${projectFilePath}`);

    try {
        await wb.xlsx.writeFile(desktopPath);
        console.log(`✅ Copia generada exitosamente en el Escritorio: ${desktopPath}`);
    } catch (e) {
        console.warn('⚠️ No se pudo escribir directamente en el Escritorio:', e.message);
    }

    console.log('\n--- PROCESO FINALIZADO CON ÉXITO ---');
}

generarReporteExcel().catch(console.error);
