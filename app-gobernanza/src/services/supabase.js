import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SUPABASE_URL = 'https://hakysnqiryimxbwdslwe.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDIyNzQsImV4cCI6MjA4NTYxODI3NH0.-85OS1dohc9gh4U4qBhEBlqHi9Bq7l7H6JnzcUzrCIg';

const getAsyncStorage = () => {
  const mod = AsyncStorage;
  if (mod && typeof mod.getItem === 'function') return mod;
  if (mod?.default && typeof mod.default.getItem === 'function') return mod.default;
  return null;
};

const storageAdapter = {
  getItem: async (key) => {
    try {
      const storage = getAsyncStorage();
      return storage ? await storage.getItem(key) : null;
    } catch (e) {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      const storage = getAsyncStorage();
      if (storage) await storage.setItem(key, value);
    } catch (e) {}
  },
  removeItem: async (key) => {
    try {
      const storage = getAsyncStorage();
      if (storage) await storage.removeItem(key);
    } catch (e) {}
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
