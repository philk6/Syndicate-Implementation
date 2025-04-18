create type "public"."user_role" as enum ('user', 'admin');

create sequence "public"."allocation_results_id_seq";

create sequence "public"."company_company_id_seq";

create sequence "public"."invitation_codes_invite_id_seq";

create sequence "public"."order_products_sequence_seq";

create sequence "public"."order_statuses_order_status_id_seq";

create sequence "public"."orders_order_id_seq";

create table "public"."allocation_results" (
    "id" integer not null default nextval('allocation_results_id_seq'::regclass),
    "order_id" integer not null,
    "sequence" integer not null,
    "company_id" integer not null,
    "quantity" integer not null,
    "roi" numeric,
    "needs_review" boolean default false,
    "created_at" timestamp without time zone default CURRENT_TIMESTAMP
);


create table "public"."company" (
    "company_id" integer not null default nextval('company_company_id_seq'::regclass),
    "name" character varying(100) not null,
    "email" character varying(255) not null,
    "created_at" timestamp without time zone default CURRENT_TIMESTAMP,
    "status" character varying(20) default 'Active'::character varying
);


alter table "public"."company" enable row level security;

create table "public"."invitation_codes" (
    "invite_id" integer not null default nextval('invitation_codes_invite_id_seq'::regclass),
    "code" character varying(5) not null,
    "created_user_id" uuid,
    "expired" boolean default false,
    "used_by_user_id" uuid,
    "invited_to_company" integer
);


alter table "public"."invitation_codes" enable row level security;

create table "public"."order_company" (
    "order_id" integer not null,
    "company_id" integer not null,
    "max_investment" numeric(10,2) not null
);


alter table "public"."order_company" enable row level security;

create table "public"."order_pre_assignments" (
    "assignment_id" integer generated always as identity not null,
    "order_id" integer not null,
    "sequence" integer not null,
    "company_id" integer not null,
    "quantity" integer,
    "created_at" timestamp without time zone default CURRENT_TIMESTAMP
);


alter table "public"."order_pre_assignments" enable row level security;

create table "public"."order_products" (
    "order_id" integer not null,
    "sequence" integer not null default nextval('order_products_sequence_seq'::regclass),
    "asin" character varying(10) not null,
    "price" numeric(10,2) not null,
    "roi" numeric(5,2),
    "description" text,
    "quantity" integer not null,
    "total_cost" numeric(10,2),
    "cost_price" numeric not null default '0'::numeric
);


alter table "public"."order_products" enable row level security;

create table "public"."order_products_company" (
    "order_id" integer not null,
    "sequence" integer not null,
    "company_id" integer not null,
    "quantity" integer not null,
    "ungated" boolean default false,
    "ungated_min_amount" integer
);


alter table "public"."order_products_company" enable row level security;

create table "public"."order_statuses" (
    "order_status_id" integer not null default nextval('order_statuses_order_status_id_seq'::regclass),
    "description" character varying(50) not null
);


alter table "public"."order_statuses" enable row level security;

create table "public"."orders" (
    "order_id" integer not null default nextval('orders_order_id_seq'::regclass),
    "leadtime" integer not null,
    "deadline" timestamp without time zone not null,
    "label_upload_deadline" timestamp without time zone not null,
    "order_status_id" integer,
    "created_at" timestamp without time zone default CURRENT_TIMESTAMP,
    "total_amount" numeric(10,2)
);


alter table "public"."orders" enable row level security;

create table "public"."users" (
    "firstname" character varying(50),
    "lastname" character varying(50),
    "email" character varying(255) not null,
    "company_id" integer,
    "created_at" timestamp without time zone default CURRENT_TIMESTAMP,
    "role" user_role default 'user'::user_role,
    "user_id" uuid not null
);


alter table "public"."users" enable row level security;

alter sequence "public"."allocation_results_id_seq" owned by "public"."allocation_results"."id";

alter sequence "public"."company_company_id_seq" owned by "public"."company"."company_id";

alter sequence "public"."invitation_codes_invite_id_seq" owned by "public"."invitation_codes"."invite_id";

alter sequence "public"."order_products_sequence_seq" owned by "public"."order_products"."sequence";

alter sequence "public"."order_statuses_order_status_id_seq" owned by "public"."order_statuses"."order_status_id";

alter sequence "public"."orders_order_id_seq" owned by "public"."orders"."order_id";

