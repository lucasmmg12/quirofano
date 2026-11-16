/**
 * Catálogo centralizado de Módulos, Submódulos y Roles (Predeterminados y Personalizados)
 * Sistema ADM-QUI — Sanatorio Argentino
 */
import { supabase } from '../lib/supabase';

export const CUSTOM_ROLES_CONFIG_KEY = 'custom_roles_catalog';

/**
 * Árbol completo de módulos y submódulos del Sidebar.
 * Los IDs coinciden exactamente con las rutas y claves usadas en Sidebar.jsx y App.jsx.
 */
export const MODULE_TREE = [
    {
        id: 'gobernanza_group',
        label: 'Gobernanza de Datos',
        description: 'Tableros gerenciales, indicadores clínicos y análisis IA',
        color: '#6D28D9',
        items: [
            { id: 'gobernanza_indicadores', label: 'Dashboard e Indicadores' },
            { id: 'gobernanza', label: 'Audios / IA & Proyectos' },
        ],
    },
    {
        id: 'mensajeria_group',
        label: 'Mensajería WhatsApp',
        description: 'Chats directos y gestión de plantillas',
        color: '#059669',
        items: [
            { id: 'mensajeria', label: 'Chat WhatsApp' },
            { id: 'plantillas', label: 'Plantillas WhatsApp' },
        ],
    },
    {
        id: 'pedidos_group',
        label: 'Emisión de Pedidos',
        description: 'Pedidos médicos, recetario y nomenclador',
        color: '#1E40AF',
        items: [
            { id: 'pedidos', label: 'Nuevo Pedido' },
            { id: 'recetario', label: 'Recetario Electrónico (ReNaPDiS)' },
            { id: 'historial', label: 'Historial de Pedidos' },
            { id: 'nomenclador', label: 'Nomenclador' },
            { id: 'pedidos_marcela', label: 'Pedidos Marcela' },
        ],
    },
    {
        id: 'altas_group',
        label: 'Altas Administrativas',
        description: 'Entrega de fichas, control de altas, facturación y auditoría',
        color: '#0284C7',
        items: [
            { id: 'entrega_fichas', label: '1. Entrega de Fichas' },
            { id: 'altas', label: '2. Control de Altas' },
            { id: 'facturacion', label: '3. Facturación' },
            { id: 'txt_provincia', label: 'Txt Provincia' },
            { id: 'asignaciones', label: 'Asignaciones' },
            { id: 'auditoria_historias', label: 'Auditoría de Historias Clínicas' },
        ],
    },
    {
        id: 'general_group',
        label: 'Gestión General',
        description: 'Turnos, deudas, consultas de guardia y documentos',
        color: '#D97706',
        items: [
            { id: 'turnos', label: 'Cola de Turnos' },
            { id: 'deudas', label: 'Deudas' },
            { id: 'consultas', label: 'Consultas Guardia' },
            { id: 'documentos', label: 'Documentos' },
        ],
    },
    {
        id: 'cirugias_group',
        label: 'Control de Cirugías',
        description: 'Gestión quirúrgica, pacientes, métricas y anatomía patológica',
        color: '#DC2626',
        items: [
            { id: 'cirugias', label: 'Control de Cirugías' },
            { id: 'pacientes', label: 'Pacientes' },
            { id: 'metricas', label: 'Métricas Quirúrgicas' },
            { id: 'asociaciones_entrega', label: 'Entrega Asociaciones' },
            { id: 'laboratorios', label: 'Anatomía Patológica' },
        ],
    },
    {
        id: 'simon_group',
        label: 'Simon IA',
        description: 'Asistente documental, reglas operativas y analytics',
        color: '#4F46E5',
        items: [
            { id: 'beto', label: 'Chat & Documentos' },
            { id: 'beto_rules', label: 'Gestión de Reglas' },
            { id: 'beto_analytics', label: 'Simon Analytics' },
        ],
    },
    {
        id: 'contact_center_group',
        label: 'Contact Center',
        description: 'Consola omnicanal, turnos online, métricas e incentivos',
        color: '#0D9488',
        items: [
            { id: 'contact_center', label: 'Consola General' },
            { id: 'contact_center_chats', label: 'Chats' },
            { id: 'contact_center_nueva', label: '+ Nueva Conversación' },
            { id: 'contact_center_cancelaciones', label: 'Cancelaciones' },
            { id: 'turnos_online', label: 'Turnos Online' },
            { id: 'contact_center_metricas', label: 'Métricas Contact Center' },
            { id: 'contact_center_incentivos', label: 'Incentivos Contact Center' },
            { id: 'contact_center_config', label: 'Configuración Contact Center' },
            { id: 'contact_center_permisos', label: 'Permisos Contact Center' },
        ],
    },
    {
        id: 'admin_group',
        label: 'Administración y Sistema',
        description: 'Activos, seguridad de usuarios, manual y configuración',
        color: '#475569',
        items: [
            { id: 'activos', label: 'Gestión de Activos' },
            { id: 'usuarios_seguridad', label: 'Usuarios y Seguridad' },
            { id: 'manual', label: 'Manual del Sistema' },
            { id: 'config', label: 'Configuración' },
        ],
    },
];

export const ALL_SUBMODULE_IDS = MODULE_TREE.flatMap(g => g.items.map(i => i.id));

/**
 * Roles Predeterminados del sistema con su conjunto de módulos por defecto.
 */
