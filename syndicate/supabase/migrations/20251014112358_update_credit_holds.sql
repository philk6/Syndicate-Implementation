-- only if such FK exists
alter table credit_holds
  alter column order_id drop not null;

alter table credit_holds
  drop constraint if exists credit_holds_order_id_fkey;

alter table credit_holds
  add constraint credit_holds_order_id_fkey
  foreign key (order_id) references orders(order_id) on delete set null;
