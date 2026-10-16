// Operações de edição da planta: funções puras Pavimento → Pavimento que o
// editor passa para useObra.editar (via substituirPavimento). Cada uma valida
// a entrada e devolve o pavimento novo ou a mensagem de erro para a tela.
//
// Regras de regeneração (gerarEstrutura):
// - criar, apagar ou mudar a geometria/vínculos de uma laje regenera vigas e pilares;
// - apagar uma viga força vínculo "livre" nos bordos das lajes que estão sobre o
//   eixo dela e regenera; sem isso gerarEstrutura recriaria a viga. Para trazê-la
//   de volta, volte o vínculo desses bordos para "auto" no painel da laje;
// - acrescentar ou apagar pilar não regenera. Apagar um pilar gerado (cruzamento ou
//   extremidade de viga) guarda a posição em pilaresRemovidos, e gerarEstrutura não o
//   recria: a viga passa contínua sobre o ponto. Desenhar um pilar ali tira a posição.
import { lajeNova, nomeLivre, novoId, type Retangulo } from "../dominio/criar";
import {
  colineares,
  eixoDaViga,
  eixoDoBordo,
  eixosDasVigas,
  gerarEstrutura,
  mesmoPonto,
  PILAR_INICIAL,
  pontosDePilar,
  posicaoNoEixo,
  sobreposicao,
  TOL,
} from "../dominio/gerar";
import {
  BORDOS,
  type Laje,
  type Obra,
  type Pavimento,
  type Pilar,
  type Viga,
} from "../dominio/obra";
import { lajeSobreposta, type Ponto } from "./geometria";

export type Edicao = { ok: true; pavimento: Pavimento } | { ok: false; erro: string };

const falha = (erro: string): Edicao => ({ ok: false, erro });
const sucesso = (pavimento: Pavimento): Edicao => ({ ok: true, pavimento });

/** Menor vão aceito para uma laje, m. */
export const VAO_MINIMO = 0.1;

/** A obra com o pavimento de id `id` trocado por `pav`. */
export const substituirPavimento = (obra: Obra, id: string, pav: Pavimento): Obra => ({
  ...obra,
  pavimentos: obra.pavimentos.map((p) => (p.id === id ? pav : p)),
});

const numeroOk = (v: number) => Number.isFinite(v);

function validarNome(nome: string, outros: readonly { nome: string }[]) {
  if (nome.trim() === "") return "O nome não pode ficar vazio.";
  if (outros.some((o) => o.nome === nome)) return `Já existe um elemento chamado ${nome}.`;
  return undefined;
}

/** Primeiro erro dos valores da laje, ou undefined se ela é válida. */
export function validarLaje(l: Laje) {
  if (![l.x, l.y, l.lx, l.ly, l.h, l.revestimento, l.sobrecarga, l.mu].every(numeroOk))
    return "Valor numérico inválido.";
  if (l.lx < VAO_MINIMO || l.ly < VAO_MINIMO)
    return "Os vãos lx e ly precisam ser de pelo menos 0,10 m.";
  if (l.h <= 0) return "A espessura h precisa ser maior que zero.";
  if (l.revestimento < 0) return "O revestimento não pode ser negativo.";
  if (l.sobrecarga < 0) return "A sobrecarga não pode ser negativa.";
  if (l.mu <= 0) return "A relação μ = my/mx precisa ser maior que zero.";
  return undefined;
}

/** Primeiro erro dos valores da viga, ou undefined. */
export function validarViga(v: Viga) {
  if (![v.bw, v.h, v.cargaLinear].every(numeroOk)) return "Valor numérico inválido.";
  if (v.bw <= 0) return "A largura bw precisa ser maior que zero.";
  if (v.h <= 0) return "A altura h precisa ser maior que zero.";
  if (v.cargaLinear < 0) return "A carga linear não pode ser negativa.";
  return undefined;
}

/** Primeiro erro dos valores do pilar, ou undefined. */
export function validarPilar(p: Pilar) {
  if (![p.b, p.h].every(numeroOk)) return "Valor numérico inválido.";
  if (p.b <= 0 || p.h <= 0) return "Os lados b e h precisam ser maiores que zero.";
  return undefined;
}

const mensagemSobreposicao = (l: Laje) => `A laje se sobrepõe à ${l.nome}.`;

