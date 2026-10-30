import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envLocal = path.join(__dirname, '.env');
const envParent = path.join(__dirname, '..', '.env');
dotenv.config({ path: fs.existsSync(envParent) ? envParent : envLocal });

// 1. ADM-QUI Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Simon IA Supabase Client
const simonUrl = process.env.SIMON_SUPABASE_URL || 'https://dtjmckbrofevgfqbkzli.supabase.co';
const simonKey = process.env.SIMON_SERVICE_ROLE_KEY;
const simonSupabase = simonKey ? createClient(simonUrl, simonKey) : null;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 1536;

const SQL_CONFIG = {
    server: process.env.SALUS_DB_SERVER || '128.223.16.29',
    port: parseInt(process.env.SALUS_DB_PORT || '2450', 10),
    user: process.env.SALUS_DB_USER || 'SalusConsulta',
    password: process.env.SALUS_DB_PASSWORD || 'ConsultaSALUS1234',
    database: process.env.SALUS_DB_NAME || 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 90000,
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    }
};

const DIAS_SEMANA = {
    1: 'Domingo',
    2: 'Lunes',
    3: 'Martes',
    4: 'Miércoles',
    5: 'Jueves',
    6: 'Viernes',
    7: 'Sábado'
};

export function parseSpecialty(noteText, salusEspecialidades = [], agendaName = '') {
    if (salusEspecialidades && salusEspecialidades.length > 0) {
        return salusEspecialidades.join(' / ');
    }
    if (noteText) {
        const match = noteText.match(/especialidad\s*[:=]?\s*([^\r\n*]+)/i);
        if (match && match[1].trim().length > 2) return match[1].trim();
        const known = [
            [/ginecolog/i, 'GINECOLOGÍA Y OBSTETRICIA'],
            [/obstetr/i, 'OBSTETRICIA'],
            [/cardiolog/i, 'CARDIOLOGÍA'],
            [/pediatr/i, 'PEDIATRÍA'],
            [/kinesiolog|fisioterap|piso pelvico|drenaje/i, 'KINESIOLOGÍA Y FISIOTERAPIA'],
            [/ecograf|doppler/i, 'ECOGRAFÍA / DIAGNÓSTICO POR IMÁGENES'],
            [/traumatolog/i, 'TRAUMATOLOGÍA'],
            [/dermatolog/i, 'DERMATOLOGÍA'],
            [/endocrinolog/i, 'ENDOCRINOLOGÍA'],
            [/gastroenterolog/i, 'GASTROENTEROLOGÍA'],
            [/neurolog/i, 'NEUROLOGÍA'],
            [/urolog/i, 'UROLOGÍA'],
            [/otorrino/i, 'OTORRINOLARINGOLOGÍA'],
            [/nutrici/i, 'NUTRICIÓN'],
            [/psicolog/i, 'PSICOLOGÍA'],
            [/cirug[ií]a/i, 'CIRUGÍA'],
            [/mastolog/i, 'MASTOLOGÍA'],
            [/reumatolog/i, 'REUMATOLOGÍA'],
            [/neumonolog/i, 'NEUMONOLOGÍA'],
            [/cl[ií]nic[oa]/i, 'CLÍNICA MÉDICA'],
        ];
        for (const [rx, label] of known) {
            if (rx.test(noteText) || rx.test(agendaName)) return label;
        }
    }
    return 'Consulta Médica';
}

export function parseMatricula(noteText) {
    if (!noteText) return null;
    const m1 = noteText.match(/(?:MP|MAT\.?|MATR[IÍ]CULA)\s*[:=.]?\s*(\d{2,6})/i);
    if (m1) return m1[1];
    const m2 = noteText.match(/\b(\d{3,5})\s*MP\b/i);
    if (m2) return m2[1];
    return null;
}

