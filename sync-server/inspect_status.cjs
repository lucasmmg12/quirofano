const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: "sync-server/.env" });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data, error } = await supabase
        .from("contact_center_conversations")
        .select("phone, nombre_completo, status, closed_at, resolution_reason, bot_active, bot_stage, assigned_agent_name, last_message_text, updated_at")
        .order("updated_at", { ascending: false })
        .limit(15);
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}
check();
