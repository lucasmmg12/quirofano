/**
 * ragClient.js — API Client para Simon IA (RAG Pipeline)
 * Conecta ADM-QUI con el backend de Simon en Render
 * 
 * Funciones: Chat, Conversations, Files, Folders, Rules, Analytics, Health
 */

const RAG_API_BASE = import.meta.env.VITE_RAG_API_URL || '/rag-api';

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
        const error = await response.json().catch(() => ({ detail: 'Error de conexión' }));
        throw new Error(error.detail || 'Error al enviar pregunta');
    }
    return response.json();
}

// ═══════════════════════════════════
// CONVERSATIONS
// ═══════════════════════════════════

export async function listRAGConversations() {
    const response = await fetch(`${RAG_API_BASE}/conversations`);
    if (!response.ok) throw new Error('Error al cargar conversaciones');
    return response.json();
}

export async function getRAGConversationMessages(conversationId) {
    const response = await fetch(`${RAG_API_BASE}/conversations/${conversationId}/messages`);
    if (!response.ok) throw new Error('Error al cargar mensajes');
    return response.json();
}

export async function deleteRAGConversation(conversationId) {
    const response = await fetch(`${RAG_API_BASE}/conversations/${conversationId}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Error al eliminar conversación');
    return response.json();
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
            const error = await response.json().catch(() => ({ detail: 'Error al subir archivo' }));
            throw new Error(error.detail || 'Error al subir documento');
        }
        return response.json();
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
    return response.json();
}

export async function downloadRAGFile(path) {
    const response = await fetch(`${RAG_API_BASE}/files/download?path=${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error('Error al descargar archivo');
    const data = await response.json();
    if (data.download_url) window.open(data.download_url, '_blank');
    return data;
}

export async function createRAGFolder(name, parent = '') {
    const params = new URLSearchParams({ name });
    if (parent) params.append('parent', parent);
    const response = await fetch(`${RAG_API_BASE}/folders?${params}`, { method: 'POST' });
    if (!response.ok) throw new Error('Error al crear carpeta');
    return response.json();
}

export async function deleteRAGFile(path) {
    const response = await fetch(`${RAG_API_BASE}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Error al eliminar archivo');
    return response.json();
}

export async function deleteRAGFolder(path) {
    const response = await fetch(`${RAG_API_BASE}/folders?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Error al eliminar carpeta');
    return response.json();
}

// ═══════════════════════════════════
// RULES
// ═══════════════════════════════════

export async function listRAGRules() {
    const response = await fetch(`${RAG_API_BASE}/rules`);
    if (!response.ok) throw new Error('Error al cargar reglas');
    return response.json();
}

export async function createRAGRule(text) {
    const response = await fetch(`${RAG_API_BASE}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Error al guardar regla');
    }
    return response.json();
}

export async function deleteRAGRule(ruleId) {
    const response = await fetch(`${RAG_API_BASE}/rules/${ruleId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Error al eliminar regla');
    return response.json();
}

// ═══════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════

export async function fetchRAGAnalytics(days = 30) {
    const response = await fetch(`${RAG_API_BASE}/analytics?days=${days}`);
    if (!response.ok) throw new Error('Error al cargar analytics');
    return response.json();
}

export async function fetchLearningStats() {
    try {
        const response = await fetch(`${RAG_API_BASE}/learning/stats`);
        if (!response.ok) return null;
        return response.json();
    } catch { return null; }
}

// ═══════════════════════════════════
// HEALTH & SUGGESTIONS
// ═══════════════════════════════════

export async function checkRAGHealth() {
    try {
        const response = await fetch(`${RAG_API_BASE}/health`);
        return response.ok;
    } catch { return false; }
}

export async function fetchSuggestions() {
    try {
        const response = await fetch(`${RAG_API_BASE}/suggestions`);
        if (!response.ok) return { categories: [], top_queries: [] };
        return await response.json();
    } catch { return { categories: [], top_queries: [] }; }
}