CREATE UNIQUE INDEX allocation_results_order_seq_comp_key ON public.allocation_results USING btree (order_id, sequence, company_id);

CREATE UNIQUE INDEX allocation_results_pkey ON public.allocation_results USING btree (id);

CREATE UNIQUE INDEX company_email_key ON public.company USING btree (email);

CREATE UNIQUE INDEX company_pkey ON public.company USING btree (company_id);

CREATE UNIQUE INDEX invitation_codes_code_key ON public.invitation_codes USING btree (code);

CREATE UNIQUE INDEX invitation_codes_pkey ON public.invitation_codes USING btree (invite_id);

CREATE UNIQUE INDEX order_company_pkey ON public.order_company USING btree (order_id, company_id);

CREATE INDEX order_pre_assignments_order_id_idx ON public.order_pre_assignments USING btree (order_id);

CREATE UNIQUE INDEX order_pre_assignments_pkey ON public.order_pre_assignments USING btree (assignment_id);

CREATE UNIQUE INDEX order_products_company_pkey ON public.order_products_company USING btree (order_id, sequence, company_id);

CREATE UNIQUE INDEX order_products_company_unique_constraint ON public.order_products_company USING btree (order_id, sequence, company_id);

CREATE UNIQUE INDEX order_products_pkey ON public.order_products USING btree (order_id, sequence);

CREATE UNIQUE INDEX order_statuses_pkey ON public.order_statuses USING btree (order_status_id);

CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (order_id);

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (user_id);

alter table "public"."allocation_results" add constraint "allocation_results_pkey" PRIMARY KEY using index "allocation_results_pkey";

alter table "public"."company" add constraint "company_pkey" PRIMARY KEY using index "company_pkey";

alter table "public"."invitation_codes" add constraint "invitation_codes_pkey" PRIMARY KEY using index "invitation_codes_pkey";

alter table "public"."order_company" add constraint "order_company_pkey" PRIMARY KEY using index "order_company_pkey";

alter table "public"."order_pre_assignments" add constraint "order_pre_assignments_pkey" PRIMARY KEY using index "order_pre_assignments_pkey";

alter table "public"."order_products" add constraint "order_products_pkey" PRIMARY KEY using index "order_products_pkey";

alter table "public"."order_products_company" add constraint "order_products_company_pkey" PRIMARY KEY using index "order_products_company_pkey";

alter table "public"."order_statuses" add constraint "order_statuses_pkey" PRIMARY KEY using index "order_statuses_pkey";

alter table "public"."orders" add constraint "orders_pkey" PRIMARY KEY using index "orders_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."allocation_results" add constraint "allocation_results_company_id_fkey" FOREIGN KEY (company_id) REFERENCES company(company_id) not valid;

alter table "public"."allocation_results" validate constraint "allocation_results_company_id_fkey";

alter table "public"."allocation_results" add constraint "allocation_results_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(order_id) not valid;

alter table "public"."allocation_results" validate constraint "allocation_results_order_id_fkey";

alter table "public"."allocation_results" add constraint "allocation_results_order_id_sequence_fkey" FOREIGN KEY (order_id, sequence) REFERENCES order_products(order_id, sequence) not valid;

alter table "public"."allocation_results" validate constraint "allocation_results_order_id_sequence_fkey";

alter table "public"."allocation_results" add constraint "allocation_results_order_seq_comp_key" UNIQUE using index "allocation_results_order_seq_comp_key";

alter table "public"."company" add constraint "company_email_key" UNIQUE using index "company_email_key";

alter table "public"."invitation_codes" add constraint "invitation_codes_code_key" UNIQUE using index "invitation_codes_code_key";

alter table "public"."invitation_codes" add constraint "invitation_codes_created_user_id_fkey" FOREIGN KEY (created_user_id) REFERENCES users(user_id) ON DELETE SET NULL not valid;

alter table "public"."invitation_codes" validate constraint "invitation_codes_created_user_id_fkey";

alter table "public"."invitation_codes" add constraint "invitation_codes_invited_to_company_fkey" FOREIGN KEY (invited_to_company) REFERENCES company(company_id) ON DELETE SET NULL not valid;

alter table "public"."invitation_codes" validate constraint "invitation_codes_invited_to_company_fkey";

