ALTER TABLE public.order_products_company
ADD COLUMN discounted_price NUMERIC(10,2) DEFAULT NULL;

ALTER TABLE public.order_company
ADD COLUMN has_discounts BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.order_products_company.discounted_price IS 'Discounted price for a specific product, company, and order, if applicable';
COMMENT ON COLUMN public.order_company.has_discounts IS 'Indicates if the company has any discounts for this order';