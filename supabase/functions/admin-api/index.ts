import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const client = createClient(supabaseUrl, anonKey)
    const { data: { user }, error: userError } = await client.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user) throw new Error('Unauthorized')

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: adminData } = await adminClient.from('recipes').select('data').eq('id', 'admins').single()
    const admins = adminData?.data || []
    if (!admins.includes(user.email)) throw new Error('Not an admin')

    const body = await req.json()
    const action = body.action

    if (action === 'list_users') {
      const { data: { users }, error } = await adminClient.auth.admin.listUsers()
      if (error) throw error
      return new Response(JSON.stringify({ users }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'delete_user') {
      const { error } = await adminClient.auth.admin.deleteUser(body.userId)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error('Unknown action')
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
