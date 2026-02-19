/**
 * Servicio de datos — Conexión con Supabase
 * Gestión de pedidos médicos, pacientes y nomenclador
 */
import { supabase } from '../lib/supabase';

// =============================================
// NOMENCLADOR
// =============================================
export async function fetchNomenclador() {
    const { data, error } = await supabase
        .from('nomenclador')
        .select('*')
        .eq('is_active', true)
        .order('usage_count', { ascending: false });
    if (error) throw error;
    return data;
}

// =============================================
// PATIENTS
// =============================================
export async function searchPatients(query) {
    if (!query || query.length < 2) return [];
    const { data, error } = await supabase
        .from('patients')
        .select('*')
        .ilike('nombre', `%${query}%`)
        .order('updated_at', { ascending: false })
        .limit(10);
    if (error) throw error;
    return data;
}

export async function upsertPatient(patientData) {
    // Build query - avoid sending empty eq values (causes 406)
    let query = supabase
        .from('patients')
        .select('id')
        .eq('nombre', patientData.nombre);

    if (patientData.afiliado) {
        query = query.eq('afiliado', patientData.afiliado);
    }

    const { data: existing } = await query
        .limit(1)
        .maybeSingle();

    if (existing) {
        const { data, error } = await supabase
            .from('patients')
            .update({
                obra_social: patientData.obraSocial,
                diagnostico: patientData.diagnostico,
                tratamiento: patientData.tratamiento,
                medico: patientData.medico,
            })
            .eq('id', existing.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    const { data, error } = await supabase
        .from('patients')
        .insert({
            nombre: patientData.nombre,
            obra_social: patientData.obraSocial,
            afiliado: patientData.afiliado,
            diagnostico: patientData.diagnostico,
            tratamiento: patientData.tratamiento,
            medico: patientData.medico,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

// =============================================
// MEDICAL ORDERS
// =============================================
export async function createOrder(patientData, cartItems) {
    let patient = null;
    if (patientData.nombre) {
        try {
            patient = await upsertPatient(patientData);
        } catch (e) {
            console.warn('Could not upsert patient:', e);
        }
    }

    const { data: order, error: orderError } = await supabase
        .from('medical_orders')
        .insert({
            patient_id: patient?.id || null,
            nombre_paciente: patientData.nombre,
            obra_social: patientData.obraSocial,
            afiliado: patientData.afiliado,
            diagnostico: patientData.diagnostico,
            tratamiento: patientData.tratamiento,
            fecha: patientData.fecha,
            medico: patientData.medico,
        })
        .select()
        .single();
    if (orderError) throw orderError;

    const items = cartItems.map((item, idx) => ({
        order_id: order.id,
        code: item.code,
        name: item.name,
        display_name: item.displayName || item.name,
        category: item.category,
        quantity: item.quantity,
        fecha: item.date || patientData.fecha,
        custom_field: item.customField,
        custom_value: item.customValue,
        position: idx,
    }));

    const { error: itemsError } = await supabase
        .from('order_items')
        .insert(items);

    if (itemsError) {
        await supabase.from('medical_orders').delete().eq('id', order.id);
        throw itemsError;
    }
    return order;
}

export async function markOrderPrinted(orderId) {
    await supabase.from('medical_orders').update({
        status: 'printed',
        printed_at: new Date().toISOString(),
    }).eq('id', orderId);
}

export async function markOrderSent(orderId, phoneNumber) {
    await supabase.from('medical_orders').update({
        whatsapp_sent: true,
        whatsapp_number: phoneNumber,
        whatsapp_sent_at: new Date().toISOString(),
        status: 'sent',
    }).eq('id', orderId);
}

export async function fetchOrderHistory(limit = 50) {
    const { data, error } = await supabase
        .from('medical_orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data;
}
