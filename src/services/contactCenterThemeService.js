/**
 * contactCenterThemeService.js
 * Sistema de personalización visual y ergonomía para Contact Center (Sanatorio Argentino).
 * Permite cambiar entre temas predeterminados (Clínico, Gris Slate, Dark) y personalizar
 * imagen de fondo (con oscurecimiento regulable), colores de sidebars y burbujas.
 */

export const WALLPAPERS = [
    {
        id: 'nano_banana',
        name: 'Nano Banana (Cyberpunk / Tech)',
        url: '/wallpapers/nano_banana.jpg',
        thumbnail: '/wallpapers/nano_banana.jpg'
    },
    {
        id: 'cordillera_night',
        name: 'Noche en Cordillera (San Juan)',
        url: '/wallpapers/cordillera_night.jpg',
        thumbnail: '/wallpapers/cordillera_night.jpg'
    },
    {
        id: 'medical_tech',
        name: 'Pulso Médico (Tech Blue)',
        url: '/wallpapers/medical_tech.jpg',
        thumbnail: '/wallpapers/medical_tech.jpg'
    },
    {
        id: 'aurora_waves',
        name: 'Ondas Aurora (Descanso Visual)',
        url: '/wallpapers/aurora_waves.jpg',
        thumbnail: '/wallpapers/aurora_waves.jpg'
    },
    {
        id: 'dora_bot',
        name: 'Dora Bot Asistente (Sci-Fi)',
        url: '/wallpapers/dora_bot.jpg',
        thumbnail: '/wallpapers/dora_bot.jpg'
    },
    {
        id: 'none',
        name: 'Sin imagen (Liso / Trama sutil)',
        url: null,
        thumbnail: null
    }
];

export const THEME_PRESETS = {
    default: {
        id: 'default',
        name: 'Clínico Institucional (Por Defecto)',
        description: 'Fondo blanco clínico QOAG, acentos en Azul Sanatorio y tipografía limpia de máxima claridad.',
        isDark: false,
        leftSidebarBg: '#FFFFFF',
        leftSidebarText: '#0F172A',
        leftSidebarBorder: '#E2E8F0',
        leftSidebarHeaderBg: '#F8FAFC',
        chatHeaderBg: '#FFFFFF',
        chatHeaderBorder: '#E2E8F0',
        chatHeaderColor: '#0F172A',
        chatBgColor: '#F8FAFC',
        chatBgImage: null,
        chatOverlayOpacity: 0.70,
        chatInputBg: '#FFFFFF',
        chatInputBorder: '#CBD5E1',
        chatInputText: '#0F172A',
        rightSidebarBg: '#FFFFFF',
        rightSidebarText: '#0F172A',
        rightSidebarBorder: '#E2E8F0',
        rightSidebarCardBg: '#FFFFFF',
        rightSidebarCardBorder: '#E2E8F0',
        bubbleInBg: '#FFFFFF',
        bubbleInText: '#0F172A',
        bubbleOutBg: '#E0F2FE',
        bubbleOutText: '#0369A1',
        accentColor: '#0284C7'
    },
    slate: {
        id: 'slate',
        name: 'Midnight Slate (Grises Neutros)',
        description: 'Combinación balanceada de tonos grises y pizarra oscura. Descansa la vista en turnos largos sin llegar a ser negro.',
        isDark: true,
        leftSidebarBg: '#1E293B',
        leftSidebarText: '#F8FAFC',
        leftSidebarBorder: '#334155',
        leftSidebarHeaderBg: '#0F172A',
        chatHeaderBg: '#1E293B',
        chatHeaderBorder: '#334155',
        chatHeaderColor: '#F8FAFC',
        chatBgColor: '#0F172A',
        chatBgImage: '/wallpapers/nano_banana.jpg',
        chatOverlayOpacity: 0.70, // 70% de oscurecimiento pedido por el usuario
        chatInputBg: '#1E293B',
        chatInputBorder: '#475569',
        chatInputText: '#F8FAFC',
        rightSidebarBg: '#1E293B',
        rightSidebarText: '#F8FAFC',
        rightSidebarBorder: '#334155',
        rightSidebarCardBg: '#0F172A',
        rightSidebarCardBorder: '#334155',
        bubbleInBg: '#334155',
        bubbleInText: '#F8FAFC',
        bubbleOutBg: '#0369A1',
        bubbleOutText: '#FFFFFF',
        accentColor: '#38BDF8'
    },
    dark: {
        id: 'dark',
        name: 'Deep Obsidian (Modo Dark)',
        description: 'Modo oscuro profundo de alto contraste con acentos nocturnos. Ideal para guardias y entornos de baja luz.',
        isDark: true,
        leftSidebarBg: '#0B1120',
        leftSidebarText: '#F1F5F9',
        leftSidebarBorder: '#1E293B',
        leftSidebarHeaderBg: '#030712',
        chatHeaderBg: '#0B1120',
        chatHeaderBorder: '#1E293B',
        chatHeaderColor: '#F1F5F9',
        chatBgColor: '#030712',
        chatBgImage: '/wallpapers/nano_banana.jpg',
        chatOverlayOpacity: 0.75,
        chatInputBg: '#0B1120',
        chatInputBorder: '#334155',
        chatInputText: '#F1F5F9',
        rightSidebarBg: '#0B1120',
        rightSidebarText: '#F1F5F9',
        rightSidebarBorder: '#1E293B',
        rightSidebarCardBg: '#111827',
        rightSidebarCardBorder: '#1F2937',
        bubbleInBg: '#1E293B',
        bubbleInText: '#F1F5F9',
        bubbleOutBg: '#065F46',
        bubbleOutText: '#FFFFFF',
        accentColor: '#10B981'
    }
};

const THEME_STORAGE_KEY = 'admqui_contact_center_theme_config';

/**
 * Obtiene el tema almacenado localmente o el default
 */
export function getStoredTheme() {
    try {
        const raw = localStorage.getItem(THEME_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.id) {
                // Si es un preset conocido sin modificaciones, mergear con la definición actual
                const base = THEME_PRESETS[parsed.id] || THEME_PRESETS.default;
                return { ...base, ...parsed };
            }
        }
    } catch (e) {
        console.warn('Error leyendo tema de Contact Center:', e);
    }
    return { ...THEME_PRESETS.default };
}

/**
 * Guarda la configuración de tema elegida por la operadora
 */
export function saveStoredTheme(themeConfig) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themeConfig));
    } catch (e) {
        console.warn('Error guardando tema de Contact Center:', e);
    }
    return themeConfig;
}

/**
 * Restablece a los valores de fábrica
 */
export function resetStoredTheme() {
    try {
        localStorage.removeItem(THEME_STORAGE_KEY);
    } catch (e) {
        console.warn('Error reiniciando tema de Contact Center:', e);
    }
    return { ...THEME_PRESETS.default };
}
