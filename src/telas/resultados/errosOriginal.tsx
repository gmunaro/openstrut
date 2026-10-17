// Erros do SISTRUT original encontrados na obra (calculo/defeitosOriginal.ts): o bloco
// destacado da aba Resultados e do relatório, com as quatro partes de cada erro, e a
// marca no elemento das tabelas, que leva à explicação. Só a NB-1/78 tem o caminho do
// SISTRUT; nas outras normas a lista é vazia e nada aparece.
import { Bug } from "lucide-react";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  DEFEITOS_CONFERIDOS,
  errosDoOriginal,
  type ErroDoOriginal,
  type SentidoDefeito,
} from "../../calculo/defeitosOriginal";
import type { Obra } from "../../dominio/obra";
import { calcular, type Calculo } from "../calculo";
import { Cabecalho, Corpo, Linha, Tabela, Td, Th } from "./tabela";

/** Nome curto de cada defeito conferido, para a linha "conferidos sem efeito". */
const NOME_CURTO: Record<(typeof DEFEITOS_CONFERIDOS)[number], string> = {
  "P-b": "carga em dobro de pilar sobre viga de transição",
  R5: "reações cortadas no .REP",
  R1: "flecha das lajes",
  R2: "negativa sem refazer a laje vizinha",
  R3: "otimização dos negativos sem fim",
  "D-ψ": "ρ do ψ no piso",
  "D-3": "pilar com Nk nulo",
  "D-2": "equilíbrio do pilar sem fim",
};

const SENTIDO: Record<SentidoDefeito, { rotulo: string; classe: string }> = {
  "a favor": { rotulo: "a favor da segurança", classe: "border-ok/60 text-ok" },
  contra: { rotulo: "contra a segurança", classe: "border-destructive/60 text-destructive" },
  neutro: { rotulo: "sem efeito na segurança", classe: "border-muted-foreground/60" },
  "a conferir": { rotulo: "efeito na segurança a conferir", classe: "border-aviso/60 text-aviso" },
};

/** Âncora da explicação de um erro (a marca do elemento leva a ela). */
export const ancoraErro = (id: string) => `erro-original-${id.replace(/[^A-Za-z0-9-]/g, "")}`;

/**
 * Erros do original na obra, com a obra calculada também no outro modo (o modo ativo
 * vem de `calculo`). Lista vazia sem resultado do SISTRUT ou se o outro modo falhar
 * no modo corrigido (os registros que isolam cada erro vêm do modo original).
 */
export function useErrosDoOriginal(calculo: Calculo, obra: Obra | null | undefined) {
  return useMemo(() => {
    if (calculo.tipo !== "ok" || !obra || !calculo.resultado.sistrut) return [];
    const ativo = calculo.resultado.sistrut.modo;
    const outro = calcular({
      ...obra,
      modoCalculo: ativo === "original" ? "corrigido" : "original",
    });
    const resultadoOutro = outro.tipo === "ok" ? outro.resultado : undefined;
    if (ativo === "original") return errosDoOriginal(calculo.resultado, resultadoOutro, ativo);
    return resultadoOutro ? errosDoOriginal(resultadoOutro, calculo.resultado, ativo) : [];
  }, [calculo, obra]);
}

/** Erros por elemento ("pavimento|nome"), para as marcas das tabelas. */
export const ErrosOriginalContexto = createContext<ReadonlyMap<string, ErroDoOriginal[]>>(
  new Map(),
);

/** Índice dos erros por elemento, para o `ErrosOriginalContexto`. */
export function errosPorElemento(erros: readonly ErroDoOriginal[]) {
  const m = new Map<string, ErroDoOriginal[]>();
  for (const e of erros)
    for (const { local, elemento } of e.elementos) {
      const k = `${local}|${elemento}`;
      const lista = m.get(k) ?? [];
      if (!lista.includes(e)) m.set(k, [...lista, e]);
    }
  return m;
}

/** Marca ao lado do nome do elemento afetado por um erro do original: link para a
 *  explicação. Nada quando o elemento não tem erro. */
export function MarcaErroOriginal({ local, elemento }: { local: string; elemento: string }) {
  const erros = useContext(ErrosOriginalContexto).get(`${local}|${elemento}`);
  if (!erros) return null;
  return (
    <>
      {erros.map((e) => (
        <a
          key={e.id}
          href={`#${ancoraErro(e.id)}`}
          title={`Erro do SISTRUT original nesta obra: ${e.titulo}`}
          aria-label={`${elemento}: erro do SISTRUT original ${e.id}, ${e.titulo}`}
          className="border-primary/60 text-primary hover:bg-primary/10 ml-1.5 inline-flex items-center gap-0.5 rounded border px-1 align-middle text-[0.65rem] leading-4 font-medium whitespace-nowrap no-underline"
        >
          <Bug className="size-3" aria-hidden />
          {e.id}
        </a>
      ))}
    </>
  );
}

/** Nome do elemento com a marca de erro do original (para `LinhaElemento.nome`). */
export function NomeComMarca({ nome, local }: { nome: string; local: string }) {
  return (
    <>
      {nome}
      <MarcaErroOriginal local={local} elemento={nome} />
    </>
  );
}

