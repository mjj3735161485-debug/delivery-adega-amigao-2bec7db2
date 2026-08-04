-- Trigger-only functions: no API access at all
REVOKE ALL ON FUNCTION public._credit_cashback_on_delivered() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public._log_stock_change() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public._start_next_route_after_delivery() FROM anon, authenticated;

-- Admin-only functions: signed-in only (in-function has_role checks remain)
REVOKE ALL ON FUNCTION public.admin_courier_deliveries_range(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_users(text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.admin_register_courier(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_courier_ativo(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_role(uuid, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.auto_advance_pickup_orders(integer) FROM anon;

-- Courier/staff functions: signed-in only
REVOKE ALL ON FUNCTION public.accept_order(integer) FROM anon;
REVOKE ALL ON FUNCTION public.mark_delivered(integer) FROM anon;
REVOKE ALL ON FUNCTION public.start_route_to_customer(integer) FROM anon;
REVOKE ALL ON FUNCTION public.update_courier_presence(boolean, double precision, double precision) FROM anon;
REVOKE ALL ON FUNCTION public.self_register_staff(text, text, text) FROM anon;

-- Customer account function: signed-in only
REVOKE ALL ON FUNCTION public.get_my_cashback_balance() FROM anon;