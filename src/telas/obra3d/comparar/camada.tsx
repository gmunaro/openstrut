// Camada "Original × Corrigido": calcula a obra no outro modo da NB-1/78 (a vista já tem o
// do modo da obra), compara peça a peça (comparacao.ts) e pinta: cinza igual, laranja-terra
// maior no original, azul menor no original e verde-azulado quando a situação muda. O
// Painel mostra os modos, a tolerância, a contagem, a legenda e a lista das peças que
// diferem, cada uma levando à peça na vista.
import { useState, useSyncExternalStore } from "react";
import { normaPorId } from "../../../calculo/normas";
import type { ModoCalculo, Obra } from "../../../dominio/obra";
import { calcular, NOME_MODO, NOME_NORMA } from "../../calculo";
import { converter, formatarNumero, type SistemaUnidades } from "../../formato";
import { useSessao } from "../../sessao";
import type {
  Calculo,
  Camada,
  ContextoVista,
  DadosElemento,
  Elemento3D,
  EstadoElemento,
} from "../api";
import { dadosDosElementos, GRANDEZAS } from "../dados";
import {
  CATEGORIAS,
  COR_COMPARACAO,
  compararModos,
  contar,
  type Diferenca,
  queDiferem,
  ROTULO_CATEGORIA,
} from "./comparacao";

const ID = "comparar";

type Fase =
  | { tipo: "calculando" }
  | { tipo: "pronto" }
  /** Sem comparação (norma sem modo, obra sem cálculo, erro no outro modo). */
  | { tipo: "indisponivel"; mensagem: string };

/** Estado da camada; a tolerância e "esconder iguais" sobrevivem entre ligar e desligar. */
const estado = {
  /** Fração: 0,01 = 1 %. */
  tolerancia: 0.01,
  esconderIguais: false,
  fase: { tipo: "calculando" } as Fase,
  modoObra: "corrigido" as ModoCalculo,
  diferencas: new Map<string, Diferenca>(),
};

/** O cálculo do outro modo da última obra, para não refazer ao religar a camada. */
let cache: { obra: Obra; outro: Calculo } | null = null;

// o Painel lê `estado` pela versão (useSyncExternalStore): um aviso entre o primeiro desenho
// e a assinatura (o cálculo que termina antes) não se perde
const ouvintes = new Set<() => void>();
let versao = 0;
const avisar = () => {
  versao++;
  ouvintes.forEach((f) => f());
};
const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => void ouvintes.delete(f);
};

const outroModo = (m: ModoCalculo): ModoCalculo => (m === "original" ? "corrigido" : "original");

/** Diferenças com os dados do modo da obra (ctx.dados) e os do outro modo. */
function comparar(ctx: ContextoVista, outro: Calculo) {
  const modoOutro = outroModo(ctx.obra.modoCalculo);
  const dadosOutro: ReadonlyMap<string, DadosElemento> = dadosDosElementos(
    ctx.modelo,
    outro,
    { ...ctx.obra, modoCalculo: modoOutro },
    "si",
  );
  const [original, corrigido] =
    ctx.obra.modoCalculo === "original" ? [ctx.dados, dadosOutro] : [dadosOutro, ctx.dados];
  estado.diferencas = compararModos(ctx.modelo.elementos, original, corrigido, estado.tolerancia);
}

/** Cores e filtro a partir de `estado.diferencas` (refaz a geometria). */
function pintar(ctx: ContextoVista) {
  const dif = estado.diferencas;
  ctx.definirCores(ID, (e: Elemento3D) => {
    const d = dif.get(e.chave);
    return d ? COR_COMPARACAO[d.categoria] : null;
  });
  filtrar(ctx);
}

function filtrar(ctx: ContextoVista) {
  const dif = estado.diferencas;
  ctx.definirFiltro(
    ID,
    estado.esconderIguais && estado.fase.tipo === "pronto"
      ? (e) => {
          const d = dif.get(e.chave);
          return d !== undefined && d.categoria !== "igual";
        }
      : null,
  );
}

function limparCena(ctx: ContextoVista) {
  ctx.definirCores(ID, null);
  ctx.definirFiltro(ID, null);
}

/** Muda a tolerância (fração) e repinta. */
function mudarTolerancia(ctx: ContextoVista, t: number) {
  estado.tolerancia = t;
  if (estado.fase.tipo === "pronto" && cache) {
    comparar(ctx, cache.outro);
    pintar(ctx);
  }
  avisar();
}