export const PRESET_ROLES = [
    {
        value: 'admin',
        label: 'Administrador Total',
        description: 'Acceso irrestricto a todos los módulos, submódulos y configuración de seguridad.',
        color: '#1E40AF',
        bg: '#DBEAFE',
        defaultModules: ALL_SUBMODULE_IDS,
        isFullAccess: true,
    },
    {
        value: 'operador',
        label: 'Operador / Admisión / Quirófano',
        description: 'Operación diaria: Pedidos, Altas, Cirugías, Mensajería, Turnos, Deudas y Simon IA.',
        color: '#334155',
        bg: '#F1F5F9',
        defaultModules: [
            'mensajeria', 'plantillas',
            'pedidos', 'recetario', 'historial', 'nomenclador', 'pedidos_marcela',
            'entrega_fichas', 'altas', 'facturacion', 'txt_provincia', 'asignaciones', 'auditoria_historias',
            'turnos', 'deudas', 'consultas', 'documentos',
            'cirugias', 'pacientes', 'metricas', 'asociaciones_entrega', 'laboratorios',
            'beto', 'beto_rules', 'beto_analytics',
            'manual', 'config',
        ],
    },
    {
        value: 'contact_center',
        label: 'Agente Contact Center',
        description: 'Consola de Chats, Turnos Online, Cancelaciones, Métricas e Incentivos + Simon IA.',
        color: '#047857',
        bg: '#D1FAE5',
        defaultModules: [
            'contact_center', 'contact_center_chats', 'contact_center_nueva',
            'contact_center_cancelaciones', 'turnos_online', 'contact_center_metricas',
            'contact_center_incentivos', 'contact_center_config',
            'beto', 'beto_rules', 'beto_analytics',
        ],
    },
    {
        value: 'gobernanza',
        label: 'Gobernanza de Datos',
        description: 'Dashboard e Indicadores + Proyectos & Audios IA + Simon IA.',
        color: '#6D28D9',
        bg: '#EDE9FE',
        defaultModules: [
            'gobernanza_indicadores', 'gobernanza',
            'beto', 'beto_rules', 'beto_analytics',
        ],
    },
    {
        value: 'gobernanza_dashboard',
        label: 'Gobernanza (Solo Dashboard)',
        description: 'Acceso exclusivo al Dashboard e Indicadores de Gobernanza.',
        color: '#7C3AED',
        bg: '#F3E8FF',
        defaultModules: ['gobernanza_indicadores'],
    },
    {
        value: 'uci',
        label: 'Indicadores UCI',
        description: 'Acceso a Dashboard UCI + Simon IA.',
        color: '#0369A1',
        bg: '#E0F2FE',
        defaultModules: ['gobernanza_indicadores', 'beto', 'beto_rules', 'beto_analytics'],
    },
    {
        value: 'activos',
        label: 'Gestión de Activos',
        description: 'Acceso exclusivo al módulo de Gestión de Activos e Inventario.',
        color: '#B45309',
        bg: '#FEF3C7',
        defaultModules: ['activos'],
    },
    {
        value: 'laboratorio',
        label: 'Portal Externo Laboratorio',
        description: 'Acceso externo limitado al seguimiento de Anatomía Patológica.',
        color: '#64748B',
        bg: '#F8FAFC',
        defaultModules: ['laboratorios'],
    },
    {
        value: 'personalizado',
        label: 'Rol Personalizado (Módulos a medida)',
        description: 'Permite definir exactamente qué módulos y submódulos puede ver este usuario.',
        color: '#0F766E',
        bg: '#CCFBF1',
        defaultModules: ['manual', 'config'],
    },
];

export function getPresetRoleMeta(rol) {
    return PRESET_ROLES.find(r => r.value === rol) || PRESET_ROLES[1];
}

/**
 * Obtiene el catálogo de roles personalizados guardados en app_config.
 */
export async function fetchCustomRolesCatalog() {
    const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', CUSTOM_ROLES_CONFIG_KEY)
        .maybeSingle();

    if (error) {
        console.warn('[rolesCatalog] Error leyendo custom_roles_catalog:', error.message);
        return [];
    }
    if (!data?.value) return [];
    try {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Guarda la lista completa de roles personalizados en app_config.
 */
export async function saveCustomRolesCatalog(rolesList) {
    const clean = Array.isArray(rolesList) ? rolesList : [];
    const { error } = await supabase
        .from('app_config')
        .upsert(
            {
                key: CUSTOM_ROLES_CONFIG_KEY,
                value: clean,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'key' }
        );
    if (error) throw new Error(error.message);
    return clean;
}

/**
 * Lee los permisos (selected_modules) de todos los usuarios desde user_module_preferences.
 * Retorna un mapa { [user_id]: string[], ... } y { [usuario]: string[] }.
 */
export async function fetchAllUserModulePreferences() {
    const { data, error } = await supabase
        .from('user_module_preferences')
        .select('user_id, usuario, selected_modules, completed_onboarding');

    if (error) {
        console.warn('[rolesCatalog] Error leyendo user_module_preferences:', error.message);
        return { byUserId: {}, byUsuario: {} };
    }
    const byUserId = {};
    const byUsuario = {};
    (data || []).forEach(row => {
        if (Array.isArray(row.selected_modules)) {
            if (row.user_id) byUserId[row.user_id] = row.selected_modules;
            if (row.usuario) byUsuario[row.usuario.toLowerCase().trim()] = row.selected_modules;
        }
    });
    return { byUserId, byUsuario };
}

/**
 * Persiste los módulos y submódulos asignados a un usuario en user_module_preferences.
 */
export async function saveUserModulePermissions({ userId, usuario, modules }) {
    if (!userId && !usuario) return;
    const cleanModules = Array.from(new Set((modules || []).filter(Boolean)));
    const payload = {
        user_id: userId,
        usuario: (usuario || '').toLowerCase().trim(),
        selected_modules: cleanModules,
        completed_onboarding: true,
        updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
        .from('user_module_preferences')
        .upsert(payload, { onConflict: 'user_id' });

    if (error) throw new Error(`Error guardando permisos de módulos: ${error.message}`);
    return cleanModules;
}
