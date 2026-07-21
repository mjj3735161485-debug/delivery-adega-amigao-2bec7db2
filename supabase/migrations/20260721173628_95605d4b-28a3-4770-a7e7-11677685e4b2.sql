CREATE OR REPLACE FUNCTION public.admin_courier_deliveries_range(_courier_id uuid, _from date, _to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  SELECT coalesce(jsonb_agg(row_to_json(r) ORDER BY r.delivered_at), '[]'::jsonb) INTO v FROM (
    SELECT o.numero, o.cliente_nome, o.bairro, o.taxa_entrega, o.total, o.subtotal,
           o.pagamento, o.troco_para, o.observacoes,
           o.delivered_at, o.tipo_entrega
    FROM public.orders o
    WHERE o.courier_id = _courier_id
      AND o.delivered_at >= _from::timestamptz
      AND o.delivered_at < (_to + 1)::timestamptz
    ORDER BY o.delivered_at
  ) r;
  RETURN v;
END $function$;

REVOKE ALL ON FUNCTION public.admin_courier_deliveries_range(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_courier_deliveries_range(uuid, date, date) TO authenticated;