/** Acrescenta uma laje nova no retângulo e regenera a estrutura. Recusa vão pequeno e sobreposição. */
export function acrescentarLaje(
  pav: Pavimento,
  r: Retangulo,
): { ok: true; pavimento: Pavimento; id: string } | { ok: false; erro: string } {
  const laje = lajeNova(pav, r);
  const erro = validarLaje(laje);
  if (erro) return { ok: false, erro };
  const outra = lajeSobreposta(pav.lajes, r);
  if (outra) return { ok: false, erro: mensagemSobreposicao(outra) };
  return {
    ok: true,
    pavimento: gerarEstrutura({ ...pav, lajes: [...pav.lajes, laje] }),
    id: laje.id,
  };
}

/** Altera campos da laje. Mudança de geometria ou vínculos regenera vigas e pilares. */
export function alterarLaje(
  pav: Pavimento,
  id: string,
  mudanca: Partial<Omit<Laje, "id">>,
): Edicao {
  const antiga = pav.lajes.find((l) => l.id === id);
  if (!antiga) return falha("Laje não encontrada.");
  const nova = { ...antiga, ...mudanca };
  const erro =
    validarNome(
      nova.nome,
      pav.lajes.filter((l) => l.id !== id),
    ) ?? validarLaje(nova);
  if (erro) return falha(erro);
  const outra = lajeSobreposta(pav.lajes, nova, id);
  if (outra) return falha(mensagemSobreposicao(outra));
  const lajes = pav.lajes.map((l) => (l.id === id ? nova : l));
  const regenera =
    (["x", "y", "lx", "ly"] as const).some((k) => nova[k] !== antiga[k]) ||
    nova.vinculos !== antiga.vinculos;
  return sucesso(regenera ? gerarEstrutura({ ...pav, lajes }) : { ...pav, lajes });
}

/** Altera nome, seção ou carga da viga (sem regenerar: a geometria não muda). */
export function alterarViga(
  pav: Pavimento,
  id: string,
  mudanca: Partial<Omit<Viga, "id">>,
): Edicao {
  const antiga = pav.vigas.find((v) => v.id === id);
  if (!antiga) return falha("Viga não encontrada.");
  const nova = { ...antiga, ...mudanca };
  const erro =
    validarNome(
      nova.nome,
      pav.vigas.filter((v) => v.id !== id),
    ) ?? validarViga(nova);
  if (erro) return falha(erro);
  return sucesso({ ...pav, vigas: pav.vigas.map((v) => (v.id === id ? nova : v)) });
}

/** Altera nome ou seção do pilar. */
export function alterarPilar(
  pav: Pavimento,
  id: string,
  mudanca: Partial<Omit<Pilar, "id">>,
): Edicao {
  const antigo = pav.pilares.find((p) => p.id === id);
  if (!antigo) return falha("Pilar não encontrado.");
  const novo = { ...antigo, ...mudanca };
  const erro =
    validarNome(
      novo.nome,
      pav.pilares.filter((p) => p.id !== id),
    ) ?? validarPilar(novo);
  if (erro) return falha(erro);
  return sucesso({ ...pav, pilares: pav.pilares.map((p) => (p.id === id ? novo : p)) });
}

/** Remove a laje e regenera a estrutura. */
export function apagarLaje(pav: Pavimento, id: string): Edicao {
  if (!pav.lajes.some((l) => l.id === id)) return falha("Laje não encontrada.");
  return sucesso(gerarEstrutura({ ...pav, lajes: pav.lajes.filter((l) => l.id !== id) }));
}

/** Remove a viga: força "livre" nos bordos das lajes sobre o eixo dela e regenera,
 *  para que gerarEstrutura não a recrie. */
export function apagarViga(pav: Pavimento, id: string): Edicao {
  const viga = pav.vigas.find((v) => v.id === id);
  const eixo = viga && eixoDaViga(viga);
  if (!eixo) return falha("Viga não encontrada.");
  const lajes = pav.lajes.map((l) => {
    const livres = BORDOS.filter((b) => {
      const e = eixoDoBordo(l, b);
      return colineares(e, eixo) && sobreposicao(e.s1, e.s2, eixo.s1, eixo.s2) > TOL;
    });
    if (livres.length === 0) return l;
    const vinculos = { ...l.vinculos };
    for (const b of livres) vinculos[b] = "livre";
    return { ...l, vinculos };
  });
  return sucesso(gerarEstrutura({ ...pav, lajes }));
}

