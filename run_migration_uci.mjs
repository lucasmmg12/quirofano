import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = process.env.SUPABASE_PROJECT_REF || 'hakysnqiryimxbwdslwe';

if (!token) {
    console.error('❌ ERROR: SUPABASE_ACCESS_TOKEN not found in .env');
    process.exit(1);
}

const sqlPath = resolve(__dirname, 'migrations/015_create_calidad_uci_admisiones.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function run() {
    console.log(`Running migration UCI via Supabase Management API...\n`);
    
    const uri = `https://api.supabase.com/v1/projects/${project}/database/query`;
    
    try {
        const response = await fetch(uri, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: sql })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Migration SUCCESSFUL!');
            console.log(JSON.stringify(result, null, 2));
        } else {
            const errText = await response.text();
            console.error(`❌ Migration FAILED status ${response.status}:`, errText);
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ Request error:', err.message);
        process.exit(1);
    }
}

run();
