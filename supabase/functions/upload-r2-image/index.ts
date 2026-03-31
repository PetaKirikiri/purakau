import { AwsClient } from 'npm:aws4fetch'

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const accessKeyId =
    Deno.env.get('CLOUDFLARE_S3_ACCESS_KEY_ID') ??
    Deno.env.get('R2_ACCESS_KEY_ID') ??
    Deno.env.get('AWS_ACCESS_KEY_ID')
  const secretAccessKey =
    Deno.env.get('CLOUDFLARE_S3_SECRET_ACCESS_KEY') ??
    Deno.env.get('R2_SECRET_ACCESS_KEY') ??
    Deno.env.get('AWS_SECRET_ACCESS_KEY')
  const bucket = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') ?? Deno.env.get('R2_BUCKET_NAME')
  const publicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') ?? Deno.env.get('R2_PUBLIC_URL')

  const missing = [
    !accountId && 'CLOUDFLARE_ACCOUNT_ID',
    !accessKeyId && 'CLOUDFLARE_S3_ACCESS_KEY_ID or R2_ACCESS_KEY_ID',
    !secretAccessKey && 'CLOUDFLARE_S3_SECRET_ACCESS_KEY or R2_SECRET_ACCESS_KEY',
    !bucket && 'CLOUDFLARE_R2_BUCKET_NAME',
    !publicUrl && 'CLOUDFLARE_R2_PUBLIC_URL',
  ].filter(Boolean)
  if (missing.length) {
    return new Response(
      JSON.stringify({ error: `Missing secrets: ${missing.join(', ')}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let file: File
  try {
    const formData = await req.formData()
    file = formData.get('file') as File
    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: 'No file in form field "file"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid multipart form data' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const ext = IMAGE_EXT.find((e) => file.name.toLowerCase().endsWith(e))
  if (!ext) {
    return new Response(
      JSON.stringify({ error: `Unsupported type. Use: ${IMAGE_EXT.join(', ')}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (file.size > MAX_SIZE) {
    return new Response(
      JSON.stringify({ error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const baseUrl = publicUrl.replace(/\/$/, '')
  const jurisdiction = Deno.env.get('CLOUDFLARE_R2_JURISDICTION') ?? ''
  const host =
    jurisdiction === 'eu'
      ? `${accountId}.eu.r2.cloudflarestorage.com`
      : jurisdiction === 'fedramp'
        ? `${accountId}.fedramp.r2.cloudflarestorage.com`
        : `${accountId}.r2.cloudflarestorage.com`

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  const key = `uploads/${Date.now()}-${safeName}`

  const putUrl = `https://${host}/${bucket}/${key}`

  try {
    const bytes = await file.arrayBuffer()
    const client = new AwsClient({
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      service: 's3',
      region: 'us-east-1',
    })

    const putReq = new Request(putUrl, {
      method: 'PUT',
      body: bytes,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    })

    const res = await client.fetch(putReq)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`R2 PUT failed ${res.status}: ${text.slice(0, 300)}`)
    }

    const url = `${baseUrl}/${key}`
    return new Response(JSON.stringify({ key, url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({
        error: message,
        hint:
          message.includes('Access Denied') || message.includes('Unauthorized')
            ? 'R2 API token needs "Object Read & Write" permission.'
            : undefined,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}