/** Pilar que gerarEstrutura cria nesta posição (extremidade ou cruzamento de vigas). */
export function pilarGerado(pav: Pavimento, p: Ponto) {
  return pontosDePilar(eixosDasVigas(pav.lajes)).some((q) => mesmoPonto(q, p));
}

/** Remove o pilar sem regenerar. Se ele está num ponto onde gerarEstrutura cria pilar
 *  (`gerado`), a posição vai para pilaresRemovidos para ele não voltar. */
export function apagarPilar(
  pav: Pavimento,
  id: string,
): { ok: true; pavimento: Pavimento; gerado: boolean } | { ok: false; erro: string } {
  const pilar = pav.pilares.find((p) => p.id === id);
  if (!pilar) return { ok: false, erro: "Pilar não encontrado." };
  const gerado = pilarGerado(pav, pilar);
  const registra = gerado && !pav.pilaresRemovidos.some((r) => mesmoPonto(r, pilar));
  return {
    ok: true,
    pavimento: {
      ...pav,
      pilares: pav.pilares.filter((p) => p.id !== id),
      pilaresRemovidos: registra
        ? [...pav.pilaresRemovidos, { x: pilar.x, y: pilar.y }]
        : pav.pilaresRemovidos,
    },
    gerado,
  };
}

/** Ponto (m) sobre o eixo de alguma viga. Pilar fora dele seria removido por gerarEstrutura. */
function sobreEixoDeViga(pav: Pavimento, p: Ponto) {
  return pav.vigas.some((v) => {
    const e = eixoDaViga(v);
    return e !== undefined && posicaoNoEixo(e, p.x, p.y) !== undefined;
  });
}

/** Acrescenta um pilar 20 × 20 cm no ponto (m), com o próximo nome "P<n>" livre.
 *  Só aceita ponto sobre o eixo de uma viga: fora dele gerarEstrutura o removeria.
 *  Num ponto de pilaresRemovidos, tira o ponto da lista (o pilar volta a ser gerado). */
export function acrescentarPilar(
  pav: Pavimento,
  p: Ponto,
): { ok: true; pavimento: Pavimento; id: string } | { ok: false; erro: string } {
  const existente = pav.pilares.find((q) => mesmoPonto(q, p));
  if (existente) return { ok: false, erro: `Já existe o pilar ${existente.nome} neste ponto.` };
  if (!sobreEixoDeViga(pav, p))
    return { ok: false, erro: "O pilar precisa ficar sobre o eixo de uma viga." };
  const pilar: Pilar = {
    id: novoId(),
    nome: nomeLivre(
      "P",
      pav.pilares.map((q) => q.nome),
    ),
    x: p.x,
    y: p.y,
    b: PILAR_INICIAL,
    h: PILAR_INICIAL,
  };
  return {
    ok: true,
    pavimento: {
      ...pav,
      pilares: [...pav.pilares, pilar],
      pilaresRemovidos: pav.pilaresRemovidos.filter((r) => !mesmoPonto(r, p)),
    },
    id: pilar.id,
  };
}

/** Move o pilar para o ponto (m) sem regenerar a estrutura. As regras são as de
 *  acrescentarPilar: destino sem outro pilar e sobre o eixo de uma viga. Se a origem era
 *  um pilar gerado, a posição antiga vai para pilaresRemovidos, para ele não voltar. */
export function moverPilar(pav: Pavimento, id: string, p: Ponto): Edicao {
  const atual = pav.pilares.find((q) => q.id === id);
  if (!atual) return falha("Pilar não encontrado.");
  if (mesmoPonto(atual, p)) return sucesso(pav);
  const outro = pav.pilares.find((q) => mesmoPonto(q, p));
  if (outro) return falha(`Já existe o pilar ${outro.nome} neste ponto.`);
  if (!sobreEixoDeViga(pav, p)) return falha("O pilar precisa ficar sobre o eixo de uma viga.");
  const semDestino = pav.pilaresRemovidos.filter((r) => !mesmoPonto(r, p));
  const registra = pilarGerado(pav, atual) && !semDestino.some((r) => mesmoPonto(r, atual));
  return sucesso({
    ...pav,
    pilares: pav.pilares.map((q) => (q.id === id ? { ...q, x: p.x, y: p.y } : q)),
    pilaresRemovidos: registra ? [...semDestino, { x: atual.x, y: atual.y }] : semDestino,
  });
}
