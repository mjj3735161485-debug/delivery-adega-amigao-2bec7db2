DROP POLICY IF EXISTS "codex-catalog-temp-insert-20260804" ON storage.objects;

REVOKE ALL ON FUNCTION public._log_stock_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._log_stock_change() FROM anon, authenticated;