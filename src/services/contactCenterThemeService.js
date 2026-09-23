import { supabase } from '../lib/supabase';

export const WALLPAPER_BUCKET = 'contact-center-wallpapers';
const CUSTOM_WALLPAPERS_KEY = 'admqui_contact_center_custom_wallpapers';

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
        id: 'inferno_fury',
        name: 'Furia Roja (Magma / Llamas)',
        url: '/wallpapers/inferno_fury.jpg',
        thumbnail: '/wallpapers/inferno_fury.jpg'
    },
    {
        id: 'blooming_peace',
        name: 'Paz y Flores (Jardín Zen)',
        url: '/wallpapers/blooming_peace.jpg',
        thumbnail: '/wallpapers/blooming_peace.jpg'
    },
    {
        id: 'family_warmth',
        name: 'Familia & Calidez (Pastel)',
        url: '/wallpapers/family_warmth.jpg',
        thumbnail: '/wallpapers/family_warmth.jpg'
    },
    {
        id: 'none',
        name: 'Sin imagen (Liso / Trama sutil)',
        url: null,
        thumbnail: null
    }
];

/**
 * Obtiene los wallpapers subidos por los usuarios desde localStorage
 */
export function getCustomWallpapers() {
    try {
        const raw = localStorage.getItem(CUSTOM_WALLPAPERS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        console.warn('Error leyendo wallpapers personalizados:', e);
    }
    return [];
}

/**
 * Guarda un nuevo wallpaper en la lista local de personalizados
 */
export function saveCustomWallpaper(wallpaper) {
    try {
        const current = getCustomWallpapers();
        const filtered = current.filter(w => w.id !== wallpaper.id && w.url !== wallpaper.url);
        const updated = [wallpaper, ...filtered];
        localStorage.setItem(CUSTOM_WALLPAPERS_KEY, JSON.stringify(updated));
        return updated;
    } catch (e) {
        console.warn('Error guardando wallpaper personalizado:', e);
        return getCustomWallpapers();
    }
}

/**
 * Elimina un wallpaper personalizado
 */
export function deleteCustomWallpaper(wallpaperId) {
    try {
        const current = getCustomWallpapers();
        const toDelete = current.find(w => w.id === wallpaperId);
        const updated = current.filter(w => w.id !== wallpaperId);
        localStorage.setItem(CUSTOM_WALLPAPERS_KEY, JSON.stringify(updated));

        if (toDelete?.storagePath) {
            supabase.storage.from(WALLPAPER_BUCKET).remove([toDelete.storagePath]).catch((err) => {
                console.warn('No se pudo borrar del bucket:', err);
            });
        }
        return updated;
    } catch (e) {
        console.warn('Error eliminando wallpaper personalizado:', e);
        return getCustomWallpapers();
    }
}

/**
 * Sube una imagen al bucket de Supabase y retorna el objeto del wallpaper
 */
export async function uploadCustomWallpaper(file) {
    if (!file) throw new Error('No se proporcionó ningún archivo');

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
        throw new Error('Formato no soportado. Debe ser imagen JPG, PNG o WebP.');
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSize) {
        throw new Error('La imagen excede el límite de 10 MB.');
    }

    const ext = file.name?.split('.').pop() || 'jpg';
    const cleanFileName = (file.name || 'wallpaper')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 24);
    const storagePath = `user_${Date.now()}_${cleanFileName}.${ext}`;

    const { data, error } = await supabase.storage
        .from(WALLPAPER_BUCKET)
        .upload(storagePath, file, {
            contentType: file.type,
            upsert: false
        });

    if (error) {
        console.error('Error subiendo imagen a Supabase Storage:', error);
        throw new Error(`Error en subida: ${error.message || 'Fallo de almacenamiento'}`);
    }

    const { data: urlData } = supabase.storage
        .from(WALLPAPER_BUCKET)
        .getPublicUrl(data.path);

    const publicUrl = urlData.publicUrl;

    const newWallpaper = {
        id: `custom_${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, '').slice(0, 28) || 'Mi Fondo Personalizado',
        url: publicUrl,
        thumbnail: publicUrl,
        storagePath: data.path,
        isCustom: true,
        createdAt: new Date().toISOString()
    };

    saveCustomWallpaper(newWallpaper);
    return newWallpaper;
}


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
        cardBg: '#FFFFFF',
        cardHoverBg: '#F8FAFC',
        cardSelectedBg: '#EFF6FF',
        cardText: '#0F172A',
        cardSubtext: '#64748B',
        cardBorder: '#E2E8F0',
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
        rightSidebarCardBg: '#F8FAFC',
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
        cardBg: '#0F172A',
        cardHoverBg: '#1E293B',
        cardSelectedBg: '#1E3A5F',
        cardText: '#F8FAFC',
        cardSubtext: '#94A3B8',
        cardBorder: '#334155',
        chatHeaderBg: '#1E293B',
        chatHeaderBorder: '#334155',
        chatHeaderColor: '#F8FAFC',
        chatBgColor: '#0F172A',
        chatBgImage: '/wallpapers/nano_banana.jpg',
        chatOverlayOpacity: 0.70,
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
        cardBg: '#111827',
        cardHoverBg: '#1F2937',
        cardSelectedBg: '#064E3B',
        cardText: '#F1F5F9',
        cardSubtext: '#9CA3AF',
        cardBorder: '#1E293B',
        chatHeaderBg: '#0B1120',
        chatHeaderBorder: '#1E293B',
        chatHeaderColor: '#F1F5F9',
        chatBgColor: '#030712',
        chatBgImage: '/wallpapers/medical_tech.jpg',
        chatOverlayOpacity: 0.75,
        chatInputBg: '#0B1120',
        chatInputBorder: '#334155',
        chatInputText: '#F1F5F9',
        rightSidebarBg: '#0B1120',
        rightSidebarText: '#F1F5F9',
        rightSidebarBorder: '#1E293B',
        rightSidebarCardBg: '#111827',
        rightSidebarCardBorder: '#1E293B',
        bubbleInBg: '#1E293B',
        bubbleInText: '#F1F5F9',
        bubbleOutBg: '#065F46',
        bubbleOutText: '#FFFFFF',
        accentColor: '#10B981'
    },
    inferno_fury: {
        id: 'inferno_fury',
        name: 'Furia Roja (Rage & Agresividad)',
        description: 'Intensidad total en rojo carmesí, magma y tonos carbón ardiente. Destaca furia, energía y máximo impacto visual.',
        isDark: true,
        leftSidebarBg: '#180707',
        leftSidebarText: '#FEE2E2',
        leftSidebarBorder: '#7F1D1D',
        leftSidebarHeaderBg: '#2B0B0B',
        cardBg: '#260C0C',
        cardHoverBg: '#351010',
        cardSelectedBg: '#4A1212',
        cardText: '#FEE2E2',
        cardSubtext: '#FCA5A5',
        cardBorder: '#7F1D1D',
        chatHeaderBg: '#180707',
        chatHeaderBorder: '#7F1D1D',
        chatHeaderColor: '#FCA5A5',
        chatBgColor: '#0C0303',
        chatBgImage: '/wallpapers/inferno_fury.jpg',
        chatOverlayOpacity: 0.65,
        chatInputBg: '#1F0A0A',
        chatInputBorder: '#991B1B',
        chatInputText: '#FEE2E2',
        rightSidebarBg: '#180707',
        rightSidebarText: '#FEE2E2',
        rightSidebarBorder: '#7F1D1D',
        rightSidebarCardBg: '#260C0C',
        rightSidebarCardBorder: '#7F1D1D',
        bubbleInBg: '#3B0F0F',
        bubbleInText: '#FEE2E2',
        bubbleOutBg: '#B91C1C',
        bubbleOutText: '#FFFFFF',
        accentColor: '#EF4444'
    },
    blooming_peace: {
        id: 'blooming_peace',
        name: 'Paz y Flores (Zen Verde)',
        description: 'Atmósfera de serenidad, naturaleza y crecimiento con flores brotando. Tonos verde salvia, menta y calma orgánica.',
        isDark: false,
        leftSidebarBg: '#F0F7F4',
        leftSidebarText: '#14532D',
        leftSidebarBorder: '#BBF7D0',
        leftSidebarHeaderBg: '#DCFCE7',
        cardBg: '#E3EFE8',
        cardHoverBg: '#D7EAE0',
        cardSelectedBg: '#C6E5D4',
        cardText: '#14532D',
        cardSubtext: '#166534',
        cardBorder: '#BBF7D0',
        chatHeaderBg: '#F0F7F4',
        chatHeaderBorder: '#BBF7D0',
        chatHeaderColor: '#166534',
        chatBgColor: '#E8F5E9',
        chatBgImage: '/wallpapers/blooming_peace.jpg',
        chatOverlayOpacity: 0.50,
        chatInputBg: '#FFFFFF',
        chatInputBorder: '#86EFAC',
        chatInputText: '#14532D',
        rightSidebarBg: '#F0F7F4',
        rightSidebarText: '#14532D',
        rightSidebarBorder: '#BBF7D0',
        rightSidebarCardBg: '#E3EFE8',
        rightSidebarCardBorder: '#BBF7D0',
        bubbleInBg: '#FFFFFF',
        bubbleInText: '#14532D',
        bubbleOutBg: '#DCFCE7',
        bubbleOutText: '#15803D',
        accentColor: '#16A34A'
    },
    family_warmth: {
        id: 'family_warmth',
        name: 'Calidez Familiar (Pastel & Marrón Claro)',
        description: 'Ambiente acogedor con ilustración de familia. Tonos beige pastel, lino suave y marrón claro reconfortante.',
        isDark: false,
        leftSidebarBg: '#FAF7F2',
        leftSidebarText: '#451A03',
        leftSidebarBorder: '#E7DFD5',
        leftSidebarHeaderBg: '#F3ECE2',
        cardBg: '#F2EAE0',
        cardHoverBg: '#EAE0D3',
        cardSelectedBg: '#DFD1BF',
        cardText: '#451A03',
        cardSubtext: '#78350F',
        cardBorder: '#E5DACD',
        chatHeaderBg: '#FAF7F2',
        chatHeaderBorder: '#E7DFD5',
        chatHeaderColor: '#78350F',
        chatBgColor: '#F5EFE6',
        chatBgImage: '/wallpapers/family_warmth.jpg',
        chatOverlayOpacity: 0.40,
        chatInputBg: '#FFFFFF',
        chatInputBorder: '#D7C9B8',
        chatInputText: '#451A03',
        rightSidebarBg: '#FAF7F2',
        rightSidebarText: '#451A03',
        rightSidebarBorder: '#E7DFD5',
        rightSidebarCardBg: '#F2EAE0',
        rightSidebarCardBorder: '#E5DACD',
        bubbleInBg: '#FFFFFF',
        bubbleInText: '#451A03',
        bubbleOutBg: '#FEF3C7',
        bubbleOutText: '#92400E',
        accentColor: '#B45309'
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
                // Si es un preset oficial, refrescar con la última definición para heredar nuevos tokens de tarjetas y legibilidad
                if (parsed.id !== 'custom' && THEME_PRESETS[parsed.id]) {
                    return { ...THEME_PRESETS[parsed.id] };
                }
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
