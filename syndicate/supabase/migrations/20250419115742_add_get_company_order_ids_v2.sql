CREATE OR REPLACE FUNCTION public.get_company_order_ids(p_company_id integer)
RETURNS TABLE (order_id integer) AS $$
BEGIN
  RETURN QUERY
    SELECT DISTINCT o.order_id
    FROM (
      SELECT oc.order_id FROM public.order_company oc WHERE oc.company_id = p_company_id
      UNION
      SELECT ar.order_id FROM public.allocation_results ar WHERE ar.company_id = p_company_id
    ) AS o;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_company_order_ids(integer) TO authenticated;