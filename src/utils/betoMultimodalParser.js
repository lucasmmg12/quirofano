import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { supabase } from '../lib/supabase';

/**
 * Motor Multimodal de Beto IA — Sanatorio Argentino
 * Procesa e interpreta:
 *  1. Audios grabados en vivo o adjuntos (.mp3, .wav, .ogg, .m4a, .webm, .aac)
 *  2. Imágenes y capturas clínicas/administrativas (.png, .jpg, .jpeg, .webp)
 *  3. Documentos Word (.docx / .doc)
 *  4. Planillas Excel y CSV (.xlsx, .xls, .csv)
 *  5. Documentos PDF (.pdf)
 */

/**
 * Redimensiona y convierte una imagen a DataURL base64 optimizada para GPT-4.1 Vision
 */
export async function processImageFile(file, maxDimension = 1280) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const rawDataUrl = ev.target.result;
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.86);
                resolve({
                    dataUrl: optimizedDataUrl,
                    width,
                    height
                });
            };
            img.onerror = () => resolve({ dataUrl: rawDataUrl, width: 0, height: 0 });
            img.src = rawDataUrl;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Extrae texto y tablas estructuradas de un archivo Word (.docx) usando JSZip
 */
export async function parseDocxFile(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const docXmlFile = zip.file('word/document.xml');
        if (!docXmlFile) {
            throw new Error('Archivo .docx sin word/document.xml');
        }
        const xmlText = await docXmlFile.async('string');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

        const lines = [];
        const body = xmlDoc.getElementsByTagName('w:body')[0] || xmlDoc.documentElement;

        const extractParagraphText = (pNode) => {
            const texts = [];
            const runs = pNode.getElementsByTagName('w:t');
            for (let i = 0; i < runs.length; i++) {
                texts.push(runs[i].textContent || '');
            }
            return texts.join('').trim();
        };

        for (let i = 0; i < body.childNodes.length; i++) {
            const node = body.childNodes[i];
            if (node.nodeName === 'w:p') {
                const pText = extractParagraphText(node);
                if (pText) lines.push(pText);
            } else if (node.nodeName === 'w:tbl') {
                const rows = node.getElementsByTagName('w:tr');
                const tableLines = [];
                for (let r = 0; r < rows.length; r++) {
                    const cells = rows[r].getElementsByTagName('w:tc');
                    const cellValues = [];
                    for (let c = 0; c < cells.length; c++) {
                        const pNodes = cells[c].getElementsByTagName('w:p');
                        const cellP = [];
                        for (let p = 0; p < pNodes.length; p++) {
                            const t = extractParagraphText(pNodes[p]);
                            if (t) cellP.push(t);
                        }
                        cellValues.push(cellP.join(' ').replace(/\|/g, '/'));
                    }
                    if (cellValues.some(Boolean)) {
                        tableLines.push(`| ${cellValues.join(' | ')} |`);
                        if (r === 0) {
                            tableLines.push(`| ${cellValues.map(() => '---').join(' | ')} |`);
                        }
                    }
                }
                if (tableLines.length > 0) {
                    lines.push('\n' + tableLines.join('\n') + '\n');
                }
            }
        }

        const fullText = lines.join('\n').trim();
        return {
            text: fullText || '(Documento Word sin texto extraíble)',
            charCount: fullText.length,
            lineCount: lines.length
        };
    } catch (err) {
        // Fallback para archivos .doc antiguos o texto plano
        try {
            const rawText = await file.text();
            const cleaned = rawText.replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, ' ').replace(/\s{3,}/g, ' ').trim();
            return {
                text: cleaned.slice(0, 25000) || `No se pudo extraer texto estructurado de ${file.name}`,
                charCount: cleaned.length,
                lineCount: cleaned.split('\n').length
            };
        } catch (_) {
            return {
                text: `Error al leer documento Word (${file.name}): ${err.message}`,
                charCount: 0,
                lineCount: 0
            };
        }
    }
}

