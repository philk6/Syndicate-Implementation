CREATE OR REPLACE FUNCTION public.aggregate_allocations_by_time(
    p_company_id INTEGER,
    p_date_trunc TEXT,
    p_start_date TIMESTAMP WITHOUT TIME ZONE
)
RETURNS TABLE (
    time_period TEXT,
    total_profit NUMERIC,
    total_invested_amount NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        TO_CHAR(DATE_TRUNC(p_date_trunc, ar.created_at), 'YYYY-MM-DD') AS time_period,
        COALESCE(SUM(ar.profit), 0) AS total_profit,
        COALESCE(SUM(ar.invested_amount), 0) AS total_invested_amount
    FROM public.allocation_results ar
    WHERE ar.company_id = p_company_id
        AND ar.created_at >= p_start_date
    GROUP BY DATE_TRUNC(p_date_trunc, ar.created_at)
    ORDER BY DATE_TRUNC(p_date_trunc, ar.created_at);
END;
$$ LANGUAGE plpgsql;