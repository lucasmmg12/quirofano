const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = 'hakysnqiryimxbwdslwe';

if (!accessToken) {
  console.error("Missing SUPABASE_ACCESS_TOKEN in .env");
  process.exit(1);
}

async function run() {
    console.log("Starting Garantias DB Migration via Supabase Management API...");

    const sql = `
        CREATE TABLE IF NOT EXISTS rendiciones_garantias (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            codigo TEXT NOT NULL,
            fecha_rendicion TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
            responsable_entrega TEXT,
            firma_entrega TEXT,
            responsable_recibe TEXT,
            firma_recibe TEXT,
            cantidad_garantias INTEGER,
            observaciones TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );

        CREATE TABLE IF NOT EXISTS garantias_historial (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            surgery_id UUID REFERENCES surgeries(id) ON DELETE CASCADE,
            fecha_movimiento TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
            usuario TEXT,
            tipo_movimiento TEXT,
            origen TEXT,
            destino TEXT,
            estado_vigente TEXT,
            observaciones TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );

        ALTER TABLE surgeries
        ADD COLUMN IF NOT EXISTS garantia_estado TEXT DEFAULT 'Activa',
        ADD COLUMN IF NOT EXISTS garantia_ubicacion TEXT DEFAULT 'Recepción',
        ADD COLUMN IF NOT EXISTS en_carrito_rendicion BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS carrito_rendicion_por TEXT,
        ADD COLUMN IF NOT EXISTS carrito_rendicion_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS rendicion_garantia_id UUID REFERENCES rendiciones_garantias(id) ON DELETE SET NULL;
    `;

    try {
        const response = await fetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: sql })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.error("Migration failed:", data);
        } else {
            console.log("Migration executed successfully:", data);
        }
    } catch (error) {
        console.error("Migration request failed:", error);
    }
}

run();
