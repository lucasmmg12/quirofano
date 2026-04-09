/**
 * ragClient.js — API Client para Simon IA (RAG Pipeline)
 * Conecta ADM-QUI con el backend de Simon en Render
 * 
 * Funciones: Chat, Conversations, Files, Folders, Rules, Analytics, Health
 */

const RAG_API_BASE = import.meta.env.VITE_RAG_API_URL || '/rag-api';

/**
 * Safe JSON parser — protects against Render returning HTML error pages
 * instead of JSON (common during cold starts / deploy failures).
 */
async function safeJson(response) {
    const text = await response.text();
    if (text.trim().startsWith('<')) {
        throw new Error('El servidor devolvió HTML en vez de JSON. Probablemente está reiniciándose.');
    }
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('Respuesta inválida del servidor');
    }
}

// ═══════════════════════════════════
// CHAT
// ═══════════════════════════════════

export async function sendRAGMessage(question, conversationId = null) {
    const response = await fetch(`${RAG_API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversation_id: conversationId }),
    });
    if (!response.ok) {
        const error = await safeJson(response).catch(() => ({ detail: 'Error de conexión' }));
        throw new Error(error.detail || 'Error al enviar pregunta');
    }
    return safeJson(response);
}

// ═══════════════════════════════════
// CONVERSATIONS
// ═══════════════════════════════════

export async function listRAGConversations() {
    const response = await fetch(`${RAG_API_BASE}/conversations`);
    if (!response.ok) throw new Error('Error al cargar conversaciones');
    return safeJson(response);
}

export async function getRAGConversationMessages(conversationId) {
    const response = await fetch(`${RAG_API_BASE}/conversations/${conversationId}/messages`);
    if (!response.ok) throw new Error('Error al cargar mensajes');
    return safeJson(response);
}

export async function deleteRAGConversation(conversationId) {
    const response = await fetch(`${RAG_API_BASE}/conversations/${conversationId}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Error al eliminar conversación');
    return safeJson(response);
}

// ═══════════════════════════════════
// FILE MANAGER
// ═══════════════════════════════════

export async function uploadRAGDocument(file, folder = '', tag = '', timeoutMs = 120000) {
    const formData = new FormData();
    formData.append('file', file);
    if (folder) formData.append('folder', folder);
    if (tag) formData.append('tag', tag);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${RAG_API_BASE}/upload`, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok) {
            const error = await safeJson(response).catch(() => ({ detail: 'Error al subir archivo' }));
            throw new Error(error.detail || 'Error al subir documento');
        }
        return safeJson(response);
    } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') {
            throw new Error(`Timeout: "${file.name}" tardó más de ${timeoutMs / 1000}s`);
        }
        throw e;
    }
}

export async function uploadRAGBatch(files, folder = '', tag = '', onProgress = null) {
    const results = [];
    let processed = 0, failed = 0, skipped = 0;
    let total_chunks = 0;
    const supportedExts = ['.pdf', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.md', '.json', '.xml', '.html', '.htm'];
    const TIMEOUT_MS = 120000;
    const MAX_RETRIES = 1;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = '.' + file.name.split('.').pop().toLowerCase();

        if (!supportedExts.includes(ext) || file.name.startsWith('~$') || file.name.startsWith('.')) {
            skipped++;
            results.push({ filename: file.name, status: 'skipped' });
            continue;
        }

        if (onProgress) onProgress({
            current: i + 1 - skipped, total: files.length - skipped,
            filename: file.name, processed, failed,
        });

        let success = false;
        let lastError = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (attempt > 0) {
                    if (onProgress) onProgress({
                        current: i + 1 - skipped, total: files.length - skipped,
                        filename: file.name, processed, failed, retrying: true,
                    });
                    await new Promise(r => setTimeout(r, 2000));
                }
                const result = await uploadRAGDocument(file, folder, tag, TIMEOUT_MS);
                processed++;
                total_chunks += (result.total_chunks || 0);
                results.push({ filename: file.name, status: 'ok', ...result });
                success = true;
                break;
            } catch (e) {
                lastError = e;
            }
        }

        if (!success) {
            failed++;
            results.push({ filename: file.name, status: 'error', error: lastError?.message });
        }
    }
    return { processed, failed, skipped, total_chunks, results };
}

export async function listRAGFiles(folder = '') {
    const params = folder ? `?folder=${encodeURIComponent(folder)}` : '';
    const response = await fetch(`${RAG_API_BASE}/files${params}`);
    if (!response.ok) throw new Error('Error al cargar archivos');
    return safeJson(response);
}

export async function downloadRAGFile(path) {
    const response = await fetch(`${RAG_API_BASE}/files/download?path=${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error('Error al descargar archivo');
    const data = await safeJson(response);
    if (data.download_url) window.open(data.download_url, '_blank');
    return data;
}

export async function createRAGFolder(name, parent = '') {
    const params = new URLSearchParams({ name });
    if (parent) params.append('parent', parent);
    const response = await fetch(`${RAG_API_BASE}/folders?${params}`, { method: 'POST' });
    if (!response.ok) throw new Error('Error al crear carpeta');
    return safeJson(response);
}

export async function deleteRAGFile(path) {
    const response = await fetch(`${RAG_API_BASE}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Error al eliminar archivo');
    return safeJson(response);
}

export async function deleteRAGFolder(path) {
    const response = await fetch(`${RAG_API_BASE}/folders?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Error al eliminar carpeta');
    return safeJson(response);
}

// ═══════════════════════════════════
// RULES
// ═══════════════════════════════════

export async function listRAGRules() {
    const response = await fetch(`${RAG_API_BASE}/rules`);
    if (!response.ok) throw new Error('Error al cargar reglas');
    return safeJson(response);
}

export async function createRAGRule(text) {
    const response = await fetch(`${RAG_API_BASE}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });
    if (!response.ok) {
        const err = await safeJson(response).catch(() => ({}));
        throw new Error(err.detail || 'Error al guardar regla');
    }
    return safeJson(response);
}

export async function deleteRAGRule(ruleId) {
    const response = await fetch(`${RAG_API_BASE}/rules/${ruleId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Error al eliminar regla');
    return safeJson(response);
}

// ═══════════════════════════════════
// FEEDBACK (Correct / Incorrect)
// ═══════════════════════════════════

export async function submitRAGFeedback(conversationId, messageIndex, isCorrect) {
    const response = await fetch(`${RAG_API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            conversation_id: conversationId,
            message_index: messageIndex,
            is_correct: isCorrect,
        }),
    });
    if (!response.ok) {
        const err = await safeJson(response).catch(() => ({}));
        throw new Error(err.detail || 'Error al enviar feedback');
    }
    return safeJson(response);
}

// ═══════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════

export async function fetchRAGAnalytics(days = 30) {
    const response = await fetch(`${RAG_API_BASE}/analytics?days=${days}`);
    if (!response.ok) throw new Error('Error al cargar analytics');
    return safeJson(response);
}

export async function fetchLearningStats() {
    try {
        const response = await fetch(`${RAG_API_BASE}/learning/stats`);
        if (!response.ok) return null;
        return safeJson(response);
    } catch { return null; }
}

// ═══════════════════════════════════
// HEALTH & SUGGESTIONS
// ═══════════════════════════════════

export async function checkRAGHealth() {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(`${RAG_API_BASE}/health`, { signal: controller.signal });
        clearTimeout(timer);
        return response.ok;
    } catch { return false; }
}

export async function fetchSuggestions() {
    try {
        const response = await fetch(`${RAG_API_BASE}/suggestions`);
        if (!response.ok) return { categories: [], top_queries: [] };
        return await safeJson(response);
    } catch { return { categories: [], top_queries: [] }; }
}
