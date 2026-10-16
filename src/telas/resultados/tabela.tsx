// Peças das tabelas densas de resultados: cabeçalho com unidade, célula
// numérica alinhada à direita e marcação de linha com aviso.
import type { ComponentProps, ReactNode } from "react";
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
 * Tabela de resultados. A rolagem horizontal fica neste contêiner, focável por
 * teclado (Tab, depois as setas), e a primeira coluna (`Th`/`Td`) fica fixa.
 */
export function Tabela({ className, ...props }: ComponentProps<typeof Table>) {
  return (
    <div
      tabIndex={0}
      className="focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none [&_[data-slot=table-container]]:overflow-visible"
    >
      <Table className={cn("text-xs print:text-[8pt]", className)} {...props} />
    </div>
  );
}

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
        "first:bg-background first:sticky first:left-0 last:pr-4",
        num && "text-right",
        className,
      )}
      {...props}
    >
      <span className="whitespace-nowrap">{children}</span>
      {unidade !== undefined && <span className="block font-normal opacity-80">{unidade}</span>}
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
        "first:bg-background first:sticky first:left-0 last:pr-4",
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
      <h3 className="text-sm font-semibold">{children}</h3>
      {extra ? <div className="min-w-0">{extra}</div> : null}
    </div>
  );
}