alter table "public"."invitation_codes" add constraint "invitation_codes_used_by_user_id_fkey" FOREIGN KEY (used_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL not valid;

alter table "public"."invitation_codes" validate constraint "invitation_codes_used_by_user_id_fkey";

alter table "public"."order_company" add constraint "order_company_company_id_fkey" FOREIGN KEY (company_id) REFERENCES company(company_id) not valid;

alter table "public"."order_company" validate constraint "order_company_company_id_fkey";

alter table "public"."order_company" add constraint "order_company_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(order_id) not valid;

alter table "public"."order_company" validate constraint "order_company_order_id_fkey";

alter table "public"."order_pre_assignments" add constraint "order_pre_assignments_company_id_fkey" FOREIGN KEY (company_id) REFERENCES company(company_id) not valid;

alter table "public"."order_pre_assignments" validate constraint "order_pre_assignments_company_id_fkey";

alter table "public"."order_pre_assignments" add constraint "order_pre_assignments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(order_id) not valid;

alter table "public"."order_pre_assignments" validate constraint "order_pre_assignments_order_id_fkey";

alter table "public"."order_pre_assignments" add constraint "order_pre_assignments_product_fkey" FOREIGN KEY (order_id, sequence) REFERENCES order_products(order_id, sequence) not valid;

alter table "public"."order_pre_assignments" validate constraint "order_pre_assignments_product_fkey";

alter table "public"."order_products" add constraint "order_products_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(order_id) not valid;

alter table "public"."order_products" validate constraint "order_products_order_id_fkey";

alter table "public"."order_products_company" add constraint "order_products_company_company_id_fkey" FOREIGN KEY (company_id) REFERENCES company(company_id) not valid;

alter table "public"."order_products_company" validate constraint "order_products_company_company_id_fkey";

alter table "public"."order_products_company" add constraint "order_products_company_order_id_sequence_fkey" FOREIGN KEY (order_id, sequence) REFERENCES order_products(order_id, sequence) not valid;

alter table "public"."order_products_company" validate constraint "order_products_company_order_id_sequence_fkey";

alter table "public"."order_products_company" add constraint "order_products_company_unique_constraint" UNIQUE using index "order_products_company_unique_constraint";

alter table "public"."orders" add constraint "orders_order_status_id_fkey" FOREIGN KEY (order_status_id) REFERENCES order_statuses(order_status_id) not valid;

alter table "public"."orders" validate constraint "orders_order_status_id_fkey";

alter table "public"."users" add constraint "users_company_id_fkey" FOREIGN KEY (company_id) REFERENCES company(company_id) ON DELETE SET NULL not valid;

alter table "public"."users" validate constraint "users_company_id_fkey";

alter table "public"."users" add constraint "users_email_key" UNIQUE using index "users_email_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_company(p_name text, p_email text, p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_company_id integer;
BEGIN
  -- Validate user_id matches auth.uid()
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Invalid user ID';
  END IF;

  -- Insert company
  INSERT INTO public.company (name, email, created_at, status)
  VALUES (p_name, p_email, CURRENT_TIMESTAMP, 'Active')
  RETURNING company_id INTO new_company_id;

  RETURN new_company_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user_signup(p_user_id_text text, p_email character varying, p_firstname character varying, p_lastname character varying, p_invite_code character varying)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_invite_id INTEGER;
  v_invited_to_company INTEGER;
BEGIN
  IF p_user_id_text IS NULL OR p_email IS NULL OR p_invite_code IS NULL THEN
    RAISE EXCEPTION 'Missing required parameters';
  END IF;

  v_user_id := p_user_id_text::UUID;

  SELECT invite_id, invited_to_company
  INTO v_invite_id, v_invited_to_company
  FROM invitation_codes
  WHERE code = p_invite_code
    AND expired = FALSE
    AND used_by_user_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired, or already used invitation code';
  END IF;

  INSERT INTO users (
    user_id,
    email,
    firstname,
    lastname,
    company_id,
    role,
    created_at
  )
  VALUES (
    v_user_id,
    p_email,
    p_firstname,
    p_lastname,
    v_invited_to_company,
    'user'::user_role,
    CURRENT_TIMESTAMP
  );

  UPDATE invitation_codes
  SET used_by_user_id = v_user_id,
      expired = TRUE
  WHERE invite_id = v_invite_id;

  RETURN;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error in handle_new_user_signup: %', SQLERRM;
    RAISE EXCEPTION 'Failed to complete signup: %', SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user_signup(user_id_text text, email_addr text, first_name text, last_name text, invite_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_company_id UUID;
  invite_record RECORD;
  v_user_id UUID; -- Variable to hold the casted UUID
  default_company_name TEXT;
BEGIN
  -- 1. Cast the user ID text to UUID
  BEGIN
    v_user_id := user_id_text::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid UUID format provided for user ID: %', user_id_text;
  END;

  -- 2. Verify the invite code again within the transaction
  SELECT invite_id, code, expired, used_by_user_id
  INTO invite_record
  FROM public.invitation_codes
  WHERE code = invite_code AND expired = false AND used_by_user_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already used invitation code: %', invite_code;
  END IF;

  -- 3. Generate a default company name (e.g., from email or a placeholder)
  -- Option 1: Use part of the email
   -- default_company_name := split_part(email_addr, '@', 1) || '''s Company';
  -- Option 2: Use first name
     default_company_name := first_name || '''s Company';
  -- Option 3: Generic Placeholder
  -- default_company_name := 'New Company (' || v_user_id::text || ')'; -- Example placeholder

  -- 4. Insert into the company table with the default name
  INSERT INTO public.company (name, email)
  VALUES (default_company_name, email_addr)
  RETURNING company_id INTO new_company_id;

  -- 5. Insert into the users table
  INSERT INTO public.users (user_id, firstname, lastname, email, company_id, role)
  VALUES (v_user_id, first_name, last_name, email_addr, new_company_id, 'user');

  -- 6. Update the invitation code to mark it as used
  UPDATE public.invitation_codes
  SET expired = true, used_by_user_id = v_user_id
  WHERE code = invite_code;

END;
$function$
;

grant delete on table "public"."allocation_results" to "anon";

grant insert on table "public"."allocation_results" to "anon";

grant references on table "public"."allocation_results" to "anon";

grant select on table "public"."allocation_results" to "anon";

grant trigger on table "public"."allocation_results" to "anon";

grant truncate on table "public"."allocation_results" to "anon";

grant update on table "public"."allocation_results" to "anon";

grant delete on table "public"."allocation_results" to "authenticated";

grant insert on table "public"."allocation_results" to "authenticated";

grant references on table "public"."allocation_results" to "authenticated";

grant select on table "public"."allocation_results" to "authenticated";

grant trigger on table "public"."allocation_results" to "authenticated";

grant truncate on table "public"."allocation_results" to "authenticated";

grant update on table "public"."allocation_results" to "authenticated";

grant delete on table "public"."allocation_results" to "service_role";

grant insert on table "public"."allocation_results" to "service_role";

grant references on table "public"."allocation_results" to "service_role";

grant select on table "public"."allocation_results" to "service_role";

grant trigger on table "public"."allocation_results" to "service_role";

grant truncate on table "public"."allocation_results" to "service_role";

grant update on table "public"."allocation_results" to "service_role";

grant delete on table "public"."company" to "anon";

grant insert on table "public"."company" to "anon";

grant references on table "public"."company" to "anon";

grant select on table "public"."company" to "anon";

grant trigger on table "public"."company" to "anon";

grant truncate on table "public"."company" to "anon";

grant update on table "public"."company" to "anon";

grant delete on table "public"."company" to "authenticated";

grant insert on table "public"."company" to "authenticated";

grant references on table "public"."company" to "authenticated";

grant select on table "public"."company" to "authenticated";

grant trigger on table "public"."company" to "authenticated";

grant truncate on table "public"."company" to "authenticated";

grant update on table "public"."company" to "authenticated";

grant delete on table "public"."company" to "service_role";

grant insert on table "public"."company" to "service_role";

grant references on table "public"."company" to "service_role";

grant select on table "public"."company" to "service_role";

grant trigger on table "public"."company" to "service_role";

grant truncate on table "public"."company" to "service_role";

grant update on table "public"."company" to "service_role";

grant delete on table "public"."invitation_codes" to "anon";

grant insert on table "public"."invitation_codes" to "anon";

grant references on table "public"."invitation_codes" to "anon";

grant select on table "public"."invitation_codes" to "anon";

grant trigger on table "public"."invitation_codes" to "anon";

grant truncate on table "public"."invitation_codes" to "anon";

grant update on table "public"."invitation_codes" to "anon";

grant delete on table "public"."invitation_codes" to "authenticated";

grant insert on table "public"."invitation_codes" to "authenticated";

grant references on table "public"."invitation_codes" to "authenticated";

grant select on table "public"."invitation_codes" to "authenticated";

grant trigger on table "public"."invitation_codes" to "authenticated";

grant truncate on table "public"."invitation_codes" to "authenticated";

grant update on table "public"."invitation_codes" to "authenticated";

grant delete on table "public"."invitation_codes" to "service_role";

grant insert on table "public"."invitation_codes" to "service_role";

grant references on table "public"."invitation_codes" to "service_role";

grant select on table "public"."invitation_codes" to "service_role";

grant trigger on table "public"."invitation_codes" to "service_role";

grant truncate on table "public"."invitation_codes" to "service_role";

grant update on table "public"."invitation_codes" to "service_role";

grant delete on table "public"."order_company" to "anon";

grant insert on table "public"."order_company" to "anon";

grant references on table "public"."order_company" to "anon";

grant select on table "public"."order_company" to "anon";

grant trigger on table "public"."order_company" to "anon";

grant truncate on table "public"."order_company" to "anon";

grant update on table "public"."order_company" to "anon";

grant delete on table "public"."order_company" to "authenticated";

grant insert on table "public"."order_company" to "authenticated";

grant references on table "public"."order_company" to "authenticated";

grant select on table "public"."order_company" to "authenticated";

grant trigger on table "public"."order_company" to "authenticated";

grant truncate on table "public"."order_company" to "authenticated";

grant update on table "public"."order_company" to "authenticated";

grant delete on table "public"."order_company" to "service_role";

grant insert on table "public"."order_company" to "service_role";

grant references on table "public"."order_company" to "service_role";

grant select on table "public"."order_company" to "service_role";

grant trigger on table "public"."order_company" to "service_role";

grant truncate on table "public"."order_company" to "service_role";

grant update on table "public"."order_company" to "service_role";

grant delete on table "public"."order_pre_assignments" to "anon";

grant insert on table "public"."order_pre_assignments" to "anon";

grant references on table "public"."order_pre_assignments" to "anon";

grant select on table "public"."order_pre_assignments" to "anon";

grant trigger on table "public"."order_pre_assignments" to "anon";

grant truncate on table "public"."order_pre_assignments" to "anon";

grant update on table "public"."order_pre_assignments" to "anon";

grant delete on table "public"."order_pre_assignments" to "authenticated";

grant insert on table "public"."order_pre_assignments" to "authenticated";

grant references on table "public"."order_pre_assignments" to "authenticated";

grant select on table "public"."order_pre_assignments" to "authenticated";

grant trigger on table "public"."order_pre_assignments" to "authenticated";

grant truncate on table "public"."order_pre_assignments" to "authenticated";

grant update on table "public"."order_pre_assignments" to "authenticated";

grant delete on table "public"."order_pre_assignments" to "service_role";

grant insert on table "public"."order_pre_assignments" to "service_role";

grant references on table "public"."order_pre_assignments" to "service_role";

grant select on table "public"."order_pre_assignments" to "service_role";

grant trigger on table "public"."order_pre_assignments" to "service_role";

grant truncate on table "public"."order_pre_assignments" to "service_role";

grant update on table "public"."order_pre_assignments" to "service_role";

grant delete on table "public"."order_products" to "anon";

grant insert on table "public"."order_products" to "anon";

grant references on table "public"."order_products" to "anon";

grant select on table "public"."order_products" to "anon";

grant trigger on table "public"."order_products" to "anon";

grant truncate on table "public"."order_products" to "anon";

grant update on table "public"."order_products" to "anon";

grant delete on table "public"."order_products" to "authenticated";

grant insert on table "public"."order_products" to "authenticated";

grant references on table "public"."order_products" to "authenticated";

grant select on table "public"."order_products" to "authenticated";

grant trigger on table "public"."order_products" to "authenticated";

grant truncate on table "public"."order_products" to "authenticated";

grant update on table "public"."order_products" to "authenticated";

grant delete on table "public"."order_products" to "service_role";

grant insert on table "public"."order_products" to "service_role";

grant references on table "public"."order_products" to "service_role";

grant select on table "public"."order_products" to "service_role";

grant trigger on table "public"."order_products" to "service_role";

grant truncate on table "public"."order_products" to "service_role";

grant update on table "public"."order_products" to "service_role";

grant delete on table "public"."order_products_company" to "anon";

grant insert on table "public"."order_products_company" to "anon";

grant references on table "public"."order_products_company" to "anon";

grant select on table "public"."order_products_company" to "anon";

grant trigger on table "public"."order_products_company" to "anon";

grant truncate on table "public"."order_products_company" to "anon";

grant update on table "public"."order_products_company" to "anon";

grant delete on table "public"."order_products_company" to "authenticated";

grant insert on table "public"."order_products_company" to "authenticated";

grant references on table "public"."order_products_company" to "authenticated";

grant select on table "public"."order_products_company" to "authenticated";

grant trigger on table "public"."order_products_company" to "authenticated";

grant truncate on table "public"."order_products_company" to "authenticated";

grant update on table "public"."order_products_company" to "authenticated";

grant delete on table "public"."order_products_company" to "service_role";

grant insert on table "public"."order_products_company" to "service_role";

grant references on table "public"."order_products_company" to "service_role";

grant select on table "public"."order_products_company" to "service_role";

grant trigger on table "public"."order_products_company" to "service_role";

grant truncate on table "public"."order_products_company" to "service_role";

grant update on table "public"."order_products_company" to "service_role";

grant delete on table "public"."order_statuses" to "anon";

grant insert on table "public"."order_statuses" to "anon";

grant references on table "public"."order_statuses" to "anon";

grant select on table "public"."order_statuses" to "anon";

grant trigger on table "public"."order_statuses" to "anon";

grant truncate on table "public"."order_statuses" to "anon";

grant update on table "public"."order_statuses" to "anon";

grant delete on table "public"."order_statuses" to "authenticated";

grant insert on table "public"."order_statuses" to "authenticated";

grant references on table "public"."order_statuses" to "authenticated";

grant select on table "public"."order_statuses" to "authenticated";

grant trigger on table "public"."order_statuses" to "authenticated";

grant truncate on table "public"."order_statuses" to "authenticated";

grant update on table "public"."order_statuses" to "authenticated";

grant delete on table "public"."order_statuses" to "service_role";

grant insert on table "public"."order_statuses" to "service_role";

grant references on table "public"."order_statuses" to "service_role";

grant select on table "public"."order_statuses" to "service_role";

grant trigger on table "public"."order_statuses" to "service_role";

grant truncate on table "public"."order_statuses" to "service_role";

grant update on table "public"."order_statuses" to "service_role";

grant delete on table "public"."orders" to "anon";

grant insert on table "public"."orders" to "anon";

grant references on table "public"."orders" to "anon";

grant select on table "public"."orders" to "anon";

grant trigger on table "public"."orders" to "anon";

grant truncate on table "public"."orders" to "anon";

grant update on table "public"."orders" to "anon";

grant delete on table "public"."orders" to "authenticated";

grant insert on table "public"."orders" to "authenticated";

grant references on table "public"."orders" to "authenticated";

grant select on table "public"."orders" to "authenticated";

grant trigger on table "public"."orders" to "authenticated";

grant truncate on table "public"."orders" to "authenticated";

grant update on table "public"."orders" to "authenticated";

grant delete on table "public"."orders" to "service_role";

grant insert on table "public"."orders" to "service_role";

grant references on table "public"."orders" to "service_role";

grant select on table "public"."orders" to "service_role";

grant trigger on table "public"."orders" to "service_role";

grant truncate on table "public"."orders" to "service_role";

grant update on table "public"."orders" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";

create policy "company_user_insert"
on "public"."company"
as permissive
for insert
to authenticated
with check (true);


create policy "company_user_select"
on "public"."company"
as permissive
for select
to authenticated
using ((company_id IN ( SELECT users.company_id
   FROM users
  WHERE (users.user_id = auth.uid()))));


create policy "company_user_update"
on "public"."company"
as permissive
for update
to authenticated
using ((company_id IN ( SELECT users.company_id
   FROM users
  WHERE (users.user_id = auth.uid()))));


create policy "Admins have full access to invitation_codes"
on "public"."invitation_codes"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM users
  WHERE (((users.email)::text = auth.email()) AND (users.role = 'admin'::user_role)))))
