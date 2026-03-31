# R2 credentials mapping

Cloudflare R2 → Supabase secrets. Use **R2** → **Manage R2 API Tokens** (not Profile → API Tokens).

| Cloudflare shows | Put value into Supabase secret |
|------------------|--------------------------------|
| **Access Key ID** | `CLOUDFLARE_S3_ACCESS_KEY_ID` (or `R2_ACCESS_KEY_ID`) |
| **Secret Access Key** | `CLOUDFLARE_S3_SECRET_ACCESS_KEY` (or `R2_SECRET_ACCESS_KEY`) |
| **Account ID** (from R2 overview) | `CLOUDFLARE_ACCOUNT_ID` |
| Bucket name | `CLOUDFLARE_R2_BUCKET_NAME` |
| Public URL (e.g. https://pub-xxx.r2.dev) | `CLOUDFLARE_R2_PUBLIC_URL` |
| (Optional) If bucket is in EU | `CLOUDFLARE_R2_JURISDICTION` = `eu` |
| (Optional) If bucket is FedRAMP | `CLOUDFLARE_R2_JURISDICTION` = `fedramp` |

**Important:** Access Key ID and Secret Access Key are different. Do not swap them.
- Access Key ID is shorter (e.g. 32 chars)
- Secret Access Key is longer (e.g. 64+ chars)

**If bucket is in EU:** Add secret `CLOUDFLARE_R2_JURISDICTION` with value `eu`
