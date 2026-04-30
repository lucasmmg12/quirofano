/**
 * Migración: Agregar columna 'sistema' a whatsapp_shortcuts
 * Usa service_role key para poder ejecutar DDL
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hakysnqiryimxbwdslwe.supabase.co';
// service_role key tiene permisos elevados
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDIyNzQsImV4cCI6MjA4NTYxODI3NH0.-85OS1dohc9gh4U4qBhEBlqHi9Bq7l7H6JnzcUzrCIg';

const supabase = createClient(supabaseUrl, anonKey);

// Shortcuts que pertenecen a Recepciones (chequeos)
const recepcionesShortcuts = [
  '/prevenir', '/requisitosprevenir', '/chequeo',
  '/infochequeo', '/duracionchequeo', '/valorchequeo', '/recordatorio'
];

async function run() {
  // Step 1: Try adding column via direct SQL using fetch + service_role
  console.log('1️⃣ Creando columna "sistema" via SQL...');
  
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });
    // This won't work via REST, but let's try the direct postgres approach
  } catch(e) {
    // Expected
  }
  
  // Step 2: Test if column already exists by trying to read it
  console.log('2️⃣ Verificando si la columna ya existe...');
  const { data: test, error: testErr } = await supabase
    .from('whatsapp_shortcuts')
    .select('id, shortcut, sistema')
    .limit(1);
  
  if (testErr) {
    console.log('   ❌ La columna "sistema" NO existe aún.');
    console.log('   Necesitás ejecutar este SQL en el Dashboard de Supabase:');
    console.log('');
    console.log('   ALTER TABLE whatsapp_shortcuts ADD COLUMN IF NOT EXISTS sistema TEXT DEFAULT \'admqui\';');
    console.log('');
    console.log('   Ir a: https://supabase.com/dashboard/project/hakysnqiryimxbwdslwe/sql');
    console.log('   Pegar el SQL y ejecutar. Luego corré este script de nuevo.');
    return false;
  }
  
  console.log('   ✅ La columna "sistema" existe.');
  
  // Step 3: Tag recepciones shortcuts
  console.log('\n3️⃣ Tageando shortcuts de Recepciones...');
  const { data: recData, error: recErr } = await supabase
    .from('whatsapp_shortcuts')
    .update({ sistema: 'recepciones' })
    .in('shortcut', recepcionesShortcuts)
    .select('shortcut, sistema');
  
  if (recErr) {
    console.error('   ❌ Error:', recErr.message);
    return false;
  }
  console.log(`   ✅ ${recData.length} shortcuts marcados como "recepciones"`);
  recData.forEach(s => console.log(`      ${s.shortcut}`));

  // Step 4: Tag admqui shortcuts (all the rest that aren't already tagged)
  console.log('\n4️⃣ Tageando shortcuts de ADM-QUI...');
  const { data: admData, error: admErr } = await supabase
    .from('whatsapp_shortcuts')
    .update({ sistema: 'admqui' })
    .not('shortcut', 'in', `(${recepcionesShortcuts.join(',')})`)
    .select('shortcut, sistema');
  
  if (admErr) {
    console.error('   ❌ Error:', admErr.message);
    return false;
  }
  console.log(`   ✅ ${admData.length} shortcuts marcados como "admqui"`);
  admData.forEach(s => console.log(`      ${s.shortcut}`));

  // Step 5: Final verification
  console.log('\n5️⃣ Verificación final:');
  const { data: final } = await supabase
    .from('whatsapp_shortcuts')
    .select('shortcut, label, sistema')
    .order('sistema')
    .order('sort_order');
  
  const bySystem = {};
  final.forEach(s => {
    if (!bySystem[s.sistema]) bySystem[s.sistema] = [];
    bySystem[s.sistema].push(`${s.shortcut} (${s.label})`);
  });

  Object.entries(bySystem).forEach(([sys, shortcuts]) => {
    console.log(`\n   📦 ${sys.toUpperCase()}: ${shortcuts.length} atajos`);
    shortcuts.forEach(s => console.log(`      ${s}`));
  });
  
  return true;
}

run().then(ok => {
  if (ok) console.log('\n🎉 ¡Migración completada!');
  else console.log('\n⚠️ Migración incompleta, seguir instrucciones arriba.');
});
