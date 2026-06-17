/** Despesa do processo (imp021/DespesasProcesso) — lado DEBITO */
export interface ProcessExpense {
    ctpDesNome: string;
    impDesNome: string;
    pidMnyValormn: number;
    pidMnyValorMneg?: number;
    moeEspNome?: string;
    pidVldStatus?: string;
}

/** Encargo de uma NF (com017/encargosGerais → despesas[]) — lado CREDITO */
export interface NfEncargo {
    ctpDesNome: string;
    dppMnyValorMn: number;
    impDesNome?: string;
}

/** NF de saida (com297) */
export interface NfInfo {
    docCod: number;
    docTip: number;
    docEspNumero: string;
    docDtaEmissao: string;
    docMnyValor: number;
    dpeNomPessoa?: string;
    filCod: number;
}

/** Linha agregada da tabela debito/credito/saldo */
export interface ExpenseRow {
    ctpDesNome: string;
    debito: number;
    credito: number;
    saldo: number;
}

/** Analise por NF */
export interface NfAnalysis {
    nf: NfInfo;
    proportion: number;
    rows: ExpenseRow[];
    totalDebito: number;
    totalCredito: number;
    totalSaldo: number;
}

/** Resultado completo da analise */
export interface AnalysisResult {
    priCod: number;
    processRef: string;
    clientName: string;
    summary: {
        rows: ExpenseRow[];
        totalDebito: number;
        totalCredito: number;
        totalSaldo: number;
    };
    nfs: NfAnalysis[];
}

/** Item da lista de processos */
export interface ProcessListItem {
    priCod: number;
    priEspRefcliente: string;
    dpeNomPessoa: string;
    priDtaAbertura: string;
    /**
     * `null` when Conexos didn't surface the row's filial. Per ADR-0009
     * we no longer default to a hardcoded `2`; downstream code must
     * either request a specific filial or skip the row.
     */
    filCod: number | null;
}
