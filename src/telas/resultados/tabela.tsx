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

export function Tabela({ className, ...props }: ComponentProps<typeof Table>) {
  return <Table className={cn("text-xs print:text-[8pt]", className)} {...props} />;
}

/** Cabeçalho de coluna; `unidade` aparece embaixo do rótulo; `num` alinha à direita. */
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
        num && "text-right",
        className,
      )}
      {...props}
    >
      {children}
      {unidade !== undefined && <span className="block font-normal opacity-80">{unidade}</span>}
    </TableHead>
  );
}

export function Td({
  num = false,
  className,
  ...props
}: ComponentProps<typeof TableCell> & { num?: boolean }) {
  return (
    <TableCell
      className={cn("px-2 py-1", num && "text-right font-mono tabular-nums", className)}
      {...props}
    />
  );
}

/** Título de bloco de resultados. */
export function TituloBloco({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mt-4 mb-1 flex items-baseline gap-3">
      <h3 className="text-sm font-semibold">{children}</h3>
      {extra}
    </div>
  );
}
