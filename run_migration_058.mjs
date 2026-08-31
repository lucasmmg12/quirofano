import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = process.env.SUPABASE_PROJECT_REF || 'hakysnqiryimxbwdslwe';
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!token) {
    console.error('❌ ERROR: SUPABASE_ACCESS_TOKEN not found in .env');
    process.exit(1);
}

const sqlPath = resolve(__dirname, 'supabase/migrations/058_gobernanza_proyectos.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function run() {
    console.log(`Running migration 058 via Supabase Management API...\n`);
    
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
