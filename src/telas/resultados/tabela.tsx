// Peças das tabelas densas de resultados: cabeçalho com unidade (e ordenação no
// clique), célula numérica alinhada à direita, marcação de linha com aviso e o botão
// que copia a tabela em texto separado por tabulação, para colar no Excel.
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export { TableBody as Corpo, TableHeader as Cabecalho, TableRow as Linha };

/**
 * Tabela de resultados. A rolagem horizontal fica neste contêiner (a página não rola
 * de lado), focável por teclado (Tab, depois as setas), e a primeira coluna
 * (`Th`/`Td`) fica fixa. A rolagem encaixa no começo das colunas logo depois da
 * coluna fixa (scroll-snap com scroll-padding da largura dela): ao parar, nenhuma
 * coluna fica pela metade atrás da fixa. Na impressão a rolagem some (index.css).
 */
export function Tabela({ className, ...props }: ComponentProps<typeof Table>) {
  const rolagem = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rolagem.current;
    const fixa = el?.querySelector("th, td");
    if (!el || !fixa) return;
    const medir = () => {
      el.style.scrollPaddingLeft = `${fixa.getBoundingClientRect().width}px`;
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(fixa);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={rolagem}
      tabIndex={0}
      data-slot="tabela-rolagem"
      className="focus-visible:ring-ring max-w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-sm focus-visible:ring-2 focus-visible:outline-none [&_[data-slot=table-container]]:overflow-visible [&_td]:snap-start [&_th]:snap-start"
    >
      <Table className={cn("text-xs print:text-[8pt]", className)} {...props} />
    </div>
  );
}

/** Primeira coluna fixa: fundo opaco por cima das colunas que rolam (z-10) e, na borda
 *  direita, uma linha e uma sombra que mostram que o resto passa por baixo dela. */
const COLUNA_FIXA =
  "first:bg-background first:sticky first:left-0 first:z-10 first:pr-3 first:shadow-[inset_-1px_0_0_var(--border),6px_0_6px_-6px_rgb(0_0_0/0.6)] print:first:shadow-none";

/**
 * Cabeçalho de coluna. O rótulo fica numa linha só; `unidade` aparece embaixo
 * dele. `num` alinha à direita.
 */
export function Th({
  children,
  unidade,
  num = false,
  ordenar,
  className,
  ...props
}: ComponentProps<typeof TableHead> & {
  unidade?: string;
  num?: boolean;
  /** Coluna ordenável: o rótulo vira botão (useOrdenacao().coluna). */
  ordenar?: OrdemColuna;
}) {
  const rotulo = (
    <>
      <span className="whitespace-nowrap">{children}</span>
      {unidade !== undefined && (
        <span data-unidade className="block font-normal whitespace-nowrap opacity-80">
          {unidade}
        </span>
      )}
    </>
  );
  const Seta = !ordenar?.sentido ? ArrowUpDown : ordenar.sentido === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={
        ordenar?.sentido === "asc"
          ? "ascending"
          : ordenar?.sentido === "desc"
            ? "descending"
            : undefined
      }
      className={cn(
        "text-muted-foreground h-auto px-2 py-1.5 align-bottom text-[11px] leading-tight font-medium",
        // fixa só a primeira célula da primeira linha: na segunda linha de um cabeçalho
        // agrupado a primeira célula é de um grupo, não da coluna do nome
        COLUNA_FIXA,
        "last:pr-4 [tr+tr>&]:static! [tr+tr>&]:shadow-none!",
        num && "text-right",
        className,
      )}
      {...props}
    >
      {ordenar ? (
        <button
          type="button"
          onClick={ordenar.aoClicar}
          title="Ordenar por esta coluna (clique de novo para inverter)"
          className={cn(
            "hover:text-foreground focus-visible:ring-ring inline-flex items-end gap-0.5 rounded outline-none focus-visible:ring-2 print:pointer-events-none",
            num ? "flex-row-reverse text-right" : "text-left",
            ordenar.sentido && "text-foreground",
          )}
        >
          <span>{rotulo}</span>
          <Seta aria-hidden className="mb-0.5 size-3 shrink-0 opacity-70 print:hidden" />
        </button>
      ) : (
        rotulo
      )}
    </TableHead>
  );
}

/** Estado de ordenação de uma coluna para o Th. */
export interface OrdemColuna {
  sentido: "asc" | "desc" | null;
  aoClicar: () => void;
}

/**
 * Ordenação de uma tabela por coluna. `coluna(k)` liga o Th; `ordenar(lista, valor)`
 * devolve a lista na ordem escolhida, com `valor(item, k)` dando o número ou texto da
 * coluna. Primeiro clique: crescente (texto) ou decrescente (número, o maior primeiro);
 * segundo inverte; terceiro volta à ordem do cálculo. Valores ausentes ficam no fim.
 */
