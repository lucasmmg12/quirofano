/**
 * elevenlabsTts.mjs — Servicio servidor de síntesis de voz (Text-to-Speech) con ElevenLabs
 * Utiliza el SDK oficial @elevenlabs/elevenlabs-js y lee ELEVENLABS_API_KEY del entorno.
 */
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

// Catálogo curado de voces femeninas para Simón IA / Beto (Sanatorio Argentino)
export const ELEVENLABS_VOICES_CATALOG = [
    {
        id: 'XrExE9yKIg1WjnnlVkGX',
        name: 'Matilda (Femenina · Cálida y Profesional — Acento Argentino)',
        shortName: 'Matilda (Femenina Ejecutiva)',
        gender: 'female',
        accent: 'es-AR (Multilingüe)',
        description: 'Voz femenina clara, empática y profesional con entonación rioplatense.'
    },
    {
        id: 'EXAVITQu4vr4xnSDxMaL',
        name: 'Sarah (Femenina · Suave y Clínica)',
        shortName: 'Sarah (Femenina Suave)',
        gender: 'female',
        accent: 'es-AR (Multilingüe)',
        description: 'Voz femenina serena y reconfortante para lectura de reportes e indicaciones.'
    },
    {
        id: 'hpp4J3VqNfWAUOO0d1Us',
        name: 'Bella (Femenina · Dinámica y Clara)',
        shortName: 'Bella (Femenina Clara)',
        gender: 'female',
        accent: 'es-AR (Multilingüe)',
        description: 'Voz femenina brillante y ágil para respuestas rápidas.'
    },
    {
        id: 'FGY2WhTYpPnrIDTdsKH5',
        name: 'Laura (Femenina · Joven y Conversacional)',
        shortName: 'Laura (Femenina Joven)',
        gender: 'female',
        accent: 'es-AR (Multilingüe)',
        description: 'Voz femenina joven y expresiva.'
    },
    {
        id: 'TZvhlMgMw2P4gPSuD8v7',
        name: 'Agustina (Femenina · Buenos Aires Nativa — Plan Creator+)',
        shortName: 'Agustina (Bs. As. Nativa)',
        gender: 'female',
        accent: 'Argentina (Rioplatense)',
        description: 'Voz argentina nativa de biblioteca compartida (requiere agregarla en tu librería ElevenLabs).'
    }
];

export const DEFAULT_FEMALE_VOICE_ID = 'XrExE9yKIg1WjnnlVkGX'; // Matilda
export const DEFAULT_TTS_MODEL_ID = 'eleven_flash_v2_5';

let cachedClient = null;
let cachedKey = null;

export function getElevenLabsClient(explicitKey = null) {
    const apiKey = explicitKey || process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        throw new Error('ELEVENLABS_API_KEY no está configurada en el entorno (.env.local)');
    }
    if (!cachedClient || cachedKey !== apiKey) {
        cachedClient = new ElevenLabsClient({ apiKey });
        cachedKey = apiKey;
    }
    return cachedClient;
}

/**
 * Limpia el markdown, tablas y bloques técnicos de la respuesta de Simón IA
 * para que la locución hablada suene natural, fluida y concisa.
 */
export function prepareSpokenTextForSimon(rawText, maxChars = 900) {
    if (!rawText) return '';
    let text = String(rawText)
        // Quitar bloques de código o etiquetas de acción
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\[ACTION:[^\]]+\]/g, '')
        // Quitar filas de tablas markdown (| col | col |) para no deletrear barras
        .replace(/^\|.*\|$/gm, '')
        // Quitar separadores horizontales
        .replace(/^[═─=\-*_]{3,}$/gm, '')
        // Quitar links markdown dejando solo el texto visible
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Quitar negritas, cursivas y encabezados markdown
        .replace(/#{1,6}\s*/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        // Quitar emojis decorativos comunes para que no los lea literalmente
        .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        // Reemplazar siglas clínicas para pronunciación natural en español argentino
        .replace(/\bUCI\b/g, 'U C I')
        .replace(/\bDxI\b/gi, 'Diagnóstico por Imágenes')
        .replace(/\bHdD\b/g, 'Hospital de Día')
        .replace(/\bNHC\b/g, 'historia clínica')
        .replace(/\bOS\b/g, 'Obra Social')
        .replace(/\s+/g, ' ')
        .trim();

    if (text.length > maxChars) {
        const cut = text.slice(0, maxChars);
        const lastPeriod = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(': '), cut.lastIndexOf('! '));
        text = (lastPeriod > 200 ? cut.slice(0, lastPeriod + 1) : cut) + ' Podés ver el detalle completo en pantalla.';
    }
    return text;
}

/**
 * Convierte texto en un Buffer MP3 usando ElevenLabs SDK (@elevenlabs/elevenlabs-js).
 */
export async function synthesizeSimonSpeech({
    text,
    voiceId = DEFAULT_FEMALE_VOICE_ID,
    modelId = DEFAULT_TTS_MODEL_ID,
    apiKey = null
}) {
    const cleanText = prepareSpokenTextForSimon(text);
    if (!cleanText) {
        throw new Error('El texto a sintetizar está vacío');
    }

    const client = getElevenLabsClient(apiKey);
    const isV4 = modelId.startsWith('eleven_v4');

    const requestOptions = {
        text: cleanText,
        modelId,
        outputFormat: 'mp3_44100_128',
        voiceSettings: isV4
            ? { stability: 0.45, similarityBoost: 0.78 }
            : { stability: 0.45, similarityBoost: 0.78, style: 0.15, useSpeakerBoost: true }
    };

    if (!modelId.includes('multilingual_v2')) {
        requestOptions.languageCode = 'es';
    }

    const audioStream = await client.textToSpeech.convert(voiceId, requestOptions);

    const chunks = [];
    for await (const chunk of audioStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return {
        audioBuffer: Buffer.concat(chunks),
        spokenText: cleanText,
        voiceId,
        modelId,
        characterCount: cleanText.length
    };
}

