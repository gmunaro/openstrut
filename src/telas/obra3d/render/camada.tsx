// Camada "Render realista": materiais PBR com a cor da vista (situação ou grandeza),
// ambiente de estúdio, sol com sombra e, opcional, path tracing progressivo quando a câmera
// para. O Painel tem rugosidade, luz, sombras, path tracing com contador de amostras e
// "Baixar imagem". Desligar devolve materiais, luzes, tone mapping e sombras da vista.
import { useSyncExternalStore } from "react";
import { type Material, Mesh, type MeshStandardMaterial } from "three";
import { Button } from "@/components/ui/button";
import type { Camada, ContextoVista, PapelMaterial } from "../api";
import { type Iluminacao, ligarIluminacao } from "./iluminacao";
import { materialPBR } from "./materiais";
import type { Tracador } from "./tracado";

type SituacaoTracado = "desligado" | "carregando" | "ligado" | "erro";

/** Escolhas do usuário e estado mostrado no Painel; ficam no módulo entre ligar e
 *  desligar a camada. */
let estado = {
  rugosidade: 0.85,
  luz: 1,
  /** No celular (ponteiro grosso) a sombra começa desligada: custa ~15 % do quadro. */
  sombras: !(typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches),
  /** O usuário quer o path tracing (vale de novo ao religar a camada). */
  querTracado: false,
  tracado: "desligado" as SituacaoTracado,
  amostras: 0,
  erro: "",
};
const ouvintes = new Set<() => void>();
function mudar(p: Partial<typeof estado>) {
  estado = { ...estado, ...p };
  ouvintes.forEach((f) => f());
}
const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => void ouvintes.delete(f);
};

/** O que a camada ligou na vista atual (null com a camada desligada). */
let sessao: {
  ctx: ContextoVista;
  materiais: Partial<Record<PapelMaterial, Material>>;
  luz: Iluminacao;
  tracador: Tracador | null;
} | null = null;

const ehSolido = (m: Mesh) => sessao !== null && m.material === sessao.materiais.solido;

function definirRugosidade(r: number) {
  mudar({ rugosidade: r });
  if (!sessao) return;
  for (const p of ["solido", "fantasma"] as const) {
    const m = sessao.materiais[p] as MeshStandardMaterial | undefined;
    if (m) m.roughness = r;
  }
  sessao.tracador?.materiaisMudaram();
  sessao.ctx.pedirRender();
}

function definirLuz(f: number) {
  mudar({ luz: f });
  if (!sessao) return;
  sessao.luz.definirLuz(f);
  sessao.tracador?.materiaisMudaram();
  sessao.ctx.pedirRender();
}

function definirSombras(sim: boolean) {
  mudar({ sombras: sim });
  sessao?.luz.definirSombras(sim);
}

async function ligarTracado(sim: boolean) {
  const s = sessao;
  if (!s) return;
  if (!sim) {
    s.tracador?.limpar();
    s.tracador = null;
    mudar({ querTracado: false, tracado: "desligado", amostras: 0 });
    return;
  }
  mudar({ querTracado: true, tracado: "carregando", erro: "" });
  try {
    const { ligarTracado } = await import("./tracado");
    // a camada pode ter desligado enquanto o código baixava
    if (sessao !== s || !estado.querTracado || s.tracador) return;
    s.tracador = ligarTracado(
      s.ctx,
      (n) => {
        if (n !== estado.amostras) mudar({ amostras: n });
      },
      // fora do quadro: a limpeza mexe no onAfterRender que está rodando
      (e) => queueMicrotask(() => falhouTracado(s, e)),
    );
    mudar({ tracado: "ligado", amostras: 0 });
  } catch (e) {
    falhouTracado(s, e);
  }
}

function falhouTracado(s: NonNullable<typeof sessao>, e: unknown) {
  s.tracador?.limpar();
  s.tracador = null;
  mudar({
    querTracado: false,
    tracado: "erro",
    amostras: 0,
    erro: e instanceof Error ? e.message : String(e),
  });
}

