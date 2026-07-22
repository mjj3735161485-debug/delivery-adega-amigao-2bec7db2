
-- 1. threshold per product
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS estoque_alerta_min integer;

-- 2. stock_movements table
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('entrada','saida','ajuste','pedido')),
  delta integer NOT NULL,
  estoque_antes integer,
  estoque_depois integer,
  motivo text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read stock movements"
  ON public.stock_movements FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert stock movements"
  ON public.stock_movements FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created
  ON public.stock_movements(product_id, created_at DESC);

-- 3. trigger to auto-log when products.estoque changes directly
CREATE OR REPLACE FUNCTION public._log_stock_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta integer;
  v_tipo text;
BEGIN
  IF NEW.estoque IS DISTINCT FROM OLD.estoque
     AND NEW.estoque IS NOT NULL AND OLD.estoque IS NOT NULL THEN
    v_delta := NEW.estoque - OLD.estoque;
    IF v_delta = 0 THEN RETURN NEW; END IF;
    -- Skip if adjustment came through adjust_stock (which sets a session flag via NEW._skip_log — not possible here)
    -- Instead, we tag via GUC
    IF current_setting('app.skip_stock_log', true) = 'on' THEN
      RETURN NEW;
    END IF;
    v_tipo := CASE WHEN v_delta > 0 THEN 'entrada'
                   WHEN v_delta < 0 THEN 'saida'
                   ELSE 'ajuste' END;
    INSERT INTO public.stock_movements(product_id, tipo, delta, estoque_antes, estoque_depois, motivo, created_by)
    VALUES (NEW.id, v_tipo, v_delta, OLD.estoque, NEW.estoque,
            'Alteração direta', auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_stock_change ON public.products;
CREATE TRIGGER trg_log_stock_change
  AFTER UPDATE OF estoque ON public.products
  FOR EACH ROW EXECUTE FUNCTION public._log_stock_change();

-- 4. adjust_stock: single product ajuste with motivo
CREATE OR REPLACE FUNCTION public.adjust_stock(
  _product_id uuid,
  _tipo text,          -- 'entrada' | 'saida' | 'ajuste'
  _quantidade integer, -- always positive
  _motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod public.products%ROWTYPE;
  v_delta integer;
  v_novo integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  IF _tipo NOT IN ('entrada','saida','ajuste') THEN
    RAISE EXCEPTION 'Tipo inválido';
  END IF;
  IF _quantidade IS NULL OR _quantidade < 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;

  SELECT * INTO v_prod FROM public.products WHERE id = _product_id FOR UPDATE;
  IF v_prod.id IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  IF _tipo = 'entrada' THEN
    v_delta := _quantidade;
    v_novo := COALESCE(v_prod.estoque, 0) + _quantidade;
  ELSIF _tipo = 'saida' THEN
    v_delta := -_quantidade;
    v_novo := GREATEST(COALESCE(v_prod.estoque, 0) - _quantidade, 0);
  ELSE -- ajuste: _quantidade é o valor absoluto novo
    v_novo := _quantidade;
    v_delta := v_novo - COALESCE(v_prod.estoque, 0);
  END IF;

  PERFORM set_config('app.skip_stock_log', 'on', true);
  UPDATE public.products SET estoque = v_novo WHERE id = _product_id;
  PERFORM set_config('app.skip_stock_log', 'off', true);

  INSERT INTO public.stock_movements(product_id, tipo, delta, estoque_antes, estoque_depois, motivo, created_by)
  VALUES (_product_id, _tipo, v_delta, v_prod.estoque, v_novo, NULLIF(trim(coalesce(_motivo,'')), ''), auth.uid());

  RETURN jsonb_build_object('ok', true, 'estoque', v_novo);
END $$;

REVOKE EXECUTE ON FUNCTION public.adjust_stock(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, text, integer, text) TO authenticated;

-- 5. bulk_adjust_stock: array de {product_id, tipo, quantidade}
CREATE OR REPLACE FUNCTION public.bulk_adjust_stock(_items jsonb, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it jsonb;
  v_count int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    PERFORM public.adjust_stock(
      (it->>'product_id')::uuid,
      it->>'tipo',
      (it->>'quantidade')::int,
      _motivo
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'count', v_count);
END $$;

REVOKE EXECUTE ON FUNCTION public.bulk_adjust_stock(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_adjust_stock(jsonb, text) TO authenticated;

-- 6. list_stock_movements
CREATE OR REPLACE FUNCTION public.list_stock_movements(_product_id uuid, _limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  SELECT coalesce(jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC), '[]'::jsonb) INTO v FROM (
    SELECT id, tipo, delta, estoque_antes, estoque_depois, motivo, created_at, created_by
    FROM public.stock_movements
    WHERE product_id = _product_id
    ORDER BY created_at DESC
    LIMIT greatest(1, least(coalesce(_limit, 100), 500))
  ) r;
  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.list_stock_movements(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_stock_movements(uuid, integer) TO authenticated;

-- 7. list_low_stock: produtos abaixo do limite configurável (fallback global via _default)
CREATE OR REPLACE FUNCTION public.list_low_stock(_default_min integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  SELECT coalesce(jsonb_agg(row_to_json(r) ORDER BY r.estoque ASC), '[]'::jsonb) INTO v FROM (
    SELECT p.id, p.nome, p.estoque, coalesce(p.estoque_alerta_min, _default_min) AS limite,
           p.disponivel
    FROM public.products p
    WHERE p.estoque IS NOT NULL
      AND p.estoque <= coalesce(p.estoque_alerta_min, _default_min)
    ORDER BY p.estoque ASC
  ) r;
  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.list_low_stock(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_low_stock(integer) TO authenticated;