/**
 * Extrae datos, hojas, métricas y filas de un archivo Excel (.xlsx, .xls) o CSV (.csv)
 */
export async function parseExcelFile(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        const sheetSummaries = [];
        let allExportableRows = [];

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            if (!jsonRows || jsonRows.length === 0) continue;

            if (allExportableRows.length === 0) {
                allExportableRows = jsonRows.slice(0, 500);
            }

            const columns = Object.keys(jsonRows[0] || {});
            const totalRows = jsonRows.length;

            // Calcular estadísticas rápidas de columnas numéricas
            const numericStats = [];
            columns.slice(0, 15).forEach((col) => {
                let sum = 0;
                let count = 0;
                jsonRows.forEach((r) => {
                    const val = r[col];
                    if (typeof val === 'number' && !isNaN(val)) {
                        sum += val;
                        count++;
                    } else if (typeof val === 'string' && val.trim() !== '') {
                        const parsed = Number(val.replace(/\./g, '').replace(',', '.'));
                        if (!isNaN(parsed) && /^[\d.,$-]+$/.test(val.trim())) {
                            sum += parsed;
                            count++;
                        }
                    }
                });
                if (count > totalRows * 0.3 && count > 1) {
                    numericStats.push(`${col}: Suma=${sum.toLocaleString('es-AR', { maximumFractionDigits: 2 })} (Prom=${(sum / count).toLocaleString('es-AR', { maximumFractionDigits: 2 })})`);
                }
            });

            // Construir tabla Markdown con las primeras 80 filas para que Beto tenga precisión nominal
            const sampleRows = jsonRows.slice(0, 80);
            const headerLine = `| ${columns.join(' | ')} |`;
            const sepLine = `| ${columns.map(() => '---').join(' | ')} |`;
            const bodyLines = sampleRows.map((row) => {
                const vals = columns.map((c) => {
                    const v = row[c];
                    if (v instanceof Date) return v.toISOString().slice(0, 10);
                    return String(v ?? '').replace(/\|/g, '/').replace(/[\r\n]+/g, ' ').slice(0, 80);
                });
                return `| ${vals.join(' | ')} |`;
            });

            sheetSummaries.push(
                `### Hoja "${sheetName}" (${totalRows} filas, ${columns.length} columnas)\n` +
                `- **Columnas**: ${columns.join(', ')}\n` +
                (numericStats.length > 0 ? `- **Totales/Promedios detectados**: ${numericStats.join(' | ')}\n` : '') +
                `\n${headerLine}\n${sepLine}\n${bodyLines.join('\n')}` +
                (totalRows > 80 ? `\n*(...mostrando primeras 80 de ${totalRows} filas totales)*` : '')
            );
        }

        const fullSummary = sheetSummaries.join('\n\n');
        return {
            text: fullSummary || '(Planilla Excel vacía)',
            sheetCount: workbook.SheetNames.length,
            sheetNames: workbook.SheetNames,
            rows: allExportableRows
        };
    } catch (err) {
        return {
            text: `Error al parsear archivo Excel/CSV (${file.name}): ${err.message}`,
            sheetCount: 0,
            sheetNames: [],
            rows: []
        };
    }
}

/**
 * Extrae el texto página por página de un archivo PDF (.pdf) usando pdfjs-dist con fallback nativo
 */
