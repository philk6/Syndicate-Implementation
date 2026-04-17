-- ============================================================================
-- Migration: add_prep_portal
-- Description:
--   FBA prep / warehouse portal. Six tables covering shipment lifecycle,
--   items, documents, invoices, line items, and notifications.
--
--   Clients (has_1on1_membership=true) submit shipments; warehouse team
--   (admins) processes them, uploads receiving docs, and creates invoices.
--
--   Reuses public.handle_updated_at() defined in the missions migration.
-- ============================================================================


-- ============================================================================
-- Table: prep_shipments
-- ============================================================================
CREATE TABLE public.prep_shipments (
    id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id              UUID    NOT NULL REFERENCES public.users   (user_id)    ON DELETE CASCADE,
    company_id           INTEGER NOT NULL REFERENCES public.company (company_id),
    supplier_name        TEXT    NOT NULL,
    tracking_number      TEXT,
    po_number            TEXT,
    estimated_arrival    DATE,
    unit_count_expected  INTEGER,
    unit_count_received  INTEGER,
    status               TEXT    NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted','in_transit','received','prepping',
                          'complete','shipped_to_amazon','cancelled')),
    warehouse_notes      TEXT,
    client_notes         TEXT,
    amazon_shipment_id   TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX prep_shipments_user_id_idx    ON public.prep_shipments (user_id);
CREATE INDEX prep_shipments_company_id_idx ON public.prep_shipments (company_id);
CREATE INDEX prep_shipments_status_idx     ON public.prep_shipments (status);
CREATE INDEX prep_shipments_created_at_idx ON public.prep_shipments (created_at DESC);

CREATE TRIGGER prep_shipments_updated_at
    BEFORE UPDATE ON public.prep_shipments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================================
-- Table: prep_shipment_items
-- ============================================================================
CREATE TABLE public.prep_shipment_items (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shipment_id     INTEGER NOT NULL REFERENCES public.prep_shipments (id) ON DELETE CASCADE,
    product_name    TEXT    NOT NULL,
    asin            TEXT,
    fnsku           TEXT,
    units_expected  INTEGER NOT NULL DEFAULT 0 CHECK (units_expected >= 0),
    units_received  INTEGER NOT NULL DEFAULT 0 CHECK (units_received >= 0),
    units_damaged   INTEGER NOT NULL DEFAULT 0 CHECK (units_damaged >= 0),
    prep_type       TEXT,
    notes           TEXT
);

CREATE INDEX prep_shipment_items_shipment_idx ON public.prep_shipment_items (shipment_id);


-- ============================================================================
-- Table: prep_documents
-- ============================================================================
CREATE TABLE public.prep_documents (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shipment_id     INTEGER NOT NULL REFERENCES public.prep_shipments (id) ON DELETE CASCADE,
    uploaded_by     UUID    NOT NULL REFERENCES public.users (user_id),
    document_type   TEXT    NOT NULL
        CHECK (document_type IN ('purchase_order','invoice','bol','receiving_photo',
                                 'damage_photo','fba_confirmation','other')),
    file_name       TEXT    NOT NULL,
    file_url        TEXT    NOT NULL,
    file_size       INTEGER,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX prep_documents_shipment_idx ON public.prep_documents (shipment_id);


-- ============================================================================
-- Table: prep_invoices
-- ============================================================================
CREATE TABLE public.prep_invoices (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shipment_id     INTEGER NOT NULL REFERENCES public.prep_shipments (id) ON DELETE CASCADE,
    company_id      INTEGER NOT NULL REFERENCES public.company (company_id),
    invoice_number  TEXT    NOT NULL UNIQUE,
    status          TEXT    NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','sent','paid','overdue','cancelled')),
    subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
    tax             NUMERIC(10,2) NOT NULL DEFAULT 0,
    total           NUMERIC(10,2) NOT NULL DEFAULT 0,
    due_date        DATE,
    paid_at         TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX prep_invoices_company_idx  ON public.prep_invoices (company_id);
CREATE INDEX prep_invoices_shipment_idx ON public.prep_invoices (shipment_id);
CREATE INDEX prep_invoices_status_idx   ON public.prep_invoices (status);


-- ============================================================================
-- Table: prep_invoice_line_items
-- ============================================================================
CREATE TABLE public.prep_invoice_line_items (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id  INTEGER NOT NULL REFERENCES public.prep_invoices (id) ON DELETE CASCADE,
    description TEXT    NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price  NUMERIC(10,2) NOT NULL,
    total       NUMERIC(10,2) NOT NULL
);

CREATE INDEX prep_invoice_line_items_invoice_idx ON public.prep_invoice_line_items (invoice_id);


-- ============================================================================
-- Table: prep_notifications
-- ============================================================================
CREATE TABLE public.prep_notifications (
    id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      UUID    NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
    shipment_id  INTEGER          REFERENCES public.prep_shipments (id) ON DELETE SET NULL,
    type         TEXT    NOT NULL
        CHECK (type IN ('status_change','invoice_ready','document_uploaded',
                        'warehouse_message','shipment_received')),
    message      TEXT    NOT NULL,
    is_read      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX prep_notifications_user_unread_idx
    ON public.prep_notifications (user_id, is_read, created_at DESC);


-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.prep_shipments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prep_shipment_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prep_documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prep_invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prep_invoice_line_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prep_notifications       ENABLE ROW LEVEL SECURITY;


-- ── prep_shipments ──────────────────────────────────────────────────────────
CREATE POLICY "prep_shipments_admin_all"
    ON public.prep_shipments FOR ALL TO authenticated
    USING  (public.is_chat_admin()) WITH CHECK (public.is_chat_admin());

CREATE POLICY "prep_shipments_user_select"
    ON public.prep_shipments FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "prep_shipments_user_insert"
    ON public.prep_shipments FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "prep_shipments_user_update"
    ON public.prep_shipments FOR UPDATE TO authenticated
    USING  (user_id = auth.uid() AND status IN ('submitted','in_transit'))
    WITH CHECK (user_id = auth.uid() AND status IN ('submitted','in_transit','cancelled'));


-- ── prep_shipment_items ─────────────────────────────────────────────────────
CREATE POLICY "prep_shipment_items_admin_all"
    ON public.prep_shipment_items FOR ALL TO authenticated
    USING  (public.is_chat_admin()) WITH CHECK (public.is_chat_admin());

CREATE POLICY "prep_shipment_items_user_select"
    ON public.prep_shipment_items FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.prep_shipments s
        WHERE s.id = prep_shipment_items.shipment_id
          AND s.user_id = auth.uid()
    ));

CREATE POLICY "prep_shipment_items_user_insert"
    ON public.prep_shipment_items FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.prep_shipments s
        WHERE s.id = prep_shipment_items.shipment_id
          AND s.user_id = auth.uid()
          AND s.status IN ('submitted','in_transit')
    ));

