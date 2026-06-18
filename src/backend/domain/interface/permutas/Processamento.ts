/**
 * Processamento — estado do analista sobre um adiantamento (Fase B).
 *
 * Ontology: ação `processar-permuta` (Frente I). Persiste o status atribuído
 * pelo analista no botão "Processar" da tela Gestão. SOFT-REF por
 * `adiantamentoDocCod` (chave natural) — sobrevive à re-ingestão diária dos
 * fatos. Status como CONSTANTES TIPADAS (P3 / Domain State Machines).
 */
export const PROCESSAMENTO_STATUS = {
    PENDENTE: 'pendente',
    PROCESSANDO: 'processando',
    PROCESSADO: 'processado',
    ERRO: 'erro',
} as const;

export type ProcessamentoStatus = (typeof PROCESSAMENTO_STATUS)[keyof typeof PROCESSAMENTO_STATUS];

export interface Processamento {
    adiantamentoDocCod: string;
    status: ProcessamentoStatus;
    invoiceDocCod?: string;
    observacao?: string;
    processadoPor?: string;
    processadoEm?: Date;
}
