import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Star, StarOff, Eye, EyeOff, Upload, Loader2, Search, AlertTriangle, History, PackagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { brl } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/produtos")({
  component: AdminProdutos,
  head: () => ({
    meta: [
      { title: "Produtos — Adega Amigão" },
      { name: "description", content: "Gerencie o catálogo de produtos da Adega Amigão." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Category = { id: string; nome: string; slug: string; ordem: number };
type Product = {
  id: string;
  category_id: string | null;
  nome: string;
  descricao: string | null;
  preco: number;
  imagem_url: string | null;
  disponivel: boolean;
  destaque: boolean;
  ordem: number;
  estoque: number | null;
  estoque_alerta_min: number | null;
};

type FormState = {
  id?: string;
  nome: string;
  descricao: string;
  preco: string;
  imagem_url: string;
  category_id: string;
  disponivel: boolean;
  destaque: boolean;
  estoque: string;
  estoque_alerta_min: string;
};

const empty: FormState = {
  nome: "", descricao: "", preco: "", imagem_url: "",
  category_id: "", disponivel: true, destaque: false, estoque: "",
  estoque_alerta_min: "",
};

type Movement = {
  id: string;
  tipo: string;
  delta: number;
  estoque_antes: number | null;
  estoque_depois: number | null;
  motivo: string | null;
  created_at: string;
};

const DEFAULT_ALERT_MIN = 5;

function normalizeSearch(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function AdminProdutos() {
  const { ready, isAdmin } = useAdminGuard();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTipo, setBulkTipo] = useState<"entrada" | "saida" | "ajuste">("entrada");
  const [bulkQtd, setBulkQtd] = useState("");
  const [bulkMotivo, setBulkMotivo] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [histProduct, setHistProduct] = useState<Product | null>(null);
  const [showLowOnly, setShowLowOnly] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["admin", "categories"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("ordem");
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["admin", "products"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("destaque", { ascending: false })
        .order("nome");
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: lowStock = [] } = useQuery({
    queryKey: ["admin", "low-stock"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_low_stock", { _default_min: DEFAULT_ALERT_MIN });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["admin", "stock-movements", histProduct?.id],
    enabled: !!histProduct,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_stock_movements", {
        _product_id: histProduct!.id, _limit: 100,
      });
      if (error) throw error;
      return (data as Movement[]) ?? [];
    },
  });

  function edit(p: Product) {
    setForm({
      id: p.id, nome: p.nome, descricao: p.descricao ?? "",
      preco: String(p.preco), imagem_url: p.imagem_url ?? "",
      category_id: p.category_id ?? "", disponivel: p.disponivel, destaque: p.destaque,
      estoque: p.estoque == null ? "" : String(p.estoque),
      estoque_alerta_min: p.estoque_alerta_min == null ? "" : String(p.estoque_alerta_min),
    });
    setOpen(true);
  }
  function novo() { setForm(empty); setOpen(true); }

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data, error: urlErr } = await supabase.storage
        .from("product-images")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (urlErr) throw urlErr;
      setForm((f) => ({ ...f, imagem_url: data.signedUrl }));
      toast.success("Imagem carregada");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao enviar imagem");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form.nome.trim() || !form.preco) {
      toast.error("Nome e preço são obrigatórios"); return;
    }
    const payload = {
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      preco: Number(form.preco.replace(",", ".")),
      imagem_url: form.imagem_url.trim() || null,
      category_id: form.category_id || null,
      disponivel: form.disponivel,
      destaque: form.destaque,
      estoque: form.estoque.trim() === "" ? null : Math.max(0, Math.floor(Number(form.estoque))),
      estoque_alerta_min: form.estoque_alerta_min.trim() === "" ? null : Math.max(0, Math.floor(Number(form.estoque_alerta_min))),
    };
    const { error } = form.id
      ? await supabase.from("products").update(payload).eq("id", form.id)
      : await supabase.from("products").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Produto atualizado" : "Produto criado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    qc.invalidateQueries({ queryKey: ["admin", "low-stock"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function toggle(p: Product, field: "disponivel" | "destaque") {
    const patch = field === "disponivel"
      ? { disponivel: !p.disponivel }
      : { destaque: !p.destaque };
    const { error } = await supabase.from("products").update(patch).eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function remove(p: Product) {
    if (!confirm(`Excluir "${p.nome}"?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produto excluído");
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    qc.invalidateQueries({ queryKey: ["admin", "low-stock"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function runBulk() {
    const qty = Math.floor(Number(bulkQtd));
    if (!Number.isFinite(qty) || qty < 0) return toast.error("Quantidade inválida");
    if (selected.size === 0) return toast.error("Selecione produtos");
    setBulkSaving(true);
    try {
      const items = Array.from(selected).map((product_id) => ({
        product_id, tipo: bulkTipo, quantidade: qty,
      }));
      const { error } = await supabase.rpc("bulk_adjust_stock", {
        _items: items as any, _motivo: bulkMotivo || null,
      });
      if (error) throw error;
      toast.success(`${selected.size} produto(s) atualizados`);
      setBulkOpen(false); setSelected(new Set()); setBulkQtd(""); setBulkMotivo("");
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["admin", "low-stock"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao ajustar");
    } finally {
      setBulkSaving(false);
    }
  }

  function openHistory(p: Product) {
    setHistProduct(p);
    setHistOpen(true);
  }

  if (!ready) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!isAdmin) return <div className="p-8 text-center">Sem permissão de admin.</div>;

  const lowIds = new Set((lowStock as any[]).map((l) => l.id));
  const filtered = products
    .filter((p) => normalizeSearch(p.nome).includes(normalizeSearch(search)))
    .filter((p) => (showLowOnly ? lowIds.has(p.id) : true));

  return (
    <div className="min-h-screen">
      <AdminNav title="Produtos" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {lowStock.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-200 text-sm">
                {lowStock.length} produto(s) com estoque baixo
              </p>
              <p className="text-xs text-amber-100/80 mt-0.5">
                Limite padrão: {DEFAULT_ALERT_MIN} un. (personalize por produto na edição).
              </p>
            </div>
            <Button size="sm" variant="outline" className="border-amber-400/60 text-amber-200"
              onClick={() => setShowLowOnly((v) => !v)}>
              {showLowOnly ? "Ver todos" : "Ver apenas baixos"}
            </Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center mb-4">
          <p className="text-sm text-muted-foreground">{filtered.length} de {products.length} produtos</p>
          <div className="flex gap-2 w-full sm:w-auto">
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            {selected.size > 0 && (
              <Button variant="secondary" onClick={() => setBulkOpen(true)}>
                <PackagePlus className="h-4 w-4 mr-1" /> Estoque ({selected.size})
              </Button>
            )}
            <Button onClick={novo}><Plus className="h-4 w-4 mr-1" /> Novo produto</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => {
            const cat = categories.find((c) => c.id === p.category_id);
            const limite = p.estoque_alerta_min ?? DEFAULT_ALERT_MIN;
            const isLow = p.estoque != null && p.estoque <= limite;
            const isSel = selected.has(p.id);
            return (
              <article key={p.id} className={`rounded-xl bg-card border p-3 flex gap-3 ${isSel ? "border-primary ring-1 ring-primary" : isLow ? "border-amber-500/50" : "border-border"}`}>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  checked={isSel}
                  onChange={() => toggleSelect(p.id)}
                />
                <div className="h-20 w-20 shrink-0 rounded-lg bg-muted overflow-hidden">
                  {p.imagem_url && (
                    <img src={p.imagem_url} alt={p.nome} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">{cat?.nome ?? "sem categoria"}</p>
                      {p.estoque != null && (
                        <p className={`text-xs mt-0.5 font-medium ${p.estoque <= 0 ? "text-destructive" : isLow ? "text-amber-500" : "text-emerald-500"}`}>
                          {p.estoque <= 0 ? "Sem estoque" : `Estoque: ${p.estoque}`}{isLow && p.estoque > 0 ? ` (≤${limite})` : ""}
                        </p>
                      )}
                    </div>
                    <p className="font-display font-bold text-primary">{brl(Number(p.preco))}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => toggle(p, "disponivel")}>
                      {p.disponivel ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => toggle(p, "destaque")}>
                      {p.destaque ? <Star className="h-3.5 w-3.5 text-primary" /> : <StarOff className="h-3.5 w-3.5 text-muted-foreground" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openHistory(p)} title="Histórico de estoque">
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => edit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => remove(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Preço (R$)</Label>
                <Input inputMode="decimal" value={form.preco}
                  onChange={(e) => setForm({ ...form, preco: e.target.value })} />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Estoque (unidades)</Label>
              <Input
                inputMode="numeric"
                placeholder="Deixe vazio para não controlar"
                value={form.estoque}
                onChange={(e) => setForm({ ...form, estoque: e.target.value.replace(/[^\d]/g, "") })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ao chegar em 0, o produto é desativado. Ao adicionar unidades, volta a ficar disponível.
              </p>
            </div>
            <div>
              <Label>Alerta de estoque baixo (unidades)</Label>
              <Input
                inputMode="numeric"
                placeholder={`Padrão: ${DEFAULT_ALERT_MIN}`}
                value={form.estoque_alerta_min}
                onChange={(e) => setForm({ ...form, estoque_alerta_min: e.target.value.replace(/[^\d]/g, "") })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Aparece um aviso quando o estoque ficar ≤ este valor.
              </p>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div>
              <Label>URL da imagem</Label>
              <div className="flex gap-2">
                <Input placeholder="https://... ou carregue abaixo" value={form.imagem_url}
                  onChange={(e) => setForm({ ...form, imagem_url: e.target.value })} />
                <Button type="button" variant="outline" disabled={uploading}
                  onClick={() => document.getElementById("product-image-file")?.click()}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span className="ml-1">Carregar</span>
                </Button>
                <input
                  id="product-image-file"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </div>
              {form.imagem_url && (
                <div className="mt-2 h-24 w-24 rounded-lg overflow-hidden bg-muted">
                  <img src={form.imagem_url} alt="Prévia" className="h-full w-full object-cover" />
                </div>
              )}
            </div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.disponivel}
                  onChange={(e) => setForm({ ...form, disponivel: e.target.checked })} />
                Disponível
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.destaque}
                  onChange={(e) => setForm({ ...form, destaque: e.target.checked })} />
                Destaque
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar estoque em massa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {selected.size} produto(s) selecionados.
            </p>
            <div>
              <Label>Operação</Label>
              <Select value={bulkTipo} onValueChange={(v) => setBulkTipo(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada (+ somar)</SelectItem>
                  <SelectItem value="saida">Saída (− subtrair)</SelectItem>
                  <SelectItem value="ajuste">Ajuste (definir valor exato)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input inputMode="numeric" value={bulkQtd}
                onChange={(e) => setBulkQtd(e.target.value.replace(/[^\d]/g, ""))} />
            </div>
            <div>
              <Label>Motivo (opcional)</Label>
              <Input value={bulkMotivo} onChange={(e) => setBulkMotivo(e.target.value)}
                placeholder="Ex: reposição, contagem semanal, perda..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancelar</Button>
            <Button onClick={runBulk} disabled={bulkSaving}>
              {bulkSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico · {histProduct?.nome}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {movements.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhuma movimentação registrada.
              </p>
            )}
            {movements.map((m) => {
              const color = m.delta > 0 ? "text-emerald-500" : m.delta < 0 ? "text-destructive" : "text-muted-foreground";
              const label = m.tipo === "entrada" ? "Entrada"
                : m.tipo === "saida" ? "Saída"
                : m.tipo === "pedido" ? "Pedido"
                : "Ajuste";
              return (
                <div key={m.id} className="rounded-lg border border-border p-2 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
                      <span className={`text-sm font-bold ${color}`}>
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </span>
                    </div>
                    {m.motivo && <p className="text-xs text-muted-foreground mt-0.5">{m.motivo}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(m.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    <p>{m.estoque_antes ?? "—"} → <span className="font-semibold text-foreground">{m.estoque_depois ?? "—"}</span></p>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}