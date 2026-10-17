// Camada "Sequência construtiva 4D": a obra montada etapa por etapa (fundação; em cada
// nível, pilares, fôrma e vigas, lajes), com datas por etapa a partir de uma data de
// início. O concluído aparece normal, a etapa em andamento ganha cor própria
// (`definirCores`, só quando a etapa muda) e o futuro some (`definirFiltro`) ou fica
// transparente (`definirTransparencia`). As etapas e as datas saem de etapas.ts.
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { Camada, ContextoVista } from "../api";
import {
  cronogramaCsv,
  DURACAO_PADRAO,
  dataBr,
  datasDaEtapa,
  diasValidos,
  type Etapa,
  etapaNoDia,
  gerarEtapas,
  pecasNoDia,
  ROTULO_ETAPA,
  somarDias,
  TIPOS_ETAPA,
  totalDias,
  type TipoEtapa,
} from "./etapas";

const ID = "sequencia";
/** Cor da etapa em andamento: violeta, fora das cores de situação, da seleção, da
 *  rampa azul e da marca de defeito. */
export const COR_EM_OBRA = "#8b5cf6";
const VELOCIDADES = [1, 2, 5, 10];

const movimentoReduzido = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function hoje() {
  const d = new Date();
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** Escolhas do usuário: ficam no módulo entre ligar e desligar a camada. */
const opcoes = {
  inicio: hoje(),
  duracoes: { ...DURACAO_PADRAO },
  /** Dias decorridos desde o início (0 = primeiro dia; o total = obra concluída). */
  dia: 0,
  passo: "dia" as "dia" | "etapa",
  /** Passos (dias ou etapas) por segundo na reprodução. */
  velocidade: 2,
  futuro: "oculto" as "oculto" | "transparente",
  seguir: false,
};

/** Estado da camada ligada; null com ela desligada. */
interface Sessao {
  etapas: Etapa[];
  atual: number;
  tocando: boolean;
  irParaDia(dia: number): void;
  regenerar(): void;
  alternarReproducao(): void;
  aplicarFuturo(): void;
  enquadrar(forcar: boolean): void;
}
let sessao: Sessao | null = null;

// o Painel redesenha quando a sessão avisa
let versao = 0;
const ouvintes = new Set<() => void>();
const avisar = () => {
  versao++;
  for (const f of ouvintes) f();
};
const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => void ouvintes.delete(f);
};

function criarSessao(ctx: ContextoVista): { sessao: Sessao; limpar: () => void } {
  let modelo = ctx.modelo;
  let conhecidas = new Set<string>();
  let visiveis = new Set<string>();
  let aplicada: number | null = null; // etapa em andamento já aplicada (−1 = concluída)
  let nivelEnquadrado: number | null = null;
  let pararQuadro: (() => void) | null = null;
  let travado = false;

  const travar = (sim: boolean) => {
    if (sim === travado) return;
    travado = sim;
    ctx.travarControles(sim);
  };

  const s: Sessao = {
    etapas: [],
    atual: -1,
    tocando: false,

    irParaDia(dia) {
      opcoes.dia = Math.max(0, Math.min(Math.round(dia), totalDias(s.etapas)));
      const atual = etapaNoDia(s.etapas, opcoes.dia);
      s.atual = atual;
      if (atual !== aplicada) {
        aplicada = atual;
        const pecas = pecasNoDia(s.etapas, opcoes.dia);
        visiveis = pecas.visiveis;
        const { emObra } = pecas;
        ctx.definirCores(
          ID,
          emObra.size ? (e) => (emObra.has(e.chave) ? COR_EM_OBRA : null) : null,
        );
        s.aplicarFuturo();
        s.enquadrar(false);
      }
      avisar();
    },

    regenerar() {
      modelo = ctx.modelo;
      s.etapas = gerarEtapas(modelo, opcoes.duracoes);
      conhecidas = new Set(modelo.elementos.map((e) => e.chave));
      aplicada = null;
      nivelEnquadrado = null;
      s.irParaDia(opcoes.dia);
    },

    alternarReproducao() {
      if (s.tocando) {
        s.tocando = false;
        pararQuadro?.();
        pararQuadro = null;
        travar(false);
        avisar();
        return;
      }
      const total = totalDias(s.etapas);
      if (total === 0) return;
      if (opcoes.dia >= total) s.irParaDia(0);
      s.tocando = true;
      travar(opcoes.seguir);
      let acumulado = 0;
      pararQuadro = ctx.aoQuadro((dt) => {
        acumulado += dt * opcoes.velocidade;
        if (acumulado < 1) return;
        const passos = Math.floor(acumulado);
        acumulado -= passos;
        if (opcoes.passo === "dia") s.irParaDia(opcoes.dia + passos);
        else {
          const prox = s.etapas[Math.max(s.atual, 0) + passos];
          s.irParaDia(s.atual < 0 || !prox ? totalDias(s.etapas) : prox.inicio);
        }
        if (opcoes.dia >= totalDias(s.etapas)) s.alternarReproducao();
      });
      avisar();
    },

    /** O futuro some (filtro, barato) ou fica transparente (refaz a geometria). Peça
     *  desconhecida (modelo novo, antes de `regenerar`) aparece normal. */
    aplicarFuturo() {
      const futuro = (chave: string) => conhecidas.has(chave) && !visiveis.has(chave);
      if (opcoes.futuro === "transparente") {
        ctx.definirFiltro(ID, null);
        ctx.definirTransparencia(ID, (e) => futuro(e.chave));
      } else {
        ctx.definirTransparencia(ID, null);
        ctx.definirFiltro(ID, (e) => !futuro(e.chave));
      }
    },

    /** Câmera no nível da etapa em andamento (obra concluída: o prédio inteiro). Sem
     *  `forcar`, só quando o nível muda. */
    enquadrar(forcar) {
      if (!opcoes.seguir) return;
      const etapa = s.etapas[s.atual];
      const nivel = etapa ? etapa.nivel : -1;
      if (!forcar && nivel === nivelEnquadrado) return;
      nivelEnquadrado = nivel;
      const alvo = etapa ? ctx.caixaDoNivel(nivel) : ctx.esferaVisivel();
      if (!alvo) return;
      // "cancelada": outra coisa (o usuário, a vista, outra camada) assumiu a câmera; não
      // insiste. O próximo nível enquadra de novo.
      void ctx.enquadrarEm(alvo, !movimentoReduzido());
    },
  };

  // obra editada (modelo novo): as etapas mudam
  const pararCena = ctx.aoMudar("cena", () => {
    if (ctx.modelo !== modelo) s.regenerar();
  });
  // a câmera reenquadra quando o explodido termina
  const pararExplodido = ctx.aoMudar("explodido", () => {
    if (!ctx.explodidoEmAnimacao) s.enquadrar(true);
  });

  s.regenerar();
  ctx.definirLegenda(ID, {
    titulo: "Sequência construtiva",
    itens: [{ cor: COR_EM_OBRA, rotulo: "Etapa em andamento" }],
  });

  const limpar = () => {
    pararQuadro?.();
    pararCena();
    pararExplodido();
    s.tocando = false;
    travar(false);
    ctx.definirFiltro(ID, null);
    ctx.definirTransparencia(ID, null);
    ctx.definirLegenda(ID, null);
    ctx.definirCores(ID, null);
    ctx.pedirRender();
  };
  return { sessao: s, limpar };
}

