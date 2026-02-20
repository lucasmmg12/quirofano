/**
 * Config Service — Lee y escribe configuraciones desde app_config
 */
import { supabase } from '../lib/supabase';

/**
 * Obtiene todas las configuraciones
 */
export async function getAllConfig() {
    const { data, error } = await supabase
        .from('app_config')
        .select('*')
        .order('category', { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * Obtiene configuraciones por categoría
 */
export async function getConfigByCategory(category) {
    const { data, error } = await supabase
        .from('app_config')
        .select('*')
        .eq('category', category);

    if (error) throw error;
    return data || [];
}

/**
 * Obtiene un valor de configuración por key
 */
export async function getConfigValue(key) {
    const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', key)
        .single();

    if (error) return null;
    return data?.value || null;
}

/**
 * Actualiza un valor de configuración
 */
export async function updateConfig(key, value) {
    const { error } = await supabase
        .from('app_config')
        .update({
            value,
            updated_at: new Date().toISOString(),
            updated_by: 'admin',
        })
        .eq('key', key);

    if (error) throw error;
}

/**
 * Actualiza múltiples configs a la vez
 */
export async function updateMultipleConfigs(configs) {
    const promises = Object.entries(configs).map(([key, value]) =>
        updateConfig(key, value)
    );
    await Promise.all(promises);
}

/**
 * Prueba la conexión con BuilderBot usando las credenciales configuradas
 */
export async function testBuilderBotConnection() {
    const apiKey = await getConfigValue('builderbot_api_key');
    const projectId = await getConfigValue('builderbot_project_id');

    if (!apiKey || !projectId) {
        throw new Error('Faltan credenciales de BuilderBot');
    }

    // Intentar invocar send-whatsapp con un test (sin enviar realmente)
    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
            content: 'Test de conexión — no enviar',
            number: '0000000000',
            testOnly: true,
        },
    });

    if (error) throw error;
    return data;
}
