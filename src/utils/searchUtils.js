/**
 * Utilidades de búsqueda para el nomenclador de prácticas
 */

/**
 * Normaliza un string removiendo acentos y convirtiendo a minúsculas
 */
function normalize(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

/**
 * Filtra prácticas por texto (código o nombre) y categoría
 * @param {string} query - Texto de búsqueda
 * @param {Array} practices - Lista de prácticas
 * @param {string} categoryFilter - Filtro de categoría ('all' = sin filtro)
 * @returns {Array} Prácticas filtradas
 */
export function filterPractices(query, practices, categoryFilter = 'all') {
    let filtered = practices;

    // Filtrar por categoría
    if (categoryFilter !== 'all') {
        filtered = filtered.filter(p => p.category === categoryFilter);
    }

    // Filtrar por texto
    if (query && query.trim().length > 0) {
        const normalizedQuery = normalize(query);
        const tokens = normalizedQuery.split(/\s+/);

        filtered = filtered.filter(practice => {
            const normalizedName = normalize(practice.name);
            const normalizedCode = practice.code.toLowerCase();

            // Si buscan por código exacto
            if (normalizedCode.startsWith(normalizedQuery)) {
                return true;
            }

            // Buscar que todos los tokens estén presentes en el nombre
            return tokens.every(token =>
                normalizedName.includes(token) || normalizedCode.includes(token)
            );
        });
    }

    return filtered;
}

/**
 * Formatea una fecha a formato DD/MM/YYYY
 */
export function formatDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD
 */
export function getTodayISO() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}
