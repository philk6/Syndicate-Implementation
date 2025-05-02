CREATE OR REPLACE FUNCTION public.get_company_order_ids(p_company_id integer)
RETURNS TABLE (order_id integer) AS $$
BEGIN
  RETURN QUERY
    SELECT DISTINCT order_id
    FROM (
      SELECT order_id FROM public.order_company WHERE company_id = p_company_id
      UNION
      SELECT order_id FROM public.allocation_results WHERE company_id = p_company_id
    ) AS orders;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_company_order_ids(integer) TO authenticated;