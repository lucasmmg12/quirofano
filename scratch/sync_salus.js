import { createClient } from '@supabase/supabase-js';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables del .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ==========================================
// CONFIGURACIÓN DE CONEXIONES
// ==========================================

// Configuración de Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL;
// Utilizamos SERVICE_ROLE_KEY si existe para tener permisos completos, sino el ANON_KEY
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuración de SALUS (SQL Server)
// NOTA: Reemplazar estas variables de entorno en el archivo .env o directamente aquí si es necesario
const sqlConfig = {
    user: process.env.SALUS_DB_USER || 'sa',
    password: process.env.SALUS_DB_PASSWORD || 'password',
    database: process.env.SALUS_DB_NAME || 'SALUS',
    server: process.env.SALUS_DB_SERVER || 'localhost',
    port: process.env.SALUS_DB_PORT ? parseInt(process.env.SALUS_DB_PORT, 10) : 1433,
    options: {
        encrypt: false, // Depende de la configuración del servidor, 'false' es normal en redes internas
        trustServerCertificate: true, // Importante para entornos locales/desarrollo
    },
};

// ==========================================
// FUNCIÓN PRINCIPAL
// ==========================================

async function syncPacientes() {
    try {
        console.log('1. Conectando a SQL Server (SALUS)...');
        await sql.connect(sqlConfig);

        console.log('2. Consultando los últimos 2000 pacientes...');
        // Obtenemos solo los campos que vamos a mapear en nuestra DB de Supabase
        const result = await sql.query`
            SELECT TOP (2000) 
                [id],
                [nombre],
                [NIF],
                [edad],
                [sexo],
                [email],
                [mutua]
            FROM [SALUS].[dbo].[VIS_Pacientes]
            ORDER BY [id] DESC
        `;

        const pacientesSalus = result.recordset;
        console.log(`✅ Se obtuvieron ${pacientesSalus.length} pacientes de SALUS.`);

        // 3. Mapeo a la estructura de 'hospital_pacientes' en Supabase
        // (id_paciente, nombre, dni, edad, sexo, email, centro)
        const pacientesAInsertar = pacientesSalus.map(p => ({
            id_paciente: p.id,
            nombre: p.nombre ? p.nombre.trim() : 'Sin nombre',
            dni: p.NIF ? p.NIF.trim() : null,
            edad: p.edad ? p.edad.toString() : null,
            sexo: p.sexo ? p.sexo.trim() : null,
            email: p.email ? p.email.trim() : null,
            centro: p.mutua ? p.mutua.trim() : null // Mapeamos mutua como el centro/obra social
        }));

        console.log('3. Sincronizando con Supabase mediante Upsert en lotes...');

        // Hacemos el upsert en lotes para no sobrecargar el endpoint de Supabase
        const BATCH_SIZE = 500;
        let totalSync = 0;
        
        for (let i = 0; i < pacientesAInsertar.length; i += BATCH_SIZE) {
            const batch = pacientesAInsertar.slice(i, i + BATCH_SIZE);
            
            // Upsert inserta si no existe y actualiza si ya existe (basado en id_paciente que es PRIMARY KEY)
            const { error } = await supabase
                .from('hospital_pacientes')
                .upsert(batch, { onConflict: 'id_paciente' });
            
            if (error) {
                console.error(`❌ Error al insertar lote ${i} a ${i + BATCH_SIZE}:`, error);
                // Opcional: break; si queremos que se detenga al primer error
            } else {
                totalSync += batch.length;
                console.log(`   ➡️ Progreso: ${totalSync} / ${pacientesAInsertar.length} pacientes sincronizados.`);
            }
        }

        console.log('✅ ¡Sincronización completada con éxito!');
        
    } catch (err) {
        console.error('❌ Ocurrió un error crítico:', err);
    } finally {
        // Cerrar la conexión a SQL Server
        await sql.close();
        process.exit(0);
    }
}

syncPacientes();
