const { Client } = require('pg');

async function run() {
    const client = new Client({
        connectionString: 'postgresql://postgres:07052812Mv.@db.hakysnqiryimxbwdslwe.supabase.co:5432/postgres',
    });
    try {
        await client.connect();
        
        // Let's first check what the current constraint is:
        const res = await client.query(`
            SELECT pg_get_constraintdef(oid) 
            FROM pg_constraint 
            WHERE conname = 'usuarios_rol_check';
        `);
        console.log('Current constraint:', res.rows[0]);

        // Now let's drop and replace it to include 'facturacion'
        await client.query(`ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;`);
        await client.query(`
            ALTER TABLE public.usuarios 
            ADD CONSTRAINT usuarios_rol_check 
            CHECK (rol IN ('enfermero', 'enfermero_jefe', 'admin', 'facturacion', 'medico', 'recepcion', 'auditor', 'administracion'));
        `);
        console.log('Constraint updated successfully');
    } catch(err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
run();
