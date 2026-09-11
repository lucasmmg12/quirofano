/**
 * Parser inteligente de observaciones de Presupuestos (Salus / Sanatorio Argentino)
 * 
 * Desglosa el texto de contratos y coseguros en secciones
 * clínico-administrativas: Prestación, Cobertura, ID de Autorización, Primeros Renglones,
 * Inclusiones, Exclusiones, Requisitos de Internación, Formas de Pago, Vigencia y Contacto.
 */

export function parseBudgetObservaciones(raw) {
    if (!raw || typeof raw !== 'string') return null;

    const clean = raw.replace(/\r\n/g, '\n').trim();
    if (!clean) return null;

    // Patrones de inicio de sección
    const sectionDefs = [
        { key: 'prestacion', regex: /PRESTACI[OÓ]N(?:\s+PRESUPUESTADA)?\s*:/i },
        { key: 'cobertura', regex: /COBERTURA\s*:/i },
        { key: 'idRef', regex: /ID\s*[:\-#]?/i },
        { key: 'incluye', regex: /INCLUYE\s*:/i },
        { key: 'exclusiones', regex: /EXCLUSIONES\s*:/i },
        { key: 'requisitos', regex: /REQUISITOS(?:\s+DE\s+INTERNACI[OÓ]N)?\s*:/i },
        { key: 'formasPago', regex: /FORMAS?(?:\s+DE)?\s+PAGO\s*:/i },
        { key: 'importante', regex: /IMPORTANTE\s*:/i },
    ];

    // Buscar posiciones en el texto
    const found = [];
    for (const def of sectionDefs) {
        const match = def.regex.exec(clean);
        if (match) {
            found.push({
                key: def.key,
                startIndex: match.index,
                contentStart: match.index + match[0].length,
            });
        }
    }

    // Si no tiene cabeceras estructuradas de Salus, es una observación simple
    if (found.length === 0) {
        return {
            isStructured: false,
            prestacion: null,
            cobertura: null,
            idRef: null,
            primerosRenglones: clean.slice(0, 250),
            incluye: [],
            exclusiones: [],
            requisitos: [],
            formasPago: [],
            importante: [],
            contacto: null,
            rawText: clean,
        };
    }

    // Ordenar por orden cronológico en el texto
    found.sort((a, b) => a.startIndex - b.startIndex);

    const sections = {};
    for (let i = 0; i < found.length; i++) {
        const curr = found[i];
        const end = (i + 1 < found.length) ? found[i + 1].startIndex : clean.length;
        let chunk = clean.substring(curr.contentStart, end).trim();
        chunk = chunk.replace(/^[•\-\*\s]+/, '').trim();
        sections[curr.key] = chunk;
    }

    // Extraer los primeros renglones (todo lo anterior a la primera lista: INCLUYE / EXCLUSIONES / REQUISITOS)
    const firstListHeader = found.find(f => ['incluye', 'exclusiones', 'requisitos'].includes(f.key));
    const primerosRenglones = firstListHeader 
        ? clean.substring(0, firstListHeader.startIndex).replace(/[\r\n]+/g, ' · ').trim() 
        : clean.slice(0, 250);

    // Extraer ID de Autorización
    let extractedId = sections.idRef || null;
    if (extractedId) {
        // Limpiar balas o signos sobrantes
        extractedId = extractedId.replace(/^[•\-\*\s]+/, '').replace(/[•\-\*\s]+$/, '').trim();
        if (extractedId === '•' || extractedId === '-' || extractedId.length === 0) {
            extractedId = null;
        }
    }
    // Fallback: búsqueda con regex de ID en los primeros renglones
    if (!extractedId) {
        const idRegexMatch = clean.match(/ID\s*[:\-#]\s*([a-zA-Z0-9\/\.\-_]+)/i);
        if (idRegexMatch && idRegexMatch[1] && idRegexMatch[1] !== '•' && idRegexMatch[1] !== '-') {
            extractedId = idRegexMatch[1].trim();
        }
    }

    // Helper para dividir bloques con viñetas
    const toList = (text) => {
        if (!text) return [];
        return text
            .split(/[•\n]+/)
            .map(s => s.replace(/^[\-\*\s]+/, '').trim())
            .filter(s => s.length > 0 && s !== '.');
    };

    // Parsear información de contacto en sección importante o en el texto
    let importanteText = sections.importante || '';
    let contactoInfo = null;

    const telMatch = importanteText.match(/TEL\s*[:\-]?\s*([0-9\s\-]+)/i);
    const wspMatch = importanteText.match(/WSP\s*[:\-]?\s*([0-9\s\-]+)/i);
    const emailMatch = importanteText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);

    if (telMatch || wspMatch || emailMatch) {
        contactoInfo = {
            tel: telMatch ? telMatch[1].replace(/[\s\-]+$/, '').trim() : null,
            wsp: wspMatch ? wspMatch[1].replace(/[\s\-]+$/, '').trim() : null,
            email: emailMatch ? emailMatch[1].trim() : null,
        };

        // Limpiar el texto de 'importante' para que solo quede la nota legal/vigencia
        importanteText = importanteText
            .replace(/TEL\s*[\d\s\-]+/gi, '')
            .replace(/WSP\s*[\d\s\-]+/gi, '')
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '')
            .replace(/[\-–—\s•]+$/, '')
            .trim();
    }

    // Limpiar cobertura si arrastra "ID:" al final
    let coberturaText = sections.cobertura || '';
    coberturaText = coberturaText.replace(/ID\s*[:\-#]?\s*[•\-\s]*$/i, '').trim();

    return {
        isStructured: true,
        prestacion: sections.prestacion || null,
        cobertura: coberturaText || null,
        idRef: extractedId,
        primerosRenglones,
        incluye: toList(sections.incluye),
        exclusiones: toList(sections.exclusiones),
        requisitos: toList(sections.requisitos),
        formasPago: toList(sections.formasPago),
        importante: toList(importanteText),
        contacto: contactoInfo,
        rawText: clean,
    };
}
