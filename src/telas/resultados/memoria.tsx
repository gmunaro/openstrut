// Memória de cálculo: as etapas de um elemento (descrição, fórmula, valor,
// unidade, item da norma) e a linha de tabela que expande para mostrá-las.
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import type { Etapa } from "../../calculo/tipos";
import { casasAdequadas, converterEtapa, formatarNumero } from "../formato";
import { useUnidades } from "../sessao";
import { Linha, Td } from "./tabela";

export interface GrupoMemoria {
  titulo: string;
  etapas: Etapa[];
}

export function Memoria({ grupos }: { grupos: GrupoMemoria[] }) {
  const sistema = useUnidades();
  const comEtapas = grupos.filter((g) => g.etapas.length > 0);
  if (comEtapas.length === 0)
    return <p className="text-muted-foreground px-2 py-1 text-xs">Sem etapas registradas.</p>;
  return (
    <div className="grid gap-3 py-2">
      {comEtapas.map((g, gi) => (
        <div key={gi}>
          <p className="text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-wide">
            {g.titulo}
          </p>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground text-left text-[11px]">
              <tr className="border-b">
                <th className="px-2 py-1 font-medium">Etapa</th>
                <th className="px-2 py-1 font-medium">Fórmula</th>
                <th className="px-2 py-1 text-right font-medium">Valor</th>
                <th className="px-2 py-1 font-medium">Unidade</th>
                <th className="px-2 py-1 font-medium">Ref.</th>
              </tr>
            </thead>
            <tbody>
              {g.etapas.map((e, i) => {
                const c =
                  e.valor === undefined ? null : converterEtapa(e.valor, e.unidade, sistema);
                return (
                  <tr key={i} className="border-b border-dashed last:border-0">
                    <td className="px-2 py-0.5">{e.descricao}</td>
                    <td className="px-2 py-0.5 font-mono text-[11px]">{e.formula ?? ""}</td>
                    <td className="px-2 py-0.5 text-right font-mono tabular-nums">
                      {c ? formatarNumero(c.valor, casasAdequadas(c.valor)) : ""}
                    </td>
                    <td className="px-2 py-0.5">{c ? c.unidade : (e.unidade ?? "")}</td>
                    <td className="text-muted-foreground px-2 py-0.5">{e.ref ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/** Linha de elemento: a primeira célula tem o nome, o sinal de aviso e, se
 *  `comMemoria`, o botão que abre a memória numa linha logo abaixo. */
export function LinhaElemento({
  nome,
  avisos,
  memoria,
  colunas,
  comMemoria,
  children,
}: {
  nome: ReactNode;
  avisos: readonly string[];
  memoria: GrupoMemoria[];
  /** Total de colunas da tabela (para a linha da memória ocupar tudo). */
  colunas: number;
  comMemoria: boolean;
  children: ReactNode;
}) {
  const [aberta, setAberta] = useState(false);
  const temAviso = avisos.length > 0;
  return (
    <Fragment>
      <Linha className={temAviso ? "bg-aviso/5" : undefined}>
        <Td className="font-medium">
          <span className="inline-flex items-center gap-1">
            {comMemoria && (
              <button
                type="button"
                onClick={() => setAberta((a) => !a)}
                className="text-muted-foreground hover:text-foreground -ml-1 rounded p-0.5"
                aria-expanded={aberta}
                aria-label={aberta ? "Fechar memória de cálculo" : "Abrir memória de cálculo"}
                title="Memória de cálculo"
              >
                {aberta ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
              </button>
            )}
            {nome}
            {temAviso && (
              <span title={avisos.join("\n")} aria-label={`${avisos.length} aviso(s)`}>
                <TriangleAlert className="text-aviso size-3.5" />
              </span>
            )}
          </span>
        </Td>
        {children}
      </Linha>
      {aberta && (
        <Linha className="hover:bg-transparent">
          <Td colSpan={colunas} className="bg-muted/30 whitespace-normal">
            {temAviso && (
              <ul className="text-aviso mb-1 list-disc pl-5 text-xs">
                {avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
            <Memoria grupos={memoria} />
          </Td>
        </Linha>
      )}
    </Fragment>
  );
}
