import { useMemo, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const SECTOR_SLUGS = {
    'uci': 'UCI',
    'guardia': 'GUARDIA',
    'ggo': 'GUARDIA_GGO',
    'guardia_ggo': 'GUARDIA_GGO',
    'quirofano': 'QUIROFANO',
    'internacion': 'INTERNACION',
    'epidemiologia': 'EPIDEMIOLOGIA',
    'dxi': 'DXI',
    'compras_stock': 'COMPRAS_STOCK',
    'compras': 'COMPRAS_STOCK',
    'compras-stock': 'COMPRAS_STOCK'
};

export const SECTOR_TO_SLUG = {
    'UCI': 'uci',
    'GUARDIA': 'guardia',
    'GUARDIA_GGO': 'ggo',
    'QUIROFANO': 'quirofano',
    'INTERNACION': 'internacion',
    'EPIDEMIOLOGIA': 'epidemiologia',
    'DXI': 'dxi',
    'COMPRAS_STOCK': 'compras_stock'
};

const STORAGE_KEY = 'gobernanza_active_route';

export function parseGobernanzaPath(pathname) {
    if (!pathname) return { isGobernanza: false, sectorId: null, tabId: null, subTabId: null };
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'gobernanza_indicadores') {
        return { isGobernanza: false, sectorId: null, tabId: null, subTabId: null };
    }
    const secSlug = parts[1]?.toLowerCase();
    const sectorId = secSlug ? (SECTOR_SLUGS[secSlug] || null) : null;
    const tabId = parts[2] ? parts[2].toLowerCase() : null;
    const subTabId = parts[3] ? parts[3].toLowerCase() : null;

    return {
        isGobernanza: true,
        sectorId,
        tabId,
        subTabId
    };
}

export function buildGobernanzaUrl(sectorId, tabId, subTabId) {
    const slug = sectorId ? (SECTOR_TO_SLUG[sectorId] || sectorId.toLowerCase()) : 'uci';
    let url = `/gobernanza_indicadores/${slug}`;
    if (tabId) {
        url += `/${tabId.toLowerCase()}`;
        if (subTabId) {
            url += `/${subTabId.toLowerCase()}`;
        }
    }
    return url;
}

export function useGobernanzaNavigation(currentUser) {
    const location = useLocation();
    const navigate = useNavigate();

    const cleanUsernameLower = (currentUser?.usuario || '').toLowerCase().trim();
    const isUciOnly = cleanUsernameLower === 'naguilera' || currentUser?.rol === 'uci';
    const isGobernanzaDashboardOnly = ['pgarcia', 'pgarcia@sanatorioargentino.com.ar'].includes(cleanUsernameLower) || currentUser?.rol === 'gobernanza_dashboard';

    const defaultSector = isUciOnly ? 'UCI' : isGobernanzaDashboardOnly ? 'GUARDIA' : 'UCI';

    // Parse current URL
    const route = useMemo(() => {
        const parsed = parseGobernanzaPath(location.pathname);
        if (!parsed.isGobernanza) {
            return {
                sectorId: defaultSector,
                tabId: null,
                subTabId: null,
                hasExplicitSector: false
            };
        }

        // Si el usuario está restringido a UCI y la URL apunta a otro sector, forzar UCI
        if (isUciOnly && parsed.sectorId && parsed.sectorId !== 'UCI') {
            return {
                sectorId: 'UCI',
                tabId: parsed.tabId,
                subTabId: parsed.subTabId,
                hasExplicitSector: true
            };
        }

        return {
            sectorId: parsed.sectorId || null,
            tabId: parsed.tabId,
            subTabId: parsed.subTabId,
            hasExplicitSector: Boolean(parsed.sectorId)
        };
    }, [location.pathname, defaultSector, isUciOnly]);

    // Función para navegar y sincronizar URL + localStorage
    const navigateToRoute = useCallback((newSector, newTab = null, newSubTab = null, { replace = false } = {}) => {
        let targetSector = newSector || defaultSector;
        if (isUciOnly) targetSector = 'UCI';

        const url = buildGobernanzaUrl(targetSector, newTab, newSubTab);
        
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                sectorId: targetSector,
                tabId: newTab,
                subTabId: newSubTab
            }));
        } catch (_) {}

        if (location.pathname !== url) {
            navigate(url, { replace });
        }
    }, [defaultSector, isUciOnly, location.pathname, navigate]);

    // Al montar o cuando se navega a `/gobernanza_indicadores` a secas, redirigir a la última ruta o por defecto
    useEffect(() => {
        const parts = location.pathname.split('/').filter(Boolean);
        if (parts.length === 1 && parts[0] === 'gobernanza_indicadores') {
            // Intentar recuperar de localStorage
            try {
                const savedStr = localStorage.getItem(STORAGE_KEY);
                if (savedStr) {
                    const saved = JSON.parse(savedStr);
                    if (saved?.sectorId && (!isUciOnly || saved.sectorId === 'UCI')) {
                        const targetUrl = buildGobernanzaUrl(saved.sectorId, saved.tabId, saved.subTabId);
                        navigate(targetUrl, { replace: true });
                        return;
                    }
                }
            } catch (_) {}

            // Fallback por defecto según rol
            const defaultTab = defaultSector === 'GUARDIA' ? 'internado' : defaultSector === 'UCI' ? 'censo' : null;
            const defaultSubTab = defaultSector === 'GUARDIA' ? 'admisiones_paola' : null;
            const fallbackUrl = buildGobernanzaUrl(defaultSector, defaultTab, defaultSubTab);
            navigate(fallbackUrl, { replace: true });
        }
    }, [location.pathname, defaultSector, isUciOnly, navigate]);

    return {
        sectorId: route.sectorId || defaultSector,
        tabId: route.tabId,
        subTabId: route.subTabId,
        hasExplicitSector: route.hasExplicitSector,
        navigateToRoute
    };
}
