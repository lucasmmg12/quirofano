import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL, 
    process.env.VITE_SUPABASE_ANON_KEY
);

async function test() {
    console.time('messages');
    try {
        const { data: m, error: errM } = await supabase
            .from('whatsapp_messages')
            .select('id, phone, created_at')
            .eq('line_id', 'contact_center')
            .order('created_at', { ascending: false })
            .limit(5);
        console.timeEnd('messages');
        console.log('Messages ok:', m?.length, 'error:', errM?.message);
    } catch (e) {
        console.timeEnd('messages');
        console.error('Messages err:', e);
    }

    console.time('conversations');
    try {
        const { data: c, error: errC } = await supabase
            .from('contact_center_conversations')
            .select('id, phone, status')
            .limit(5);
        console.timeEnd('conversations');
        console.log('Conversations ok:', c?.length, 'error:', errC?.message);
    } catch (e) {
        console.timeEnd('conversations');
        console.error('Conversations err:', e);
    }
}

test();
