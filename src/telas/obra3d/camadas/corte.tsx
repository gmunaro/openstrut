// Camada "Corte por pavimento": um plano horizontal a uma altura acima da laje do nível
// escolhido corta tudo o que está acima, como a planta de fôrma (os pilares do nível de
// cima aparecem cortados). Usa só o contexto da vista (camadas.ts): é o exemplo vivo do
// ponto de extensão.
import { useState } from "react";
import { Plane, Vector3 } from "three";
import type { Camada, ContextoVista } from "../camadas";

/** Estado do corte, guardado entre ligar e desligar a camada. */
const corte = { nivel: -1, altura: 1 };

function aplicar(ctx: ContextoVista) {
  const n = ctx.modelo.niveis[corte.nivel];
  if (!n) return ctx.definirPlanosCorte("corte", []);
  const y = ctx.alturaNaCena(n.indice, n.cota + corte.altura);
  // fica o lado positivo: −Y + y ≥ 0, ou seja, abaixo da altura do corte
  ctx.definirPlanosCorte("corte", [new Plane(new Vector3(0, -1, 0), y)]);
}

function Painel({ ctx }: { ctx: ContextoVista }) {
  const [nivel, setNivel] = useState(corte.nivel);
  const [altura, setAltura] = useState(corte.altura);
  const mudar = (n: number, a: number) => {
    corte.nivel = n;
    corte.altura = a;
    setNivel(n);
    setAltura(a);
    aplicar(ctx);
  };
  return (
    <div className="grid gap-2 text-xs">
      <label className="grid gap-1">
        <span>Cortar acima do pavimento</span>
        <select
          className="border-input bg-background h-9 rounded-md border px-2"
          value={nivel}
          onChange={(e) => mudar(Number(e.target.value), altura)}
        >
          {ctx.modelo.niveis.toReversed().map((n) => (
            <option key={n.chave} value={n.indice}>
              {n.nome} (+{n.cota.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} m)
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span>
          Altura do corte acima da face de cima da laje: {altura.toLocaleString("pt-BR")} m
        </span>
        <input
          type="range"
          min={0.1}
          max={2.5}
          step={0.1}
          value={altura}
          onChange={(e) => mudar(nivel, Number(e.target.value))}
        />
      </label>
    </div>
  );
}

export const camada: Camada = {
  ativar(ctx) {
    const niveis = ctx.modelo.niveis.length;
    if (corte.nivel < 0 || corte.nivel >= niveis) corte.nivel = Math.max(0, niveis - 2);
    aplicar(ctx);
    // a altura acompanha o explodido (a cada quadro da animação) e o modelo novo
    const pararCena = ctx.aoMudar("cena", () => aplicar(ctx));
    const pararExplodido = ctx.aoMudar("explodido", () => aplicar(ctx));
    return () => {
      pararCena();
      pararExplodido();
      ctx.definirPlanosCorte("corte", []);
    };
  },
  Painel,
};
