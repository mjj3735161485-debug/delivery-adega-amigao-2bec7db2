import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Star, StarOff, Eye, EyeOff, Upload, Loader2, Search } from "lucide-react";
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
};

const empty: FormState = {
  nome: "", descricao: "", preco: "", imagem_url: "",
  category_id: "", disponivel: true, destaque: false,
};

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

  function edit(p: Product) {
    setForm({
      id: p.id, nome: p.nome, descricao: p.descricao ?? "",
      preco: String(p.preco), imagem_url: p.imagem_url ?? "",
      category_id: p.category_id ?? "", disponivel: p.disponivel, destaque: p.destaque,
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
    };
    const { error } = form.id
      ? await supabase.from("products").update(payload).eq("id", form.id)
      : await supabase.from("products").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Produto atualizado" : "Produto criado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
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
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  if (!ready) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!isAdmin) return <div className="p-8 text-center">Sem permissão de admin.</div>;

  const filtered = products.filter((p) =>
    normalizeSearch(p.nome).includes(normalizeSearch(search))
  );

  return (
    <div className="min-h-screen">
      <AdminNav title="Produtos" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center mb-4">
          <p className="text-sm text-muted-foreground">{filtered.length} de {products.length} produtos</p>
          <div className="flex gap-2 w-full sm:w-auto">
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            <Button onClick={novo}><Plus className="h-4 w-4 mr-1" /> Novo produto</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => {
            const cat = categories.find((c) => c.id === p.category_id);
            return (
              <article key={p.id} className="rounded-xl bg-card border border-border p-3 flex gap-3">
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
    </div>
  );
}