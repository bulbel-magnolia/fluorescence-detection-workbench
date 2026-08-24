CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_memberships (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.detection_records (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL CHECK (length(record_id) BETWEEN 1 AND 180),
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  sample_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL,
  result_status TEXT NOT NULL,
  algorithm_version TEXT,
  protocol_version TEXT,
  calibration_version TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, record_id)
);

CREATE INDEX IF NOT EXISTS idx_cloud_records_workspace_created
  ON public.detection_records(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sync_requests (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  record_id TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, idempotency_key)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_workspace_member(target_workspace UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_memberships
    WHERE workspace_id = target_workspace
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(target_workspace UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_memberships
    WHERE workspace_id = target_workspace
      AND user_id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_workspace_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(UUID) TO authenticated;

CREATE POLICY "profiles_read_self"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "workspaces_read_members"
  ON public.workspaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(id));
CREATE POLICY "workspaces_insert_owner"
  ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "workspaces_update_admin"
  ON public.workspaces FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(id))
  WITH CHECK (public.is_workspace_admin(id));

CREATE POLICY "memberships_read_members"
  ON public.workspace_memberships FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY "memberships_insert_admin"
  ON public.workspace_memberships FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "memberships_update_admin"
  ON public.workspace_memberships FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "memberships_delete_admin"
  ON public.workspace_memberships FOR DELETE TO authenticated
  USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "records_read_members"
  ON public.detection_records FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY "records_insert_members"
  ON public.detection_records FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND owner_id = auth.uid()
  );
CREATE POLICY "records_update_owner_or_admin"
  ON public.detection_records FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_admin(workspace_id))
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND (owner_id = auth.uid() OR public.is_workspace_admin(workspace_id))
  );
CREATE POLICY "records_delete_admin"
  ON public.detection_records FOR DELETE TO authenticated
  USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "sync_requests_read_own"
  ON public.sync_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_workspace_member(workspace_id));
CREATE POLICY "sync_requests_insert_own"
  ON public.sync_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id));

CREATE OR REPLACE FUNCTION public.create_workspace(workspace_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  INSERT INTO public.workspaces (name, created_by)
  VALUES (trim(workspace_name), auth.uid())
  RETURNING id INTO created_id;
  INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
  VALUES (created_id, auth.uid(), 'admin', 'active');
  RETURN created_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT) TO authenticated;
