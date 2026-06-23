import { inject, injectable } from 'tsyringe';
import ConexosClient from '../../client/ConexosClient.js';
import { LOG_TYPE } from '../../interface/log/LogInterface.js';
import EnvironmentProvider from '../../libs/environment/EnvironmentProvider.js';
import PermutaAlocacaoRepository, {
    type AlocacaoRow,
} from '../../repository/permutas/PermutaAlocacaoRepository.js';
import PermutaExecucaoRepository, {
    type ExecucaoStatus,
} from '../../repository/permutas/PermutaExecucaoRepository.js';
import PermutaRelationalRepository from '../../repository/permutas/PermutaRelationalRepository.js';
import LogService from '../LogService.js';

/** Conta gerencial do juros = VARIAÇÃO CAMBIAL PASSIVA REALIZADA (HAR + ontologia). */
const CONTA_GER_JUROS = 131;
const GER_DES_JUROS = 'VARIAÇÃO CAMBIAL PASSIVA REALIZADA';

export interface ReconciliarInput {
    adiantamentoDocCod: string;
    executadoPor: string;
    /** Data de movimento do borderô em epoch-ms (default: meia-noite UTC de hoje — via params). */
    dataMovto: number;
    /** Força dry-run mesmo com escrita habilitada (preview sem POST). */
    dryRunOverride?: boolean;
}

export interface ResultadoAlocacao {
    invoiceDocCod: string;
    status: ExecucaoStatus | 'dry-run' | 'skipped';
    dryRun: boolean;
    borCod?: number;
    bxaCodSeq?: number;
    valorBaixado?: number;
    erro?: string;
    payload?: Record<string, unknown>;
}

export interface ReconciliarResult {
    adiantamentoDocCod: string;
    dryRun: boolean;
    writeEnabled: boolean;
    borCod?: number;
    resultados: ResultadoAlocacao[];
}

/**
 * ReconciliacaoPermutaService — executa a BAIXA/PERMUTA no ERP `fin010` a partir das
 * alocações (Fase 3, risco arquitetural #1). Escreve ADTO A ADTO (um borderô, N pares
 * adto→invoice), espelhando o fluxo manual. Ver `business-rules/fin010-write-contract.md`.
 *
 * Guard-rails (config): só escreve com `CONEXOS_WRITE_ENABLED=true` E `CONEXOS_DRY_RUN=false`.
 * Default = dry-run (monta/loga o payload sem POST). Write-ahead: a intenção é gravada
 * (`reconciling`) ANTES do POST; vira `settled` só com a confirmação (`bxaCodSeq`) do ERP;
 * em falha vira `error` com a resposta crua (reconciliação manual). Idempotência por par
 * adto↔invoice (`idempotency_key`): par já `settled` é pulado.
 */
@injectable()
export default class ReconciliacaoPermutaService {
    constructor(
        @inject(ConexosClient) private conexosClient: ConexosClient,
        @inject(EnvironmentProvider) private environmentProvider: EnvironmentProvider,
        @inject(PermutaAlocacaoRepository)
        private alocacaoRepository: PermutaAlocacaoRepository,
        @inject(PermutaExecucaoRepository)
        private execucaoRepository: PermutaExecucaoRepository,
        @inject(PermutaRelationalRepository)
        private relationalRepository: PermutaRelationalRepository,
        @inject(LogService) private logService: LogService,
    ) {}

