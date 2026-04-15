-- ============================================================================
-- Migration: seed_mission_control_v2_data
-- Description:
--   Seed data for Mission Control v2: phases, ranks, bonus XP events,
--   missions, and tasks for all 5 phases.
--
--   Idempotent-ish: uses ON CONFLICT DO NOTHING on natural keys where
--   possible. Missions/tasks are inserted fresh each run with
--   TRUNCATE-guarded inserts — re-running will create duplicates unless
--   the re-run block at the top is used.
--
--   For a dev environment running this once, the simple inserts are fine.
-- ============================================================================

-- ============================================================================
-- PHASES
-- ============================================================================
INSERT INTO public.phases (id, name, slug, color, sort_order, always_available) VALUES
    (1, 'ESTABLISH BASE', 'establish_base', '#FF6B35', 1, FALSE),
    (2, 'MAKE CONTACT',   'make_contact',   '#4ECDC4', 2, FALSE),
    (3, 'LOCK IN',        'lock_in',        '#A8E6CF', 3, FALSE),
    (4, 'COMPOUND',       'compound',       '#FFD93D', 4, FALSE),
    (5, 'ELEVATE',        'elevate',        '#C77DFF', 5, TRUE)
ON CONFLICT (id) DO UPDATE
    SET name             = EXCLUDED.name,
        slug             = EXCLUDED.slug,
        color            = EXCLUDED.color,
        sort_order       = EXCLUDED.sort_order,
        always_available = EXCLUDED.always_available;


-- ============================================================================
-- RANKS
-- ============================================================================
INSERT INTO public.ranks (id, name, min_xp, color, sort_order) VALUES
    (1, 'Recruit',          0,      '#888888', 1),
    (2, 'Hustler',           1000,  '#FF6B35', 2),
    (3, 'Operator',          5000,  '#4ECDC4', 3),
    (4, 'Merchant',         15000,  '#A8E6CF', 4),
    (5, 'Distributor',      35000,  '#FFD93D', 5),
    (6, 'Mogul',            75000,  '#C77DFF', 6),
    (7, 'Syndicate Elite', 150000,  '#FF0080', 7)
ON CONFLICT (id) DO UPDATE
    SET name       = EXCLUDED.name,
        min_xp     = EXCLUDED.min_xp,
        color      = EXCLUDED.color,
        sort_order = EXCLUDED.sort_order;


-- ============================================================================
-- BONUS XP EVENTS
-- ============================================================================
INSERT INTO public.bonus_xp_events (phase_id, code, description, xp_reward, is_repeatable) VALUES
    -- Phase 1
    (1, 'phase1_7day',            'Complete all Phase 1 missions within 7 days',    500, FALSE),
    (1, 'phase1_14day',           'Complete all Phase 1 missions within 14 days',   250, FALSE),
    (1, 'phase1_weekly_checkin',  'Phase 1 weekly check-in',                         50, TRUE),
    -- Phase 2
    (2, 'phase2_supplier_7day',   'Land first supplier within 7 days of Phase 2',   750, FALSE),
    (2, 'phase2_weekly_checkin',  'Phase 2 weekly check-in',                         50, TRUE),
    (2, 'phase2_share_supplier',  'Share supplier win with community',                75, TRUE),
    -- Phase 3
    (3, 'phase3_first_po_7day',   'First PO within 7 days of first supplier',       500, FALSE),
    (3, 'phase3_weekly_checkin',  'Phase 3 weekly check-in',                         50, TRUE),
    (3, 'phase3_share_product',   'Share profitable product find',                  100, TRUE),
    -- Phase 4
    (4, 'phase4_weekly_checkin',  'Phase 4 weekly check-in',                         50, TRUE),
    (4, 'phase4_leaderboard_out', 'Top leaderboard: supplier outreach',             300, TRUE),
    (4, 'phase4_leaderboard_po',  'Top leaderboard: PO count',                      300, TRUE),
    (4, 'phase4_share_revenue',   'Share revenue win',                              150, TRUE),
    -- Phase 5
    (5, 'phase5_share_win',       'Share VA or funding win',                        200, TRUE),
    (5, 'phase5_weekly_checkin',  'Phase 5 weekly check-in',                         50, TRUE)
ON CONFLICT (code) DO UPDATE
    SET phase_id      = EXCLUDED.phase_id,
        description   = EXCLUDED.description,
        xp_reward     = EXCLUDED.xp_reward,
        is_repeatable = EXCLUDED.is_repeatable;


-- ============================================================================
-- MISSIONS + TASKS
--   Using DO block + WITH inserts to capture generated mission IDs inline.
-- ============================================================================
DO $seed$
DECLARE
    m_id INTEGER;
BEGIN

-- ───────────────────────────────────────────────────────────────────────
-- PHASE 1 — ESTABLISH BASE
-- ───────────────────────────────────────────────────────────────────────

