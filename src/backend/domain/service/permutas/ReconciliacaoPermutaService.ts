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

/**
 * Arredonda para 2 casas decimais. OBRIGATÓRIO em todo valor monetário enviado ao `fin010`
 * (sonda real 2026-06-23): o ERP rejeita money com >2 decimais (`CnxValidatorMny`,
 * `precision_not_supported`). A variação cambial chega com ruído de ponto flutuante.
 */
const round2 = (n: number): number => Math.round(n * 100) / 100;

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
            // DRY-RUN: preview puro, SEM efeito no banco (I-Recon-4) — não cria linha de execução.
            if (dryRun) {
                const preview = this.buildPreviewPayload(aloc, filCod);
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

            // Idempotência POR ESTADO DA ALOCAÇÃO: a chave inclui o `atualizado_em` da alocação.
            // - Mesma alocação JÁ executada (sem re-alocar) → mesma chave → BLOQUEADA (skipped).
            // - Re-alocar (mesmo par) muda o `atualizado_em` → chave nova → lançável de novo.
            // - Adicionar nova alocação (outro par) → chave nova → lançável.
            const key = `permuta:${adiantamentoDocCod}:${aloc.invoiceDocCod}:${aloc.atualizadoEm.getTime()}`;

            // Idempotência VIVA: se já há baixa settled MAS o borderô dela foi CANCELADO/ESTORNADO/
            // REMOVIDO no ERP, a baixa é nula → libera o relançamento (remove a linha stale). Só
            // bloqueia se o borderô ainda é válido (em cadastro ou finalizado).
            const existente = await this.execucaoRepository.findByIdempotencyKey(key);
            if (existente?.status === 'settled') {
                const baixaAindaValida = await this.borderoAindaValido(filCod, existente.borCod);
                if (baixaAindaValida) {
                    resultados.push({
                        invoiceDocCod: aloc.invoiceDocCod,
                        status: 'skipped',
                        dryRun,
                    });
                    continue;
                }
                // Borderô nulo (cancelado/estornado/removido): libera a re-baixa SEM apagar a linha
                // antiga — renomeia a chave pra preservar o borderô cancelado no histórico da lista.
                await this.execucaoRepository.renameKey(
                    key,
                    `${key}:sup:${existente.borCod ?? 'x'}`,
                );
            }

            const begin = await this.execucaoRepository.beginExecution({
                idempotencyKey: key,
                adiantamentoDocCod,
                invoiceDocCod: aloc.invoiceDocCod,
                filCod,
                dryRun: false,
                executadoPor,
            });
            if (begin.alreadySettled) {
                resultados.push({ invoiceDocCod: aloc.invoiceDocCod, status: 'skipped', dryRun });
                continue;
            }

            // ── Escrita real: handshake de 5 chamadas (borderô criado uma vez) ──
            try {
                if (borCod === undefined) {
                    // Data do borderô = a data ESCOLHIDA pelo analista no modal (`dataMovto`). O front
                    // sugere a data da D.I/DUIMP como default, mas o analista ajusta quando o período
                    // contábil da D.I está fechado (ERP: FIN_010.DATA_BLOQUEADA_PELA_CONTABILIDADE).
                    const bordero = await this.conexosClient.criarBordero({
                        filCod,
                        dataMovto,
                    });
                    borCod = bordero.borCod;
                }
                const resultado = await this.executarBaixa({ key, borCod, filCod, aloc });
                resultados.push(resultado);
            } catch (err) {
                const mensagem = this.friendlyErpMessage(err);
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

        // Persiste o borCod ANTES dos POSTs do handshake (Regis F-availability-1/3): se o
        // processo morrer no meio, a trilha aponta o borderô a conciliar (não fica órfão sem rastro).
        await this.execucaoRepository.setBorCod(key, borCod);

        // Passo 2 — valida a invoice; o ERP devolve o valor a baixar (em-aberto vivo).
        const val2 = await this.conexosClient.validarTituloBaixa({
            filCod,
            borCod,
            invoiceDocCod,
            titCod: 1,
        });
        this.assertNoErpError(val2, 'tituloBaixa');
        const emAbertoErp = val2.responseData?.bxaMnyValor;
        if (emAbertoErp === undefined || !(emAbertoErp > 0)) {
            // Em-aberto zero/ausente: nada a baixar (provável já baixado no ERP). Aborta.
            throw new Error(
                `título ${invoiceDocCod} sem valor em aberto no ERP (bxaMnyValor=${String(emAbertoErp)})`,
            );
        }

        // BAIXA PARCIAL (decisão Yuri 2026-06-23): baixamos o VALOR ALOCADO convertido p/ BRL
        // (valorAlocado × taxaInvoice), não o título cheio do ERP — um adto pode pagar só parte da
        // invoice (múltiplas: adto distribuído entre N invoices). O juros (variacao_resultado) já é da
        // parte alocada. I-Write-1 (anti-over-pay, Regis F-security-4/F-fault-tolerance-4): a baixa
        // NUNCA pode exceder o em-aberto vivo do ERP → aborta em vez de super-pagar.
        if (aloc.taxaInvoice === undefined || !(aloc.taxaInvoice > 0)) {
            throw new Error(
                `alocação ${adiantamentoDocCod}→${invoiceDocCod} sem taxa da invoice — não dá para calcular o valor da baixa`,
            );
        }
        const valorBaixaDesejado = Math.round(aloc.valorAlocado * aloc.taxaInvoice * 100) / 100;
        const tolerancia = Math.max(0.01, emAbertoErp * 0.005);
        if (valorBaixaDesejado > emAbertoErp + tolerancia) {
            throw new Error(
                `anti-drift: baixa ${valorBaixaDesejado.toFixed(2)} (BRL) > em-aberto do ERP ${emAbertoErp} ` +
                    `(alocado ${aloc.valorAlocado} × taxa ${aloc.taxaInvoice}) — alocação maior que o saldo vivo da invoice; conferir manualmente`,
            );
        }
        // Teto no em-aberto (protege arredondamento dentro da tolerância).
        const bxaMnyValor = Math.min(valorBaixaDesejado, emAbertoErp);

        // Passo 3 — valida a permuta (adiantamento); o ERP devolve os dados da permuta.
        const val3 = await this.conexosClient.validarTituloPermuta({
            filCod,
            borCod,
            adiantamentoDocCod,
            bxaTitCod: 1,
        });
        this.assertNoErpError(val3, 'tituloPermuta');
        const perm = val3.responseData;
        if (!perm)
            throw new Error(`adiantamento ${adiantamentoDocCod} sem dados de permuta no ERP`);

        // JUROS vai em bxaMnyJuros (conta 131); DESCONTO vai em bxaMnyDesconto (conta do ERP).
        // ARREDONDAR a 2 casas (sonda real 2026-06-23): o ERP rejeita money com >2 decimais
        // (CnxValidatorMny precision_not_supported). A variação cambial vem com ruído de ponto
        // flutuante (ex.: 1000×(5.2887−4.9806)=308.1000000000005) → round2 em todo valor monetário.
        const isDesconto = aloc.variacaoClassificacao === 'DESCONTO';
        const valorVariacao = round2(aloc.variacaoResultado ?? 0);
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
        this.assertNoErpError(val4, 'atualizaValorLiquido');
        const bxaMnyLiquido = round2(
            val4.responseData?.bxaMnyLiquido ?? bxaMnyValor + juros - desconto,
        );

        // Comentário do borderô (spec do analista): a conta da variação cambial — taxas das
        // duas pontas + conta de juros. Vai em `bxaEspComplemento` no payload.
        const comentario = this.buildComentario(aloc, bxaMnyValor, isDesconto ? desconto : juros);

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
            comentario,
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
        comentario?: string;
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
        // Comentário do borderô (spec do analista) — conta da variação cambial.
        bxaEspComplemento: p.comentario ?? null,
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

    /**
     * Monta o comentário do borderô (spec do analista): a conta da variação cambial com as
     * taxas das duas pontas + a conta de juros. `valorBaixaBrl` é o valor parcial baixado.
     */
    private buildComentario = (
        aloc: AlocacaoRow,
        valorBaixaBrl: number,
        valorVariacao: number,
    ): string => {
        const isDesconto = aloc.variacaoClassificacao === 'DESCONTO';
        const tipo = isDesconto ? 'Desconto' : 'Juros';
        const conta = isDesconto ? 'conta desconto' : `conta ${CONTA_GER_JUROS} (${GER_DES_JUROS})`;
        const moeda = aloc.moeda ?? 'USD';
        const partes: string[] = [
            `Permuta adto ${aloc.adiantamentoDocCod} x invoice ${aloc.invoiceDocCod}.`,
            `Baixa ${valorBaixaBrl.toFixed(2)} BRL (alocado ${aloc.valorAlocado} ${moeda}).`,
        ];
        if (aloc.taxaAdiantamento !== undefined && aloc.taxaInvoice !== undefined) {
            partes.push(
                `Variacao cambial (${tipo}): ${aloc.valorAlocado} ${moeda} x (taxa adto ${aloc.taxaAdiantamento} - taxa invoice ${aloc.taxaInvoice}) = ${valorVariacao.toFixed(2)} BRL.`,
            );
        } else {
            partes.push(`Variacao cambial (${tipo}): ${valorVariacao.toFixed(2)} BRL.`);
        }
        partes.push(`Lancado em ${conta}.`);
        // O ERP exige descrição em MAIÚSCULAS (CnxValidatorDescr / not_in_uppercase, sonda 2026-06-23).
        return partes.join(' ').toUpperCase();
    };

    /** Preview (dry-run) montado SÓ com dados locais — sem chamar o ERP. */
    private buildPreviewPayload = (aloc: AlocacaoRow, filCod: number): Record<string, unknown> => {
        const isDesconto = aloc.variacaoClassificacao === 'DESCONTO';
        const valorVariacao = round2(aloc.variacaoResultado ?? 0);
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
            bxaEspComplemento: this.buildComentario(
                aloc,
                aloc.taxaInvoice ? round2(aloc.valorAlocado * aloc.taxaInvoice) : aloc.valorAlocado,
                valorVariacao,
            ),
        };
    };

    /**
     * Lê o envelope `{ messages }` das validações do fin010 (Regis F-integrability-3): um
     * `valid='ERRO'` chega com HTTP 200 e passaria despercebido. AVISO (ex.:
     * PESSOA_POSSUI_ADIANTAMENTO) é informativo e segue; ERRO aborta o handshake.
     */
    private assertNoErpError = (
        resp: { messages?: Array<{ valid?: string; message?: string }> },
        passo: string,
    ): void => {
        const erro = resp.messages?.find((m) => m.valid === 'ERRO');
        if (erro) {
            throw new Error(`fin010 ${passo} retornou ERRO: ${erro.message ?? 'sem detalhe'}`);
        }
    };

    /**
     * O borderô de uma baixa settled ainda é VÁLIDO no ERP? (em cadastro ou finalizado).
     * CANCELADO (borVldFinalizado=2) / ESTORNADO (borCodEstornado) / REMOVIDO (404) ⇒ inválido →
     * libera relançamento. Em ERRO de leitura: conservador = válido (não arrisca dupla baixa).
     */
    private borderoAindaValido = async (filCod: number, borCod?: number): Promise<boolean> => {
        if (borCod === undefined) return false; // settled sem borderô registrado → libera
        try {
            const det = await this.conexosClient.getBordero({ filCod, borCod });
            if (!det) return false; // removido
            if (det.borCodEstornado != null) return false; // estornado
            if (det.borVldFinalizado === 2) return false; // cancelado
            return true; // em cadastro (0) ou finalizado (1)
        } catch {
            return true; // incerto → conservador (bloqueia re-baixa)
        }
    };

    private extractErpData = (err: unknown): unknown => {
        const ax = err as {
            response?: { data?: unknown };
            cause?: { response?: { data?: unknown } };
        };
        return ax?.response?.data ?? ax?.cause?.response?.data ?? null;
    };

    /** Mensagem amigável (PT) a partir do erro do ERP — traduz os códigos de validação do fin010. */
    private friendlyErpMessage = (err: unknown): string => {
        const data = this.extractErpData(err) as { messages?: Array<{ message?: string }> } | null;
        const key = data?.messages?.[0]?.message;
        const map: Record<string, string> = {
            'FIN_010.DATA_BLOQUEADA_PELA_CONTABILIDADE':
                'Data do borderô bloqueada pela contabilidade (período fechado). Use uma data em período aberto.',
            'FIN_010.FIN_IMPOSSIVEL_ALTERAR_REGISTRO':
                'Borderô finalizado — não é possível alterar.',
            CnxValidatorMny: 'Valor monetário inválido (precisão > 2 casas).',
            CnxValidatorDescr: 'Descrição/comentário inválido (precisa estar em MAIÚSCULAS).',
        };
        if (key) return map[key] ?? String(key);
        return err instanceof Error ? err.message : String(err);
    };
}
