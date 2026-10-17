// Camada "Realidade aumentada": põe o prédio, como está na vista, sobre a mesa (maquete
// 1:50, 1:100 ou 1:200) ou no terreno (1:1) pela câmera do celular, com WebXR
// "immersive-ar" e hit-test. Sem suporte (computador, iPhone, Android sem ARCore), o
// Painel diz por quê e aponta a exportação glTF da vista. Ligar a camada só consulta o
// suporte; nada roda a cada quadro fora da sessão.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Camada, ContextoVista } from "../api";
import { mudarEstadoAr, type MotivoSemAr, type Suporte, useEstadoAr } from "./estado";
import { caixaDasVisiveis, ESCALAS, type EscalaAr, fatorDaEscala } from "./maquete";
import { abrirAr, encerrarAr, escolherEscala, sairDaAr } from "./sessao";

async function verificarSuporte(): Promise<Suporte> {
  if (!window.isSecureContext) return { tipo: "nao", motivo: "https" };
  const xr = navigator.xr;
  if (!xr) return { tipo: "nao", motivo: "semWebxr" };
  try {
    return (await xr.isSessionSupported("immersive-ar"))
      ? { tipo: "sim" }
      : { tipo: "nao", motivo: "semAr" };
  } catch {
    return { tipo: "nao", motivo: "bloqueado" };
  }
}

const MOTIVO: Record<MotivoSemAr, string> = {
  https:
    "A realidade aumentada só abre em página segura (https). Abra o app pelo endereço publicado.",
  semWebxr:
    "Este navegador não tem WebXR. No iPhone e no iPad, o Safari não abre realidade aumentada pela web; no Android, use o Chrome.",
  semAr:
    "O navegador tem WebXR, mas este aparelho não abre realidade aumentada: é um computador, ou um Android sem o “Google Play Services para RA” (ARCore).",
  bloqueado:
    "O navegador recusou a consulta de realidade aumentada (permissão ou política da página).",
};

/** Tamanho da maquete na escala: largura × profundidade de planta e altura, em cm (ou m
 *  na 1:1), do que aparece na vista. */
function tamanhoNaEscala(ctx: ContextoVista, escala: EscalaAr) {
  const caixa = caixaDasVisiveis(
    ctx.modelo.elementos.map((e) => e.chave),
    (k) => ctx.estaVisivel(k),
    (k) => ctx.caixaDe(k),
  );
  if (caixa.isEmpty()) return null;
  const f = fatorDaEscala(escala);
  const real = escala === "1:1";
  const n = (m: number) =>
    (real ? m : m * f * 100).toLocaleString("pt-BR", { maximumFractionDigits: real ? 1 : 0 });
  const u = real ? "m" : "cm";
  const t = caixa.max.clone().sub(caixa.min);
  return `${n(t.x)} × ${n(t.z)} ${u} de planta e ${n(t.y)} ${u} de altura`;
}

/** Baixa o modelo visível em .glb (a alternativa sem realidade aumentada). */
async function baixarGlb(ctx: ContextoVista) {
  const dados = await ctx.exportarGlb();
  const url = URL.createObjectURL(new Blob([dados], { type: "model/gltf-binary" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(ctx.obra.nome || "obra").replace(/[^\w\-. ]+/g, "_")}-3d.glb`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Painel({ ctx }: { ctx: ContextoVista }) {
  const { suporte, fase, escala, erro } = useEstadoAr();
  // o tamanho acompanha foco, filtros e cortes
  const [, redesenhar] = useState(0);
  useEffect(() => ctx.aoMudar("visibilidade", () => redesenhar((n) => n + 1)), [ctx]);

  if (suporte.tipo === "verificando")
    return (
      <p className="text-muted-foreground text-xs">
        Verificando se este aparelho abre realidade aumentada…
      </p>
    );

  if (suporte.tipo === "nao")
    return (
      <div role="note" className="grid gap-1.5 rounded-md border p-2 text-xs">
        <p className="font-medium">Realidade aumentada indisponível neste aparelho.</p>
        <p>{MOTIVO[suporte.motivo]}</p>
        <p>
          Alternativa: baixe as peças visíveis em glTF (.glb), com as cores da vista (o mesmo do
          botão <strong>glTF (.glb)</strong> em Exportar), e abra o arquivo num visualizador de glTF
          ou de realidade aumentada que aceite .glb. O visualizador de RA do iPhone (Quick Look) só
          abre .usdz: converta o .glb antes.
        </p>
        <Button size="sm" variant="outline" className="w-fit" onClick={() => void baixarGlb(ctx)}>
          Baixar .glb
        </Button>
      </div>
    );

  const tamanho = tamanhoNaEscala(ctx, escala);
  const fora = fase === "fora";
  return (
    <div className="grid gap-2 text-xs">
      <label className="grid gap-1">
        <span>Escala</span>
        <select
          className="border-input bg-background h-9 rounded-md border px-2"
          value={escala}
          onChange={(e) => escolherEscala(e.target.value as EscalaAr)}
        >
          {ESCALAS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.id === "1:1" ? "1:1 (tamanho real, no terreno)" : `${e.id} (maquete na mesa)`}
            </option>
          ))}
        </select>
      </label>
      {tamanho && (
        <p className="text-muted-foreground">
          Em {escala}: {tamanho}.
        </p>
      )}
      {fora ? (
        <Button size="sm" className="compacto:h-9" onClick={() => abrirAr(ctx)}>
          {escala === "1:1" ? "Ver no terreno" : "Ver na mesa"}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <span role="status">
            {fase === "abrindo" ? "Abrindo a realidade aumentada…" : "Realidade aumentada aberta."}
          </span>
          <Button size="xs" variant="outline" className="compacto:h-9" onClick={sairDaAr}>
            {fase === "abrindo" ? "Cancelar" : "Sair"}
          </Button>
        </div>
      )}
      <p className="text-muted-foreground">
        Abre a câmera do celular. Aponte para a mesa ou o chão, toque para pôr o prédio e gire com
        dois dedos. Aparece o que está visível na vista agora: foco, filtros, cores e cortes.
      </p>
      {erro && (
        <p role="alert" className="text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

export const camada: Camada = {
  ativar() {
    let ligada = true;
    mudarEstadoAr({ suporte: { tipo: "verificando" }, erro: null });
    void verificarSuporte().then((suporte) => {
      if (ligada) mudarEstadoAr({ suporte });
    });
    return () => {
      ligada = false;
      encerrarAr();
    };
  },
  Painel,
};