function baixarCsv(ctx: ContextoVista, etapas: readonly Etapa[]) {
  const csv = cronogramaCsv(etapas, opcoes.inicio);
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  const nome = ctx.obra.nome.trim().replaceAll(/[^\p{L}\p{N}]+/gu, "-") || "obra";
  a.href = url;
  a.download = `cronograma-${nome}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const campo = "border-input bg-background h-8 rounded-md border px-2";

function Painel({ ctx }: { ctx: ContextoVista }) {
  useSyncExternalStore(assinar, () => versao);
  const s = sessao;
  if (!s) return null;
  const mudar = (f: () => void) => {
    f();
    avisar();
  };
  const { etapas, atual } = s;
  const total = totalDias(etapas);
  if (total === 0) return <p className="text-muted-foreground text-xs">A obra não tem peças.</p>;
  const etapa = etapas[atual];
  const fimObra = somarDias(opcoes.inicio, total - 1);
  const porEtapa = opcoes.passo === "etapa";

  return (
    <div className="grid gap-2 text-xs">
      <label className="flex items-center justify-between gap-2">
        <span>Início da obra</span>
        <input
          type="date"
          className={campo}
          value={opcoes.inicio}
          onChange={(e) => e.target.value && mudar(() => (opcoes.inicio = e.target.value))}
        />
      </label>

      <fieldset className="grid gap-1">
        <legend className="mb-1">Duração de cada etapa (dias corridos)</legend>
        <div className="grid grid-cols-2 gap-1">
          {TIPOS_ETAPA.map((t: TipoEtapa) => (
            <label key={t} className="flex items-center justify-between gap-1">
              <span>{ROTULO_ETAPA[t]}</span>
              <input
                type="number"
                min={1}
                step={1}
                className={`${campo} w-14 text-right tabular-nums`}
                aria-label={`Dias de ${ROTULO_ETAPA[t].toLowerCase()}`}
                value={opcoes.duracoes[t]}
                onChange={(e) =>
                  mudar(() => {
                    opcoes.duracoes[t] = diasValidos(Number(e.target.value));
                    s.regenerar();
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="text-muted-foreground">
          Padrão de obra pequena com uma equipe: fundação {DURACAO_PADRAO.fundacao} d; por nível,
          pilares {DURACAO_PADRAO.pilares} d, fôrma e vigas {DURACAO_PADRAO.vigas} d e lajes{" "}
          {DURACAO_PADRAO.lajes} d (a escada entra com as lajes do nível de cima). As etapas correm
          uma depois da outra. Ajuste à sua obra.
        </p>
      </fieldset>

      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="tabular-nums" aria-live="polite">
            {dataBr(somarDias(opcoes.inicio, Math.min(opcoes.dia, total - 1)))} · dia{" "}
            {Math.min(opcoes.dia + 1, total)} de {total}
          </span>
          <select
            className={campo}
            aria-label="Passo da linha do tempo"
            value={opcoes.passo}
            onChange={(e) => mudar(() => (opcoes.passo = e.target.value as "dia" | "etapa"))}
          >
            <option value="dia">por dia</option>
            <option value="etapa">por etapa</option>
          </select>
        </div>
        <input
          type="range"
          aria-label="Linha do tempo"
          min={0}
          max={porEtapa ? etapas.length : total}
          step={1}
          value={porEtapa ? (atual < 0 ? etapas.length : atual) : opcoes.dia}
          onChange={(e) => {
            const v = Number(e.target.value);
            s.irParaDia(porEtapa ? (etapas[v]?.inicio ?? total) : v);
          }}
        />
        <p>
          {etapa ? (
            <>
              <span
                className="mr-1 inline-block size-2.5 rounded-sm align-middle"
                style={{ background: COR_EM_OBRA }}
              />
              Em andamento: <strong>{etapa.nome}</strong> (etapa {atual + 1} de {etapas.length})
            </>
          ) : (
            <>Obra concluída em {dataBr(fimObra)}.</>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button size="xs" variant="outline" onClick={() => s.irParaDia(0)}>
          Início
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={atual <= 0 && opcoes.dia === 0}
          onClick={() => {
            const k = atual < 0 ? etapas.length - 1 : atual - 1;
            s.irParaDia(etapas[Math.max(k, 0)]!.inicio);
          }}
        >
          Etapa anterior
        </Button>
        <Button
          size="xs"
          variant={s.tocando ? "secondary" : "default"}
          onClick={s.alternarReproducao}
        >
          {s.tocando ? "Pausar" : "Reproduzir"}
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={atual < 0}
          onClick={() => s.irParaDia(etapas[atual + 1]?.inicio ?? total)}
        >
          Próxima etapa
        </Button>
        <select
          className={campo}
          aria-label="Velocidade"
          value={opcoes.velocidade}
          onChange={(e) => mudar(() => (opcoes.velocidade = Number(e.target.value)))}
        >
          {VELOCIDADES.map((v) => (
            <option key={v} value={v}>
              {v} {porEtapa ? (v === 1 ? "etapa" : "etapas") : v === 1 ? "dia" : "dias"}/s
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center justify-between gap-2">
        <span>Etapas futuras</span>
        <select
          className={campo}
          value={opcoes.futuro}
          onChange={(e) =>
            mudar(() => {
              opcoes.futuro = e.target.value as "oculto" | "transparente";
              s.aplicarFuturo();
            })
          }
        >
          <option value="oculto">escondidas</option>
          <option value="transparente">transparentes</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={opcoes.seguir}
          onChange={(e) =>
            mudar(() => {
              opcoes.seguir = e.target.checked;
              s.enquadrar(true);
            })
          }
        />
        Câmera acompanha o nível em obra
        {movimentoReduzido() && " (sem animação)"}
      </label>

      <ol className="grid max-h-56 gap-px overflow-y-auto rounded-md border" aria-label="Etapas">
        {etapas.map((e, i) => {
          const d = datasDaEtapa(e, opcoes.inicio);
          const feita = atual < 0 || i < atual;
          return (
            <li key={`${e.tipo}|${e.nivel}`}>
              <button
                type="button"
                aria-current={i === atual ? "step" : undefined}
                className={`hover:bg-muted grid w-full grid-cols-[1fr_auto] gap-x-2 px-2 py-1 text-left ${
                  i === atual ? "bg-muted font-semibold" : feita ? "" : "text-muted-foreground"
                }`}
                style={i === atual ? { boxShadow: `inset 3px 0 0 ${COR_EM_OBRA}` } : undefined}
                onClick={() => s.irParaDia(e.inicio)}
              >
                <span>
                  {i + 1}. {e.nome}
                </span>
                <span className="tabular-nums">{e.dias} d</span>
                <span className="text-muted-foreground col-span-2 tabular-nums">
                  {dataBr(d.inicio)} a {dataBr(d.fim)} · {e.chaves.length} peças
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <Button size="xs" variant="outline" onClick={() => baixarCsv(ctx, etapas)}>
        Cronograma CSV
      </Button>
    </div>
  );
}

export const camada: Camada = {
  ativar(ctx) {
    const { sessao: s, limpar } = criarSessao(ctx);
    sessao = s;
    return () => {
      limpar();
      if (sessao === s) sessao = null;
      avisar();
    };
  },
  Painel,
};
