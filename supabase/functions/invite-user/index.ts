import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Missing Supabase config' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let body: { email?: string; displayName?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) {
    return new Response(
      JSON.stringify({ error: 'Email is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() || null : null
  const role = typeof body.role === 'string' && (body.role === 'admin' || body.role === 'user')
    ? body.role
    : 'user'

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      { data: { display_name: displayName } }
    )
    if (inviteError) {
      return new Response(
        JSON.stringify({
          error: inviteError.message,
          hint:
            inviteError.message.includes('already been registered') ||
            inviteError.message.includes('already exists')
              ? 'User already has an account. They can sign in on the Login page.'
              : undefined,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authUserId = inviteData?.user?.id ?? null
    const { data: appUser, error: insertError } = await admin
      .from('app_users')
      .insert({
        email,
        display_name: displayName,
        role,
        auth_user_id: authUserId,
      })
      .select('id, email, display_name, role, created_at')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: updated } = await admin
          .from('app_users')
          .update({ auth_user_id: authUserId, display_name: displayName, role })
          .eq('email', email)
          .select('id, email, display_name, role, created_at')
          .single()
        if (updated) {
          return new Response(
            JSON.stringify({
              message: 'Invite sent. User already in roster; auth link updated.',
              user: updated,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
      return new Response(
        JSON.stringify({
          error: insertError.message,
          hint: insertError.code === '23505' ? 'User already exists in app_users.' : undefined,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        message: 'Invite sent. User will receive an email to set their password.',
        user: appUser,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
