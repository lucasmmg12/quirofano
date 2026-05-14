import { createClient } from '@supabase/supabase-js';

const s = createClient(
    'https://hakysnqiryimxbwdslwe.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM'
);

(async () => {
    // Step 1: Add is_meta column if not exists
    const { error: e1 } = await s.rpc('exec_sql', {
        query: "ALTER TABLE whatsapp_lines ADD COLUMN IF NOT EXISTS is_meta boolean DEFAULT false;"
    });
    if (e1) {
        console.log('Note: exec_sql not available, trying direct update...');
    } else {
        console.log('Column is_meta added/verified');
    }

    // Step 2: Update line_b to is_meta = true  
    const { data, error } = await s.from('whatsapp_lines')
        .update({ is_meta: true })
        .eq('id', 'line_b')
        .select('id, label, phone, is_meta, is_active');
    
    if (error) {
        console.error('Update error:', error);
    } else {
        console.log('Updated line_b:', JSON.stringify(data, null, 2));
    }

    // Step 3: Verify all lines
    const { data: all, error: e3 } = await s.from('whatsapp_lines')
        .select('id, label, phone, is_meta, is_active')
        .in('id', ['line_a', 'line_b', 'line_c', 'line_meta'])
        .order('id');
    
    if (e3) console.error('Verify error:', e3);
    else console.log('All lines:', JSON.stringify(all, null, 2));
})();