export async function parsePdfFile(file) {
    const arrayBuffer = await file.arrayBuffer();

    // 1. Intentar con pdfjs-dist
    try {
        const pdfjsLib = await import('pdfjs-dist');
        if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.4.168'}/pdf.worker.min.mjs`;
        }
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdfDoc = await loadingTask.promise;
        const numPages = pdfDoc.numPages;
        const pagesText = [];

        for (let pageNum = 1; pageNum <= Math.min(numPages, 40); pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageStr = textContent.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
            if (pageStr) {
                pagesText.push(`--- [Página ${pageNum} de ${numPages}] ---\n${pageStr}`);
            }
        }

        const joined = pagesText.join('\n\n').trim();
        if (joined.length > 20) {
            return {
                text: joined.slice(0, 32000),
                pageCount: numPages
            };
        }
    } catch (pdfErr) {
        console.warn('[Beto PDF Parser] Fallback extractor para PDF:', pdfErr?.message);
    }

    // 2. Fallback: Extractor de streams de texto PDF y/o función auditar-hc-pdf
    try {
        const bytes = new Uint8Array(arrayBuffer);
        const decoder = new TextDecoder('latin1');
        const raw = decoder.decode(bytes);

        // Extraer literales entre paréntesis en bloques BT..ET
        const extractedChunks = [];
        const tjRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g;
        let match;
        while ((match = tjRegex.exec(raw)) !== null) {
            const clean = match[1]
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, ' ')
                .replace(/\\\(/g, '(')
                .replace(/\\\)/g, ')')
                .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');
            if (clean.trim().length > 1) extractedChunks.push(clean.trim());
        }

        const fallbackText = extractedChunks.join(' ').replace(/\s+/g, ' ').trim();
        if (fallbackText.length > 40) {
            return {
                text: fallbackText.slice(0, 28000),
                pageCount: Math.max(1, (raw.match(/\/Type\s*\/Page\b/g) || []).length)
            };
        }
    } catch (_) {
        // Ignorar
    }

    return {
        text: `[Documento PDF adjunto: ${file.name} (${(file.size / 1024).toFixed(1)} KB). El PDF parece contener páginas escaneadas como imagen.]`,
        pageCount: 1
    };
}

/**
 * Transcribe un Blob o File de Audio usando:
 *  1) Deepgram Nova-2 REST API (si VITE_DEEPGRAM_API_KEY está disponible)
 *  2) Fallback: Supabase Storage ('gobernanza_audios') + Edge Function 'transcribe-audio' (OpenAI Whisper-1)
 */
