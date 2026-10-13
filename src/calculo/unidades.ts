// Conversões entre SI (interno) e as unidades técnicas antigas (exibição).
// 1 tf = 9,80665 kN (gravidade padrão); 1 MPa = 10,197 kgf/cm².
export const KN_POR_TF = 9.80665;

export const tfParaKn = (tf: number) => tf * KN_POR_TF;
export const knParaTf = (kn: number) => kn / KN_POR_TF;
export const mpaParaKgfCm2 = (mpa: number) => (mpa * 1000) / KN_POR_TF / 10;
export const kgfCm2ParaMpa = (kgf: number) => (kgf * KN_POR_TF * 10) / 1000;
