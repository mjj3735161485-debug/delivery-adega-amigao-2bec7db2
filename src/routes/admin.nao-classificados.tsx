import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, EyeOff, Sparkles, Trash2, X, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { scoreProduct, type Suggestion } from "@/lib/classify-score";
import { useEffect } from "react";

export const Route = createFileRoute("/admin/nao-classificados")({
  component: NaoClassificados,
  head: () => ({
    meta: [
      { title: "Revisar categorias — Adega Amigão" },
      { name: "description", content: "Produtos que caíram no fallback para realocação manual." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

// Categoria "Alimentos" = fallback usado pela classificação automática
const FALLBACK_CATEGORY_ID = "3a78d33f-daba-438a-b7e5-30df87c5301c";
const PAGE_SIZE = 50;
const STORAGE_KEY = "amigao.classify.thresholds";

type Category = { id: string; nome: string; ordem: number };
type Product = {
  id: string;
  category_id: string | null;
  nome: string;
  preco: number;
  imagem_url: string | null;
  disponivel: boolean;
};

type ScoredItem = {
  product: Product;
  suggestion: Suggestion | null;
  origin: "fallback" | "review";
  currentName?: string; // categoria atual quando origin === "review"
};

function NaoClassificados() {
  const { ready, isAdmin } = useAdminGuard();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(0);
  const [showFrom, setShowFrom] = useState(40); // %
  const [autoFrom, setAutoFrom] = useState(85); // %
  const [hideAutoReady, setHideAutoReady] = useState(false);
  const [reviewCopaoCombos, setReviewCopaoCombos] = useState(false);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Carrega/salva preferências do slider
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { showFrom?: number; autoFrom?: number; reviewCopaoCombos?: boolean };
        if (typeof p.showFrom === "number") setShowFrom(p.showFrom);
        if (typeof p.autoFrom === "number") setAutoFrom(p.autoFrom);
        if (typeof p.reviewCopaoCombos === "boolean") setReviewCopaoCombos(p.reviewCopaoCombos);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ showFrom, autoFrom, reviewCopaoCombos })); } catch { /* ignore */ }
  }, [showFrom, autoFrom, reviewCopaoCombos]);

  const { data: categories = [] } = useQuery({
    queryKey: ["admin", "categories"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id,nome,ordem").order("nome");
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["admin", "products", "fallback"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,category_id,nome,preco,imagem_url,disponivel")
        .eq("category_id", FALLBACK_CATEGORY_ID)
        .order("nome");
      if (error) throw error;
      return data as Product[];
    },
  });

  // Amostras (até 200 nomes) por categoria (exceto fallback) para o Jaccard
  const { data: samples } = useQuery({
    queryKey: ["admin", "category-samples", categories.map((c) => c.id).join(",")],
    enabled: ready && isAdmin && categories.length > 0,
    queryFn: async () => {
      const map = new Map<string, string[]>();
      const targets = categories.filter((c) => c.id !== FALLBACK_CATEGORY_ID);
      await Promise.all(
        targets.map(async (c) => {
          const { data, error } = await supabase
            .from("products")
            .select("nome")
            .eq("category_id", c.id)
            .limit(200);
          if (!error && data) map.set(c.id, data.map((r) => r.nome));
        }),
      );
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  const samplesMap = samples ?? new Map<string, string[]>();

  // IDs das categorias Copão e Combos (para revisão cruzada)
  const copaoCombosIds = useMemo(() => {
    return categories
      .filter((c) => {
        const n = c.nome.toLowerCase();
        return n === "copão" || n === "copao" || n === "combos";
      })
      .map((c) => c.id);
  }, [categories]);

  const catNameById = useMemo(() => {
    const ids: string[] = [];
    void ids;
    return new Map(categories.map((c) => [c.id, c.nome]));
  }, [categories]);

  const { data: reviewProducts = [] } = useQuery({
    queryKey: ["admin", "products", "copao-combos", copaoCombosIds.join(",")],
    enabled: ready && isAdmin && reviewCopaoCombos && copaoCombosIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,category_id,nome,preco,imagem_url,disponivel")
        .in("category_id", copaoCombosIds)
        .order("nome");
      if (error) throw error;
      return data as Product[];
    },
  });

  // Calcula sugestões para todos os produtos
  const scored = useMemo<ScoredItem[]>(() => {
    const targets = categories.filter((c) => c.id !== FALLBACK_CATEGORY_ID);
    const fallbackItems: ScoredItem[] = products.map((p) => ({
      product: p,
      suggestion: scoreProduct(p.nome, targets, samplesMap, FALLBACK_CATEGORY_ID),
      origin: "fallback" as const,
    }));
    if (!reviewCopaoCombos || copaoCombosIds.length === 0) return fallbackItems;

    const catById = new Map(categories.map((c) => [c.id, c.nome]));
    const reviewItems: ScoredItem[] = [];
    for (const p of reviewProducts) {
      const current = p.category_id;
      const sug = scoreProduct(p.nome, targets, samplesMap, current);
      // Só interessa quando a melhor sugestão é a outra categoria do par Copão/Combos
      if (!sug) continue;
      if (!copaoCombosIds.includes(sug.category_id)) continue;
      if (sug.category_id === current) continue;
      reviewItems.push({
        product: p,
        suggestion: sug,
        origin: "review",
        currentName: current ? catById.get(current) : undefined,
      });
    }
    return [...fallbackItems, ...reviewItems];
  }, [products, categories, samplesMap, reviewCopaoCombos, reviewProducts, copaoCombosIds]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const thresh = showFrom / 100;
    const autoThresh = autoFrom / 100;
    return scored.filter(({ product, suggestion }) => {
      if (ignored.has(product.id)) return false;
      if (q && !product.nome.toLowerCase().includes(q)) return false;
      const hasSug = suggestion && suggestion.score >= thresh;
      // Sempre exibe se não passar do "mostrar"? Sim, mostramos todos com badge "Sem sugestão"
      // Se hideAutoReady, escondemos os que já estão prontos para auto
      if (hideAutoReady && suggestion && suggestion.score >= autoThresh) return false;
      if (showFrom > 0 && suggestion && suggestion.score < thresh && showFrom >= 100) return false;
      // Nada a fazer aqui — retornamos true; hasSug só é usado para badge/ordenação
      void hasSug;
      return true;
    })
    .sort((a, b) => (b.suggestion?.score ?? 0) - (a.suggestion?.score ?? 0));
  }, [scored, busca, showFrom, autoFrom, hideAutoReady, ignored]);

  const autoReady = useMemo(
    () => scored.filter(({ product, suggestion }) =>
      !ignored.has(product.id) &&
      suggestion && suggestion.score >= autoFrom / 100,
    ),
    [scored, autoFrom, ignored],
  );

  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  async function setCategory(p: Product, category_id: string) {
    const { error } = await supabase.from("products").update({ category_id }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Categoria atualizada");
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    qc.invalidateQueries({ queryKey: ["admin", "products", "fallback"] });
    qc.invalidateQueries({ queryKey: ["admin", "products", "copao-combos"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function bulkApply(entries: { id: string; category_id: string }[]) {
    if (entries.length === 0) return;
    setBusy(true);
    try {
      // Agrupa por category_id e faz update em lote com .in()
      const groups = new Map<string, string[]>();
      for (const e of entries) {
        const arr = groups.get(e.category_id) ?? [];
        arr.push(e.id);
        groups.set(e.category_id, arr);
      }
      let ok = 0;
      for (const [cat, ids] of groups.entries()) {
        const { error } = await supabase.from("products").update({ category_id: cat }).in("id", ids);
        if (error) {
          toast.error(`Falha em ${ids.length} itens: ${error.message}`);
        } else {
          ok += ids.length;
        }
      }
      if (ok > 0) toast.success(`${ok} produto(s) reclassificado(s)`);
      qc.invalidateQueries({ queryKey: ["admin", "products", "fallback"] });
      qc.invalidateQueries({ queryKey: ["admin", "products", "copao-combos"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } finally {
      setBusy(false);
    }
  }

  async function autoClassify() {
    const entries = autoReady
      .filter((x) => x.suggestion)
      .map((x) => ({ id: x.product.id, category_id: x.suggestion!.category_id }));
    if (entries.length === 0) {
      toast.info("Nenhum produto acima do limiar automático.");
      return;
    }
    // Resumo por categoria para confirmação
    const summary = new Map<string, number>();
    for (const e of autoReady) {
      if (!e.suggestion) continue;
      summary.set(e.suggestion.category_name, (summary.get(e.suggestion.category_name) ?? 0) + 1);
    }
    const detail = Array.from(summary.entries()).map(([n, c]) => `${n}: ${c}`).join("\n");
    if (!window.confirm(`Reclassificar ${entries.length} produto(s)?\n\n${detail}`)) return;
    await bulkApply(entries);
  }

  async function acceptAllVisible() {
    const entries = filtered
      .filter(({ suggestion }) => suggestion && suggestion.score >= showFrom / 100)
      .map(({ product, suggestion }) => ({ id: product.id, category_id: suggestion!.category_id }));
    if (entries.length === 0) return toast.info("Nenhuma sugestão visível para aceitar.");
    if (!window.confirm(`Aceitar sugestão de ${entries.length} produto(s) visíveis?`)) return;
    await bulkApply(entries);
  }

  async function ocultar(p: Product) {
    const { error } = await supabase.from("products").update({ disponivel: false }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produto ocultado");
    qc.invalidateQueries({ queryKey: ["admin", "products", "fallback"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function excluir(p: Product) {
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produto excluído");
    qc.invalidateQueries({ queryKey: ["admin", "products", "fallback"] });
    qc.invalidateQueries({ queryKey: ["admin", "products", "copao-combos"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  function badgeForScore(s: Suggestion | null): { label: string; className: string } {
    if (!s) return { label: "Sem sugestão", className: "bg-muted text-muted-foreground" };
    const pct = Math.round(s.score * 100);
    const label = `${s.category_name} · ${pct}%`;
    if (s.score >= autoFrom / 100) return { label, className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" };
    if (s.score >= showFrom / 100) return { label, className: "bg-amber-500/15 text-amber-500 border-amber-500/30" };
    return { label, className: "bg-muted text-muted-foreground" };
  }

  if (!ready) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!isAdmin) return <div className="p-8 text-center">Sem permissão de admin.</div>;

  return (
    <div className="min-h-screen">
      <AdminNav title="Revisar categorias" />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 space-y-2">
          <div>
            <h1 className="font-display text-2xl font-bold">Produtos para revisar</h1>
            <p className="text-sm text-muted-foreground">
              Estes produtos caíram no fallback <strong>Alimentos</strong> por não baterem com nenhuma
              regra automática. Escolha a categoria correta ou oculte do site.
            </p>
          </div>

          {/* Controles de confiança */}
          <div className="rounded-xl border border-border p-4 grid gap-4 md:grid-cols-2 bg-card/40">
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Mostrar sugestões a partir de
                </span>
                <span className="text-muted-foreground">{showFrom}%</span>
              </div>
              <Slider
                value={[showFrom]}
                min={0}
                max={100}
                step={5}
                onValueChange={(v) => setShowFrom(v[0] ?? 40)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Abaixo disso, o produto continua listado com badge cinza.
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-emerald-500" />
                  Auto-classificar acima de
                </span>
                <span className="text-muted-foreground">{autoFrom}%</span>
              </div>
              <Slider
                value={[autoFrom]}
                min={50}
                max={100}
                step={5}
                onValueChange={(v) => setAutoFrom(Math.max(v[0] ?? 85, showFrom))}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Corte para o botão de reclassificação em lote.
              </p>
            </div>
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <Switch checked={hideAutoReady} onCheckedChange={setHideAutoReady} />
                Ocultar já elegíveis para auto
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <Switch checked={reviewCopaoCombos} onCheckedChange={setReviewCopaoCombos} />
                Incluir revisão Copão ↔ Combos
              </label>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={acceptAllVisible}
                  disabled={busy || filtered.length === 0}
                >
                  Aceitar visíveis
                </Button>
                <Button
                  size="sm"
                  onClick={autoClassify}
                  disabled={busy || autoReady.length === 0}
                  className="gap-1"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Auto-classificar {autoReady.length}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por nome..."
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPage(0); }}
              className="max-w-sm"
            />
            <p className="text-sm text-muted-foreground ml-auto">
              {filtered.length} de {products.length}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          {pageItems.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhum produto para revisar 🎉
            </div>
          ) : (
            pageItems.map(({ product: p, suggestion, origin, currentName }) => {
              const badge = badgeForScore(suggestion);
              return (
              <div
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 hover:bg-muted/30"
              >
                <div className="h-10 w-10 shrink-0 rounded bg-muted overflow-hidden">
                  {p.imagem_url && (
                    <img src={p.imagem_url} alt={p.nome} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px] py-0 h-4 border-border text-muted-foreground">
                      {(p.category_id ? catNameById.get(p.category_id) : null) ?? "Sem categoria"}
                    </Badge>
                    {origin === "review" && currentName && (
                      <Badge variant="outline" className="text-[10px] py-0 h-4 border-sky-500/30 bg-sky-500/10 text-sky-500">
                        {currentName} →
                      </Badge>
                    )}
                    <Badge variant="outline" className={badge.className + " text-[10px] py-0 h-4"}>
                      {badge.label}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {brl(Number(p.preco))} · {p.disponivel ? "disponível" : "oculto"}
                    </span>
                  </div>
                </div>
                {suggestion && suggestion.score >= showFrom / 100 && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-9 gap-1"
                      onClick={() => setCategory(p, suggestion.category_id)}
                      title={`Mover para ${suggestion.category_name}`}
                    >
                      <Check className="h-4 w-4" /> Aceitar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 px-2"
                      onClick={() => setIgnored((s) => new Set(s).add(p.id))}
                      title="Ignorar sugestão"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Select value="" onValueChange={(v) => setCategory(p, v)}>
                  <SelectTrigger className="w-44 h-9">
                    <SelectValue placeholder="Mover para..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories
                      .filter((c) => c.id !== FALLBACK_CATEGORY_ID)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 px-2 text-muted-foreground"
                  onClick={() => ocultar(p)}
                  title="Ocultar do site"
                >
                  <EyeOff className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 px-2 text-destructive hover:text-destructive"
                  onClick={() => excluir(p)}
                  title="Excluir produto"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              );
            })
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Anterior
            </Button>
            <p className="text-sm text-muted-foreground">
              Página {page + 1} de {totalPages}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Próxima
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}