const fs = require('fs');
const { execSync } = require('child_process');

// We will modify index.js to print all skipped or errored urgencias
let indexJs = fs.readFileSync('index.js', 'utf8');

if (!indexJs.includes('// URGENCIA DEBUG')) {
    indexJs = indexJs.replace(
        `const { data, error } = await supabase`,
        `// URGENCIA DEBUG\n        const urgenciasInBatch = batch.filter(r => r.estado && r.estado.toUpperCase() === 'URGENCIA');\n        if (urgenciasInBatch.length > 0) console.log('Urgencias in batch:', urgenciasInBatch.length);\n        const { data, error } = await supabase`
    );
    
    indexJs = indexJs.replace(
        `console.error(\`   ❌ Batch error:\`, error.message);`,
        `console.error(\`   ❌ Batch error:\`, error.message);\n            console.error('Batch had urgencias:', batch.filter(r => r.estado && r.estado.toUpperCase() === 'URGENCIA').map(u => u.nombre_paciente));`
    );
    
    fs.writeFileSync('index.js', indexJs);
    console.log("Modified index.js for debugging.");
} else {
    console.log("Already modified.");
}
