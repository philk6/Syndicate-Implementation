CREATE OR REPLACE FUNCTION public.handle_order_status_transition(p_order_id integer, p_new_status_id integer, p_old_status_id integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_closed_status_id INT;
    v_user_id UUID := auth.uid();
    company_rec RECORD;
    v_total_cost_value NUMERIC;
    v_debit_amount NUMERIC;
    v_description TEXT;
    v_available NUMERIC;
BEGIN
    -- Get the status ID for 'Closed' status
    SELECT order_status_id INTO v_closed_status_id
    FROM public.order_statuses
    WHERE LOWER(description) = 'closed';

    -- Case 1: Order is being closed
    IF p_new_status_id = v_closed_status_id AND p_old_status_id != v_closed_status_id THEN
        -- Process each company that has an application
        FOR company_rec IN
            SELECT oc.company_id, oc.max_investment, oc.held_amount
            FROM public.order_company oc
            WHERE oc.order_id = p_order_id
              AND oc.held_amount > 0  -- Only process companies with active holds
        LOOP
            -- Calculate total cost price of allocated products for this company
            SELECT COALESCE(SUM(ar.quantity * op.cost_price), 0)
            INTO v_total_cost_value
            FROM public.allocation_results ar
            JOIN public.order_products op ON ar.order_id = op.order_id AND ar.sequence = op.sequence
            WHERE ar.order_id = p_order_id 
              AND ar.company_id = company_rec.company_id;

            -- Determine debit amount based on your business logic
            IF v_total_cost_value > company_rec.max_investment THEN
                v_debit_amount := company_rec.max_investment;
                v_description := format('Order #%s closed - Full investment amount debited', p_order_id);
            ELSE
                v_debit_amount := v_total_cost_value;
                v_description := format('Order #%s closed - Actual cost debited ($%s of $%s max)', 
                    p_order_id, to_char(v_total_cost_value, 'FM999999999.99'), to_char(company_rec.max_investment, 'FM999999999.99'));
            END IF;

            -- Only process if there's an amount to debit
            IF v_debit_amount > 0 THEN
                -- First, release the existing hold
                INSERT INTO public.credit_transactions(
                    company_id, amount, transaction_type, description, order_id, created_by
                )
                VALUES (
                    company_rec.company_id, 
                    company_rec.held_amount, 
                    'release', 
                    'Release hold for order closing', 
                    p_order_id, 
                    v_user_id
                );

                -- Then create the debit transaction
                INSERT INTO public.credit_transactions(
                    company_id, amount, transaction_type, description, order_id, created_by
                )
                VALUES (
                    company_rec.company_id, 
                    v_debit_amount * -1,  -- Negative for debit
                    'debit', 
                    v_description, 
                    p_order_id, 
                    v_user_id
                );

                -- Update the hold status to 'allocated'
                UPDATE public.credit_holds 
                SET status = 'allocated', released_at = NOW()
                WHERE order_id = p_order_id 
                  AND company_id = company_rec.company_id 
                  AND status = 'active';

                -- Clear the held_amount and set allocated_amount
                UPDATE public.order_company 
                SET held_amount = 0,
                    allocated_amount = v_debit_amount
                WHERE order_id = p_order_id 
                  AND company_id = company_rec.company_id;
            END IF;
        END LOOP;

        RETURN 'Order closed and credit transactions processed';

    -- Case 2: Closed order is being reopened
    ELSIF p_old_status_id = v_closed_status_id AND p_new_status_id != v_closed_status_id THEN
        -- First, check if all companies have sufficient balance to reinstate holds
        FOR company_rec IN
            SELECT oc.company_id, oc.max_investment, oc.allocated_amount, c.name as company_name
            FROM public.order_company oc
            JOIN public.company c ON c.company_id = oc.company_id
            WHERE oc.order_id = p_order_id
              AND oc.allocated_amount > 0
        LOOP
            SELECT available_balance INTO v_available
            FROM public.company_credit_summary
            WHERE company_id = company_rec.company_id;

            IF v_available + company_rec.allocated_amount < company_rec.max_investment THEN
                RAISE EXCEPTION 'Insufficient balance for company % (ID: %) to reinstate hold of % (available after credit would be %)', 
                    company_rec.company_name, company_rec.company_id, company_rec.max_investment, v_available + company_rec.allocated_amount;
            END IF;
        END LOOP;

        -- If all checks pass, proceed with processing
        FOR company_rec IN
            SELECT oc.company_id, oc.max_investment, oc.allocated_amount, c.name as company_name
            FROM public.order_company oc
            JOIN public.company c ON c.company_id = oc.company_id
            WHERE oc.order_id = p_order_id
              AND oc.allocated_amount > 0
        LOOP
            -- Reverse the debit transaction
            INSERT INTO public.credit_transactions(
                company_id, amount, transaction_type, description, order_id, created_by
            )
            VALUES (
                company_rec.company_id, 
                company_rec.allocated_amount,  -- Positive to reverse the debit
                'credit', 
                format('Order #%s reopened - Reversing previous debit', p_order_id), 
                p_order_id, 
                v_user_id
            );

            -- Recreate the hold for the original max_investment amount
            INSERT INTO public.credit_transactions(
                company_id, amount, transaction_type, description, order_id, created_by
            )
            VALUES (
                company_rec.company_id, 
                company_rec.max_investment * -1,  -- Negative for hold
                'hold', 
                format('Order #%s reopened - Reinstating hold', p_order_id), 
                p_order_id, 
                v_user_id
            );

            -- Update the credit_holds table
            UPDATE public.credit_holds 
            SET status = 'active', released_at = NULL
            WHERE order_id = p_order_id 
              AND company_id = company_rec.company_id;

            -- If no active hold exists, create one
            IF NOT FOUND THEN
                INSERT INTO public.credit_holds (company_id, order_id, amount, status)
                VALUES (company_rec.company_id, p_order_id, company_rec.max_investment, 'active');
            END IF;

            -- Update order_company to reflect the reinstated hold
            UPDATE public.order_company 
            SET held_amount = company_rec.max_investment,
                allocated_amount = 0
            WHERE order_id = p_order_id 
              AND company_id = company_rec.company_id;
        END LOOP;

        RETURN 'Order reopened and holds reinstated';
    END IF;

    RETURN 'No credit processing needed for this status change';
END;
$function$
;