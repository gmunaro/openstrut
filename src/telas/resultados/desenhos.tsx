// Desenhos do detalhamento na aba Resultados e no relatório: o esquema das barras ao
// longo da viga (com os apoios e as cotas dos vãos) e o corte da seção do pilar (barras,
// estribo e cotas b e h). Medidas em cm, como as posições do detalhamento.
// No celular o desenho mantém o tamanho de leitura e rola de lado, em vez de encolher.
import type { PosicaoArmadura } from "../../calculo/detalhamento/vigas";
import type { PosicaoPilar } from "../../calculo/detalhamento/pilares";
import {
  rotuloPhi,
  rotuloPosicao,
  type DetalhamentoPilarObra,
  type DetalhamentoVigaObra,
  type LanceDetalhadoObra,
} from "../detalhamento";
import { formatarNumero } from "../formato";

/** Largura do esquema da viga e alturas das faixas, px. */
const LARGURA_ESQUEMA = 760;
const MARGEM = 16;
const FAIXA = 20;
const ALTURA_VIGA = 22;
const GANCHO_PX = 6;
/** Faixa das cotas dos vãos e dos nomes dos apoios, embaixo de tudo. */
const FAIXA_COTAS = 36;
const LETRA = 11;

const emCima = (p: PosicaoArmadura) => p.tipo === "negativa" || p.tipo === "porta-estribos";

/** Vãos entre nós consecutivos, cm (os x dos nós contam do primeiro). */
export const vaosDosNos = (nos: readonly number[]) => nos.slice(1).map((x, k) => x - (nos[k] ?? 0));

/**
 * Esquema da viga, com escala só na horizontal: barras superiores (negativas e
 * porta-estribos) em faixas acima do contorno, inferiores (positivas e construtivas)
 * abaixo e os estribos na última faixa. Cada barra vai de xInicio a xFim, com um
 * tracinho onde há gancho. Os apoios aparecem com a largura deles e, na faixa de baixo,
 * a cota de cada vão (entre eixos de apoio, cm) e o nome do apoio.
 */
export function EsquemaViga({ d }: { d: DetalhamentoVigaObra }) {
  const ps = d.detalhamento.posicoes;
  const sup = ps.filter(emCima);
  const inf = ps.filter((p) => !emCima(p) && p.tipo !== "estribo");
  const est = ps.filter((p) => p.tipo === "estribo");
  const meia = (k: number) => (d.larguraApoios[k] ?? 0) / 2;
  const xs = [
    ...ps.flatMap((p) => [p.xInicio, p.xFim]),
    ...d.nos.flatMap((x, k) => [x - meia(k), x + meia(k)]),
  ];
  const xMin = Math.min(...xs);
  const escala = (LARGURA_ESQUEMA - 2 * MARGEM) / Math.max(Math.max(...xs) - xMin, 1);
  const px = (x: number) => MARGEM + (x - xMin) * escala;
  const inicioViga = d.nos[0] ?? 0;
  const fimViga = d.nos.at(-1) ?? 0;

  const topoViga = MARGEM + sup.length * FAIXA + 4;
  const baseViga = topoViga + ALTURA_VIGA;
  const fimBarras = baseViga + 4 + (inf.length + est.length) * FAIXA;
  const yCota = fimBarras + 14;
  const altura = yCota + FAIXA_COTAS - 8;
  // as de cima empilham a partir da viga para cima; as de baixo, para baixo
  const ySup = (i: number) => topoViga - 4 - (sup.length - 1 - i) * FAIXA;
  const yInf = (i: number) => baseViga + 4 + i * FAIXA + FAIXA / 2;
  const rotulo = (x: number, y: number, p: PosicaoArmadura) => (
    <text x={x} y={y} textAnchor="middle" fontSize={LETRA} className="fill-current">
      {rotuloPosicao(p)}
    </text>
  );

  /** Barra longitudinal na altura y; o gancho desce (gancho > 0) ou sobe. */
  const barra = (p: PosicaoArmadura, y: number, gancho: number) => {
    const [a, b] = [px(p.xInicio), px(p.xFim)];
    const caminho = [
      p.ganchoInicio > 0 ? `M${a},${y + gancho} L${a},${y}` : `M${a},${y}`,
      `L${b},${y}`,
      p.ganchoFim > 0 ? `L${b},${y + gancho}` : "",
    ].join(" ");
    return (
      <g key={p.numero}>
        <path d={caminho} fill="none" strokeWidth={1.5} className="stroke-current" />
        {rotulo((a + b) / 2, y - 3, p)}
      </g>
    );
  };

  return (
    <div className="max-w-full overflow-x-auto">
      <svg
        role="img"
        aria-label={`Esquema das barras de ${d.nome}, cotas em cm`}
        viewBox={`0 0 ${LARGURA_ESQUEMA} ${altura}`}
        width={LARGURA_ESQUEMA}
        height={altura}
        className="text-foreground max-w-none"
      >
        {d.nos.map((x, k) =>
          meia(k) > 0 ? (
            <rect
              key={`apoio${k}`}
              x={px(x - meia(k))}
              y={topoViga - 3}
              width={Math.max(2 * meia(k) * escala, 2)}
              height={ALTURA_VIGA + 6}
              strokeWidth={0.75}
              className="fill-muted stroke-muted-foreground"
            />
          ) : null,
        )}
        <rect
          x={px(inicioViga)}
          y={topoViga}
          width={(fimViga - inicioViga) * escala}
          height={ALTURA_VIGA}
          fill="none"
          strokeWidth={0.75}
          className="stroke-muted-foreground"
        />
        {sup.map((p, i) => barra(p, ySup(i), GANCHO_PX))}
        {inf.map((p, i) => barra(p, yInf(i), -GANCHO_PX))}
        {est.map((p, i) => {
          const y = yInf(inf.length + i);
          const [a, b] = [px(p.xInicio), px(p.xFim)];
          // um tracinho por estribo (até 60, para não borrar)
          const n = Math.min(p.quantidade, 60);
          return (
            <g key={p.numero}>
              {Array.from({ length: n }, (_, k) => {
                const x = n > 1 ? a + ((b - a) * k) / (n - 1) : a;
                return (
                  <line
                    key={k}
                    x1={x}
                    x2={x}
                    y1={y - 4}
                    y2={y + 4}
                    strokeWidth={0.75}
                    className="stroke-current"
                  />
                );
              })}
              {rotulo((a + b) / 2, y - 6, p)}
            </g>
          );
        })}
        <CotasVaos d={d} px={px} y={yCota} />
      </svg>
    </div>
  );
}

