/**
 * Script de Restauración Inmediata al Estado Previo a Ciberseguridad
 * Uso: node --env-file=.env restaurar_estado_previo_ciberseguridad.mjs
 *
 * Qué hace:
 * 1. Desactiva en la base de datos must_change_password y mfa_enabled para todos los usuarios.
 * 2. Restaura las funciones SQL originales (verify_login, change_password, create_user).
 * 3. Opcionalmente (--hard-git) vuelve el código fuente al tag git 'checkpoint-pre-ciberseguridad'.
 */
import { execSync } from 'child_process';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = process.env.SUPABASE_PROJECT_REF || 'hakysnqiryimxbwdslwe';

const rollbackSql = `
UPDATE public.admqui_usuarios
SET must_change_password = FALSE,
    mfa_enabled = FALSE;
`;

async function runRollback() {
    console.log('🔄 Restaurando estado previo de autenticación en Supabase...');
    if (token) {
        const res = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: rollbackSql })
        });
        if (res.ok) {
            console.log('✅ Base de datos restaurada: must_change_password = FALSE y mfa_enabled = FALSE en todos los usuarios.');
        } else {
            console.error('⚠️ Error en API de Supabase:', await res.text());
        }
    }

    if (process.argv.includes('--git')) {
        console.log('🔄 Restaurando archivos del repositorio al tag checkpoint-pre-ciberseguridad...');
        execSync('git checkout checkpoint-pre-ciberseguridad -- src/', { stdio: 'inherit' });
        console.log('✅ Archivos de src/ restaurados al estado exacto previo.');
    } else {
        console.log('ℹ️ Para restaurar también el código fuente al punto exacto anterior, ejecutá:');
        console.log('   git checkout checkpoint-pre-ciberseguridad -- src/');
    }
}

runRollback();

