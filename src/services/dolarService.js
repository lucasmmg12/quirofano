/**
 * Servicio de Cotización en Tiempo Real de Dólar Oficial / Tarjeta
 * Fuente: DolarApi.com (API pública argentina sin autenticación)
 */

let cachedDolar = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // Caché en memoria por 10 minutos

export async function fetchDolarOficial(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedDolar && (now - lastFetchTime < CACHE_TTL_MS)) {
        return cachedDolar;
    }

    try {
        const res = await fetch('https://dolarapi.com/v1/dolares/oficial');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        const venta = Number(data?.venta) || Number(data?.compra) || 1540;
        const compra = Number(data?.compra) || venta;
        
        cachedDolar = {
            venta,
            compra,
            fechaActualizacion: data?.fechaActualizacion || new Date().toISOString(),
            nombre: data?.nombre || 'Oficial'
        };
        lastFetchTime = now;
        return cachedDolar;
    } catch (err) {
        console.warn('[dolarService] Error consultando DolarApi:', err);
        return cachedDolar || { venta: 1540, compra: 1490, nombre: 'Oficial' };
    }
}
