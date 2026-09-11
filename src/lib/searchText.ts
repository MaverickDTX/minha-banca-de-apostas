/** Busca sem distinção de acentos, caixa ou espaços repetidos. */
export const normalizeSearchText = (text: string): string =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