with check ((EXISTS ( SELECT 1
   FROM users
  WHERE (((users.email)::text = auth.email()) AND (users.role = 'admin'::user_role)))));


create policy "invitation_codes_anon_read"
on "public"."invitation_codes"
as permissive
for select
to anon
using (((expired = false) AND (used_by_user_id IS NULL)));


create policy "invitation_codes_authenticated_read"
on "public"."invitation_codes"
as permissive
for select
to authenticated
using ((used_by_user_id = auth.uid()));


create policy "invitation_codes_rpc_update"
on "public"."invitation_codes"
as permissive
for update
to authenticated
using (true);


create policy "invite_codes_user_insert"
on "public"."invitation_codes"
as permissive
for insert
to authenticated
with check ((used_by_user_id = auth.uid()));


create policy "Admins have full access to order_company"
on "public"."order_company"
as permissive
for select
to authenticated
using ((( SELECT users.role
   FROM users
  WHERE ((users.email)::text = auth.email())) = 'admin'::user_role));


create policy "Users can manage their own investments"
on "public"."order_company"
as permissive
for all
to authenticated
using ((company_id = ( SELECT users.company_id
   FROM users
  WHERE ((users.email)::text = auth.email()))));


create policy "Users can view own order_company records"
on "public"."order_company"
as permissive
for select
to authenticated
using ((company_id = ( SELECT users.company_id
   FROM users
  WHERE ((users.email)::text = auth.email()))));


