import sql from 'mssql';

const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 180000,
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
};

async function testUciInVlise() {
    try {
        await sql.connect(SQL_CONFIG);
        console.log('Conectado a SALUS');

        // 1. Ver habitaciones distintas en Hospitalización
        const habs = await sql.query(`
            SELECT TOP 30 HOSP_Habitacion, COUNT(*) as cant
            FROM VLISE_PeticionesPruebas
            WHERE [Fecha Solicitud] >= '2025-06-01'
              AND Origen = 'Hospitalización'
            GROUP BY HOSP_Habitacion
            ORDER BY cant DESC
        `);
        console.log('--- HABITACIONES EN HOSPITALIZACION ---');
        console.table(habs.recordset);

        // 2. Cruce directo de IdPaciente con TABLEAU_Admisiones de UCI
        const cruceUci = await sql.query(`
            SELECT 
                COUNT(*) as total_estudios_uci,
                COUNT(DISTINCT v.IdPeticionDePrueba) as peticiones_unicas,
                COUNT(DISTINCT v.IdPaciente) as pacientes_uci
            FROM VLISE_PeticionesPruebas v
            JOIN TABLEAU_Admisiones b ON b.NHC = v.IdPaciente -- o IdPaciente
            WHERE b.Servicio = 'UCI'
              AND v.[Fecha Solicitud] >= '2025-06-01'
        `);
        console.log('--- CRUCE CON ADMISIONES UCI ---');
        console.table(cruceUci.recordset);

        // 3. Top estudios realizados a pacientes UCI
        const topEstudios = await sql.query(`
            SELECT TOP 15
                v.Descripcion1 as Estudio,
                COUNT(*) as cantidad
            FROM VLISE_PeticionesPruebas v
            JOIN TABLEAU_Admisiones b ON b.NHC = v.IdPaciente
            WHERE b.Servicio = 'UCI'
              AND v.[Fecha Solicitud] >= '2025-06-01'
            GROUP BY v.Descripcion1
            ORDER BY cantidad DESC
        `);
        console.log('--- TOP 15 ESTUDIOS EN UCI ---');
        console.table(topEstudios.recordset);

        await sql.close();
    } catch(err) {
        console.error(err);
    }
}
testUciInVlise();
