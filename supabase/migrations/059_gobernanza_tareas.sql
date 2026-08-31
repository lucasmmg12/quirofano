CREATE TABLE IF NOT EXISTS public.gobernanza_tareas (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    proyecto_id UUID REFERENCES public.gobernanza_proyectos(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    fecha_limite DATE,
    estado TEXT DEFAULT 'Pendiente', -- 'Pendiente' o 'Completada'
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.gobernanza_tareas ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view tasks
CREATE POLICY "Enable read access for all authenticated users" ON public.gobernanza_tareas
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert tasks
CREATE POLICY "Enable insert access for all authenticated users" ON public.gobernanza_tareas
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update tasks
CREATE POLICY "Enable update access for all authenticated users" ON public.gobernanza_tareas
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Allow authenticated users to delete tasks
CREATE POLICY "Enable delete access for all authenticated users" ON public.gobernanza_tareas
    FOR DELETE USING (auth.role() = 'authenticated');
