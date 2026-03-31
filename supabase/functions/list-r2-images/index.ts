import { AwsClient } from 'npm:aws4fetch'

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  const url = new URL(req.url)
  if (url.searchParams.get('ping') === '1') {
    return new Response(JSON.stringify({ ok: true }), {
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

  const baseUrl = publicUrl.replace(/\/$/, '')
  const jurisdiction = Deno.env.get('CLOUDFLARE_R2_JURISDICTION') ?? ''
  const host =
    jurisdiction === 'eu'
      ? `${accountId}.eu.r2.cloudflarestorage.com`
      : jurisdiction === 'fedramp'
        ? `${accountId}.fedramp.r2.cloudflarestorage.com`
        : `${accountId}.r2.cloudflarestorage.com`
  const r2Url = `https://${host}/${bucket}?list-type=2&max-keys=200`

  try {
    const client = new AwsClient({
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      service: 's3',
      region: 'us-east-1',
    })
    const res = await client.fetch(r2Url)
    const xml = await res.text()
    if (!res.ok) {
      throw new Error(`R2 returned ${res.status}: ${xml.slice(0, 500)}`)
    }
    const keys = parseListObjectsXml(xml)
    const images = keys
      .filter((k) => IMAGE_EXT.some((ext) => k.toLowerCase().endsWith(ext)))
      .map((key) => ({ key, url: `${baseUrl}/${key}` }))

    return new Response(JSON.stringify({ images }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error'
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    const cause = err instanceof Error && err.cause ? String(err.cause) : undefined
    return new Response(
      JSON.stringify({
        error: message,
        debug: {
          name,
          message,
          ...(stack && { stack: stack.split('\n').slice(0, 5).join('\n') }),
          ...(cause && { cause }),
          hint:
            message.includes('Access Denied') || message.includes('Unauthorized')
              ? 'R2 credentials may be wrong. Ensure the R2 API token has "Object Read" permission.'
              : message.includes('signature')
                ? 'Access Key ID and Secret Access Key may be swapped, or Secret was truncated. Create a new R2 token (R2 → Manage R2 API Tokens) and paste Access Key ID → CLOUDFLARE_S3_ACCESS_KEY_ID, Secret Access Key → CLOUDFLARE_S3_SECRET_ACCESS_KEY. See CREDENTIALS.md'
                : undefined,
        },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function parseListObjectsXml(xml: string): string[] {
  const keys: string[] = []
  const keyRe = /<Key>([^<]*)<\/Key>/g
  let m: RegExpExecArray | null
  while ((m = keyRe.exec(xml))) keys.push(m[1])
  return keys
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}
