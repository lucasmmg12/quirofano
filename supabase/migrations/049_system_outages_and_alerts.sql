-- =============================================
-- 049_system_outages_and_alerts.sql
-- =============================================

-- 1. Table for System Alerts (Banner)
CREATE TABLE IF NOT EXISTS system_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('warning', 'error', 'info')),
    service_affected TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT -- username of the admin who created it
);

ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_alerts_full_access" ON system_alerts
    FOR ALL USING (true) WITH CHECK (true);

-- Trigger updated_at para system_alerts
CREATE OR REPLACE FUNCTION update_system_alerts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_system_alerts_updated
    BEFORE UPDATE ON system_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_system_alerts_timestamp();


-- 2. Table for User Reports
CREATE TABLE IF NOT EXISTS system_outage_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    image_url TEXT,
    reported_by TEXT NOT NULL, -- username of the reporter
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE system_outage_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_outage_reports_full_access" ON system_outage_reports
    FOR ALL USING (true) WITH CHECK (true);


-- 3. Storage Bucket for Outage Images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('outages', 'outages', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for storage outages bucket
CREATE POLICY "Public Access outages" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'outages' );

CREATE POLICY "All can upload outages" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'outages' );