export function buildDoctorKeywords(medicoNombre, especialidad, sedes = []) {
    const clean = (medicoNombre || '')
        .toLowerCase()
        .replace(/[(),.*\-_/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const tokens = clean.split(' ').filter(t => t.length >= 3 && !['dra', 'dr', 'lic', 'con', 'del', 'las', 'los', 'sede', 'ssl'].includes(t));
    const kw = new Set();
    for (const t of tokens) {
        kw.add(t);
        kw.add(`dr ${t}`);
        kw.add(`dra ${t}`);
        kw.add(`dr. ${t}`);
        kw.add(`dra. ${t}`);
    }
    if (tokens.length >= 2) {
        const pair = `${tokens[0]} ${tokens[1]}`;
        kw.add(pair);
        kw.add(`dr ${pair}`);
        kw.add(`dra ${pair}`);
    }
    if (especialidad && especialidad !== 'Consulta Médica') {
        kw.add(especialidad.toLowerCase());
    }
    for (const s of sedes) {
        kw.add(s.toLowerCase());
    }
    for (const base of ['particular', 'alias', 'mercado pago', 'turno', 'consulta', 'parametro', 'parametros', 'tarifas', 'valores', 'atencion', 'sede', 'horarios', 'obra social', 'coseguro', 'adicional']) {
        kw.add(base);
    }
    return Array.from(kw);
}

async function generateEmbeddingsBatch(texts, batchSize = 50) {
    if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
    const allEmbeddings = [];
    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        let attempts = 0;
        while (attempts < 3) {
            attempts++;
            const res = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: EMBEDDING_MODEL,
                    input: batch,
                    dimensions: EMBEDDING_DIMENSIONS
                })
            });
            if (res.ok) {
                const json = await res.json();
                allEmbeddings.push(...json.data.map(d => d.embedding));
                break;
            } else {
                const errText = await res.text();
                if (attempts >= 3) throw new Error(`OpenAI Embeddings error (${res.status}): ${errText}`);
                await new Promise(r => setTimeout(r, 2000 * attempts));
            }
        }
    }
    return allEmbeddings;
}

function chunkMarkdown(text, chunkSize = 1200, overlap = 200) {
    const sections = text.split('\n---\n');
    const chunks = [];
    let current = '';
    for (const sec of sections) {
        const candidate = current ? `${current}\n---\n${sec}` : sec;
        if (candidate.length <= chunkSize) {
            current = candidate;
        } else {
            if (current) chunks.push(current);
            if (sec.length <= chunkSize) {
                current = sec;
            } else {
                // Split long section by lines
                const lines = sec.split('\n');
                let sub = '';
                for (const line of lines) {
                    const subCand = sub ? `${sub}\n${line}` : line;
                    if (subCand.length <= chunkSize) {
                        sub = subCand;
                    } else {
                        if (sub) chunks.push(sub);
                        sub = line.slice(0, chunkSize);
                    }
                }
                current = sub;
            }
        }
    }
    if (current) chunks.push(current);

    return chunks.map((c, idx) => {
        if (idx === 0) return c;
        const tail = chunks[idx - 1].slice(-overlap);
        return `${tail}\n${c}`;
    });
}

