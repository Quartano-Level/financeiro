/**
 * Tipos do contrato de ESCRITA `fin010` (baixa/permuta de adiantamento) — Fase 3.
 * Derivados do HAR real (ver `ontology/business-rules/fin010-write-contract.md`).
 * A baixa é um handshake de 5 chamadas; estes tipos modelam entrada/saída de cada uma.
 */

/** Resposta do passo 1 — criação do borderô. */
export interface BorderoCriado {
    borCod: number;
    filCod: number;
    borVldTipo: number;
    borDtaMvto: number;
}

/** Estado vivo de um borderô (GET /fin010/{filCod}/{borCod}). */
export interface BorderoDetalhe {
    borCod: number;
    filCod: number;
    borDtaMvto?: number;
    /** 0 = EM CADASTRO, 1 = FINALIZADO. */
    borVldFinalizado?: number;
    /** Se != null, o borderô foi ESTORNADO. */
    borCodEstornado?: number | null;
    borDtaFinalizado?: number | null;
    usnDesNomeCad?: string | null;
    usnDesNomeFin?: string | null;
    vldHasBaixa?: number;
}

/** Item da listagem de borderôs do ERP (`POST /fin010/list`). */
export interface BorderoListaItem {
    borCod: number;
    filCod: number;
    borDtaMvto?: number;
    borVldFinalizado?: number;
    borCodEstornado?: number | null;
    vlrTotalLiquido?: number;
    usnDesNomeCad?: string | null;
}

/** `responseData` do passo 2 (validação do título da invoice). */
export interface TituloBaixaValidacao {
    /** Valor do título a baixar (fonte da verdade do ERP — moeda do título). */
    bxaMnyValor: number;
    bxaCodGerJuros?: number;
    bxaCodGerDesconto?: number;
    bxaCodGerMulta?: number;
    gerDesJuros?: string;
    gerDesDesconto?: string;
    gerDesMulta?: string;
}

/** `responseData` do passo 3 (validação do título da permuta / adiantamento). */
export interface TituloPermutaValidacao {
    gerNumPermuta: number;
    gerDesPermuta?: string;
    gerDes?: string;
    gerNum?: number;
    pesCod?: number;
    dpeNomPessoa?: string;
    bxaMnyValorPermuta?: number;
    bxaMnyLiquidoPermuta?: number | null;
}

/** Resposta do passo 5 — baixa gravada (confirmação). */
export interface BaixaGravada {
    /** Sequência da baixa no borderô — a confirmação que persistimos. */
    bxaCodSeq: number;
    bxaCodSeqPerm?: number;
    borCod: number;
    docCod: number;
    bxaDocCod: number;
    bxaMnyValor: number;
    bxaMnyJuros: number;
    bxaMnyLiquido: number;
    vldPermuta?: number;
}

/** Envelope `{ messages, responseData }` das rotas de validação do `fin010`. */
export interface Fin010ValidacaoResponse<T> {
    messages?: Array<{ valid?: string; message?: string; vars?: Record<string, unknown> }>;
    responseData?: T;
}

/** Entrada de alto nível para executar UMA baixa/permuta (um par adto→invoice). */
export interface ExecutarBaixaPermutaInput {
    filCod: number;
    /** Borderô já criado (encadeia múltiplos pares no mesmo borderô). */
    borCod: number;
    /** docCod da INVOICE (lado da baixa). */
    invoiceDocCod: number;
    /** docCod do ADIANTAMENTO (lado da permuta). */
    adiantamentoDocCod: number;
    /** Parcela / número do título — `1` por ora. */
    titCod: number;
    bxaTitCod: number;
    /** Valor da variação cambial (vai em `bxaMnyJuros` quando JUROS). */
    juros: number;
    /** Conta gerencial do juros (131 = VARIAÇÃO CAMBIAL PASSIVA REALIZADA). */
    contaJuros: number;
    /** Classificação da variação — decide se vai em juros ou desconto. */
    classificacao?: 'JUROS' | 'DESCONTO';
}
