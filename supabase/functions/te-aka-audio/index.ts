/**
 * Streams Te Aka pronunciation MP3 with CORS so the browser can play it via Audio().
 * Public (verify_jwt=false): HTMLAudioElement cannot send Authorization headers.
 */

const GCS_BASE = 'https://storage.googleapis.com/maori-dictionary-prod2-web-assets/public'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const url = new URL(req.url)
  const id = url.searchParams.get('id')?.trim()
  if (!id || !/^\d+$/.test(id)) {
    return new Response(JSON.stringify({ error: 'Missing or invalid id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const upstream = `${GCS_BASE}/${id}.mp3`
  try {
    const res = await fetch(upstream, {
      headers: { 'User-Agent': 'Purakau/1.0 (Te Aka audio proxy)' },
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Upstream ${res.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const buf = await res.arrayBuffer()
    return new Response(buf, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
