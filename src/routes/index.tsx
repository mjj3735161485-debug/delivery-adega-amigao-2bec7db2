import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { TodayHoursCard } from "@/components/TodayHoursCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import heroImg from "@/assets/hero-bar.jpg";

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
};
type Settings = {
  nome: string;
  taxa_entrega: number;
  horario: string;
  ativo: boolean;
};

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Adega Amigão — Delivery de Bebidas Geladas" },
      {
        name: "description",
        content:
          "Cervejas, vinhos, destilados e drinks entregues geladinhos na sua casa. Peça na Adega Amigão e confirme pelo WhatsApp.",
      },
      { property: "og:title", content: "Adega Amigão — Delivery de Bebidas Geladas" },
      { property: "og:description", content: "Catálogo completo de cervejas, vinhos e destilados com entrega rápida." },
      { property: "og:url", content: "https://sip-n-serve-bot.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://sip-n-serve-bot.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "LiquorStore",
          name: "Adega Amigão",
          url: "https://sip-n-serve-bot.lovable.app/",
          priceRange: "$$",
          servesCuisine: "Beverages",
          telephone: "+55 12 99239-1723",
        }),
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-muted-foreground">Não foi possível carregar o catálogo. {error.message}</div>
  ),
});

function Home() {
  const [cat, setCat] = useState<string>("todos");
  const [q, setQ] = useState("");
  const [visibleCount, setVisibleCount] = useState(48);
  const [onlyPromos, setOnlyPromos] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState<boolean | null>(null);
  useEffect(() => {
    setAgeConfirmed(sessionStorage.getItem("age-confirmed") === "true");
  }, []);
  const { add } = useCart();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("ordem");
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("disponivel", true)
        .order("destaque", { ascending: false })
        .order("ordem");
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("nome, taxa_entrega, horario, ativo")
        .single();
      if (error) throw error;
      return data as Settings;
    },
  });

  const { data: minTaxa } = useQuery({
    queryKey: ["delivery-areas", "min"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("min_delivery_fee");
      if (error) throw error;
      return data == null ? undefined : Number(data);
    },
  });

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (onlyPromos && !p.destaque) return false;
      if (cat !== "todos" && p.category_id) {
        const c = categories.find((x) => x.id === p.category_id);
        if (!c || c.slug !== cat) return false;
      }
      if (q.trim()) {
        const normalize = (value: string) =>
          value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
        if (!normalize(p.nome).includes(normalize(q.trim()))) return false;
      }
      return true;
    });
  }, [products, categories, cat, q, onlyPromos]);

  return (
    <div className="min-h-screen">
      {ageConfirmed === false && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4 backdrop-blur-md">
          {" "}
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
            {" "}
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Consumo responsável</p>{" "}
            <h2 className="mt-3 font-display text-3xl font-bold">Você tem 18 anos ou mais?</h2>{" "}
            <p className="mt-3 text-sm text-muted-foreground">
              {" "}
              A venda de bebidas alcoólicas é proibida para menores de 18 anos.{" "}
            </p>{" "}
            <div className="mt-6 grid grid-cols-2 gap-3">
              {" "}
              <Button variant="outline" onClick={() => window.history.back()}>
                Não
              </Button>{" "}
              <Button
                onClick={() => {
                  sessionStorage.setItem("age-confirmed", "true");
                  setAgeConfirmed(true);
                }}
              >
                Sim, tenho 18+
              </Button>{" "}
            </div>{" "}
          </div>{" "}
        </div>
      )}{" "}
      <SiteHeader />
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={heroImg}
          alt=""
          width={1600}
          height={900}
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/70 to-background" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <p className="uppercase tracking-[0.3em] text-xs text-primary mb-4">Delivery de bebidas</p>
            <h1 className="font-display text-4xl sm:text-6xl font-bold max-w-2xl leading-[1.05]">
              Bebida gelada na sua porta em minutos.
            </h1>
            <p className="mt-4 max-w-lg text-muted-foreground">
              Cervejas, vinhos, destilados e drinks prontos. Peça pelo site, confirmamos no WhatsApp e entregamos
              rapidinho.
            </p>
            <TodayHoursCard />
            {settings && typeof minTaxa === "number" && (
              <p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">
                Entrega a partir de {brl(minTaxa)}
                {!settings.ativo && <span className="ml-3 text-destructive">· Loja desativada</span>}
              </p>
            )}
          </div>
          <aside className="rounded-2xl border border-primary/30 bg-card/90 p-5 shadow-xl backdrop-blur-sm">
            {" "}
            <div className="mb-4 flex items-center justify-between gap-3">
              {" "}
              <div>
                {" "}
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Ofertas especiais</p>{" "}
                <h2 className="mt-1 font-display text-2xl font-bold">Promoções em destaque</h2>{" "}
              </div>{" "}
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                PROMO
              </span>{" "}
            </div>{" "}
            <div className="space-y-3">
              {" "}
              {products
                .filter((product) => product.destaque)
                .slice(0, 2)
                .map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background/80 p-3"
                  >
                    {" "}
                    {product.imagem_url ? (
                      <img
                        src={product.imagem_url}
                        alt={product.nome}
                        loading="lazy"
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-muted" />
                    )}{" "}
                    <div className="min-w-0 flex-1">
                      {" "}
                      <p className="line-clamp-2 text-sm font-medium">{product.nome}</p>{" "}
                      <p className="mt-1 font-display font-bold text-primary">{brl(product.preco)}</p>{" "}
                    </div>{" "}
                    <Button
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-full"
                      aria-label={"Adicionar " + product.nome + " ao carrinho"}
                      onClick={() => {
                        add({
                          id: product.id,
                          nome: product.nome,
                          preco: product.preco,
                          imagem_url: product.imagem_url,
                        });
                        toast.success(product.nome + " adicionado!");
                      }}
                    >
                      {" "}
                      <Plus className="h-4 w-4" />{" "}
                    </Button>{" "}
                  </div>
                ))}{" "}
              {!isLoading && products.filter((product) => product.destaque).length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  {" "}
                  Novas promoções serão anunciadas aqui. Volte em breve!{" "}
                </p>
              )}{" "}
            </div>{" "}
            <Button
              variant="outline"
              className="mt-4 w-full border-primary/40 font-semibold"
              onClick={() => {
                setOnlyPromos(true);
                setCat("todos");
                setQ("");
                setVisibleCount(48);
                setTimeout(() => document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" }), 0);
              }}
            >
              {" "}
              Ver todas as promoções{" "}
            </Button>{" "}
          </aside>{" "}
        </div>{" "}
      </section>
      {/* Filtros */}
      <section id="catalogo" className="mx-auto max-w-6xl px-4 pt-8">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar bebida..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOnlyPromos(false);
                setVisibleCount(48);
              }}
              className="pl-9"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
          {[{ slug: "todos", nome: "Todos" }, ...categories].map((c) => (
            <button
              key={c.slug}
              onClick={() => {
                setCat(c.slug);
                setOnlyPromos(false);
                setVisibleCount(48);
              }}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm border transition ${
                cat === c.slug
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.nome}
            </button>
          ))}
        </div>
      </section>
      {/* Grade */}
      <section className="mx-auto max-w-6xl px-4 py-8">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">Nenhum produto encontrado.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.slice(0, visibleCount).map((p) => (
              <article
                key={p.id}
                className="group rounded-xl bg-card border border-border overflow-hidden flex flex-col hover:border-primary/50 transition"
              >
                <div className="aspect-square bg-muted overflow-hidden">
                  {p.imagem_url && (
                    <img
                      src={p.imagem_url}
                      alt={p.nome}
                      loading="lazy"
                      className="h-full w-full object-cover group-hover:scale-105 transition duration-500"
                    />
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col">
                  <h2 className="font-medium text-sm leading-tight line-clamp-2 min-h-10">{p.nome}</h2>
                  <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                    <span className="font-display font-bold text-primary text-lg">{brl(p.preco)}</span>
                    <Button
                      size="icon"
                      className="h-9 w-9 rounded-full"
                      aria-label={`Adicionar ${p.nome} ao carrinho`}
                      onClick={() => {
                        add({
                          id: p.id,
                          nome: p.nome,
                          preco: Number(p.preco),
                          imagem_url: p.imagem_url,
                        });
                        toast.success(`${p.nome} adicionado`);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {!isLoading && visibleCount < filtered.length && (
        <div className="mx-auto max-w-6xl px-4 pb-8 flex justify-center">
          {" "}
          <Button variant="outline" onClick={() => setVisibleCount((count) => count + 48)}>
            {" "}
            Carregar mais produtos{" "}
          </Button>{" "}
        </div>
      )}{" "}
      <footer className="border-t border-border mt-12 py-8 text-center text-xs text-muted-foreground">
        <p>Beba com responsabilidade. Venda proibida para menores de 18 anos.</p>
        <p className="mt-2">
          © {new Date().getFullYear()} {settings?.nome ?? "Bar do Zé"}
        </p>
      </footer>
    </div>
  );
}
