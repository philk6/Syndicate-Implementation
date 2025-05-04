-- supabase/migrations/<timestamp>_add_generate_invite_code_rpc.sql
CREATE OR REPLACE FUNCTION public.generate_invite_code(p_user_id uuid, p_company_id integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_code text;
  characters text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  max_attempts integer := 5;
  attempt integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    WHERE user_id = p_user_id
    AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'User does not belong to the specified company';
  END IF;

  WHILE attempt < max_attempts LOOP
    new_code := '';
    FOR i IN 1..5 LOOP
      new_code := new_code || substr(characters, floor(random() * length(characters) + 1)::integer, 1);
    END LOOP;

    INSERT INTO invitation_codes (
      code,
      created_user_id,
      expired,
      invited_to_company
    )
    VALUES (
      new_code,
      p_user_id,
      false,
      p_company_id
    )
    ON CONFLICT (code) DO NOTHING
    RETURNING code INTO new_code;

    IF new_code IS NOT NULL THEN
      RETURN new_code;
    END IF;

    attempt := attempt + 1;
  END LOOP;

  RAISE EXCEPTION 'Failed to generate a unique invite code after % attempts', max_attempts;
END;
$$;