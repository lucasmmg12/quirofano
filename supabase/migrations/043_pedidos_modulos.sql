-- Create pedidos_modulos table
CREATE TABLE IF NOT EXISTS pedidos_modulos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nombre TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE pedidos_modulos ENABLE ROW LEVEL SECURITY;

-- Add policies
CREATE POLICY "Enable read access for all users" ON pedidos_modulos FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON pedidos_modulos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users only" ON pedidos_modulos FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for authenticated users only" ON pedidos_modulos FOR DELETE USING (auth.role() = 'authenticated');