function mudarEsconder(ctx: ContextoVista, sim: boolean) {
  estado.esconderIguais = sim;
  filtrar(ctx);
  avisar();
}

function Painel({ ctx }: { ctx: ContextoVista }) {
  useSyncExternalStore(assinar, () => versao);
  const unidades = useSessao((s) => s.unidades);
  const [texto, setTexto] = useState(formatarNumero(estado.tolerancia * 100, 1));
  const { fase, modoObra } = estado;
  const contagem = contar(estado.diferencas.values());
  const lista = fase.tipo === "pronto" ? queDiferem(estado.diferencas.values()) : [];

  return (
    <div className="grid gap-2 text-xs" data-testid="comparar-painel">
      <p>
        Modo da obra: <strong>{NOME_MODO[modoObra]}</strong>. Comparado com:{" "}
        <strong>{NOME_MODO[outroModo(modoObra)]}</strong>.
      </p>
      {fase.tipo === "calculando" && (
        <p role="status" aria-live="polite" className="text-muted-foreground">
          Calculando no modo {NOME_MODO[outroModo(modoObra)]}…
        </p>
      )}
      {fase.tipo === "indisponivel" && (
        <p role="status" aria-live="polite" className="text-muted-foreground">
          {fase.mensagem}
        </p>
      )}
      <label className="flex items-center gap-2">
        <span>Tolerância relativa (%)</span>
        <input
          type="text"
          inputMode="decimal"
          className="border-input bg-background h-9 w-16 rounded-md border px-2 text-right tabular-nums"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            const v = Number(e.target.value.replace(",", "."));
            if (e.target.value.trim() !== "" && Number.isFinite(v) && v >= 0 && v <= 100)
              mudarTolerancia(ctx, v / 100);
          }}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={estado.esconderIguais}
          onChange={(e) => mudarEsconder(ctx, e.target.checked)}
        />
        Esconder as peças iguais
      </label>

      <ul className="grid gap-0.5" aria-label="Legenda da comparação">
        {CATEGORIAS.map((c) => (
          <li
            key={c}
            className={`flex items-center gap-2 ${c === "situacao" ? "mt-1" : ""}`}
            data-testid={`comparar-contagem-${c}`}
          >
            <span
              aria-hidden
              className="inline-block size-3 shrink-0 rounded-sm border border-black/20"
              style={{ background: COR_COMPARACAO[c] }}
            />
            <span className="flex-1">{ROTULO_CATEGORIA[c]}</span>
            <span className="tabular-nums">{fase.tipo === "pronto" ? contagem[c] : "—"}</span>
          </li>
        ))}
      </ul>

      {fase.tipo === "pronto" && (
        <section className="grid gap-1">
          <h3 className="font-semibold">Peças que diferem ({lista.length})</h3>
          {lista.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma, com esta tolerância.</p>
          ) : (
            <ul className="grid max-h-72 gap-0.5 overflow-y-auto" data-testid="comparar-lista">
              {lista.map((d) => (
                <ItemDiferenca key={d.chave} ctx={ctx} d={d} unidades={unidades} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

const NOME_TIPO: Record<Elemento3D["tipo"], string> = {
  laje: "Laje",
  viga: "Viga",
  pilar: "Pilar",
  escada: "Escada",
  fundacao: "Fundação",
};

const NOME_ESTADO: Record<EstadoElemento, string> = {
  ok: "sem avisos",
  aviso: "com avisos",
  falha: "falha",
  sem: "sem cálculo",
};

/** Nome e valor formatado da grandeza principal do tipo, nas unidades da sessão. */
function grandeza(tipo: Elemento3D["tipo"], u: SistemaUnidades) {
  if (tipo === "pilar")
    return {
      nome: "Nk",
      fmt: (v: number) =>
        `${formatarNumero(converter(v, "forca", u))} ${GRANDEZAS.nkPilares.unidade(u)}`,
    };
  if (tipo === "laje")
    return {
      nome: "M máx",
      fmt: (v: number) =>
        `${formatarNumero(converter(v, "momentoLinear", u))} ${GRANDEZAS.momentoLajes.unidade(u)}`,
    };
  return {
    nome: "ρ",
    fmt: (v: number) => `${formatarNumero(v, 3)} ${GRANDEZAS.taxaVigas.unidade(u)}`,
  };
}

function ItemDiferenca({
  ctx,
  d,
  unidades,
}: {
  ctx: ContextoVista;
  d: Diferenca;
  unidades: SistemaUnidades;
}) {
  const e = ctx.elemento(d.chave);
  if (!e) return null;
  const g = grandeza(e.tipo, unidades);
  const valor = (v: number | undefined) => (v === undefined ? "—" : g.fmt(v));
  const rel =
    d.relativa !== undefined
      ? ` (${d.relativa > 0 ? "+" : ""}${formatarNumero(100 * d.relativa, 1)} %)`
      : "";
  return (
    <li>
      <button
        type="button"
        className="hover:bg-accent grid w-full gap-0.5 rounded px-1 py-0.5 text-left"
        onClick={() => {
          ctx.selecionar(d.chave);
          const caixa = ctx.caixaDe(d.chave);
          if (caixa) void ctx.enquadrarEm(caixa);
        }}
      >
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2.5 shrink-0 rounded-sm"
            style={{ background: COR_COMPARACAO[d.categoria] }}
          />
          <span className="font-medium">
            {NOME_TIPO[e.tipo]} {e.nome} · {ctx.modelo.niveis[e.nivel]?.nome}
          </span>
        </span>
        {d.categoria === "situacao" && (
          <span>
            Situação: original {NOME_ESTADO[d.original.estado]}, corrigido{" "}
            {NOME_ESTADO[d.corrigido.estado]}
          </span>
        )}
        <span className="text-muted-foreground tabular-nums">
          {g.nome}: original {valor(d.original.grandeza)}, corrigido {valor(d.corrigido.grandeza)}
          {rel}
        </span>
      </button>
    </li>
  );
}

/** Por que não há comparação para esta obra, ou undefined se há. */
function semComparacao(obra: Obra, calculo: Calculo): string | undefined {
  if (normaPorId(obra.norma)?.caminho !== "sistrut")
    return `A obra é pela ${NOME_NORMA[obra.norma]}, que não tem modo de cálculo: a comparação Original × Corrigido vale para as obras pela NB-1/78.`;
  if (calculo.tipo !== "ok")
    return `A obra não tem cálculo no modo dela (${calculo.tipo === "erro" ? calculo.mensagem : "norma sem implementação"}).`;
  return undefined;
}

export const camada: Camada = {
  ativar(ctx) {
    let geracao = 0;
    let obraVista: Obra | null = null;
    let calculoVisto: Calculo | null = null;

    const pronto = (outro: Calculo) => {
      if (outro.tipo !== "ok") {
        estado.fase = {
          tipo: "indisponivel",
          mensagem: `O cálculo no modo ${NOME_MODO[outroModo(ctx.obra.modoCalculo)]} não saiu (${outro.tipo === "erro" ? outro.mensagem : "norma sem implementação"}).`,
        };
        estado.diferencas = new Map();
        limparCena(ctx);
        return avisar();
      }
      estado.fase = { tipo: "pronto" };
      comparar(ctx, outro);
      pintar(ctx);
      avisar();
    };

    // a obra (ou o cálculo dela) mudou: refaz a comparação; o resto ("cena" das cores, do
    // foco e dos tipos ocultos) não muda nada aqui
    const refazer = () => {
      if (ctx.obra === obraVista && ctx.calculo === calculoVisto) return;
      obraVista = ctx.obra;
      calculoVisto = ctx.calculo;
      const g = ++geracao;
      estado.modoObra = ctx.obra.modoCalculo;
      const motivo = semComparacao(ctx.obra, ctx.calculo);
      if (motivo) {
        estado.fase = { tipo: "indisponivel", mensagem: motivo };
        estado.diferencas = new Map();
        limparCena(ctx);
        return avisar();
      }
      if (cache?.obra === ctx.obra) return pronto(cache.outro);
      // as cores do modelo antigo saem enquanto o outro modo calcula
      estado.fase = { tipo: "calculando" };
      estado.diferencas = new Map();
      limparCena(ctx);
      avisar();
      // o cálculo trava a página por centenas de ms: espera um quadro desenhado com o
      // "Calculando…" antes de começar
      const obra = ctx.obra;
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setTimeout(() => {
            if (g !== geracao) return;
            const outro = calcular({ ...obra, modoCalculo: outroModo(obra.modoCalculo) });
            if (g !== geracao) return;
            cache = { obra, outro };
            pronto(outro);
          }),
        ),
      );
    };

    refazer();
    const pararCena = ctx.aoMudar("cena", refazer, ID);
    return () => {
      geracao++;
      pararCena();
      limparCena(ctx);
      estado.diferencas = new Map();
      estado.fase = { tipo: "calculando" };
    };
  },
  Painel,
};