/** Linha de cota entre os eixos dos apoios, com o vão (cm) no meio de cada trecho e o
 *  nome do apoio embaixo de cada traço. */
function CotasVaos({
  d,
  px,
  y,
}: {
  d: DetalhamentoVigaObra;
  px: (x: number) => number;
  y: number;
}) {
  const vaos = vaosDosNos(d.nos);
  return (
    <g className="text-muted-foreground" fontSize={LETRA}>
      <line
        x1={px(d.nos[0] ?? 0)}
        x2={px(d.nos.at(-1) ?? 0)}
        y1={y}
        y2={y}
        strokeWidth={0.75}
        className="stroke-current"
      />
      {d.nos.map((x, k) => (
        <g key={k}>
          <line
            x1={px(x)}
            x2={px(x)}
            y1={y - 5}
            y2={y + 5}
            strokeWidth={0.75}
            className="stroke-current"
          />
          {d.nomesApoios[k] ? (
            <text x={px(x)} y={y + 17} textAnchor="middle" className="fill-current font-medium">
              {d.nomesApoios[k]}
            </text>
          ) : null}
        </g>
      ))}
      {vaos.map((v, k) => (
        <text
          key={k}
          x={(px(d.nos[k] ?? 0) + px(d.nos[k + 1] ?? 0)) / 2}
          y={y - 4}
          textAnchor="middle"
          className="fill-foreground"
        >
          {formatarNumero(v, 0)}
        </text>
      ))}
    </g>
  );
}

// ---- pilar -------------------------------------------------------------------------

/** Lado maior do corte, px, e espaço em volta para as cotas. */
const LADO_CORTE = 120;
const FOLGA_CORTE = 34;

/** Barras do corte: `porFaceY` em cada face de comprimento b (em cima e embaixo) e
 *  `porFaceX` em cada face de comprimento h (laterais), cantos contados uma vez.
 *  Coordenadas relativas ao canto inferior esquerdo da seção, cm. */
export function barrasDoCorte(
  b: number,
  h: number,
  porFaceX: number,
  porFaceY: number,
  recuo: number,
): { x: number; y: number }[] {
  const pos = (n: number, ini: number, fim: number) =>
    n <= 1 ? [ini] : Array.from({ length: n }, (_, i) => ini + ((fim - ini) * i) / (n - 1));
  const [x0, x1, y0, y1] = [recuo, b - recuo, recuo, h - recuo];
  const pontos = [
    ...pos(porFaceY, x0, x1).flatMap((x) => [
      { x, y: y0 },
      { x, y: y1 },
    ]),
    // nas laterais, sem os cantos (já vieram com as faces de b)
    ...pos(porFaceX, y0, y1)
      .slice(1, -1)
      .flatMap((y) => [
        { x: x0, y },
        { x: x1, y },
      ]),
  ];
  return pontos;
}

/** Arranjo de um lance para o desenho: igual em lances seguidos vira um desenho só. */
function chaveCorte(
  l: LanceDetalhadoObra,
  long: PosicaoPilar | undefined,
  est: PosicaoPilar | undefined,
) {
  return [l.b, l.h, l.porFaceX, l.porFaceY, long?.phi, est?.phi, est?.espacamento].join("|");
}

/** Cortes da seção dos lances do pilar, um por arranjo diferente (lances iguais
 *  seguidos juntam: "Lances 1 a 3"). Seção não retangular fica sem desenho. */
