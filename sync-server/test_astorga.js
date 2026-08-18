import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://hakysnqiryimxbwdslwe.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM'
);

async function run() {
    const { data, error } = await supabase
        .from('asociaciones_cirugias')
        .select('*')
        .ilike('nombre_paciente', '%OLIVERA%ELISA%');
    console.log("=== SUPABASE RECORDS ===");
    console.log(data);
    if (error) console.error("Error:", error);
}
run();
