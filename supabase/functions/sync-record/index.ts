import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

interface SyncRecordBody {
  workspaceId: string;
  idempotencyKey: string;
  operation: 'upsert' | 'delete';
  record: {
    id: string;
    sampleId: string;
    origin: string;
    isDemo: boolean;
    resultStatus: string;
    createdAt: string;
    result: Record<string, unknown>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBody(value: unknown): SyncRecordBody | null {
  if (!isRecord(value) || !isRecord(value.record)) return null;
  const record = value.record;
  if (
    typeof value.workspaceId !== 'string' ||
    typeof value.idempotencyKey !== 'string' ||
    (value.operation !== 'upsert' && value.operation !== 'delete') ||
    typeof record.id !== 'string' ||
    typeof record.sampleId !== 'string' ||
    typeof record.origin !== 'string' ||
    typeof record.isDemo !== 'boolean' ||
    typeof record.resultStatus !== 'string' ||
    typeof record.createdAt !== 'string' ||
    !isRecord(record.result)
  ) {
    return null;
  }
  return {
    workspaceId: value.workspaceId,
    idempotencyKey: value.idempotencyKey,
    operation: value.operation,
    record: {
      id: record.id,
      sampleId: record.sampleId,
      origin: record.origin,
      isDemo: record.isDemo,
      resultStatus: record.resultStatus,
      createdAt: record.createdAt,
      result: record.result,
    },
  };
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
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 2 * 1024 * 1024) {
    return jsonResponse({ error: 'payload-too-large' }, 413);
  }
  let body: SyncRecordBody | null = null;
  try {
    body = parseBody(JSON.parse(text) as unknown);
  } catch {
    return jsonResponse({ error: 'invalid-json' }, 400);
  }
  if (!body) {
    return jsonResponse({ error: 'invalid-payload' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });
  const { data: membership } = await admin
    .from('workspace_memberships')
    .select('role,status')
    .eq('workspace_id', body.workspaceId)
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) {
    return jsonResponse({ error: 'workspace-access-denied' }, 403);
  }

  const { data: previous } = await admin
    .from('sync_requests')
    .select('response')
    .eq('workspace_id', body.workspaceId)
    .eq('idempotency_key', body.idempotencyKey)
    .maybeSingle();
  if (previous?.response) {
    return jsonResponse(previous.response);
  }

  let operationError: { message: string } | null = null;
  if (body.operation === 'delete') {
    if (membership.role !== 'admin') {
      return jsonResponse({ error: 'admin-role-required' }, 403);
    }
    const response = await admin
      .from('detection_records')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('workspace_id', body.workspaceId)
      .eq('record_id', body.record.id);
    operationError = response.error;
  } else {
    const result = body.record.result;
    const response = await admin.from('detection_records').upsert(
      {
        workspace_id: body.workspaceId,
        record_id: body.record.id,
        owner_id: userData.user.id,
        sample_id: body.record.sampleId,
        origin: body.record.origin,
        is_demo: body.record.isDemo,
        result_status: body.record.resultStatus,
        algorithm_version:
          typeof result.algorithmVersion === 'string' ? result.algorithmVersion : null,
        protocol_version:
          typeof result.protocolVersion === 'string' ? result.protocolVersion : null,
        calibration_version:
          typeof result.calibrationVersion === 'string' ? result.calibrationVersion : null,
        payload: body.record,
        created_at: body.record.createdAt,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      { onConflict: 'workspace_id,record_id' },
    );
    operationError = response.error;
  }
  if (operationError) {
    return jsonResponse({ error: 'record-operation-failed' }, 500);
  }

  const responseBody = {
    ok: true,
    recordId: body.record.id,
    operation: body.operation,
    syncedAt: new Date().toISOString(),
  };
  const { error: requestError } = await admin.from('sync_requests').insert({
    workspace_id: body.workspaceId,
    idempotency_key: body.idempotencyKey,
    user_id: userData.user.id,
    operation: body.operation,
    record_id: body.record.id,
    response: responseBody,
  });
  if (requestError?.code !== '23505' && requestError) {
    return jsonResponse({ error: 'idempotency-write-failed' }, 500);
  }
  return jsonResponse(responseBody);
});