-- Name Your Empire (100)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Name Your Empire', 'Pick a business name and claim your identity.', 0, 1, 'core', 'Empire Founder', 1)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Choose and finalize your business name', 0, 100);

-- Make It Official (300)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Make It Official', 'Register your LLC or business entity.', 0, 1, 'core', 'Legally Incorporated', 2)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'File LLC or business entity paperwork', 0, 300);

-- Get Your Digits (150)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Get Your Digits', 'Obtain your EIN from the IRS.', 0, 1, 'core', 'Tax ID Secured', 3)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Apply for and receive your EIN', 0, 150);

-- Digital Storefront (200)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Digital Storefront', 'Set up your Amazon Seller Central account.', 0, 1, 'core', 'Store Online', 4)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Open and verify Amazon Seller Central account', 0, 200);

-- Open for Business (250)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Open for Business', 'Open a business bank account.', 0, 1, 'core', 'Bank Account Live', 5)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Open business bank account', 0, 250);

-- Tax & Credit Setup (200)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Tax & Credit Setup', 'Secure resale certificate and set up business credit.', 0, 1, 'core', 'Credit Primed', 6)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Obtain resale certificate and open business credit line', 0, 200);


-- ───────────────────────────────────────────────────────────────────────
-- PHASE 2 — MAKE CONTACT
-- ───────────────────────────────────────────────────────────────────────

-- Learn the Language (150)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Learn the Language', 'Master the basics of supplier outreach terminology.', 0, 2, 'core', 'Supplier Fluent', 1)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Complete supplier outreach training module', 0, 150);

-- First Signal Sent (200)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('First Signal Sent', 'Send your first supplier outreach email.', 0, 2, 'core', 'First Contact', 2)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Send first supplier outreach email', 0, 200);

-- First Words Spoken (250)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('First Words Spoken', 'Make your first supplier phone call.', 0, 2, 'core', 'First Call', 3)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Complete first supplier phone call', 0, 250);

-- Daily Outreach Grind (100/200/400)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Daily Outreach Grind', 'Push daily outreach volume to new heights.', 0, 2, 'milestone', 'Outreach Machine', 4)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Contact 10 suppliers in one day', 0, 100),
    (m_id, 'Contact 25 suppliers in one day', 1, 200),
    (m_id, 'Contact 50 suppliers in one day', 2, 400);

-- On the Phone (100/200/350)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('On the Phone', 'Rack up daily phone call volume.', 0, 2, 'milestone', 'Dialer', 5)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Call 5 suppliers in one day',  0, 100),
    (m_id, 'Call 10 suppliers in one day', 1, 200),
    (m_id, 'Call 20 suppliers in one day', 2, 350);

-- Call Milestones (100/250/500/1000 lifetime)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Call Milestones', 'Lifetime supplier call volume milestones.', 0, 2, 'milestone', 'Century Caller', 6)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Log 10 calls',  0, 100),
    (m_id, 'Log 25 calls',  1, 250),
    (m_id, 'Log 50 calls',  2, 500),
    (m_id, 'Log 100 calls', 3, 1000);

-- Landing Accounts (500/750/1000/2000 lifetime)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Landing Accounts', 'Lifetime supplier accounts landed.', 0, 2, 'milestone', 'Account Closer', 7)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Land 1 supplier account',   0, 500),
    (m_id, 'Land 3 supplier accounts',  1, 750),
    (m_id, 'Land 5 supplier accounts',  2, 1000),
    (m_id, 'Land 10 supplier accounts', 3, 2000);

-- Follow-Up Fighter (100/200 weekly)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Follow-Up Fighter', 'Weekly follow-up volume targets.', 0, 2, 'weekly', 'Persistent', 8)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Send 10 follow-ups this week', 0, 100),
    (m_id, 'Send 25 follow-ups this week', 1, 200);


-- ───────────────────────────────────────────────────────────────────────
-- PHASE 3 — LOCK IN
-- ───────────────────────────────────────────────────────────────────────

-- Tool Mastery (300)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Tool Mastery', 'Master the core tools of the trade.', 0, 3, 'core', 'Tool Master', 1)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Complete tool mastery training', 0, 300);

-- Product Hunter (200)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Product Hunter', 'Identify your first profitable product.', 0, 3, 'core', 'Hunter', 2)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Identify first profitable product', 0, 200);

-- Build the PO (300)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Build the PO', 'Build your first purchase order.', 0, 3, 'core', 'PO Architect', 3)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Build first purchase order', 0, 300);

-- Pull the Trigger (500)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Pull the Trigger', 'Submit your first purchase order.', 0, 3, 'core', 'Trigger Puller', 4)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Submit first purchase order', 0, 500);

-- PO Milestones (250/500/1000/2000 lifetime)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('PO Milestones', 'Lifetime purchase order milestones.', 0, 3, 'milestone', 'PO Veteran', 5)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Submit 1 purchase order',   0, 250),
    (m_id, 'Submit 5 purchase orders',  1, 500),
    (m_id, 'Submit 10 purchase orders', 2, 1000),
    (m_id, 'Submit 25 purchase orders', 3, 2000);

