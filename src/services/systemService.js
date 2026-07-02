import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

/**
 * Alertas de Sistema
 */
export const fetchActiveAlerts = async () => {
    const { data, error } = await supabase
        .from('system_alerts')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    if (error) throw new Error('Error al cargar alertas: ' + error.message);
    return data || [];
};

export const fetchAllAlerts = async () => {
    const { data, error } = await supabase
        .from('system_alerts')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw new Error('Error al cargar historial de alertas: ' + error.message);
    return data || [];
};

export const saveAlert = async (alertData) => {
    const { id, message, severity, service_affected, is_active, created_by } = alertData;
    const payload = {
        message, severity, service_affected, is_active,
        ...(created_by && { created_by })
    };

    if (id) {
        const { data, error } = await supabase
            .from('system_alerts')
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) throw new Error('Error al actualizar alerta: ' + error.message);
        return data;
    } else {
        const { data, error } = await supabase
            .from('system_alerts')
            .insert([payload])
            .select()
            .single();
        if (error) throw new Error('Error al crear alerta: ' + error.message);
        return data;
    }
};

export const deactivateAlert = async (id) => {
    const { error } = await supabase
        .from('system_alerts')
        .update({ is_active: false })
        .eq('id', id);
    if (error) throw new Error('Error al desactivar alerta: ' + error.message);
};


/**
 * Reportes de Usuarios (Outage Reports)
 */
export const submitOutageReport = async (description, reported_by, file = null) => {
    let image_url = null;

    if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${uuidv4()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('outages')
            .upload(filePath, file);

        if (uploadError) {
            throw new Error('Error al subir imagen: ' + uploadError.message);
        }

        const { data: { publicUrl } } = supabase.storage
            .from('outages')
            .getPublicUrl(filePath);

        image_url = publicUrl;
    }

    const { data, error } = await supabase
        .from('system_outage_reports')
        .insert([{
            description,
            reported_by,
            image_url,
            status: 'pending'
        }])
        .select()
        .single();

    if (error) throw new Error('Error al guardar reporte: ' + error.message);
    return data;
};

export const fetchOutageReports = async () => {
    const { data, error } = await supabase
        .from('system_outage_reports')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw new Error('Error al cargar reportes: ' + error.message);
    return data || [];
};

export const resolveOutageReport = async (id, status = 'resolved') => {
    const { error } = await supabase
        .from('system_outage_reports')
        .update({ status })
        .eq('id', id);
    if (error) throw new Error('Error al actualizar reporte: ' + error.message);
};