export async function transcribeAudioBlob(audioBlobOrFile, customName = 'audio_beto.webm', instantSpeechText = '') {
    // Si ya obtuvimos transcripción en vivo por Web Speech API y es sustancial, combinar o retornar
    const cleanInstant = (instantSpeechText || '').trim();

    // 1. Intentar Deepgram Nova-2 directo (ultra rápido < 1.5s)
    const deepgramKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
    if (deepgramKey && audioBlobOrFile && audioBlobOrFile.size > 100) {
        try {
            const dgRes = await fetch('https://api.deepgram.com/v1/listen?language=es&smart_format=true&model=nova-2', {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${deepgramKey}`,
                    'Content-Type': audioBlobOrFile.type || 'audio/webm'
                },
                body: audioBlobOrFile
            });
            if (dgRes.ok) {
                const dgJson = await dgRes.json();
                const transcript = dgJson?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
                if (transcript) {
                    return transcript;
                }
            }
        } catch (dgErr) {
            console.warn('[Beto Audio] Deepgram fallback a Whisper:', dgErr?.message);
        }
    }

    // 2. Si tenemos texto de Web Speech API, usarlo como respuesta inmediata si el tamaño es pequeño
    if (cleanInstant.length > 3) {
        return cleanInstant;
    }

    // 3. Fallback a Supabase Storage + Edge Function transcribe-audio (OpenAI Whisper-1)
    try {
        const ext = (customName.split('.').pop() || 'webm').toLowerCase();
        const storagePath = `beto_voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: upErr } = await supabase.storage
            .from('gobernanza_audios')
            .upload(storagePath, audioBlobOrFile, {
                contentType: audioBlobOrFile.type || 'audio/webm'
            });

        if (!upErr) {
            const { data: pubData } = supabase.storage.from('gobernanza_audios').getPublicUrl(storagePath);
            if (pubData?.publicUrl) {
                const { data: fnData } = await supabase.functions.invoke('transcribe-audio', {
                    body: { audioUrl: pubData.publicUrl }
                });
                if (fnData?.transcription) {
                    return fnData.transcription.trim();
                }
            }
        }
    } catch (whisperErr) {
        console.warn('[Beto Audio] Error en transcribe-audio:', whisperErr?.message);
    }

    return cleanInstant || '';
}

/**
 * Procesador unificado para cualquier archivo adjuntado a Beto
 */
export async function parseAttachedFile(file) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const name = file.name || 'archivo';
    const ext = (name.split('.').pop() || '').toLowerCase();
    const mime = (file.type || '').toLowerCase();

    // 1. IMÁGENES
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) {
        const imgResult = await processImageFile(file);
        return {
            id,
            name,
            size: file.size,
            kind: 'image',
            badge: 'IMAGEN / VISIÓN IA',
            dataUrl: imgResult.dataUrl,
            previewUrl: imgResult.dataUrl,
            extractedText: `[Imagen adjunta por el usuario: "${name}" (${imgResult.width}x${imgResult.height}px). Analizala visualmente en detalle.]`
        };
    }

    // 2. AUDIOS
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'webm', 'aac', 'flac', 'opus'].includes(ext)) {
        const audioPreviewUrl = URL.createObjectURL(file);
        const transcript = await transcribeAudioBlob(file, name);
        return {
            id,
            name,
            size: file.size,
            kind: 'audio',
            badge: 'AUDIO TRANSCRIPTO',
            audioPreviewUrl,
            transcript: transcript || '(No se detectó voz clara en el archivo de audio)',
            extractedText: `🎙️ **AUDIO ADJUNTO ("${name}") — TRANSCRIPCIÓN OFICIAL**:\n"${transcript || 'Sin voz detectada'}"`
        };
    }

    // 3. EXCEL / CSV
    if (['xlsx', 'xls', 'csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) {
        const excelResult = await parseExcelFile(file);
        return {
            id,
            name,
            size: file.size,
            kind: 'excel',
            badge: `EXCEL (${excelResult.sheetCount} hoja${excelResult.sheetCount === 1 ? '' : 's'})`,
            rows: excelResult.rows,
            extractedText: `📊 **CONTENIDO DEL ARCHIVO EXCEL/CSV ADJUNTO ("${name}")**:\n${excelResult.text}`
        };
    }

    // 4. WORD (.DOCX / .DOC)
    if (['docx', 'doc'].includes(ext) || mime.includes('word')) {
        const wordResult = await parseDocxFile(file);
        return {
            id,
            name,
            size: file.size,
            kind: 'word',
            badge: 'WORD (.DOCX)',
            extractedText: `📝 **CONTENIDO DEL DOCUMENTO WORD ADJUNTO ("${name}")**:\n${wordResult.text}`
        };
    }

    // 5. PDF (.PDF)
    if (ext === 'pdf' || mime.includes('pdf')) {
        const pdfResult = await parsePdfFile(file);
        return {
            id,
            name,
            size: file.size,
            kind: 'pdf',
            badge: `PDF (${pdfResult.pageCount} pág.)`,
            extractedText: `📄 **CONTENIDO DEL DOCUMENTO PDF ADJUNTO ("${name}", ${pdfResult.pageCount} páginas)**:\n${pdfResult.text}`
        };
    }

    // 6. TEXTO PLANO / JSON / SQL / MD
    try {
        const txt = await file.text();
        return {
            id,
            name,
            size: file.size,
            kind: 'text',
            badge: ext.toUpperCase() || 'DOCUMENTO',
            extractedText: `📄 **CONTENIDO DEL ARCHIVO ADJUNTO ("${name}")**:\n${txt.slice(0, 25000)}`
        };
    } catch (_) {
        return {
            id,
            name,
            size: file.size,
            kind: 'unknown',
            badge: 'ARCHIVO',
            extractedText: `[Archivo adjunto: "${name}" (${(file.size / 1024).toFixed(1)} KB)]`
        };
    }
}