export function useOrdenacao<K extends string>() {
  const [ordem, setOrdem] = useState<{ chave: K; sentido: "asc" | "desc"; numero: boolean }>();
  const coluna = (chave: K, numero = true): OrdemColuna => ({
    sentido: ordem?.chave === chave ? ordem.sentido : null,
    aoClicar: () =>
      setOrdem((o) => {
        const primeiro = numero ? "desc" : "asc";
        if (o?.chave !== chave) return { chave, sentido: primeiro, numero };
        return o.sentido === primeiro
          ? { chave, sentido: primeiro === "asc" ? "desc" : "asc", numero }
          : undefined;
      }),
  });
  const ordenar = <T,>(
    lista: readonly T[],
    valor: (item: T, chave: K) => number | string | null | undefined,
  ): T[] => {
    if (!ordem) return [...lista];
    const sinal = ordem.sentido === "asc" ? 1 : -1;
    const vazio = (v: unknown) => v === null || v === undefined || Number.isNaN(v);
    return [...lista].sort((a, b) => {
      const va = valor(a, ordem.chave);
      const vb = valor(b, ordem.chave);
      if (vazio(va) || vazio(vb)) return Number(vazio(va)) - Number(vazio(vb));
      if (typeof va === "number" && typeof vb === "number") return sinal * (va - vb);
      return sinal * String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
    });
  };
  return { coluna, ordenar };
}

/** Célula de tabela de resultados; `num` alinha à direita em fonte tabular. */
export function Td({
  num = false,
  className,
  ...props
}: ComponentProps<typeof TableCell> & { num?: boolean }) {
  return (
    <TableCell
      className={cn(
        "px-2 py-1",
        COLUNA_FIXA,
        "last:pr-4",
        num && "text-right font-mono tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

/** Título de bloco de resultados; o `extra` quebra de linha em vez de estourar a tabela.
 *  Com `copiar` (nome da tabela), põe à direita o botão que copia a primeira tabela depois
 *  do título (ver BotaoCopiar). */
export function TituloBloco({
  children,
  extra,
  copiar,
}: {
  children: ReactNode;
  extra?: ReactNode;
  copiar?: string;
}) {
  return (
    <div data-titulo-bloco className="mt-4 mb-1 flex flex-wrap items-baseline gap-x-3">
      <h3 className="text-sm font-semibold whitespace-nowrap">{children}</h3>
      {extra ? <div className="min-w-0">{extra}</div> : null}
      {copiar && <BotaoCopiar nome={copiar} />}
    </div>
  );
}

/** Texto de uma célula para a cópia: o rótulo e, no cabeçalho, a unidade entre
 *  parênteses; partes marcadas com data-sem-copia (contagem de avisos) ficam de fora. */
function textoCelula(c: HTMLTableCellElement) {
  const copia = c.cloneNode(true);
  if (!(copia instanceof HTMLElement)) return "";
  for (const el of copia.querySelectorAll("[data-sem-copia]")) el.remove();
  const unidade = copia.querySelector("[data-unidade]");
  const u = unidade?.textContent?.trim();
  unidade?.remove();
  const texto = (copia.textContent ?? "").replace(/\s+/g, " ").trim();
  return u ? `${texto} (${u})` : texto;
}

/**
 * Tabela em texto separado por tabulação (uma linha por <tr>), como o Excel cola em
 * células. colspan e rowspan viram células vazias nas posições que eles cobrem; linhas
 * com data-sem-copia (a memória aberta) ficam de fora.
 */
export function tsvDaTabela(tabela: HTMLTableElement): string {
  const grade: string[][] = [];
  const linhas = Array.from(tabela.rows).filter((r) => !r.hasAttribute("data-sem-copia"));
  linhas.forEach((tr, i) => {
    const linha = (grade[i] ??= []);
    let col = 0;
    for (const c of Array.from(tr.cells)) {
      while (linha[col] !== undefined) col++;
      for (let dr = 0; dr < Math.max(c.rowSpan, 1) && i + dr < linhas.length; dr++)
        for (let dc = 0; dc < Math.max(c.colSpan, 1); dc++)
          (grade[i + dr] ??= [])[col + dc] = dr === 0 && dc === 0 ? textoCelula(c) : "";
      col += Math.max(c.colSpan, 1);
    }
  });
  return grade.map((l) => Array.from(l, (v) => v ?? "").join("\t")).join("\n");
}

/** Copia a tabela que vem depois do título deste botão (a primeira até o próximo título). */
function BotaoCopiar({ nome }: { nome: string }) {
  const [estado, setEstado] = useState<"ok" | "erro" | null>(null);
  useEffect(() => {
    if (!estado) return;
    const t = setTimeout(() => setEstado(null), 2500);
    return () => clearTimeout(t);
  }, [estado]);
  const copiar = async (botao: HTMLElement) => {
    let el = botao.closest("[data-titulo-bloco]")?.nextElementSibling;
    while (el && !el.hasAttribute("data-titulo-bloco")) {
      const tabela = el.matches("table") ? el : el.querySelector("table");
      if (tabela instanceof HTMLTableElement) {
        try {
          await navigator.clipboard.writeText(tsvDaTabela(tabela));
          setEstado("ok");
        } catch {
          setEstado("erro");
        }
        return;
      }
      el = el.nextElementSibling;
    }
    setEstado("erro");
  };
  return (
    <button
      type="button"
      onClick={(e) => void copiar(e.currentTarget)}
      aria-label={`Copiar a tabela ${nome}`}
      title="Copia a tabela para colar no Excel ou na planilha"
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring ml-auto inline-flex items-center gap-1 self-center rounded px-1.5 py-0.5 text-xs outline-none focus-visible:ring-2 print:hidden"
    >
      {estado === "ok" ? (
        <Check aria-hidden className="size-3.5" />
      ) : (
        <Copy aria-hidden className="size-3.5" />
      )}
      <span role="status">
        {estado === "ok" ? "Copiada" : estado === "erro" ? "Não foi possível copiar" : "Copiar"}
      </span>
    </button>
  );
}
