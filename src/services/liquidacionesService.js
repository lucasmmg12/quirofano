/**
 * liquidacionesService.js
 * Servicio de almacenamiento y gestión del historial de liquidaciones médicas
 * Sanatorio Argentino SRL
 */

const STORAGE_KEY = 'admqui_liquidaciones_historial_v1';

/**
 * Obtiene el historial completo de liquidaciones generadas
 * @returns {Array} Lista de liquidaciones ordenadas por fecha descendente
 */
export function getHistorialLiquidaciones() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error('Error leyendo historial de liquidaciones:', e);
        return [];
    }
}

/**
 * Guarda una nueva liquidación en el historial
 * @param {Object} liquidacionData
 * @returns {Object} La liquidación guardada con ID
 */
export function saveLiquidacionEnHistorial(liquidacionData) {
    try {
        const historial = getHistorialLiquidaciones();
        
        const newEntry = {
            id: 'liq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            tipo: liquidacionData.tipo || 'guardia', // 'guardia' | 'instrumentadores'
            fechaGeneracion: new Date().toISOString(),
            periodo: liquidacionData.periodo || 'Mayo 2026',
            numeroLiquidacion: liquidacionData.numeroLiquidacion || '410',
            usuario: liquidacionData.usuario || 'Administración',
            totalPrestadores: liquidacionData.totalPrestadores || 0,
            totalAtenciones: liquidacionData.totalAtenciones || liquidacionData.totalProcedimientosGlobal || 0,
            totalMonto: liquidacionData.totalFacturadoGlobal || 0,
            totalAdicionales: liquidacionData.totalAdicionalesGlobal || 0,
            granTotal: liquidacionData.granTotalGlobal || liquidacionData.totalFacturadoGlobal || 0,
            valorAdicional: liquidacionData.valorAdicional || 8000,
            obrasSocialesAdicional: liquidacionData.obrasSocialesAdicional || ['001 - PROVINCIA', '004 - DAMSU'],
            dataSnapshot: liquidacionData
        };

        // Evitar duplicados exactos en el mismo minuto y período
        const sinDuplicados = historial.filter(h => 
            !(h.tipo === newEntry.tipo && h.periodo === newEntry.periodo && h.numeroLiquidacion === newEntry.numeroLiquidacion && Math.abs(new Date(h.fechaGeneracion).getTime() - Date.now()) < 5000)
        );

        // Guardar hasta las últimas 30 liquidaciones
        const actualizado = [newEntry, ...sinDuplicados].slice(0, 30);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(actualizado));
        return newEntry;
    } catch (e) {
        console.error('Error guardando en historial de liquidaciones:', e);
        return null;
    }
}

/**
 * Elimina una liquidación del historial por ID
 * @param {string} id
 */
export function deleteLiquidacionDelHistorial(id) {
    try {
        const historial = getHistorialLiquidaciones();
        const filtrado = historial.filter(h => h.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtrado));
        return true;
    } catch (e) {
        console.error('Error eliminando liquidación:', e);
        return false;
    }
}

/**
 * Limpia todo el historial
 */
export function clearHistorialLiquidaciones() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        return true;
    } catch (e) {
        return false;
    }
}
