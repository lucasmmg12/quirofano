/**
 * Hub Session Tracker — ADM-QUI (Quirófano)
 * Usa RPC hub_log_external_event porque ADM-QUI no usa Supabase Auth
 */
const ADMQUI_SISTEMA_ID = '4e16cb5f-68b1-410d-871c-6cc17489bf00'

async function getPublicIP() {
  try {
    const res = await fetch('https://api.ipify.org?format=json')
    return (await res.json()).ip || null
  } catch { return null }
}

function getGeo() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    )
  })
}

export async function trackLogin(supabase, userIdentifier) {
  try {
    const [ip, geo] = await Promise.all([getPublicIP(), getGeo()])
    await supabase.rpc('hub_log_external_event', {
      p_user_identifier: userIdentifier,
      p_evento: 'login',
      p_sistema_id: ADMQUI_SISTEMA_ID,
      p_ip: ip,
      p_user_agent: navigator.userAgent,
      p_latitud: geo?.lat || null,
      p_longitud: geo?.lng || null,
      p_metadata: { source: 'adm-qui' },
    })
  } catch (e) { console.warn('[HubTracker]', e) }
}

export async function trackLogout(supabase, userIdentifier) {
  try {
    await supabase.rpc('hub_log_external_event', {
      p_user_identifier: userIdentifier,
      p_evento: 'logout',
      p_sistema_id: ADMQUI_SISTEMA_ID,
      p_ip: null,
      p_user_agent: navigator.userAgent,
      p_latitud: null,
      p_longitud: null,
      p_metadata: { source: 'adm-qui' },
    })
  } catch (e) { console.warn('[HubTracker]', e) }
}
