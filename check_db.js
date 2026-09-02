import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    console.log("Checking asociaciones_cirugias...");
    const { data, error } = await supabase
        .from('asociaciones_cirugias')
        .select('*')
        .limit(5);

    if (error) {
        console.error("ERROR QUERYING:", error);
    } else {
        console.log(`SUCCESS. Found ${data.length} records in this small query.`);
        if (data.length > 0) {
            console.log("Sample:", JSON.stringify(data[0], null, 2));
        }
    }
}

check();