create policy "company_user_insert"
on "public"."order_company"
as permissive
for insert
to authenticated
with check ((company_id IN ( SELECT users.company_id
   FROM users
  WHERE (users.user_id = auth.uid()))));


create policy "company_user_read"
on "public"."order_company"
as permissive
for select
to authenticated
using ((company_id IN ( SELECT users.company_id
   FROM users
  WHERE (users.user_id = auth.uid()))));


create policy "company_user_update"
on "public"."order_company"
as permissive
for update
to authenticated
using ((company_id IN ( SELECT users.company_id
   FROM users
  WHERE (users.user_id = auth.uid()))));


create policy "Admins have full access to order_pre_assignments"
on "public"."order_pre_assignments"
as permissive
for all
to authenticated
using ((( SELECT users.role
   FROM users
  WHERE ((users.email)::text = auth.email())) = 'admin'::user_role));


create policy "Admins have full access to order_products"
on "public"."order_products"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM users
  WHERE (((users.email)::text = auth.email()) AND (users.role = 'admin'::user_role)))))
with check ((EXISTS ( SELECT 1
   FROM users
  WHERE (((users.email)::text = auth.email()) AND (users.role = 'admin'::user_role)))));


create policy "Enable read access for all users"
on "public"."order_products"
as permissive
for select
to authenticated
using (true);


