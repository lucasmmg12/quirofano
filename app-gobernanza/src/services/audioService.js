import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

/**
 * Obtiene las plantillas de auditoría y gobernanza desde Supabase
 */
export async function getPlantillas() {
  const { data, error } = await supabase
    .from('gobernanza_plantillas')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al obtener plantillas:', error);
    throw error;
  }
  return data || [];
}

/**
 * Obtiene el historial de entrevistas registradas
 */
export async function getHistorialEntrevistas() {
  const { data, error } = await supabase
    .from('gobernanza_entrevistas')
    .select('*, gobernanza_plantillas(nombre)')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error al obtener historial:', error);
    throw error;
  }
  return data || [];
}

/**
 * Sube el archivo de audio local a Supabase Storage e inicia el análisis de IA
 */
export async function uploadAudioAndAnalyze({
  fileUri,
  entrevistaId,
  plantillaId,
  titulo,
  duracionSegundos,
  onStatusUpdate
}) {
  try {
    if (onStatusUpdate) onStatusUpdate('Preparando audio...');

    // 1. Verificar existencia del archivo local
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      throw new Error('El archivo de grabación no existe en el almacenamiento local.');
    }

    if (onStatusUpdate) onStatusUpdate('Codificando para subida...');

    // 2. Leer archivo en Base64 y convertir a ArrayBuffer para Supabase Storage
    const base64Audio = await FileSystem.readAsStringAsync(fileUri, {
      encoding: 'base64',
    });
    const arrayBuffer = decode(base64Audio);

    const fileName = `${entrevistaId}_${Date.now()}.m4a`;

    if (onStatusUpdate) onStatusUpdate('Subiendo audio a la nube...');

    // 3. Subir archivo a Supabase Storage en gobernanza_audios
    const { error: uploadError } = await supabase.storage
      .from('gobernanza_audios')
      .upload(fileName, arrayBuffer, {
        contentType: 'audio/m4a',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Error al subir audio: ${uploadError.message}`);
    }

    if (onStatusUpdate) onStatusUpdate('Creando registro de entrevista...');

    // 4. Registrar o actualizar en la tabla gobernanza_entrevistas
    const { error: dbError } = await supabase
      .from('gobernanza_entrevistas')
      .upsert({
        id: entrevistaId,
        plantilla_id: plantillaId,
        titulo: titulo || 'Entrevista Sanatorio Argentino',
        audio_url: fileName,
        duracion_segundos: duracionSegundos || 0,
        estado: 'procesando',
      }, { onConflict: 'id' });

    if (dbError) {
      throw new Error(`Error en base de datos: ${dbError.message}`);
    }

    if (onStatusUpdate) onStatusUpdate('Invocando IA de transcripción y análisis...');

    // 5. Invocar Edge Function gobernanza-ai
    supabase.functions.invoke('gobernanza-ai', {
      body: {
        action: 'transcribe_and_analyze',
        payload: {
          entrevista_id: entrevistaId,
          plantilla_id: plantillaId,
          audio_path: fileName,
        },
      },
    }).catch(err => {
      console.warn('Invocación Edge Function continuará en segundo plano:', err);
    });

    return { success: true, fileName, entrevistaId };
  } catch (error) {
    console.error('Error en uploadAudioAndAnalyze:', error);
    throw error;
  }
}

/**
 * Realiza polling del estado de la entrevista hasta que se complete o falle
 */
export function monitorEntrevistaProgress(entrevistaId, onProgress, onComplete, onError) {
  let attempts = 0;
  const maxAttempts = 60; // 60 * 3s = 3 minutos max

  const intervalId = setInterval(async () => {
    attempts++;
    try {
      const { data, error } = await supabase
        .from('gobernanza_entrevistas')
        .select('*')
        .eq('id', entrevistaId)
        .single();

      if (error) {
        console.warn('Error al verificar estado:', error);
      } else if (data) {
        if (data.estado === 'completado') {
          clearInterval(intervalId);
          onComplete(data);
          return;
        } else if (data.estado === 'error') {
          clearInterval(intervalId);
          onError(new Error('El procesamiento por IA reportó un error en el servidor.'));
          return;
        } else {
          if (onProgress) {
            onProgress({
              attempts,
              estado: data.estado,
              transcripcionParcial: data.transcripcion || '',
            });
          }
        }
      }

      if (attempts >= maxAttempts) {
        clearInterval(intervalId);
        onError(new Error('El procesamiento tardó más de lo esperado. Puedes revisar el resultado más tarde en el historial.'));
      }
    } catch (e) {
      console.error('Excepción en polling:', e);
    }
  }, 3000);

  return () => clearInterval(intervalId);
}
