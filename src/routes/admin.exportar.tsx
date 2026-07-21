import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/exportar")({
  component: ExportarPage,
  head: () => ({
    meta: [
      { title: "Exportar entregas — Adega Amigão" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Courier = {
  id: string;
  nome: string;
  comissao_percent: number;
  diaria: number;
};

type Entrega = {
  numero: number;
  cliente_nome: string;
  bairro: string | null;
  taxa_entrega: number;
  total: number;
  pagamento: string;
  delivered_at: string;
  tipo_entrega: string;
  subtotal?: number;
  troco_para?: number | null;
  observacoes?: string | null;
};

// Divide o total de um pedido entre Dinheiro / Pix / Cartão.
// Para "Misto" tenta extrair "Cartão R$X" ou "Pix R$X" das observações;
// o restante é dinheiro (e o troco é calculado como dinheiro_recebido - dinheiro).
function splitPayment(r: Entrega) {
  const total = Number(r.total || 0);
  const pag = (r.pagamento || "").toLowerCase();
  const out = { dinheiro: 0, pix: 0, cartao: 0, dinheiroRecebido: 0, troco: 0 };
  const troco = Number(r.troco_para || 0);
  if (pag === "dinheiro") {
    out.dinheiro = total;
    out.dinheiroRecebido = troco > 0 ? troco : total;
    out.troco = troco > 0 ? Math.max(0, troco - total) : 0;
    return out;
  }
  if (pag === "pix") { out.pix = total; return out; }
  if (pag === "cartão" || pag === "cartao") { out.cartao = total; return out; }
  if (pag === "misto") {
    const obs = r.observacoes || "";
    const num = (re: RegExp) => {
      const m = obs.match(re);
      if (!m) return 0;
      return Number(m[1].replace(/\./g, "").replace(",", ".")) || 0;
    };
    const cartao = num(/cart(?:ã|a)o[^0-9]*R?\$?\s*([\d.,]+)/i);
    const pix = num(/pix[^0-9]*R?\$?\s*([\d.,]+)/i);
    const dinheiro = num(/dinheiro[^0-9]*R?\$?\s*([\d.,]+)/i);
    const soma = cartao + pix + dinheiro;
    if (soma > 0) {
      out.cartao = cartao;
      out.pix = pix;
      out.dinheiro = dinheiro || Math.max(0, total - cartao - pix);
    } else {
      // fallback: sem detalhe → considera tudo como dinheiro
      out.dinheiro = total;
    }
    if (troco > 0 && out.dinheiro > 0) {
      out.dinheiroRecebido = troco;
      out.troco = Math.max(0, troco - out.dinheiro);
    }
    return out;
  }
  // desconhecido: joga em dinheiro
  out.dinheiro = total;
  return out;
}

function totalsByMethod(rows: Entrega[]) {
  const t = { dinheiro: 0, pix: 0, cartao: 0, troco: 0, entregasDinheiro: 0 };
  for (const r of rows) {
    const s = splitPayment(r);
    t.dinheiro += s.dinheiro;
    t.pix += s.pix;
    t.cartao += s.cartao;
    t.troco += s.troco;
    if (s.dinheiro > 0) t.entregasDinheiro += 1;
  }
  return t;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ExportarPage() {
  const { ready, isAdmin } = useAdminGuard();
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const { data: couriers = [] } = useQuery({
    queryKey: ["admin", "couriers-export"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("couriers")
        .select("id, nome, comissao_percent, diaria")
        .order("nome");
      if (error) throw error;
      return data as Courier[];
    },
  });

  async function fetchDeliveries(courierId: string) {
    const { data, error } = await supabase.rpc("admin_courier_deliveries_range", {
      _courier_id: courierId,
      _from: from,
      _to: to,
    });
    if (error) throw error;
    return (data ?? []) as Entrega[];
  }

  async function exportCSV(c: Courier) {
    setLoadingId(c.id + ":csv");
    try {
      const rows = await fetchDeliveries(c.id);
      const header = ["Numero", "Data/Hora", "Cliente", "Bairro", "Tipo", "Pagamento", "Taxa", "Total", "Dinheiro", "Dinheiro recebido", "Troco", "Pix", "Cartao"];
      const lines = [header.join(";")];
      let taxaTotal = 0;
      for (const r of rows) {
        taxaTotal += Number(r.taxa_entrega || 0);
        const s = splitPayment(r);
        const fmt = (n: number) => n > 0 ? n.toFixed(2).replace(".", ",") : "";
        lines.push([
          r.numero,
          new Date(r.delivered_at).toLocaleString("pt-BR"),
          `"${(r.cliente_nome ?? "").replace(/"/g, '""')}"`,
          `"${r.bairro ?? ""}"`,
          r.tipo_entrega,
          r.pagamento,
          Number(r.taxa_entrega || 0).toFixed(2).replace(".", ","),
          Number(r.total || 0).toFixed(2).replace(".", ","),
          fmt(s.dinheiro),
          fmt(s.dinheiroRecebido),
          fmt(s.troco),
          fmt(s.pix),
          fmt(s.cartao),
        ].join(";"));
      }
      const comissao = (taxaTotal * Number(c.comissao_percent || 0)) / 100;
      const tot = totalsByMethod(rows);
      lines.push("");
      lines.push("RESUMO POR FORMA DE PAGAMENTO");
      lines.push(`Total Dinheiro;${tot.dinheiro.toFixed(2).replace(".", ",")}`);
      lines.push(`Total Pix;${tot.pix.toFixed(2).replace(".", ",")}`);
      lines.push(`Total Cartao;${tot.cartao.toFixed(2).replace(".", ",")}`);
      lines.push(`Total Troco entregue;${tot.troco.toFixed(2).replace(".", ",")}`);
      lines.push("");
      lines.push(`Total taxas;${taxaTotal.toFixed(2).replace(".", ",")}`);
      lines.push(`Comissao (${c.comissao_percent}%);${comissao.toFixed(2).replace(".", ",")}`);
      lines.push(`Diaria;${Number(c.diaria || 0).toFixed(2).replace(".", ",")}`);
      lines.push(`Total a pagar;${(comissao + Number(c.diaria || 0)).toFixed(2).replace(".", ",")}`);
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, `entregas_${slug(c.nome)}_${from}_${to}.csv`);
      toast.success(`CSV gerado (${rows.length} entregas)`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar CSV");
    } finally {
      setLoadingId(null);
    }
  }

  async function exportPDF(c: Courier) {
    setLoadingId(c.id + ":pdf");
    try {
      const rows = await fetchDeliveries(c.id);
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`Fechamento — ${c.nome}`, 14, 16);
      doc.setFontSize(10);
      doc.text(`Período: ${new Date(from).toLocaleDateString("pt-BR")} a ${new Date(to).toLocaleDateString("pt-BR")}`, 14, 23);

      const taxaTotal = rows.reduce((s, r) => s + Number(r.taxa_entrega || 0), 0);
      const comissao = (taxaTotal * Number(c.comissao_percent || 0)) / 100;
      const dias = new Set(rows.map(r => new Date(r.delivered_at).toDateString())).size;
      const diariaTotal = Number(c.diaria || 0) * Math.max(1, dias);

      autoTable(doc, {
        startY: 30,
        head: [["#", "Quando", "Cliente", "Bairro", "Pgto", "Total", "Dinheiro", "Recebido", "Troco", "Pix", "Cartão"]],
        body: rows.map(r => {
          const s = splitPayment(r);
          const fmt = (n: number) => n > 0 ? brl(n) : "—";
          return [
            r.numero,
            new Date(r.delivered_at).toLocaleString("pt-BR"),
            r.cliente_nome ?? "",
            r.bairro ?? "—",
            r.pagamento,
            brl(Number(r.total || 0)),
            fmt(s.dinheiro),
            fmt(s.dinheiroRecebido),
            fmt(s.troco),
            fmt(s.pix),
            fmt(s.cartao),
          ];
        }),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 30, 30] },
      });

      const finalY = (doc as any).lastAutoTable.finalY + 8;
      const tot = totalsByMethod(rows);
      doc.setFontSize(12);
      doc.text("Resumo por forma de pagamento", 14, finalY);
      autoTable(doc, {
        startY: finalY + 3,
        head: [["Forma", "Valor"]],
        body: [
          ["Dinheiro", brl(tot.dinheiro)],
          ["Pix", brl(tot.pix)],
          ["Cartão", brl(tot.cartao)],
          ["Troco entregue", brl(tot.troco)],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 30, 30] },
        theme: "grid",
      });
      const y2 = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(11);
      doc.text(`Entregas: ${rows.length}   ·   Dias trabalhados: ${dias}`, 14, y2);
      doc.text(`Total taxas: ${brl(taxaTotal)}`, 14, y2 + 6);
      doc.text(`Comissão (${c.comissao_percent}%): ${brl(comissao)}`, 14, y2 + 12);
      doc.text(`Diária (${dias} dia${dias > 1 ? "s" : ""}): ${brl(diariaTotal)}`, 14, y2 + 18);
      doc.setFontSize(13);
      doc.text(`Total a pagar: ${brl(comissao + diariaTotal)}`, 14, y2 + 28);

      doc.save(`fechamento_${slug(c.nome)}_${from}_${to}.pdf`);
      toast.success(`PDF gerado (${rows.length} entregas)`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar PDF");
    } finally {
      setLoadingId(null);
    }
  }

  if (!ready) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!isAdmin) return <div className="p-8 text-center">Sem permissão.</div>;

  return (
    <div className="min-h-screen">
      <AdminNav title="Exportar entregas" />
      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        <section className="rounded-lg border border-border p-4 bg-muted/20 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <Label htmlFor="from">De</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="to">Até</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Escolha o período e gere PDF ou CSV para cada motoboy. O PDF traz o fechamento com comissão + diária.
          </p>
        </section>

        <section className="space-y-2">
          {couriers.length === 0 && (
            <p className="text-muted-foreground text-sm">Nenhum motoboy cadastrado.</p>
          )}
          {couriers.map((c) => (
            <div key={c.id} className="rounded-lg border border-border p-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{c.nome}</p>
                <p className="text-xs text-muted-foreground">
                  Comissão {c.comissao_percent}% · diária {brl(Number(c.diaria || 0))}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  onClick={() => exportCSV(c)}
                  disabled={loadingId !== null}>
                  {loadingId === c.id + ":csv" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
                  CSV
                </Button>
                <Button size="sm"
                  onClick={() => exportPDF(c)}
                  disabled={loadingId !== null}>
                  {loadingId === c.id + ":pdf" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
                  PDF
                </Button>
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

function slug(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}