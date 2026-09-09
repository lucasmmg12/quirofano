import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const idsToDelete = [
    { pId: '4abdc617-7dd2-40c9-87e1-bda9254333fa', pNum: 'UCI000818-P1', paciente: 'ALESSI, ROSA LIDIA' },
    { pId: '30476a6a-cd03-4656-866d-f6d615f10a1d', pNum: 'TI000229-P1', paciente: 'DE LA VEGA ROUX, GUADALUPE' },
    { pId: '86326f8d-faac-42a7-a000-394a7eb11d33', pNum: 'UCI000792-P1', paciente: 'MORENO VICTORIA, LUIS EDUARDO' },
    { pId: '7ae1f3b2-c8c7-4c90-8b76-3bc0b11b8526', pNum: 'UCI000813-P1', paciente: 'GONZALEZ, TERESA NILDA' },
    { pId: '7ab2dbdb-68d9-4c43-b90b-613d81259c69', pNum: 'I052850-P1', paciente: 'VIVES, JOSE VICENTE' },
    { pId: '775fed27-4600-4782-a35a-a5c199211a03', pNum: 'T008741-P1', paciente: 'LACIAR VARGAS, TOBIAS EZEQUIEL' },
    { pId: 'c961f423-c9cf-4486-ac07-c51235ee638c', pNum: 'I053481-P1', paciente: 'FARIAS CARDOZO, ELIANA BEATRIZ' },
    { pId: '18ea27c1-5f64-49ab-87ff-14e8f08caca4', pNum: 'I053085-P1', paciente: 'DIAZ AMARFIL, GABRIELA ALEJANDRA' },
    { pId: '8ec3ec74-f66b-4700-818b-5512652c9a52', pNum: 'TI000230-P1', paciente: 'PAZOS, VICTOR DARIO' },
    { pId: 'e5850f82-1e0d-43c3-9c67-19341ee7b12f', pNum: 'N002600-P1', paciente: 'JOFRE, LUCA' },
    { pId: '7e78f6c1-0409-44ee-98c4-e8bf783e5023', pNum: 'UCI000878-P1', paciente: 'LAGOS, SUSANA MABEL' },
    { pId: '31d4457a-e0f4-428a-abea-f320366f66a6', pNum: 'N002624-P1', paciente: 'CORTEZ, LAUTARO BENJAMIN' },
    { pId: '085e2b55-8d66-4621-a2fe-a20e2275c72c', pNum: 'N002623-P1', paciente: 'CORTEZ, JUAN IGNACIO' },
    { pId: '2ed1f645-c0b1-4b81-9073-a2d0cccc7f15', pNum: 'N002617-P1', paciente: 'ORMEÑO RIOS, NASLY' },
    { pId: 'eba0e61d-7940-494b-9367-01c13c33d433', pNum: 'UCI000866-P1', paciente: 'POBLETE, DOMINGO ALBERTO' },
    { pId: '1c8ced13-6e13-4b4f-b49d-cca5c24d45f8', pNum: 'N002609-P1', paciente: 'POMARADA, SALOME' }
];

async function deleteDuplicates() {
    console.log(`Iniciando eliminación de ${idsToDelete.length} registros duplicados no facturados...`);
    let deleted = 0;
    for (const item of idsToDelete) {
        const { data, error } = await supabase
            .from('altas_administrativas')
            .delete()
            .eq('id', item.pId);
        
        if (error) {
            console.error(`❌ Error al eliminar ${item.pNum} (${item.paciente}):`, error);
        } else {
            console.log(`✅ Eliminado: ${item.pNum} - ${item.paciente}`);
            deleted++;
        }
    }
    console.log(`\nFinalizado: ${deleted} / ${idsToDelete.length} registros eliminados exitosamente.`);
}

deleteDuplicates();
