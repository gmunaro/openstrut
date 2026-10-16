// Avisos que a tela liga a uma opção do elemento. O texto do aviso diz em pt-BR o que
// marcar; o id é estável, para a tela pôr a opção ao lado do aviso sem comparar texto.

/** Ids estáveis dos avisos com opção, e o rótulo da opção que o texto do aviso cita. */
export const OPCOES_AVISO = {
  /** `Viga.continuaSeExcederLimite`: a resposta "S" a "Continuo com o processamento
   *  desta Viga" do DESDIM (modo original). */
  "viga.continuar-acima-do-limite": "Continuar mesmo acima do limite",
  /** `Pilar.transicao`: o pilar nasce sobre uma viga de transição, e a carga da base já
   *  está nas cargas dessa viga. */
  "pilar.nasce-em-transicao": "Nasce sobre viga de transição",
} as const;

export type IdAviso = keyof typeof OPCOES_AVISO;

/** Um aviso com opção: o mesmo `texto` sai na lista de avisos do elemento ou nas falhas
 *  do pavimento; `elemento` diz onde fica a opção. */
export interface AvisoComOpcao {
  id: IdAviso;
  pavimentoId: string;
  elemento: { tipo: "viga" | "pilar"; id: string };
  texto: string;
}

/** Rótulo da opção entre aspas, para o texto do aviso: marque "…". */
export const rotuloOpcao = (id: IdAviso) => `"${OPCOES_AVISO[id]}"`;
