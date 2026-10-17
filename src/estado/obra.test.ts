// Histórico de desfazer/refazer da obra aberta: o pavimento ativo e a seleção continuam
// válidos depois de desfazer e refazer (o pavimento pode ter sumido ou voltado).
import { beforeEach, describe, expect, it } from "vitest";
import { obraNova } from "../dominio/criar";
import { adicionarPavimento, apagarPavimento, renomearPavimento } from "../telas/pavimentos";
import { useObra } from "./obra";

const estado = () => useObra.getState();
const ativo = () => estado().obra?.pavimentos.find((p) => p.id === estado().pavimentoId);

beforeEach(() => estado().abrir(obraNova("Teste", "nb1-78")));

describe("desfazer e refazer", () => {
  it("desfazer a criação do pavimento ativo volta para um pavimento que existe", () => {
    const original = estado().pavimentoId;
    const r = adicionarPavimento(estado().obra!, 0);
    estado().editar(() => r.obra);
    estado().selecionarPavimento(r.pavimento.id);

    estado().desfazer();
    expect(estado().obra?.pavimentos).toHaveLength(1);
    expect(estado().pavimentoId).toBe(original);
    expect(ativo()).toBeDefined();

    // refazer traz o pavimento de volta; o ativo continua o que estava
    estado().refazer();
    expect(estado().obra?.pavimentos).toHaveLength(2);
    expect(estado().pavimentoId).toBe(original);
  });

  it("desfazer a exclusão de um pavimento não troca o ativo", () => {
    const r = adicionarPavimento(estado().obra!, 0);
    estado().editar(() => r.obra);
    const base = estado().obra!.pavimentos[1]!.id;
    estado().selecionarPavimento(base);
    estado().editar((o) => apagarPavimento(o, r.pavimento.id));
    estado().desfazer();
    expect(estado().pavimentoId).toBe(base);
  });

  it("guarda a seleção quando o elemento existe no estado desfeito", () => {
    const pav = estado().obra!.pavimentos[0]!;
    estado().selecionar({ tipo: "laje", id: "inexistente" });
    estado().editar((o) => renomearPavimento(o, pav.id, "Térreo"));
    estado().desfazer();
    // a laje não existe: a seleção cai
    expect(estado().selecao).toBeNull();
  });

  it("edição que não muda nada não entra no histórico", () => {
    estado().editar((o) => o);
    expect(estado().passado).toHaveLength(0);
  });

  it("uma edição nova apaga o que havia para refazer", () => {
    const pav = estado().obra!.pavimentos[0]!;
    estado().editar((o) => renomearPavimento(o, pav.id, "A"));
    estado().desfazer();
    expect(estado().futuro).toHaveLength(1);
    estado().editar((o) => renomearPavimento(o, pav.id, "B"));
    expect(estado().futuro).toHaveLength(0);
    estado().refazer();
    expect(estado().obra?.pavimentos[0]?.nome).toBe("B");
  });
});
