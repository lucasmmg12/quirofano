import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, FlatList, Alert } from 'react-native';
import { Audio } from 'expo-av';
import { Mic, Square, ChevronRight } from 'lucide-react-native';
import { createClient } from '@supabase/supabase-js';

// NOTA: Configuración de base de datos pendiente de inyección.
const supabaseUrl = 'https://dummy.supabase.co';
const supabaseKey = 'dummy_key';
const supabase = createClient(supabaseUrl, supabaseKey);

const MOCK_PLANTILLAS = [
  { id: '1', nombre: 'Entrevista Seguridad Informática' },
  { id: '2', nombre: 'Entrevista RRHH (Onboarding)' },
  { id: '3', nombre: 'Auditoría Médica' }
];

export default function App() {
  const [recording, setRecording] = useState(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  
  const [plantillas, setPlantillas] = useState(MOCK_PLANTILLAS);
  const [selectedPlantilla, setSelectedPlantilla] = useState(null);

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  async function startRecording() {
    try {
      if (!permissionResponse || permissionResponse.status !== 'granted') {
        const response = await requestPermission();
        if (response.status !== 'granted') {
          Alert.alert("Permiso Denegado", "Se necesita acceso al micrófono para grabar la entrevista.");
          return;
        }
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert("Error", "No se pudo iniciar la grabación.");
    }
  }

  async function stopRecording() {
    setRecording(undefined);
    setIsRecording(false);
    
    if (recording) {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      const uri = recording.getURI();
      console.log('Recording stopped and stored at', uri);
      
      // Simular envío a la IA
      Alert.alert(
        "Entrevista Finalizada", 
        "El audio se procesaría con IA usando la plantilla: " + selectedPlantilla.nombre
      );
    }
    
    setSelectedPlantilla(null); 
    setDuration(0);
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!selectedPlantilla) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoText}>SANATORIO ARGENTINO</Text>
          </View>
          <Text style={styles.title}>Gobernanza de Datos</Text>
          <Text style={styles.subtitle}>Seleccione una plantilla</Text>
        </View>

        <FlatList 
          data={plantillas}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.templateCard} 
              onPress={() => setSelectedPlantilla(item)}
            >
              <Text style={styles.templateTitle}>{item.nombre}</Text>
              <View style={styles.startButton}>
                <Text style={styles.startText}>Comenzar</Text>
                <ChevronRight color="#fff" size={16} />
              </View>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{selectedPlantilla.nombre}</Text>
        <Text style={styles.subtitle}>Grabando Entrevista</Text>
      </View>

      <View style={styles.recordContainer}>
        <Text style={styles.timerText}>{formatTime(duration)}</Text>
        
        <View style={styles.waveformContainer}>
          <Text style={styles.waveformText}>[ Waveform UI Visualizer ]</Text>
        </View>

        <TouchableOpacity 
          style={[styles.recordButton, isRecording && styles.recordingActive]} 
          onPress={isRecording ? stopRecording : startRecording}
        >
          {isRecording ? <Square color="white" size={32} /> : <Mic color="white" size={32} />}
        </TouchableOpacity>
        
        <Text style={styles.statusText}>
          {isRecording ? 'Grabando (Fondo Activo)' : 'Toque para iniciar micrófono'}
        </Text>
      </View>
      
      {!isRecording && duration === 0 && (
        <TouchableOpacity style={{ padding: 24, alignItems: 'center' }} onPress={() => setSelectedPlantilla(null)}>
          <Text style={{ color: '#64748B' }}>Cancelar y volver</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { alignItems: 'center', padding: 24, paddingTop: 48, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  logoPlaceholder: { padding: 12, backgroundColor: '#0F172A', borderRadius: 8, marginBottom: 16 },
  logoText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#0F172A', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#64748B', marginTop: 4 },
  
  templateCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  templateTitle: { fontSize: 16, fontWeight: '500', color: '#1E293B', flex: 1, paddingRight: 12 },
  startButton: { backgroundColor: '#3B82F6', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  startText: { color: '#fff', fontWeight: 'bold', marginRight: 4 },

  recordContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  timerText: { fontSize: 64, fontWeight: '300', color: '#0F172A', marginBottom: 32, fontVariant: ['tabular-nums'] },
  waveformContainer: { width: '100%', height: 100, backgroundColor: '#E2E8F0', borderRadius: 12, marginBottom: 48, justifyContent: 'center', alignItems: 'center' },
  waveformText: { color: '#94A3B8' },
  recordButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  recordingActive: { backgroundColor: '#EF4444', shadowColor: '#EF4444' },
  statusText: { marginTop: 24, fontSize: 16, color: '#64748B' }
});