/** Baixa o canvas em PNG: desenha o quadro (com a amostra acumulada, se houver) e lê o
 *  canvas na mesma tarefa, antes de o navegador limpar o buffer. */
function baixarImagem(ctx: ContextoVista) {
  ctx.renderer.render(ctx.cena, ctx.camera);
  const url = ctx.renderer.domElement.toDataURL("image/png");
  const a = document.createElement("a");
  const nome = (ctx.obra.nome || "obra").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  a.href = url;
  a.download = `${nome || "obra"}-render.png`;
  a.click();
}

function Painel({ ctx }: { ctx: ContextoVista }) {
  const e = useSyncExternalStore(assinar, () => estado);
  const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return (
    <div className="grid gap-2 text-xs">
      <label className="grid gap-1">
        <span>Rugosidade do concreto: {num(e.rugosidade)}</span>
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={e.rugosidade}
          onChange={(ev) => definirRugosidade(Number(ev.target.value))}
        />
      </label>
      <label className="grid gap-1">
        <span>Intensidade da luz: {num(e.luz)}×</span>
        <input
          type="range"
          min={0.25}
          max={2}
          step={0.05}
          value={e.luz}
          onChange={(ev) => definirLuz(Number(ev.target.value))}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={e.sombras}
          onChange={(ev) => definirSombras(ev.target.checked)}
        />
        Sombras do sol
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={e.querTracado}
          disabled={e.tracado === "carregando"}
          onChange={(ev) => void ligarTracado(ev.target.checked)}
        />
        Path tracing quando a câmera para
      </label>
      {e.tracado !== "desligado" && (
        <p role="status" aria-live="polite" className="text-muted-foreground tabular-nums">
          {e.tracado === "carregando" && "Carregando o path tracing…"}
          {e.tracado === "ligado" &&
            (e.amostras > 0
              ? `Amostras: ${e.amostras}`
              : "Amostras: 0 (câmera mexendo ou preparando)")}
          {e.tracado === "erro" && `O path tracing não funcionou neste navegador (${e.erro}).`}
        </p>
      )}
      {e.tracado === "ligado" && (
        <p className="text-muted-foreground">
          O path tracing não aplica os planos de corte nem desenha as arestas e os rótulos.
        </p>
      )}
      <Button
        size="xs"
        variant="outline"
        className="compacto:h-9 w-fit"
        onClick={() => baixarImagem(ctx)}
      >
        Baixar imagem
      </Button>
    </div>
  );
}

export const camada: Camada = {
  ativar(ctx) {
    const materiais: Partial<Record<PapelMaterial, Material>> = {};
    const luz = ligarIluminacao(ctx, estado.luz, estado.sombras);
    const s = { ctx, materiais, luz, tracador: null as Tracador | null };
    sessao = s;
    // a vista chama a fábrica uma vez por papel e descarta os materiais na troca
    ctx.definirMateriais((papel) => (materiais[papel] = materialPBR(papel, estado.rugosidade)));
    luz.atualizar(ehSolido);
    const geometria = () => {
      luz.atualizar(ehSolido);
      s.tracador?.cenaMudou();
    };
    const parar = [
      ctx.aoMudar("cena", geometria),
      ctx.aoMudar("visibilidade", geometria),
      ctx.aoMudar("explodido", geometria),
      ctx.aoMudar("selecao", () => s.tracador?.cenaMudou()),
      ctx.aoMudar("camera", () => s.tracador?.cameraMexeu()),
    ];
    if (estado.querTracado) void ligarTracado(true);
    return () => {
      parar.forEach((f) => f());
      s.tracador?.limpar();
      sessao = null;
      luz.limpar();
      ctx.definirMateriais(null);
      mudar({ tracado: "desligado", amostras: 0 });
      ctx.pedirRender();
    };
  },
  Painel,
};