CREATE POLICY "prep_shipment_items_user_update"
    ON public.prep_shipment_items FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.prep_shipments s
        WHERE s.id = prep_shipment_items.shipment_id
          AND s.user_id = auth.uid()
          AND s.status IN ('submitted','in_transit')
    ));


-- ── prep_documents ──────────────────────────────────────────────────────────
CREATE POLICY "prep_documents_admin_all"
    ON public.prep_documents FOR ALL TO authenticated
    USING  (public.is_chat_admin()) WITH CHECK (public.is_chat_admin());

CREATE POLICY "prep_documents_user_select"
    ON public.prep_documents FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.prep_shipments s
        WHERE s.id = prep_documents.shipment_id
          AND s.user_id = auth.uid()
    ));

CREATE POLICY "prep_documents_user_insert"
    ON public.prep_documents FOR INSERT TO authenticated
    WITH CHECK (
        uploaded_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.prep_shipments s
            WHERE s.id = prep_documents.shipment_id
              AND s.user_id = auth.uid()
        )
    );


-- ── prep_invoices ───────────────────────────────────────────────────────────
CREATE POLICY "prep_invoices_admin_all"
    ON public.prep_invoices FOR ALL TO authenticated
    USING  (public.is_chat_admin()) WITH CHECK (public.is_chat_admin());

CREATE POLICY "prep_invoices_user_select"
    ON public.prep_invoices FOR SELECT TO authenticated
    USING (company_id IN (
        SELECT u.company_id FROM public.users u WHERE u.user_id = auth.uid()
    ));

-- Users may flip status to 'paid' on their own company's invoices.
CREATE POLICY "prep_invoices_user_update"
    ON public.prep_invoices FOR UPDATE TO authenticated
    USING (company_id IN (
        SELECT u.company_id FROM public.users u WHERE u.user_id = auth.uid()
    ))
    WITH CHECK (company_id IN (
        SELECT u.company_id FROM public.users u WHERE u.user_id = auth.uid()
    ));


-- ── prep_invoice_line_items ─────────────────────────────────────────────────
CREATE POLICY "prep_invoice_line_items_admin_all"
    ON public.prep_invoice_line_items FOR ALL TO authenticated
    USING  (public.is_chat_admin()) WITH CHECK (public.is_chat_admin());

CREATE POLICY "prep_invoice_line_items_user_select"
    ON public.prep_invoice_line_items FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.prep_invoices i
        JOIN public.users u ON u.user_id = auth.uid()
        WHERE i.id = prep_invoice_line_items.invoice_id
          AND i.company_id = u.company_id
    ));


-- ── prep_notifications ──────────────────────────────────────────────────────
CREATE POLICY "prep_notifications_admin_all"
    ON public.prep_notifications FOR ALL TO authenticated
    USING  (public.is_chat_admin()) WITH CHECK (public.is_chat_admin());

CREATE POLICY "prep_notifications_user_select"
    ON public.prep_notifications FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "prep_notifications_user_update"
    ON public.prep_notifications FOR UPDATE TO authenticated
    USING  (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());


-- ============================================================================
-- Grants
-- ============================================================================
GRANT SELECT, INSERT, UPDATE         ON public.prep_shipments          TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.prep_shipment_items     TO authenticated;
GRANT SELECT, INSERT                 ON public.prep_documents          TO authenticated;
GRANT SELECT, UPDATE                 ON public.prep_invoices           TO authenticated;
GRANT SELECT                         ON public.prep_invoice_line_items TO authenticated;
GRANT SELECT, UPDATE                 ON public.prep_notifications      TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prep_shipments          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prep_shipment_items     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prep_documents          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prep_invoices           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prep_invoice_line_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prep_notifications      TO service_role;


NOTIFY pgrst, 'reload schema';
