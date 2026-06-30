import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function calcularTriageAvanzado() {
    console.log('\n🚦 [TRIAGE] Recalculando triage de facturación...');
    
    // Obtenemos todas las altas desde mayo 2026 hasta junio 2026 (con paginación para evitar el límite de 1000)
    let altas = [];
    let from = 0;
    const step = 1000;
    let fetchMore = true;

    while (fetchMore) {
        const { data, error } = await supabase
            .from('altas_administrativas')
            .select('id, numero_admision, especialidad, doctor, fecha_ingreso, fecha_alta, cantidad_procedimientos, triage_facturacion')
            .gte('fecha_ingreso', '2026-05-01')
            .lt('fecha_ingreso', '2026-07-01') // Sólo hasta junio inclusive
            .range(from, from + step - 1);

        if (error) {
            console.error('   ❌ Error obteniendo altas para triage:', error.message);
            return { error: error.message };
        }

        altas = altas.concat(data);
        if (data.length < step) {
            fetchMore = false;
        } else {
            from += step;
        }
    }

    let actualizadas = 0;
    const batchUpdates = [];

    for (const alta of altas) {
        const esp = (alta.especialidad || '').toUpperCase();
        const doc = (alta.doctor || '').toUpperCase();
        const procs = alta.cantidad_procedimientos || 0;
        
        let diasInternacion = 0;
        if (alta.fecha_ingreso && alta.fecha_alta) {
            const a = new Date(alta.fecha_ingreso + 'T12:00:00');
            const b = new Date(alta.fecha_alta + 'T12:00:00');
            diasInternacion = Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
        }

        let nuevoTriage = 'Verde'; // Default

        // 🔴 Reglas ROJO
        const esTerapia = esp.includes('TERAPIA INTENSIVA');
        if (esp.includes('NEUROCIRUGIA') || esp.includes('NEUROCIRUGÍA')) {
            if (doc.includes('PONS')) nuevoTriage = 'Rojo';
        } else if (esp.includes('CARDIOVASCULAR')) {
            nuevoTriage = 'Rojo';
        } else if (esTerapia && diasInternacion > 20) {
            nuevoTriage = 'Rojo';
        } else if (esTerapia && procs >= 1) {
            nuevoTriage = 'Rojo';
        } else if (procs > 2) {
            nuevoTriage = 'Rojo';
        } 
        // 🟢 Regla Excepción GINECOLOGIA (prioridad sobre amarillo)
        else if ((esp.includes('GINECOLOGIA') || esp.includes('GINECOLOGÍA')) && procs <= 2) {
            nuevoTriage = 'Verde';
        }
        // 🟡 Reglas AMARILLO
        else if (esp.includes('HEMODINAMIA') || esp.includes('MAXILOFACIAL') || esp.includes('PLASTICA') || esp.includes('PLÁSTICA')) {
            nuevoTriage = 'Amarillo';
        } else if (esTerapia && diasInternacion >= 5 && diasInternacion <= 20) {
            nuevoTriage = 'Amarillo';
        } else if (procs === 1 || procs === 2) {
            nuevoTriage = 'Amarillo';
        }
        // 🟢 Reglas VERDE (resto cae por defecto en Verde, pero explicitamos por legibilidad)
        else if (esp.includes('CLINICA MEDICA') || esp.includes('CLÍNICA MÉDICA') || esp.includes('SHOCK ROOM')) {
            nuevoTriage = 'Verde';
        } else if (esTerapia && diasInternacion < 5) {
            nuevoTriage = 'Verde';
        }

        if (alta.triage_facturacion !== nuevoTriage) {
            batchUpdates.push({ id: alta.id, triage_facturacion: nuevoTriage });
        }
    }

    if (batchUpdates.length > 0) {
        console.log(`   🔄 Actualizando triage en ${batchUpdates.length} altas...`);
        for (const update of batchUpdates) {
            const { error: updError } = await supabase
                .from('altas_administrativas')
                .update({ triage_facturacion: update.triage_facturacion })
                .eq('id', update.id);
            if (updError) {
                console.error(`   ❌ Error update triage para ID ${update.id}:`, updError.message);
            } else {
                actualizadas++;
            }
        }
    }

    console.log(`   ✅ Triage avanzado calculado: ${actualizadas} altas actualizadas de un total de ${altas.length} analizadas.`);
}

calcularTriageAvanzado();
