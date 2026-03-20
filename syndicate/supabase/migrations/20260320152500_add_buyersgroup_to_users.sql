-- Migration: Add buyersgroup column to public.users
-- This column controls access to /orders and /credit-overview pages.
-- Admins implicitly have access regardless of this flag.

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS buyersgroup BOOLEAN DEFAULT false;

-- Backfill: ensure all existing users get the default value
UPDATE public.users SET buyersgroup = false WHERE buyersgroup IS NULL;
