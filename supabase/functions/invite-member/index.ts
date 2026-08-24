import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

interface InviteBody {
  workspaceId: string;
  email: string;
  role: 'admin' | 'member';
}

function parseBody(value: unknown): InviteBody | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const workspaceId = Reflect.get(value, 'workspaceId');
  const email = Reflect.get(value, 'email');
  const role = Reflect.get(value, 'role');
  if (
    typeof workspaceId !== 'string' ||
    typeof email !== 'string' ||
    !email.includes('@') ||
    (role !== 'admin' && role !== 'member')
  ) {
    return null;
  }
  return { workspaceId, email: email.trim().toLowerCase(), role };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method-not-allowed' }, 405);
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRole || !authorization) {
    return jsonResponse({ error: 'server-or-auth-configuration-missing' }, 401);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'invalid-authentication' }, 401);
  }
  let body: InviteBody | null = null;
  try {
    body = parseBody(await request.json());
  } catch {
    return jsonResponse({ error: 'invalid-json' }, 400);
  }
  if (!body) {
    return jsonResponse({ error: 'invalid-payload' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });
  const { data: requester } = await admin
    .from('workspace_memberships')
    .select('role,status')
    .eq('workspace_id', body.workspaceId)
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .eq('status', 'active')
    .maybeSingle();
  if (!requester) {
    return jsonResponse({ error: 'admin-role-required' }, 403);
  }

  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    body.email,
    {
      data: { invited_workspace_id: body.workspaceId },
    },
  );
  if (inviteError || !invite.user) {
    return jsonResponse({ error: 'invite-user-failed' }, 400);
  }
  const { error: membershipError } = await admin.from('workspace_memberships').upsert(
    {
      workspace_id: body.workspaceId,
      user_id: invite.user.id,
      role: body.role,
      status: 'invited',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,user_id' },
  );
  if (membershipError) {
    return jsonResponse({ error: 'membership-write-failed' }, 500);
  }
  return jsonResponse({
    ok: true,
    workspaceId: body.workspaceId,
    userId: invite.user.id,
    role: body.role,
    status: 'invited',
  });
});
