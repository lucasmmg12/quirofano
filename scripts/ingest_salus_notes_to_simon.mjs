import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';

import fs from 'fs';
import path from 'path';

// Load .env if present
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const SQL_CONFIG = {
  user: process.env.SALUS_DB_USER || 'SalusConsulta',
  password: process.env.SALUS_DB_PASSWORD || 'ConsultaSALUS1234',
  server: process.env.SALUS_DB_SERVER || '128.223.16.29',
  port: parseInt(process.env.SALUS_DB_PORT || '2450', 10),
  database: process.env.SALUS_DB_NAME || 'SALUS',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    connectTimeout: 8000,
    requestTimeout: 25000
  }
};

const OPENAI_API_KEY = process.env.SIMON_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const SIMON_SUPABASE_URL = process.env.SIMON_SUPABASE_URL || 'https://dtjmckbrofevgfqbkzli.supabase.co';
const SIMON_SERVICE_KEY = process.env.SIMON_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(SIMON_SUPABASE_URL, SIMON_SERVICE_KEY);


function extractKeywords(name, text) {
  const kws = new Set();
  
  // Clean name words
  const cleanName = name.replace(/[(),]/g, ' ').toLowerCase();
  cleanName.split(/\s+/).filter(w => w.length > 2).forEach(w => kws.add(w));
  kws.add(name.toLowerCase());

  // Check for common tokens in text
  const lowerText = text.toLowerCase();
  ['particular', 'adicional', 'plus', 'coseguro', 'alias', 'mercado pago', 'iosfa', 'osde', 'sancor', 'pami', 'osp', 'cimin', 'colpo', 'eco', 'pediatrica', 'turno', 'seña', 'consulta'].forEach(token => {
    if (lowerText.includes(token)) kws.add(token);
  });

  // Extract MP if present
  const mpMatch = text.match(/(?:mp|matr[íi]cula(?:\s*profesional)?)\s*[:.]?\s*(\d+)/i);
  if (mpMatch) {
    kws.add(`mp ${mpMatch[1]}`);
    kws.add(mpMatch[1]);
  }

  kws.add('parametros');
  kws.add('tarifas');
  return Array.from(kws).slice(0, 25);
}

