#!/usr/bin/env node
/**
 * Test R2 credentials locally. Run: node scripts/test-r2-local.mjs
 * Uses .env (dotenv). If this works, credentials are correct; issue is Supabase.
 * If this fails, credentials are wrong.
 */
import 'dotenv/config'
import { AwsClient } from 'aws4fetch'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const accessKeyId =
  process.env.CLOUDFLARE_S3_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID
const secretAccessKey =
  process.env.CLOUDFLARE_S3_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY
const bucket =
  process.env.CLOUDFLARE_R2_BUCKET_NAME ??
  process.env.R2_BUCKET_NAME ??
  process.env.R2_BUCKET ??
  process.env.BUCKET_NAME

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error(
    'Missing env vars. Need: CLOUDFLARE_ACCOUNT_ID, (CLOUDFLARE_S3_ACCESS_KEY_ID or R2_ACCESS_KEY_ID),',
    '(CLOUDFLARE_S3_SECRET_ACCESS_KEY or R2_SECRET_ACCESS_KEY), CLOUDFLARE_R2_BUCKET_NAME'
  )
  console.error('Found:', {
    accountId: !!accountId,
    accessKeyId: !!accessKeyId,
    secretAccessKey: !!secretAccessKey,
    bucket: !!bucket,
  })
  process.exit(1)
}

const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}?list-type=2&max-keys=5`
const client = new AwsClient({
  accessKeyId: accessKeyId.trim(),
  secretAccessKey: secretAccessKey.trim(),
  service: 's3',
  region: 'us-east-1',
})

try {
  const res = await client.fetch(url)
  const text = await res.text()
  if (!res.ok) {
    console.error('R2 returned', res.status, text.slice(0, 500))
    process.exit(1)
  }
  console.log('OK. R2 list response (first 500 chars):', text.slice(0, 500))
} catch (e) {
  console.error('Error:', e.message)
  process.exit(1)
}