    public reconciliar = async (input: ReconciliarInput): Promise<ReconciliarResult> => {
        const { adiantamentoDocCod, executadoPor, dataMovto } = input;

        const adto = await this.relationalRepository.findAdiantamento(adiantamentoDocCod);
        if (!adto) throw new Error(`adiantamento ${adiantamentoDocCod} not found`);
        if (adto.filCod === undefined) {
            throw new Error(`adiantamento ${adiantamentoDocCod} without filial`);
        }
        const filCod = adto.filCod;

        const todas = await this.alocacaoRepository.listAtivas();
        const alocacoes = todas.filter((a) => a.adiantamentoDocCod === adiantamentoDocCod);
        if (alocacoes.length === 0) {
            throw new Error(`adiantamento ${adiantamentoDocCod} has no alocacoes to reconcile`);
        }

        // Guard-rails de escrita via EnvironmentProvider (Rule #8 — nunca process.env no serviço).
        const env = await this.environmentProvider.getEnvironmentVars();
        const writeEnabled = env.conexosWriteEnabled;
        // Dry-run vence: sem escrita habilitada OU flag dryRun OU override explícito.
        const dryRun = !writeEnabled || env.conexosDryRun || input.dryRunOverride === true;

        const resultados: ResultadoAlocacao[] = [];
        let borCod: number | undefined;

        for (const aloc of alocacoes) {
            const key = this.idempotencyKey(adiantamentoDocCod, aloc.invoiceDocCod);
            const begin = await this.execucaoRepository.beginExecution({
                idempotencyKey: key,
                adiantamentoDocCod,
                invoiceDocCod: aloc.invoiceDocCod,
                filCod,
                dryRun,
                executadoPor,
            });
            if (begin.alreadySettled) {
                resultados.push({ invoiceDocCod: aloc.invoiceDocCod, status: 'skipped', dryRun });
                continue;
            }

            if (dryRun) {
                const preview = this.buildPreviewPayload(aloc, filCod);
                await this.execucaoRepository.setRequestPayload(key, preview);
                await this.logService.info({
                    type: LOG_TYPE.BUSINESS_INFO,
                    message: 'permuta reconciliacao DRY-RUN (payload montado, sem POST)',
                    data: { adiantamentoDocCod, invoiceDocCod: aloc.invoiceDocCod, preview },
                });
                resultados.push({
                    invoiceDocCod: aloc.invoiceDocCod,
                    status: 'dry-run',
                    dryRun: true,
                    payload: preview,
                });
                continue;
            }

            // ── Escrita real: handshake de 5 chamadas (borderô criado uma vez) ──
            try {
                if (borCod === undefined) {
                    const bordero = await this.conexosClient.criarBordero({ filCod, dataMovto });
                    borCod = bordero.borCod;
                }
                const resultado = await this.executarBaixa({ key, borCod, filCod, aloc });
                resultados.push(resultado);
            } catch (err) {
                const mensagem = err instanceof Error ? err.message : String(err);
                await this.execucaoRepository.markError(key, {
                    erroMensagem: mensagem,
                    erpResponse: this.extractErpData(err),
                    ...(borCod !== undefined ? { borCod } : {}),
                });
                await this.logService.error({
                    type: LOG_TYPE.BUSINESS_WARN,
                    message: 'permuta reconciliacao FALHOU (registrada como error)',
                    data: { adiantamentoDocCod, invoiceDocCod: aloc.invoiceDocCod, mensagem },
                });
                resultados.push({
                    invoiceDocCod: aloc.invoiceDocCod,
                    status: 'error',
                    dryRun: false,
                    ...(borCod !== undefined ? { borCod } : {}),
                    erro: mensagem,
                });
            }
        }

        return {
            adiantamentoDocCod,
            dryRun,
            writeEnabled,
            ...(borCod !== undefined ? { borCod } : {}),
            resultados,
        };
    };

    /** Executa o handshake (passos 2→5) de UM par adto→invoice e marca settled. */
    private executarBaixa = async (params: {
        key: string;
        borCod: number;
        filCod: number;
        aloc: AlocacaoRow;
    }): Promise<ResultadoAlocacao> => {
        const { key, borCod, filCod, aloc } = params;
        const invoiceDocCod = Number(aloc.invoiceDocCod);
        const adiantamentoDocCod = Number(aloc.adiantamentoDocCod);

        // Passo 2 — valida a invoice; o ERP devolve o valor a baixar (em-aberto vivo).
        const val2 = await this.conexosClient.validarTituloBaixa({
            filCod,
            borCod,
            invoiceDocCod,
            titCod: 1,
        });
        const bxaMnyValor = val2.responseData?.bxaMnyValor;
        if (bxaMnyValor === undefined || !(bxaMnyValor > 0)) {
            // Em-aberto zero/ausente: nada a baixar (provável já baixado no ERP). Aborta —
            // anti-super-pagamento: nunca baixamos mais do que o em-aberto vivo do ERP.
            throw new Error(
                `título ${invoiceDocCod} sem valor em aberto no ERP (bxaMnyValor=${String(bxaMnyValor)})`,
            );
        }

        // Passo 3 — valida a permuta (adiantamento); o ERP devolve os dados da permuta.
        const val3 = await this.conexosClient.validarTituloPermuta({
            filCod,
            borCod,
            adiantamentoDocCod,
            bxaTitCod: 1,
        });
        const perm = val3.responseData;
        if (!perm)
            throw new Error(`adiantamento ${adiantamentoDocCod} sem dados de permuta no ERP`);

        // JUROS vai em bxaMnyJuros (conta 131); DESCONTO vai em bxaMnyDesconto (conta do ERP).
        const isDesconto = aloc.variacaoClassificacao === 'DESCONTO';
        const valorVariacao = aloc.variacaoResultado ?? 0;
        const juros = isDesconto ? 0 : valorVariacao;
        const desconto = isDesconto ? valorVariacao : 0;

        // Passo 4 — recalcula o líquido com o juros informado.
        const val4 = await this.conexosClient.atualizarValorLiquido({
            filCod,
            borCod,
            invoiceDocCod,
            titCod: 1,
            valor: bxaMnyValor,
            juros,
            desconto,
        });
        const bxaMnyLiquido = val4.responseData?.bxaMnyLiquido ?? bxaMnyValor + juros - desconto;

        // Passo 5 — payload consolidado e gravação.
        const payload = this.buildFinalPayload({
            filCod,
            borCod,
            invoiceDocCod,
            adiantamentoDocCod,
            bxaMnyValor,
            juros,
            desconto,
            bxaMnyLiquido,
            perm,
            descontoGerCod: val2.responseData?.bxaCodGerDesconto,
            descontoGerDes: val2.responseData?.gerDesDesconto,
        });
        await this.execucaoRepository.setRequestPayload(key, payload);

        const baixa = await this.conexosClient.gravarBaixaPermuta({ filCod, payload });
        await this.execucaoRepository.markSettled(key, {
            borCod,
            bxaCodSeq: baixa.bxaCodSeq,
            valorBaixado: bxaMnyValor,
            juros,
            contaJuros: isDesconto ? (val2.responseData?.bxaCodGerDesconto ?? 0) : CONTA_GER_JUROS,
            erpResponse: baixa,
        });
        await this.logService.info({
            type: LOG_TYPE.BUSINESS_INFO,
            message: 'permuta reconciliacao SETTLED',
            data: { adiantamentoDocCod, invoiceDocCod, borCod, bxaCodSeq: baixa.bxaCodSeq },
        });

        return {
            invoiceDocCod: aloc.invoiceDocCod,
            status: 'settled',
            dryRun: false,
            borCod,
            bxaCodSeq: baixa.bxaCodSeq,
            valorBaixado: bxaMnyValor,
        };
    };