export async function syncDoctorParameters({ syncSimon = true } = {}) {
    console.log('[SYNC-DOCTOR-PARAMS] Starting enriched sync from SALUS...');
    let pool;
    try {
        pool = await sql.connect(SQL_CONFIG);

        // Ejecutar todas las consultas de enriquecimiento en paralelo contra SALUS
        const [
            resAgendas,
            resNotas,
            resEsp,
            resCentros,
            resConsultoriosHoy,
            resHorarios,
            resTiposVisita
        ] = await Promise.all([
            pool.request().query(`
                SELECT 
                    a.id AS IdAgenda,
                    a.Nombre AS NombreAgenda,
                    a.NombreAbrev AS AgendaAbrev,
                    a.DuracionVisita AS DuracionVisita,
                    a.Observaciones AS ObservacionesAgenda,
                    a.InformacionAdicional AS InfoAdicional
                FROM dbo.Agendas a
                WHERE a.Activo = 1
                ORDER BY a.Nombre ASC
            `),
            pool.request().query(`
                SELECT 
                    Id AS IdNota,
                    IdAgenda,
                    FechaInicio,
                    FechaFin,
                    Descripcion,
                    CASE WHEN FechaFin >= GETDATE() THEN 1 ELSE 0 END AS EsVigente
                FROM dbo.AgendaNotasDiarias
                WHERE Descripcion IS NOT NULL 
                  AND LEN(LTRIM(RTRIM(CAST(Descripcion AS NVARCHAR(MAX))))) > 3
                ORDER BY IdAgenda, CASE WHEN FechaFin >= GETDATE() THEN 0 ELSE 1 END, Id DESC
            `),
            pool.request().query(`
                SELECT ae.IdAgenda, e.Descripcion AS Especialidad
                FROM dbo.AgendaEspecialidad ae
                INNER JOIN dbo.Especialidades e ON e.id = ae.IdEspecialidad
                WHERE e.Activar = 1
            `),
            pool.request().query(`
                SELECT ac.idAgenda AS IdAgenda, dc.Centro_Alias AS Sede, dc.Centro_Direccion AS Direccion
                FROM dbo.AgendasCentros ac
                INNER JOIN dbo.VLISE_DatosCentros dc ON dc.Centro_id = ac.idBd
            `),
            pool.request().query(`
                SELECT 
                    v.idAgenda AS IdAgenda,
                    MAX(LTRIM(RTRIM(v.NombreConsulta))) AS NombreConsulta,
                    MAX(dc.Centro_Alias) AS SedeHoy
                FROM dbo.Visitas v
                LEFT JOIN dbo.VLISE_DatosCentros dc ON dc.Centro_id = v.idBd
                WHERE CAST(v.Data AS DATE) = CAST(GETDATE() AS DATE)
                  AND v.NombreConsulta IS NOT NULL AND LEN(LTRIM(RTRIM(v.NombreConsulta))) > 0
                GROUP BY v.idAgenda
            `),
            pool.request().query(`
                SELECT 
                    v.idAgenda AS IdAgenda,
                    dc.Centro_Alias AS SedeReal,
                    MAX(CASE WHEN LEN(LTRIM(RTRIM(ISNULL(v.NombreConsulta, '')))) > 0 THEN LTRIM(RTRIM(v.NombreConsulta)) ELSE NULL END) AS ConsultorioHabitual,
                    DATEPART(dw, v.Data) AS DiaSemana,
                    MIN(CONVERT(VARCHAR(5), v.HoraInici, 108)) AS HoraMin,
                    MAX(CONVERT(VARCHAR(5), v.HoraFi, 108)) AS HoraMax,
                    COUNT(*) AS CantTurnos
                FROM dbo.Visitas v
                LEFT JOIN dbo.VLISE_DatosCentros dc ON dc.Centro_id = v.idBd
                WHERE v.Data >= DATEADD(day, -60, GETDATE())
                  AND v.Data <= DATEADD(day, 60, GETDATE())
                  AND v.idAgenda IS NOT NULL
                GROUP BY v.idAgenda, dc.Centro_Alias, DATEPART(dw, v.Data)
                HAVING COUNT(*) >= 3
            `),
            pool.request().query(`
                SELECT 
                    v.idAgenda AS IdAgenda,
                    t.Nom AS TipoVisita,
                    COUNT(*) AS Freq
                FROM dbo.Visitas v
                INNER JOIN dbo.TipusDeSessions t ON t.IdTipus = v.IdTipus
                WHERE v.Data >= DATEADD(day, -60, GETDATE())
                  AND v.idAgenda IS NOT NULL
                GROUP BY v.idAgenda, t.Nom
                HAVING COUNT(*) >= 2
                ORDER BY v.idAgenda, COUNT(*) DESC
            `)
        ]);

        // Indexar notas por IdAgenda (consolidando vigentes si hay más de una)
        const notasMap = {};
        for (const n of resNotas.recordset) {
            const text = (n.Descripcion || '').trim();
            if (!text) continue;
            if (!notasMap[n.IdAgenda]) {
                notasMap[n.IdAgenda] = {
                    id_nota: n.IdNota,
                    vigencia_hasta: n.FechaFin ? new Date(n.FechaFin).toISOString().slice(0, 10) : '2099-12-31',
                    textos: [text],
                    es_vigente: n.EsVigente === 1
                };
            } else if (n.EsVigente === 1 && notasMap[n.IdAgenda].es_vigente && notasMap[n.IdAgenda].textos.length < 3) {
                // Evitar duplicar si el texto es prácticamente igual
                const normNew = text.replace(/\s+/g, ' ').toLowerCase();
                const alreadyExists = notasMap[n.IdAgenda].textos.some(t => t.replace(/\s+/g, ' ').toLowerCase() === normNew);
                if (!alreadyExists) {
                    notasMap[n.IdAgenda].textos.push(text);
                }
            }
        }

        // Indexar especialidades por IdAgenda
        const espMap = {};
        for (const e of resEsp.recordset) {
            if (!espMap[e.IdAgenda]) espMap[e.IdAgenda] = [];
            if (!espMap[e.IdAgenda].includes(e.Especialidad.trim())) {
                espMap[e.IdAgenda].push(e.Especialidad.trim());
            }
        }

        // Indexar sedes configuradas por IdAgenda
        const sedesConfigMap = {};
        for (const c of resCentros.recordset) {
            if (!sedesConfigMap[c.IdAgenda]) sedesConfigMap[c.IdAgenda] = [];
            const label = c.Direccion ? `${c.Sede.trim()} (${c.Direccion.trim()})` : c.Sede.trim();
            if (!sedesConfigMap[c.IdAgenda].includes(label)) {
                sedesConfigMap[c.IdAgenda].push(label);
            }
        }

        // Indexar consultorio hoy
        const consultoriosHoyMap = {};
        for (const c of resConsultoriosHoy.recordset) {
            consultoriosHoyMap[c.IdAgenda] = c.SedeHoy
                ? `${c.SedeHoy.trim()} · ${c.NombreConsulta}`
                : c.NombreConsulta;
        }

        // Indexar horarios y sedes reales por IdAgenda
        const horariosMap = {};
        const sedesRealesMap = {};
        const consultorioHabitualMap = {};
        for (const h of resHorarios.recordset) {
            if (!horariosMap[h.IdAgenda]) horariosMap[h.IdAgenda] = [];
            const diaNombre = DIAS_SEMANA[h.DiaSemana] || `Día ${h.DiaSemana}`;
            const sedeStr = h.SedeReal ? h.SedeReal.trim() : 'Sanatorio Argentino';
            horariosMap[h.IdAgenda].push({
                dia: h.DiaSemana,
                texto: `${diaNombre} ${h.HoraMin} a ${h.HoraMax} hs (${sedeStr}${h.ConsultorioHabitual ? ` - ${h.ConsultorioHabitual}` : ''})`
            });
            if (h.SedeReal) {
                if (!sedesRealesMap[h.IdAgenda]) sedesRealesMap[h.IdAgenda] = [];
                if (!sedesRealesMap[h.IdAgenda].includes(h.SedeReal.trim())) {
                    sedesRealesMap[h.IdAgenda].push(h.SedeReal.trim());
                }
            }
            if (h.ConsultorioHabitual && !consultorioHabitualMap[h.IdAgenda]) {
                consultorioHabitualMap[h.IdAgenda] = h.SedeReal
                    ? `${h.SedeReal.trim()} · ${h.ConsultorioHabitual}`
                    : h.ConsultorioHabitual;
            }
        }

        // Indexar tipos de visita / prácticas reales por IdAgenda (top 6)
        const tiposVisitaMap = {};
        for (const tv of resTiposVisita.recordset) {
            if (!tiposVisitaMap[tv.IdAgenda]) tiposVisitaMap[tv.IdAgenda] = [];
            if (tiposVisitaMap[tv.IdAgenda].length < 6) {
                const cleanNom = (tv.TipoVisita || '').trim();
                if (cleanNom && !tiposVisitaMap[tv.IdAgenda].includes(cleanNom)) {
                    tiposVisitaMap[tv.IdAgenda].push(cleanNom);
                }
            }
        }

        // Construir registros enriquecidos
        const rowsToUpsert = [];
        const simonDoctorRecords = [];

        for (const row of resAgendas.recordset) {
            const idAgenda = row.IdAgenda;
            const doctorName = row.NombreAgenda ? row.NombreAgenda.trim() : `Agenda ${idAgenda}`;
            const notaInfo = notasMap[idAgenda];
            const notaRaw = notaInfo ? notaInfo.textos.join('\n\n---\n\n') : '';
            const salusEsps = espMap[idAgenda] || [];
            const specialty = parseSpecialty(notaRaw, salusEsps, doctorName);
            const matricula = parseMatricula(notaRaw);

            const sedesReales = sedesRealesMap[idAgenda] || [];
            const sedesConfig = sedesConfigMap[idAgenda] || [];
            const sedesDisplay = sedesReales.length > 0 ? sedesReales.join(' / ') : (sedesConfig.length > 0 ? sedesConfig.join(' | ') : '');

            const horariosList = (horariosMap[idAgenda] || [])
                .sort((a, b) => a.dia - b.dia)
                .map(h => h.texto);

            const practicasList = tiposVisitaMap[idAgenda] || [];
            const duracionMin = row.DuracionVisita ? `${row.DuracionVisita} min` : null;
            const consultorio = consultoriosHoyMap[idAgenda] || consultorioHabitualMap[idAgenda] || (sedesReales[0] || null);

            // Construir bloque enriquecido para ADM-QUI y Simon IA
            const extraLines = [];
            if (specialty && specialty !== 'Consulta Médica') extraLines.push(`• Especialidad SALUS: ${specialty}`);
            if (matricula) extraLines.push(`• Matrícula (MP): ${matricula}`);
            if (sedesDisplay) extraLines.push(`• Sedes de Atención: ${sedesDisplay}`);
            if (consultorio) extraLines.push(`• Consultorio / Sector: ${consultorio}`);
            if (duracionMin) extraLines.push(`• Duración estándar de turno: ${duracionMin}`);
            if (horariosList.length > 0) extraLines.push(`• Días y Horarios habituales en SALUS: ${horariosList.join(' | ')}`);
            if (practicasList.length > 0) extraLines.push(`• Prácticas / Tipos de turno frecuentes: ${practicasList.join(', ')}`);
            if (row.ObservacionesAgenda && row.ObservacionesAgenda.trim()) {
                extraLines.push(`• Observaciones de Agenda: ${row.ObservacionesAgenda.trim()}`);
            }

            const fichaEnriquecida = [
                notaRaw || null,
                extraLines.length > 0 ? `[Datos Operativos SALUS Actualizados]\n${extraLines.join('\n')}` : null
            ].filter(Boolean).join('\n\n');

            rowsToUpsert.push({
                id: `agenda_${idAgenda}`,
                id_agenda: idAgenda,
                id_personal: null,
                profesional_nombre: doctorName,
                especialidad: specialty,
                consultorio_actual: consultorio,
                condiciones_consulta: fichaEnriquecida || null,
                updated_at: new Date().toISOString()
            });

            // Incluir en Simon IA si tiene nota diaria o actividad de turnos real
            if (notaRaw || horariosList.length > 0 || practicasList.length > 0) {
                simonDoctorRecords.push({
                    id_agenda: idAgenda,
                    medico: doctorName,
                    especialidad: specialty,
                    matricula,
                    sedes: sedesReales.length > 0 ? sedesReales : sedesConfig,
                    consultorio,
                    duracion_min: duracionMin,
                    horarios: horariosList,
                    practicas: practicasList,
                    nota_id: notaInfo?.id_nota || null,
                    vigencia_hasta: notaInfo?.vigencia_hasta || '2099-12-31',
                    nota_raw: notaRaw,
                    ficha_completa: fichaEnriquecida
                });
            }
        }

        console.log(`[SYNC-DOCTOR-PARAMS] Upserting ${rowsToUpsert.length} doctor records into ADM-QUI Supabase...`);
        const chunkSize = 50;
        let inserted = 0;
        for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
            const chunk = rowsToUpsert.slice(i, i + chunkSize);
            const { error } = await supabase
                .from('contact_center_doctor_parameters')
                .upsert(chunk, { onConflict: 'id' });
            if (error) {
                console.error(`[SYNC-DOCTOR-PARAMS] ADM-QUI Chunk ${i} error:`, error.message);
            } else {
                inserted += chunk.length;
            }
        }
        console.log(`[SYNC-DOCTOR-PARAMS] ADM-QUI Supabase synced (${inserted} records).`);

        // 4. Sincronizar con Simon IA (Reglas vectorizadas + Documento Maestro en Parametros_Medicos)
        let simonSyncedRules = 0;
        let simonSyncedChunks = 0;
        if (syncSimon && simonSupabase && OPENAI_API_KEY) {
            console.log(`[SYNC-DOCTOR-PARAMS] Syncing ${simonDoctorRecords.length} enriched doctor profiles to Simon IA...`);
            const todayIso = new Date().toISOString();
            const todayDate = todayIso.slice(0, 10);
            const todayHuman = new Date().toLocaleDateString('es-AR');

            // 4a. Preparar reglas individuales para cada médico/agenda activa
            const rulePayloads = simonDoctorRecords.map(doc => {
                const title = `Tarifas y Parámetros Operativos - ${doc.medico}`;
                const processedText = [
                    `Médico / Agenda: ${doc.medico} (ID Agenda SALUS: ${doc.id_agenda})`,
                    `Especialidad: ${doc.especialidad}`,
                    doc.matricula ? `Matrícula Profesional (MP): ${doc.matricula}` : null,
                    doc.sedes.length > 0 ? `Sedes donde atiende: ${doc.sedes.join(' / ')}` : null,
                    doc.consultorio ? `Consultorio / Sector habitual: ${doc.consultorio}` : null,
                    doc.duracion_min ? `Duración estándar del turno: ${doc.duracion_min}` : null,
                    doc.horarios.length > 0 ? `Días y horarios habituales en SALUS: ${doc.horarios.join(' | ')}` : null,
                    doc.practicas.length > 0 ? `Prácticas / Tipos de turno que realiza: ${doc.practicas.join(', ')}` : null,
                    `Parámetros Operativos, Valores y Condiciones de Atención:\n${doc.nota_raw || 'Sin observaciones de cobro adicional registradas en Notas Diarias.'}`
                ].filter(Boolean).join('\n');

                const embedText = `REGLA: ${title}\nCategoría: medico\n${processedText}\nTexto original SALUS: ${doc.nota_raw || doc.ficha_completa}`;

                return {
                    content: embedText,
                    metadata: {
                        title,
                        medico: doc.medico,
                        especialidad: doc.especialidad,
                        sedes: doc.sedes,
                        horarios: doc.horarios,
                        practicas: doc.practicas,
                        source: 'rule',
                        nota_id: doc.nota_id,
                        category: 'medico',
                        filename: '__rules__',
                        keywords: buildDoctorKeywords(doc.medico, doc.especialidad, doc.sedes),
                        file_type: 'rule',
                        id_agenda: doc.id_agenda,
                        matricula: doc.matricula,
                        rule_date: todayDate,
                        created_at: todayIso,
                        created_by: 'Sincronizador Automático SALUS',
                        original_text: doc.nota_raw || doc.ficha_completa,
                        processed_text: processedText
                    }
                };
            });

            console.log(`[SYNC-DOCTOR-PARAMS] Generating OpenAI embeddings for ${rulePayloads.length} Simon IA doctor rules...`);
            const ruleEmbeddings = await generateEmbeddingsBatch(rulePayloads.map(r => r.content), 50);

            // Borrar reglas automáticas anteriores de SALUS e insertar las nuevas actualizadas
            const { error: delRulesErr } = await simonSupabase
                .from('rag_documents')
                .delete()
                .eq('metadata->>source', 'rule')
                .eq('metadata->>created_by', 'Sincronizador Automático SALUS');
            if (delRulesErr) {
                console.warn('[SYNC-DOCTOR-PARAMS] Warning deleting old Simon SALUS rules:', delRulesErr.message);
            }

            for (let i = 0; i < rulePayloads.length; i += 50) {
                const batch = rulePayloads.slice(i, i + 50).map((r, idx) => ({
                    content: r.content,
                    metadata: r.metadata,
                    embedding: ruleEmbeddings[i + idx]
                }));
                const { error: insErr } = await simonSupabase.from('rag_documents').insert(batch);
                if (insErr) {
                    console.error(`[SYNC-DOCTOR-PARAMS] Error inserting Simon rules batch ${i}:`, insErr.message);
                } else {
                    simonSyncedRules += batch.length;
                }
            }

            // 4b. Construir y actualizar el documento maestro Guia_Parametros_Notas_Diarias_Medicos_SALUS.md
            const mdSections = [
                `# GUÍA DE PARÁMETROS, SEDES, HORARIOS Y NOTAS DIARIAS DE MÉDICOS - SANATORIO ARGENTINO`,
                `*Fecha de Sincronización con SALUS:* ${todayHuman}`,
                `*Total de Agendas y Médicos Activos Sincronizados:* ${simonDoctorRecords.length}`,
                `\nEste documento oficial consolida todas las directivas operativas, especialidades, sedes de atención, consultorios, días y horarios habituales, tipos de turno, aranceles particulares, coseguros/adicionales, exclusiones de obras sociales, alias de pago y particularidades de los profesionales del Sanatorio Argentino vigentes en SALUS.`
            ];

            for (const doc of simonDoctorRecords) {
                const sec = [
                    `## ${doc.medico}`,
                    `- **Id Agenda SALUS:** ${doc.id_agenda}`,
                    `- **Especialidad:** ${doc.especialidad}`,
                    doc.matricula ? `- **Matrícula (MP):** ${doc.matricula}` : null,
                    doc.sedes.length > 0 ? `- **Sedes de Atención:** ${doc.sedes.join(' / ')}` : null,
                    doc.consultorio ? `- **Consultorio Habitual:** ${doc.consultorio}` : null,
                    doc.duracion_min ? `- **Duración de Turno:** ${doc.duracion_min}` : null,
                    doc.horarios.length > 0 ? `- **Días y Horarios Habituales:** ${doc.horarios.join(' | ')}` : null,
                    doc.practicas.length > 0 ? `- **Prácticas / Tipos de Turno:** ${doc.practicas.join(', ')}` : null,
                    `- **Vigencia hasta:** ${doc.vigencia_hasta}`,
                    `**Detalle de Parámetros y Valores (Notas Diarias SALUS):**`,
                    '```text',
                    doc.nota_raw || 'Agenda activa en SALUS sin observaciones de cobro adicional en Notas Diarias.',
                    '```'
                ].filter(Boolean).join('\n');
                mdSections.push(sec);
            }

            const fullMarkdown = mdSections.join('\n\n---\n\n');
            const mdBuffer = Buffer.from(fullMarkdown, 'utf-8');
            const filename = 'Guia_Parametros_Notas_Diarias_Medicos_SALUS.md';
            const folder = 'Parametros_Medicos';
            const storagePath = `${folder}/${filename}`;
            const docSummary = 'Guía operativa oficial del Sanatorio Argentino sincronizada desde SALUS que detalla para cada médico su especialidad, sede y consultorio de atención, días y horarios habituales, prácticas realizadas, tarifas particulares, adicionales/coseguros por obra social, alias de transferencia y requisitos de turno.';

            // Subir archivo actualizado al Storage de Simon IA
            try {
                await simonSupabase.storage.from('rag-files').upload(storagePath, mdBuffer, {
                    contentType: 'text/markdown; charset=utf-8',
                    upsert: true
                });
            } catch (stErr) {
                console.warn('[SYNC-DOCTOR-PARAMS] Storage upload warning:', stErr.message);
            }

            // Chunkear y vectorizar el documento maestro
            const rawChunks = chunkMarkdown(fullMarkdown, 1200, 200);
            const contextPrefix = `[Documento: ${filename}]\n[Resumen: ${docSummary}]\n\n`;
            const chunkTexts = rawChunks.map(c => `${contextPrefix}${c}`);
            console.log(`[SYNC-DOCTOR-PARAMS] Generating OpenAI embeddings for ${chunkTexts.length} markdown chunks...`);
            const chunkEmbeddings = await generateEmbeddingsBatch(chunkTexts, 50);

            await simonSupabase
                .from('rag_documents')
                .delete()
                .eq('metadata->>filename', filename);

            for (let i = 0; i < chunkTexts.length; i += 50) {
                const batch = chunkTexts.slice(i, i + 50).map((content, idx) => ({
                    content,
                    embedding: chunkEmbeddings[i + idx],
                    metadata: {
                        tag: 'salus-notas-diarias',
                        folder,
                        filename,
                        file_size: mdBuffer.length,
                        file_type: '.md',
                        chunk_index: i + idx,
                        doc_summary: docSummary,
                        storage_path: storagePath,
                        total_chunks: chunkTexts.length
                    }
                }));
                const { error: chErr } = await simonSupabase.from('rag_documents').insert(batch);
                if (chErr) {
                    console.error(`[SYNC-DOCTOR-PARAMS] Error inserting markdown chunks batch ${i}:`, chErr.message);
                } else {
                    simonSyncedChunks += batch.length;
                }
            }
            console.log(`[SYNC-DOCTOR-PARAMS] Simon IA updated: ${simonSyncedRules} doctor rules + ${simonSyncedChunks} document chunks.`);
        }

        return {
            success: true,
            count: inserted,
            simonRulesCount: simonSyncedRules,
            simonChunksCount: simonSyncedChunks
        };

    } catch (err) {
        console.error('[SYNC-DOCTOR-PARAMS] Error:', err.message);
        throw err;
    } finally {
        if (pool) await pool.close();
    }
}

// Ejecución directa si se invoca por CLI
if (process.argv[1] && process.argv[1].endsWith('sync_doctor_parameters.mjs')) {
    syncDoctorParameters().then((res) => {
        console.log('[SYNC-DOCTOR-PARAMS] Done:', res);
        process.exit(0);
    }).catch(e => {
        console.error(e);
        process.exit(1);
    });
}