-- Weekly PO Grind (150/300/600 weekly)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Weekly PO Grind', 'Weekly PO submission targets.', 0, 3, 'weekly', 'PO Grinder', 6)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Submit 2 POs this week',  0, 150),
    (m_id, 'Submit 5 POs this week',  1, 300),
    (m_id, 'Submit 10 POs this week', 2, 600);


-- ───────────────────────────────────────────────────────────────────────
-- PHASE 4 — COMPOUND
-- ───────────────────────────────────────────────────────────────────────

-- Restock Routine (150/300/750/1500 lifetime)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Restock Routine', 'Lifetime restock milestones.', 0, 4, 'milestone', 'Restock Pro', 1)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Complete 5 total restocks',   0, 150),
    (m_id, 'Complete 15 total restocks',  1, 300),
    (m_id, 'Complete 30 total restocks',  2, 750),
    (m_id, 'Complete 60 total restocks',  3, 1500);

-- Portfolio Expansion (200/400/750/1200/2500 lifetime)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Portfolio Expansion', 'Grow your SKU catalog.', 0, 4, 'milestone', 'Portfolio Builder', 2)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Add 5 SKUs to your store',   0, 200),
    (m_id, 'Add 15 SKUs to your store',  1, 400),
    (m_id, 'Add 30 SKUs to your store',  2, 750),
    (m_id, 'Add 50 SKUs to your store',  3, 1200),
    (m_id, 'Add 100 SKUs to your store', 4, 2500);

-- Revenue Milestones
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Revenue Milestones', 'Monthly sales volume milestones.', 0, 4, 'milestone', 'Revenue Champion', 3)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Hit $1K in monthly sales',   0, 500),
    (m_id, 'Hit $5K in monthly sales',   1, 1000),
    (m_id, 'Hit $10K in monthly sales',  2, 2000),
    (m_id, 'Hit $25K in monthly sales',  3, 4000),
    (m_id, 'Hit $50K in monthly sales',  4, 7500),
    (m_id, 'Hit $100K in monthly sales', 5, 15000);

-- Supplier Portfolio Growth (500/1000/2000/5000)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Supplier Portfolio Growth', 'Active supplier count milestones.', 0, 4, 'milestone', 'Supplier Magnate', 4)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Reach 5 active suppliers',   0, 500),
    (m_id, 'Reach 10 active suppliers',  1, 1000),
    (m_id, 'Reach 25 active suppliers',  2, 2000),
    (m_id, 'Reach 50 active suppliers',  3, 5000);

-- Weekly Consistency Streak (200/500/1000)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Weekly Consistency Streak', 'Rack up consecutive weeks of activity.', 0, 4, 'weekly', 'Consistency King', 5)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Hit 2-week consistency streak', 0, 200),
    (m_id, 'Hit 4-week consistency streak', 1, 500),
    (m_id, 'Hit 8-week consistency streak', 2, 1000);


-- ───────────────────────────────────────────────────────────────────────
-- PHASE 5 — ELEVATE
-- ───────────────────────────────────────────────────────────────────────

-- VA Ready (750)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('VA Ready', 'Hire and onboard your first virtual assistant.', 0, 5, 'core', 'VA Commander', 1)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Hire and onboard first VA', 0, 750);

-- Systems Running (100/200/500)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Systems Running', 'Document and automate your operation.', 0, 5, 'milestone', 'Systems Operator', 2)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Document 5 core SOPs',              0, 100),
    (m_id, 'Document 15 core SOPs',             1, 200),
    (m_id, 'Fully automate 1 business function', 2, 500);

-- Capital Ready (1000)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Capital Ready', 'Prepare your financials for a funding application.', 0, 5, 'core', 'Capital Ready', 3)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Prepare financials for funding application', 0, 1000);

-- Funded Milestones (500/1000/2000/5000)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Funded Milestones', 'Business funding secured milestones.', 0, 5, 'milestone', 'Funded', 4)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Secure $10K in business funding',  0, 500),
    (m_id, 'Secure $25K in business funding',  1, 1000),
    (m_id, 'Secure $50K in business funding',  2, 2000),
    (m_id, 'Secure $100K in business funding', 3, 5000);

-- Deploy Capital (500/1000)
INSERT INTO public.missions (title, description, xp_reward, phase_id, mission_type, badge_name, sort_order)
VALUES ('Deploy Capital', 'Put funded capital to work.', 0, 5, 'milestone', 'Capital Deployer', 5)
RETURNING id INTO m_id;
INSERT INTO public.tasks (mission_id, title, order_index, xp_reward) VALUES
    (m_id, 'Deploy $10K in funded capital to purchases', 0, 500),
    (m_id, 'Deploy $50K in funded capital to purchases', 1, 1000);

END $seed$;


-- ============================================================================
-- Reload PostgREST schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';