async function runIngestion() {
  console.log('=== INICIANDO EXTRACCIÓN DE NOTAS DIARIAS DE SALUS ===');
  const pool = await sql.connect(SQL_CONFIG);
  
  const query = `
    WITH RankedNotes AS (
      SELECT 
        ND.Id as NotaId,
        ND.IdAgenda,
        A.Nombre as AgendaNombre,
        A.NombreAbrev as AgendaAbrev,
        P.Nombre as PersonalNombre,
        P.NumColegiado,
        ND.FechaInicio,
        ND.FechaFin,
        ND.Descripcion,
        ROW_NUMBER() OVER (PARTITION BY ND.IdAgenda ORDER BY ND.FechaFin DESC, ND.Id DESC) as rn
      FROM AgendaNotasDiarias ND
      INNER JOIN Agendas A ON A.id = ND.IdAgenda
      LEFT JOIN Personal P ON P.Nombre = A.Nombre
      WHERE ND.FechaFin >= GETDATE() 
        AND LTRIM(RTRIM(ND.Descripcion)) <> ''
        AND A.Activo = 1
    )
    SELECT * FROM RankedNotes WHERE rn = 1
    ORDER BY AgendaNombre ASC
  `;
  
  const res = await pool.request().query(query);
  await pool.close();

  const records = res.recordset;
  console.log(`Encontradas ${records.length} agendas activas con notas vigentes en SALUS.`);

  // Clean up any test records created earlier for Galante
  await sb.from('rag_documents')
    .delete()
    .eq('metadata->>created_by', 'Test Integracion SALUS');
  
  // Clean up any previous automatic sync to avoid duplicates
  const { error: delErr } = await sb.from('rag_documents')
    .delete()
    .eq('metadata->>created_by', 'Sincronizador Automático SALUS');
  if (delErr) console.warn('Aviso limpiando registros previos:', delErr.message);

  console.log('=== GENERANDO EMBEDDINGS E INSERTANDO REGLAS EN SIMÓN RAG ===');
  
  const BATCH_SIZE = 40;
  let totalProcessed = 0;
  let totalInserted = 0;

  // For Markdown catalog
  const catalogLines = [
    '# GUÍA DE PARÁMETROS Y NOTAS DIARIAS DE MÉDICOS Y AGENDAS - SANATORIO ARGENTINO',
    `*Fecha de Sincronización con SALUS:* ${new Date().toLocaleDateString('es-AR')}`,
    `*Total de Agendas y Médicos Activos:* ${records.length}`,
    '',
    'Este documento consolida todas las directivas operativas, aranceles, cobros de señas, adicionales, exclusiones de obras sociales, alias de pago y particularidades de los profesionales del Sanatorio Argentino vigentes en SALUS.',
    '',
    '---',
    ''
  ];

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    
    // Prepare embedding texts and payloads
    const items = batch.map(rec => {
      const cleanDesc = rec.Descripcion.replace(/\r\n/g, '\n').trim();
      const title = `Tarifas y Parámetros Operativos - ${rec.AgendaNombre}`;
      const keywords = extractKeywords(rec.AgendaNombre, cleanDesc);

      const embedText = `REGLA: ${title}
Categoría: medico
Médico / Agenda: ${rec.AgendaNombre}
${rec.NumColegiado ? `Matrícula Profesional (MP): ${rec.NumColegiado}\n` : ''}Parámetros Operativos y Condiciones de Atención:
${cleanDesc}
Texto original SALUS: ${cleanDesc}`;

      // Append to catalog
      catalogLines.push(`## ${rec.AgendaNombre}`);
      if (rec.NumColegiado) catalogLines.push(`- **Matrícula Profesional (MP):** ${rec.NumColegiado}`);
      catalogLines.push(`- **Id Agenda SALUS:** ${rec.IdAgenda}`);
      catalogLines.push(`- **Vigencia hasta:** ${new Date(rec.FechaFin).toISOString().split('T')[0]}`);
      catalogLines.push('**Detalle de Parámetros y Valores:**');
      catalogLines.push('```text');
      catalogLines.push(cleanDesc);
      catalogLines.push('```');
      catalogLines.push('');
      catalogLines.push('---');
      catalogLines.push('');

      return {
        content: embedText,
        title,
        keywords,
        cleanDesc,
        rec
      };
    });

    // Request embeddings from OpenAI
    const textsToEmbed = items.map(it => it.content);
    const embResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: textsToEmbed,
        dimensions: 1536
      })
    }).then(r => r.json());

    if (embResponse.error) {
      console.error(`Error generando embeddings para lote ${i}:`, embResponse.error);
      throw new Error(embResponse.error.message);
    }

    const embeddings = embResponse.data.map(d => d.embedding);

    // Build rows for Supabase insert
    const rowsToInsert = items.map((it, idx) => ({
      content: it.content,
      embedding: embeddings[idx],
      metadata: {
        source: 'rule',
        filename: '__rules__',
        file_type: 'rule',
        title: it.title,
        category: 'medico',
        medico: it.rec.AgendaNombre,
        id_agenda: it.rec.IdAgenda,
        nota_id: it.rec.NotaId,
        matricula: it.rec.NumColegiado || null,
        original_text: it.cleanDesc,
        processed_text: it.cleanDesc,
        keywords: it.keywords,
        created_by: 'Sincronizador Automático SALUS',
        created_at: new Date().toISOString(),
        rule_date: new Date().toISOString().split('T')[0]
      }
    }));

    const { error: insertErr } = await sb.from('rag_documents').insert(rowsToInsert);
    if (insertErr) {
      console.error(`Error insertando en Supabase lote ${i}:`, insertErr);
      throw insertErr;
    }

    totalProcessed += batch.length;
    totalInserted += rowsToInsert.length;
    console.log(`Progreso: ${totalProcessed} / ${records.length} notas procesadas e insertadas.`);
  }

  console.log(`\n=== INGESTA DE REGLAS COMPLETADA: ${totalInserted} DIRECTIVAS MÉDICAS ACTIVAS ===`);

  // Write Master Catalog to disk
  const catalogContent = catalogLines.join('\n');
  const catalogPath = 'c:/Users/Sanatorio Argentino/Desktop/Proyectos/Sistema ADM-QUI/scratch/Guia_Parametros_Notas_Diarias_Medicos_SALUS.md';
  const fs = await import('fs');
  fs.writeFileSync(catalogPath, catalogContent, 'utf-8');
  console.log(`Catálogo maestro guardado en ${catalogPath} (${(catalogContent.length / 1024).toFixed(1)} KB)`);

  // Upload Master Catalog to Simón RAG API
  console.log('=== SUBIENDO CATÁLOGO MAESTRO AL FILE MANAGER DE SIMÓN RAG ===');
  const formData = new FormData();
  const fileBlob = new Blob([catalogContent], { type: 'text/markdown' });
  formData.append('file', fileBlob, 'Guia_Parametros_Notas_Diarias_Medicos_SALUS.md');
  formData.append('folder', 'Parametros_Medicos');
  formData.append('tag', 'salus-notas-diarias');

  try {
    const uploadRes = await fetch('https://contactcenter-1.onrender.com/api/upload', {
      method: 'POST',
      body: formData
    }).then(r => r.json());
    console.log('Resultado de subida de catálogo a Simón RAG:', uploadRes);
  } catch (upErr) {
    console.warn('Aviso al subir documento catálogo a /upload:', upErr.message);
  }

  console.log('=== PROCESO FINALIZADO EXITOSAMENTE ===');
}

runIngestion().catch(console.error);