create policy "Allow full access for service_role on order_products_company"
on "public"."order_products_company"
as permissive
for all
to service_role
using (true)
with check (true);


create policy "SET ungated value"
on "public"."order_products_company"
as permissive
for all
to authenticated
using ((auth.email() = (( SELECT users.email
   FROM users
  WHERE (users.company_id = order_products_company.company_id)))::text));


create policy "Users can view own order products company records"
on "public"."order_products_company"
as permissive
for select
to authenticated
using ((company_id = ( SELECT users.company_id
   FROM users
  WHERE ((users.email)::text = auth.email()))));


create policy "Admins can read order_statuses"
on "public"."order_statuses"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM users
  WHERE (((users.email)::text = auth.email()) AND (users.role = 'admin'::user_role)))));


create policy "Enable read access for all users"
on "public"."order_statuses"
as permissive
for select
to authenticated
using (true);


create policy "Admins have full access to orders"
on "public"."orders"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM users
  WHERE (((users.email)::text = auth.email()) AND (users.role = 'admin'::user_role)))));


create policy "Allow full access to service_role"
on "public"."orders"
as permissive
for all
to service_role
using (true)
with check (true);


create policy "Users can view company orders and unassigned orders"
on "public"."orders"
as permissive
for select
to authenticated
using (((order_id IN ( SELECT oc.order_id
   FROM order_company oc
  WHERE (oc.company_id = ( SELECT u.company_id
           FROM users u
          WHERE ((u.email)::text = auth.email()))))) OR (NOT (EXISTS ( SELECT 1
   FROM order_company oc
  WHERE (oc.order_id = orders.order_id))))));


create policy "Users can read own info"
on "public"."users"
as permissive
for select
to authenticated
using (((email)::text = auth.email()));


create policy "users_rpc_insert"
on "public"."users"
as permissive
for insert
to authenticated
with check (true);


create policy "users_self_read"
on "public"."users"
as permissive
for select
to authenticated
using ((user_id = auth.uid()));


create policy "users_self_update"
on "public"."users"
as permissive
for update
to authenticated
using ((user_id = auth.uid()));