/** Uma parte da explicação: rótulo e texto. */
function Parte({ n, rotulo, children }: { n: number; rotulo: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {n}. {rotulo}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function TabelaImpacto({ erro, ativo }: { erro: ErroDoOriginal; ativo: "original" | "corrigido" }) {
  const destaque = "bg-primary/10 font-medium";
  return (
    <Tabela className="mt-1 text-xs" aria-label={`Impacto de ${erro.id} por elemento`}>
      <Cabecalho>
        <Linha>
          <Th>Elemento</Th>
          <Th>SISTRUT original{ativo === "original" ? " (ativo)" : ""}</Th>
          <Th>Sem este erro</Th>
          <Th>Modo corrigido{ativo === "corrigido" ? " (ativo)" : ""}</Th>
        </Linha>
      </Cabecalho>
      <Corpo>
        {erro.linhas.map((l, i) => (
          <Linha key={i}>
            <Td className="font-medium whitespace-nowrap">
              {l.elemento}
              <span className="text-muted-foreground font-normal"> · {l.local}</span>
            </Td>
            <Td className={ativo === "original" ? destaque : ""}>{l.original}</Td>
            <Td>{l.semErro}</Td>
            <Td className={ativo === "corrigido" ? destaque : ""}>{l.corrigido}</Td>
          </Linha>
        ))}
      </Corpo>
    </Tabela>
  );
}

function CartaoErro({ erro, ativo }: { erro: ErroDoOriginal; ativo: "original" | "corrigido" }) {
  const sentido = SENTIDO[erro.sentido];
  return (
    <article
      id={ancoraErro(erro.id)}
      aria-labelledby={`${ancoraErro(erro.id)}-titulo`}
      className="bg-background scroll-mt-4 rounded-md border p-3 break-inside-avoid"
    >
      <h3
        id={`${ancoraErro(erro.id)}-titulo`}
        className="flex flex-wrap items-center gap-2 text-sm font-semibold"
      >
        <Badge variant="outline" className="border-primary/60 text-primary font-mono">
          {erro.id}
        </Badge>
        {erro.titulo}
        <Badge variant="outline" className={sentido.classe}>
          {sentido.rotulo}
        </Badge>
      </h3>
      <dl className="mt-2 grid gap-2">
        <Parte n={1} rotulo="O que acontecia no SISTRUT">
          {erro.mecanismo}
        </Parte>
        <Parte n={2} rotulo="Impacto nesta obra">
          <p>{erro.impacto}</p>
          <p className="mt-1">{erro.sentidoTexto}</p>
          <p className="text-muted-foreground mt-1 text-xs">Valores: {erro.grandeza}.</p>
          <TabelaImpacto erro={erro} ativo={ativo} />
        </Parte>
        <Parte n={3} rotulo="O que a V2 faz">
          {erro.v2Faz}
        </Parte>
        <Parte n={4} rotulo="O que fazer">
          {erro.oQueFazer}
        </Parte>
      </dl>
      <p className="text-muted-foreground mt-2 text-xs">
        Referência no original: {erro.referencia}. Defeito {erro.id} de docs/MODO-CALCULO.md.
      </p>
    </article>
  );
}

/**
 * Bloco "Erros do SISTRUT original encontrados nesta obra", separado dos avisos e das
 * verificações da V2. Sem erro, uma linha dizendo o que foi conferido. Nada fora da
 * NB-1/78 (sem `sistrut`).
 */
export function BlocoErrosOriginal({
  erros,
  calculo,
}: {
  erros: readonly ErroDoOriginal[];
  calculo: Calculo;
}) {
  if (calculo.tipo !== "ok" || !calculo.resultado.sistrut) return null;
  const ativo = calculo.resultado.sistrut.modo;
  const achados = new Set(erros.map((e) => e.id));
  const semEfeito = DEFEITOS_CONFERIDOS.filter((id) => !achados.has(id));
  return (
    <section
      aria-labelledby="erros-original"
      className="border-primary/50 bg-primary/5 mt-4 mb-3 rounded-md border-2 p-3"
    >
      <h2 id="erros-original" className="flex items-center gap-2 text-sm font-semibold">
        <Bug className="text-primary size-4" aria-hidden />
        Erros do SISTRUT original encontrados nesta obra ({erros.length})
      </h2>
      <p className="text-muted-foreground mt-1 text-xs">
        Defeitos do SISTRUT 4.0 que mudam números desta obra. Para cada um: o que o original fazia,
        o impacto aqui, o que a V2 faz no modo{" "}
        {ativo === "original" ? "Como o SISTRUT original" : "corrigido"} (ativo), com o valor do
        outro modo ao lado, e o que fazer. São separados das verificações da própria V2.
      </p>
      {erros.length > 0 && (
        <div className="mt-3 grid gap-3">
          {erros.map((e) => (
            <CartaoErro key={e.id} erro={e} ativo={ativo} />
          ))}
        </div>
      )}
      <p className="text-muted-foreground mt-2 text-xs">
        {erros.length === 0 ? "Nenhum se manifesta nesta obra. " : ""}
        {semEfeito.length > 0 &&
          `Conferidos sem efeito nesta obra: ${semEfeito.map((id) => `${id} (${NOME_CURTO[id]})`).join(", ")}. `}
        Os outros defeitos da lista de docs/MODO-CALCULO.md não são conferidos aqui.
      </p>
    </section>
  );
}
