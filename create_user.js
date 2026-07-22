import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function setPassword() {
    console.log("Looking up user sfemenia@sanatorioargentino.com.ar...");
    
    // List users to find the ID
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
        console.error("Error listing users:", listError.message);
        process.exit(1);
    }
    
    const user = users.find(u => u.email === 'sfemenia@sanatorioargentino.com.ar');
    
    if (user) {
        console.log("User found, updating password...");
        const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
            password: '123456',
            email_confirm: true
        });
        
        if (error) {
            console.error("Error updating password:", error.message);
            process.exit(1);
        }
        console.log("Password updated successfully for", data.user.email);
        process.exit(0);
    } else {
        console.log("User not found in the list. Creating...");
        const { data, error } = await supabase.auth.admin.createUser({
            email: 'sfemenia@sanatorioargentino.com.ar',
            password: '123456',
            email_confirm: true
        });
        if (error) {
            console.error("Error creating:", error.message);
            process.exit(1);
        }
        console.log("User created successfully!");
        process.exit(0);
    }
}

setPassword();
