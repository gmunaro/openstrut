// Peças das tabelas densas de resultados: cabeçalho com unidade, célula
// numérica alinhada à direita e marcação de linha com aviso.
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
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
  className,
  ...props
}: ComponentProps<typeof TableHead> & { unidade?: string; num?: boolean }) {
  return (
    <TableHead
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
      <span className="whitespace-nowrap">{children}</span>
      {unidade !== undefined && (
        <span className="block font-normal whitespace-nowrap opacity-80">{unidade}</span>
      )}
    </TableHead>
  );
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

/** Título de bloco de resultados; o `extra` quebra de linha em vez de estourar a tabela. */
export function TituloBloco({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mt-4 mb-1 flex flex-wrap items-baseline gap-x-3">
      <h3 className="text-sm font-semibold whitespace-nowrap">{children}</h3>
      {extra ? <div className="min-w-0">{extra}</div> : null}
    </div>
  );
}
