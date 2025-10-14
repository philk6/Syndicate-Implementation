-- make sure order_id is nullable
alter table credit_transactions
  alter column order_id drop not null;

-- drop old FK and re-create with ON DELETE SET NULL
alter table credit_transactions
  drop constraint if exists credit_transactions_order_id_fkey;

alter table credit_transactions
  add constraint credit_transactions_order_id_fkey
  foreign key (order_id) references orders(order_id) on delete set null;