export function CortesPilar({ d }: { d: DetalhamentoPilarObra }) {
  const ps = d.detalhamento.posicoes;
  const grupos: { de: number; ate: number; chave: string }[] = [];
  d.lances.forEach((l, i) => {
    const long = ps.find((p) => p.tramo === i && p.tipo === "longitudinal");
    const est = ps.find((p) => p.tramo === i && p.tipo === "estribo");
    if (!l.retangular || !long) return;
    const chave = chaveCorte(l, long, est);
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.chave === chave && ultimo.ate === i - 1) ultimo.ate = i;
    else grupos.push({ de: i, ate: i, chave });
  });
  if (grupos.length === 0) return null;
  return (
    <div className="flex max-w-full flex-wrap gap-4 overflow-x-auto py-1">
      {grupos.map((g) => {
        const l = d.lances[g.de];
        const long = ps.find((p) => p.tramo === g.de && p.tipo === "longitudinal");
        const est = ps.find((p) => p.tramo === g.de && p.tipo === "estribo");
        if (!l || !long) return null;
        const titulo = g.de === g.ate ? `Lance ${g.de + 1}` : `Lances ${g.de + 1} a ${g.ate + 1}`;
        return (
          <CortePilar
            key={g.de}
            nome={d.nome}
            titulo={titulo}
            lance={l}
            cobrimento={d.cobrimento}
            longitudinal={long}
            estribo={est}
          />
        );
      })}
    </div>
  );
}

/** Corte b × h de um lance: contorno, estribo recuado do cobrimento, barras na escala
 *  do diâmetro (com um mínimo para aparecer) e as cotas b (embaixo) e h (à direita). */
function CortePilar({
  nome,
  titulo,
  lance: l,
  cobrimento,
  longitudinal,
  estribo,
}: {
  nome: string;
  titulo: string;
  lance: LanceDetalhadoObra;
  cobrimento: number;
  longitudinal: PosicaoPilar;
  estribo: PosicaoPilar | undefined;
}) {
  const esc = LADO_CORTE / Math.max(l.b, l.h);
  const w = l.b * esc;
  const hh = l.h * esc;
  const phiEst = (estribo?.phi ?? 5) / 10;
  const recuo = cobrimento + phiEst + longitudinal.phi / 20;
  const barras = barrasDoCorte(l.b, l.h, l.porFaceX, l.porFaceY, recuo);
  const raio = Math.max((longitudinal.phi / 20) * esc, 2.5);
  const ox = 8;
  const oy = 8;
  // y da tela cresce para baixo: a face de baixo da seção fica em oy + hh
  const tx = (x: number) => ox + x * esc;
  const ty = (y: number) => oy + hh - y * esc;
  const largura = w + ox + FOLGA_CORTE + 8;
  const altura = hh + oy + FOLGA_CORTE;
  const cEst = cobrimento + phiEst / 2;
  return (
    <figure className="text-foreground">
      <svg
        role="img"
        aria-label={`Corte de ${nome}, ${titulo}: ${formatarNumero(l.b, 0)} × ${formatarNumero(l.h, 0)} cm, ${barras.length} barras`}
        viewBox={`0 0 ${largura} ${altura}`}
        width={largura}
        height={altura}
        className="max-w-none"
      >
        <rect
          x={ox}
          y={oy}
          width={w}
          height={hh}
          strokeWidth={1}
          className="fill-muted stroke-muted-foreground"
        />
        <rect
          x={tx(cEst)}
          y={ty(l.h - cEst)}
          width={(l.b - 2 * cEst) * esc}
          height={(l.h - 2 * cEst) * esc}
          rx={2}
          fill="none"
          strokeWidth={1.25}
          className="stroke-current"
        />
        {barras.map((p, i) => (
          <circle key={i} cx={tx(p.x)} cy={ty(p.y)} r={raio} className="fill-current" />
        ))}
        <g fontSize={LETRA} className="text-muted-foreground">
          <line
            x1={ox}
            x2={ox + w}
            y1={oy + hh + 12}
            y2={oy + hh + 12}
            strokeWidth={0.75}
            className="stroke-current"
          />
          <text x={ox + w / 2} y={oy + hh + 26} textAnchor="middle" className="fill-foreground">
            {formatarNumero(l.b, 0)}
          </text>
          <line
            x1={ox + w + 12}
            x2={ox + w + 12}
            y1={oy}
            y2={oy + hh}
            strokeWidth={0.75}
            className="stroke-current"
          />
          <text
            x={ox + w + 26}
            y={oy + hh / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${ox + w + 26} ${oy + hh / 2})`}
            className="fill-foreground"
          >
            {formatarNumero(l.h, 0)}
          </text>
        </g>
      </svg>
      <figcaption className="text-muted-foreground mt-0.5 max-w-48 text-xs leading-snug">
        <span className="text-foreground font-medium">{titulo}</span>: {longitudinal.nome}{" "}
        {longitudinal.quantidade} φ {rotuloPhi(longitudinal.phi)}
        {estribo
          ? ` · ${estribo.nome} φ ${rotuloPhi(estribo.phi)}${estribo.espacamento ? ` c/${rotuloPhi(estribo.espacamento)}` : ""}`
          : ""}{" "}
        · cotas em cm
      </figcaption>
    </figure>
  );
}