    /** Payload do passo 5 — une o lado invoice + o lado permuta (dados do ERP no passo 3). */
    private buildFinalPayload = (p: {
        filCod: number;
        borCod: number;
        invoiceDocCod: number;
        adiantamentoDocCod: number;
        bxaMnyValor: number;
        juros: number;
        desconto: number;
        bxaMnyLiquido: number;
        perm: {
            gerNumPermuta: number;
            gerDesPermuta?: string;
            gerDes?: string;
            gerNum?: number;
            pesCod?: number;
            dpeNomPessoa?: string;
            bxaMnyValorPermuta?: number;
        };
        descontoGerCod?: number;
        descontoGerDes?: string;
    }): Record<string, unknown> => ({
        bxaVldSistema: 0,
        docTip: 2,
        bxaVldCcorrente: 0,
        bxaVldCorrenteDc: 1,
        borVldFinalizado: 0,
        filCod: p.filCod,
        borCod: p.borCod,
        borVldTipo: 2,
        gerNum: p.perm.gerNum ?? p.perm.gerNumPermuta,
        gerDes: p.perm.gerDes ?? p.perm.gerDesPermuta ?? null,
        bxaVldAdto: 1,
        frontModelName: 'baixa',
        docCod: p.invoiceDocCod,
        titCod: 1,
        bxaMnyDesconto: p.desconto,
        bxaCodGerDesconto: p.descontoGerCod ?? null,
        gerDesDesconto: p.descontoGerDes ?? null,
        bxaMnyValor: p.bxaMnyValor,
        bxaMnyMulta: 0,
        bxaMnyJuros: p.juros,
        bxaCodGerJuros: CONTA_GER_JUROS,
        gerDesJuros: GER_DES_JUROS,
        bxaMnyLiquido: p.bxaMnyLiquido,
        bxaDocTip: 2,
        bxaDocCod: p.adiantamentoDocCod,
        bxaTitCod: 1,
        gerDesPermuta: p.perm.gerDesPermuta ?? null,
        dpeNomPessoa: p.perm.dpeNomPessoa ?? null,
        gerNumPermuta: p.perm.gerNumPermuta,
        bxaMnyLiquidoPermuta: null,
        pesCod: p.perm.pesCod ?? null,
        bxaMnyValorPermuta: p.perm.bxaMnyValorPermuta ?? null,
    });

    /** Preview (dry-run) montado SÓ com dados locais — sem chamar o ERP. */
    private buildPreviewPayload = (aloc: AlocacaoRow, filCod: number): Record<string, unknown> => {
        const isDesconto = aloc.variacaoClassificacao === 'DESCONTO';
        const valorVariacao = aloc.variacaoResultado ?? 0;
        return {
            _nota: 'DRY-RUN — valores do título/permuta viriam do ERP no handshake real',
            filCod,
            docCod: Number(aloc.invoiceDocCod),
            bxaDocCod: Number(aloc.adiantamentoDocCod),
            titCod: 1,
            bxaTitCod: 1,
            valorAlocadoNegociado: aloc.valorAlocado,
            moeda: aloc.moeda ?? null,
            classificacao: aloc.variacaoClassificacao ?? null,
            bxaMnyJuros: isDesconto ? 0 : valorVariacao,
            bxaMnyDesconto: isDesconto ? valorVariacao : 0,
            bxaCodGerJuros: CONTA_GER_JUROS,
            taxaAdiantamento: aloc.taxaAdiantamento ?? null,
            taxaInvoice: aloc.taxaInvoice ?? null,
        };
    };

    private idempotencyKey = (adiantamentoDocCod: string, invoiceDocCod: string): string =>
        `permuta:${adiantamentoDocCod}:${invoiceDocCod}`;

    private extractErpData = (err: unknown): unknown => {
        const ax = err as {
            response?: { data?: unknown };
            cause?: { response?: { data?: unknown } };
        };
        return ax?.response?.data ?? ax?.cause?.response?.data ?? null;
    };
}
