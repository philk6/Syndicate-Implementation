-- Migration: add_company_profile
-- Description: Creates tables for company goals, POs, and notes,
--              a private storage bucket for PO files, and RLS policies.

-- =============================================
-- Table: company_goals
-- =============================================
CREATE TABLE public.company_goals (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES public.company(company_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.company_goals ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD on all company_goals
CREATE POLICY "Admins have full access to company_goals"
ON public.company_goals
AS PERMISSIVE FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
);

-- Users: read-only on own company goals
CREATE POLICY "Users can read own company goals"
ON public.company_goals
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
    company_id = (
        SELECT u.company_id FROM users u WHERE u.user_id = auth.uid()
    )
);

CREATE INDEX company_goals_company_id_idx ON public.company_goals (company_id);


-- =============================================
-- Table: company_pos
-- =============================================
CREATE TABLE public.company_pos (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES public.company(company_id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES public.users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.company_pos ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD on all company_pos
CREATE POLICY "Admins have full access to company_pos"
ON public.company_pos
AS PERMISSIVE FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
);

-- Users: full CRUD on own company POs
CREATE POLICY "Users have full access to own company POs"
ON public.company_pos
AS PERMISSIVE FOR ALL
TO authenticated
USING (
    company_id = (
        SELECT u.company_id FROM users u WHERE u.user_id = auth.uid()
    )
)
WITH CHECK (
    company_id = (
        SELECT u.company_id FROM users u WHERE u.user_id = auth.uid()
    )
);

CREATE INDEX company_pos_company_id_idx ON public.company_pos (company_id);


-- =============================================
-- Table: company_notes
-- =============================================
CREATE TABLE public.company_notes (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES public.company(company_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES public.users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.company_notes ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD on all company_notes
CREATE POLICY "Admins have full access to company_notes"
ON public.company_notes
AS PERMISSIVE FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
);

-- Users: read-only on own company public notes
CREATE POLICY "Users can read own company public notes"
ON public.company_notes
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
    company_id = (
        SELECT u.company_id FROM users u WHERE u.user_id = auth.uid()
    )
    AND is_public = TRUE
);

CREATE INDEX company_notes_company_id_idx ON public.company_notes (company_id);


-- =============================================
-- Storage Bucket: company_pos
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('company_pos', 'company_pos', false);

-- =============================================
-- Storage RLS Policies for company_pos bucket
-- =============================================

-- Admin: full CRUD on all files in the bucket
CREATE POLICY "Admins have full access to company_pos bucket"
ON storage.objects
AS PERMISSIVE FOR ALL
TO authenticated
USING (
    bucket_id = 'company_pos'
    AND EXISTS (
        SELECT 1 FROM public.users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
)
WITH CHECK (
    bucket_id = 'company_pos'
    AND EXISTS (
        SELECT 1 FROM public.users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
);

-- Users: full CRUD on files within their own company folder
-- Files are expected to be stored under: company_pos/<company_id>/...
CREATE POLICY "Users can manage own company PO files"
ON storage.objects
AS PERMISSIVE FOR ALL
TO authenticated
USING (
    bucket_id = 'company_pos'
    AND (storage.foldername(name))[1] = (
        SELECT u.company_id::TEXT FROM public.users u WHERE u.user_id = auth.uid()
    )
)
WITH CHECK (
    bucket_id = 'company_pos'
    AND (storage.foldername(name))[1] = (
        SELECT u.company_id::TEXT FROM public.users u WHERE u.user_id = auth.uid()
    )
);
