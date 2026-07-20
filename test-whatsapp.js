async function test() {
  const response = await fetch("https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/send-whatsapp", {
    method: "POST",
    headers: {
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDIyNzQsImV4cCI6MjA4NTYxODI3NH0.-85OS1dohc9gh4U4qBhEBlqHi9Bq7l7H6JnzcUzrCIg",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ 
      action: "send_template", 
      lineId: "line_meta", 
      to: "5492645438114", 
      templateName: "2_confirmacin_de_reporte_recibido_felicitacin",
      languageCode: "es_AR",
      components: [
          {
              type: 'body',
              parameters: [
                  { type: 'text', text: 'Sector de prueba' },
                  { type: 'text', text: 'SA-2026-TEST' }
              ]
          }
      ]
    })
  });
  console.log("Status:", response.status);
  console.log("Body:", await response.text());
}
test();
