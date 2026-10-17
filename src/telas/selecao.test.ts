// Leitura da seleção (selecao.ts) com arquivos do Google Drive: só o que a importação lê
// é baixado (o .DXF, o .PLT e o .BAK ficam no resumo sem download), o progresso conta os
// baixados, uma falha não derruba o resto, e a obra sai igual à da mesma pasta do disco.
import { describe, expect, it } from "vitest";
import { PREDIO, semIds } from "./__fixtures__/predioSistrut";
import { fetchFalso, type NoDrive } from "./drive/__fixtures__/driveFalso";
import { baixarArquivo, lerAlvo, limitador, type AcessoDrive } from "./drive/api";
import { importarObraSistrut, type ArquivoEntrada } from "./InicioSistrut";
import { lerSelecao, type Escolhido } from "./selecao";

const NAO_LIDOS = ["R1__TETO.DXF", "TETO.PLT"];
const pasta = (extras: NoDrive[] = []): NoDrive => ({
  id: "pasta-predio-01",
  name: "PREDIO",
  filhos: [
    ...[...PREDIO, ...NAO_LIDOS.map((nome) => ({ nome, dados: new Uint8Array([1, 2]) }))].map(
      (a, i) => ({ id: `arq-${i}`, name: a.nome, dados: a.dados }),
    ),
    ...extras,
  ],
});

/** Lista a pasta no Drive falso e monta os escolhidos como ImportarDrive.tsx. */
async function doDrive(raiz: NoDrive, opcoes: Parameters<typeof fetchFalso>[1] = {}) {
  const falso = fetchFalso(raiz, opcoes);
  const acesso: AcessoDrive = { apiKey: "chave" };
  const conteudo = await lerAlvo({ id: raiz.id }, acesso, falso.fetch);
  const limite = limitador(4);
  const escolhidos: Escolhido[] = conteudo.arquivos.map((a) => ({
    nome: a.nome,
    caminho: a.caminho,
    ler: (signal) => limite(() => baixarArquivo(a, acesso, falso.fetch, signal)),
  }));
  return { escolhidos, falso };
}

const baixados = (falso: ReturnType<typeof fetchFalso>) =>
  falso.chamadas
    .filter((c) => c.url.searchParams.get("alt") === "media")
    .map((c) => c.url.pathname.split("/").pop());

describe("lerSelecao com arquivos do Drive", () => {
  it("baixa só o que a importação lê; o resto entra vazio e aparece nos ignorados", async () => {
    const { escolhidos, falso } = await doDrive(pasta());
    const progresso: [number, number][] = [];
    const { lidos, falhas } = await lerSelecao(
      escolhidos,
      (feitos, total) => progresso.push([feitos, total]),
      new AbortController().signal,
    );
    expect(falhas).toEqual([]);
    // PREDIO tem 11 arquivos; o .BAK é ignorado pela importação, então não é baixado
    const ids = baixados(falso);
    const nomeDo = (id: string | undefined) => escolhidos[Number(id?.slice(4))]?.nome;
    expect(ids.map(nomeDo).sort()).toEqual(
      PREDIO.map((a) => a.nome)
        .filter((n) => n !== "TETO.BAK")
        .sort(),
    );
    expect(ids.map(nomeDo)).not.toContain("R1__TETO.DXF");
    expect(progresso[0]).toEqual([0, 10]);
    expect(progresso.at(-1)).toEqual([10, 10]);
    for (const nome of [...NAO_LIDOS, "TETO.BAK"])
      expect(lidos.find((a) => a.nome === nome)?.dados).toEqual(new Uint8Array());

    const r = importarObraSistrut(lidos);
    expect(r.ok).toBe(true);
    expect(r.resumo.ignorados.map((i) => i.arquivo)).toEqual(
      expect.arrayContaining(["R1__TETO.DXF", "TETO.PLT", "TETO.BAK"]),
    );
  });

  it("a obra sai igual à da mesma pasta lida do disco", async () => {
    const { escolhidos } = await doDrive(pasta());
    const { lidos } = await lerSelecao(escolhidos, () => {}, new AbortController().signal);
    const doDisco: ArquivoEntrada[] = [
      ...PREDIO,
      ...NAO_LIDOS.map((nome) => ({ nome, dados: new Uint8Array() })),
    ].map((a) => ({ ...a, caminho: `PREDIO/${a.nome}` }));
    const [drive, disco] = [importarObraSistrut(lidos), importarObraSistrut(doDisco)];
    if (!drive.ok || !disco.ok) throw new Error("a importação falhou");
    expect(lidos.map((a) => a.caminho)).toEqual(doDisco.map((a) => a.caminho));
    expect(semIds(drive.obra)).toBe(semIds(disco.obra));
    expect(drive.resumo).toEqual(disco.resumo);
    expect(drive.avisos).toEqual(disco.avisos);
  });

  it("um arquivo que não baixa vira falha com o caminho, e o resto entra", async () => {
    const { escolhidos } = await doDrive(pasta(), { proibidos: ["arq-2"] });
    const { lidos, falhas } = await lerSelecao(escolhidos, () => {}, new AbortController().signal);
    expect(falhas).toEqual([
      'PREDIO/TETO.SEC: Sem login, o Google Drive não abre isto: não está compartilhado como "qualquer pessoa com o link", ou o link está errado. Se foi compartilhado com você, entre com a sua conta Google.',
    ]);
    expect(lidos.map((a) => a.nome)).not.toContain("TETO.SEC");
    expect(lidos).toHaveLength(PREDIO.length + NAO_LIDOS.length - 1);
  });

  it("cancelar interrompe a leitura", async () => {
    const controle = new AbortController();
    const escolhidos: Escolhido[] = [
      {
        nome: "TETO.LAJ",
        caminho: "TETO.LAJ",
        ler: (signal) =>
          new Promise((_, falha) => signal.addEventListener("abort", () => falha(signal.reason))),
      },
    ];
    const leitura = lerSelecao(escolhidos, () => {}, controle.signal);
    controle.abort();
    await expect(leitura).rejects.toMatchObject({ name: "AbortError" });
  });
});
