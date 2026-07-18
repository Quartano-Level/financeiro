import { inject, injectable } from 'tsyringe';
import ConexosSispagRetornoClient from '../../client/ConexosSispagRetornoClient.js';
import { LOG_TYPE } from '../../interface/log/LogInterface.js';
import EnvironmentProvider from '../../libs/environment/EnvironmentProvider.js';
import LogService from '../LogService.js';

/**
 * Chave de advisory lock EXCLUSIVA do poller de retorno (≠ ingestão 726354819,
 * ≠ formação 615243789). Um poller por vez lê a pasta e processa.
 */
export const RETORNO_POLLER_LOCK_KEY = 528417963;

/** Um `.RET` encontrado na pasta/SharePoint, pronto para subir. */
export interface ArquivoRetPendente {
    fileName: string;
    conteudo: Buffer;
    /** Banco e config de layout (do `ger015`) — roteados pelo nome/pasta do arquivo. */
    bncCod: number;
    gtbCodSeq: number;
    filCod: number;
}

export interface ProcessarRetornosInput {
    triggeredBy: string;
    /** Força dry-run mesmo com escrita habilitada (preview sem POST). */
    dryRunOverride?: boolean;
}

export interface ArquivoRetResult {
    fileName: string;
    status: 'dry-run' | 'processed' | 'skipped' | 'error';
    dryRun: boolean;
    garCodSeq?: number;
    /** Baixas confirmadas (linhas de detalhe com `bxaCodSeq`). */
    baixas?: number;
    rejeitados?: number;
    erro?: string;
}

export interface ProcessarRetornosResult {
    dryRun: boolean;
    writeEnabled: boolean;
    resultados: ArquivoRetResult[];
}

/**
 * RetornoOrquestracaoService — ESQUELETO (2026-07-11) da perna de RETORNO do SISPAG.
 *
 * Fluxo alvo (Fatia 3, pós-analista): robô-poller lê a pasta/SharePoint onde o Nexxera
 * larga os `.RET` → para cada arquivo: `carregar` (upload) → `processar` (o ERP parseia e
 * dá as baixas no fin010) → confirma a baixa pelo detalhe (`bxaCodSeq`) → transiciona o
 * lote (`RETORNADO`→`BAIXADO`) → trata rejeitado/parcial. Espelha a doutrina de escrita
 * irreversível de `ReconciliacaoPermutaService` (gating `conexosWriteEnabled`/`conexosDryRun`,
 * dry-run default, ledger write-ahead idempotente) e o padrão de poller de
 * `IngestaoPagamentosService` (advisory lock + run de auditoria).
 *
 * ⚠️ NÃO WIRED / DORMENTE: nenhuma rota/cron chama; falta o `.RET` de exemplo, o HAR de
 * `processar`/`liberar` e do `arquivosRetornoDetalhe/list`, o reader de pasta/SharePoint,
 * o ledger `retorno_execucao` e o status `BAIXADO`. Os pontos bloqueados estão como TODO.
 * Ver `ontology/_inbox/sispag-fin052-exploration.md`.
 */
@injectable()
export default class RetornoOrquestracaoService {
    public constructor(
        @inject(ConexosSispagRetornoClient)
        private readonly retorno: ConexosSispagRetornoClient,
        @inject(EnvironmentProvider) private readonly environmentProvider: EnvironmentProvider,
        @inject(LogService) private readonly logService: LogService,
    ) {}

    public processarRetornos = async (
        input: ProcessarRetornosInput,
    ): Promise<ProcessarRetornosResult> => {
        // Gating de escrita (Rule #8 — nunca process.env no serviço). Dry-run vence.
        const env = await this.environmentProvider.getEnvironmentVars();
        const writeEnabled = env.conexosWriteEnabled;
        const dryRun = !writeEnabled || env.conexosDryRun || input.dryRunOverride === true;

        // TODO(Ricardo/comercial): reader da PASTA/SharePoint onde o Nexxera larga os `.RET`.
        //   Caminho exato em aberto (briefing §4.2). Retornar os arquivos + rotear (bncCod,
        //   gtbCodSeq) pelo nome/pasta. Enquanto não existe, no-op seguro (lista vazia).
        // TODO(advisory-lock): envolver o corpo em `db.withAdvisoryLock(RETORNO_POLLER_LOCK_KEY, ...)`
        //   (igual IngestaoPagamentosService) quando houver o PostgreeDatabaseClient injetado.
        const pendentes = await this.listarRetNaPasta();

        const resultados: ArquivoRetResult[] = [];
        for (const arq of pendentes) {
            resultados.push(await this.processarArquivo(arq, dryRun));
        }

        // TODO(audit): gravar um run de auditoria (espelhar PagamentoIngestaoRunRepository):
        //   quem disparou, quantos arquivos, baixas confirmadas, rejeitados.
        await this.logService.info({
            type: LOG_TYPE.BUSINESS_INFO,
            message: 'retorno poller: processamento concluído',
            data: {
                dryRun,
                writeEnabled,
                total: resultados.length,
                triggeredBy: input.triggeredBy,
            },
        });
        return { dryRun, writeEnabled, resultados };
    };

    /** Processa UM `.RET`: carregar → processar → confirmar baixa → transicionar. */
    private processarArquivo = async (
        arq: ArquivoRetPendente,
        dryRun: boolean,
    ): Promise<ArquivoRetResult> => {
        // DRY-RUN: preview puro, sem tocar o ERP (I-Recon-4 equivalente).
        if (dryRun) {
            await this.logService.info({
                type: LOG_TYPE.BUSINESS_INFO,
                message: 'retorno DRY-RUN (sem upload/processar)',
                data: { fileName: arq.fileName, bncCod: arq.bncCod, gtbCodSeq: arq.gtbCodSeq },
            });
            return { fileName: arq.fileName, status: 'dry-run', dryRun: true };
        }

        // TODO(ledger): idempotência write-ahead — pular se este arquivo (hash/nome) já foi
        //   processado (tabela `retorno_execucao` com idempotency_key UNIQUE, espelhar
        //   PermutaExecucaoRepository). Gravar a intenção ANTES do upload.

        try {
            // 1) CARREGAR o `.RET` (multipart) → garCodSeq. (client pronto, não validado em HML.)
            const arquivo = await this.retorno.carregarArquivoRetorno({
                filCod: arq.filCod,
                bncCod: arq.bncCod,
                gtbCodSeq: arq.gtbCodSeq,
                fileName: arq.fileName,
                conteudo: arq.conteudo,
            });

            // 2) PROCESSAR (o ERP parseia e dá as baixas no fin010).
            // TODO(HAR): o `arquivosRetorno/processar` (PUT) não tem body no OpenAPI — capturar
            //   o HAR real e adicionar `processarArquivoRetorno` ao ConexosSispagRetornoClient.
            //   Provável: PUT com a chave do arquivo (bnc/gtb/gar) no body.
            // await this.retorno.processarArquivoRetorno({ ...key });

            // 3) CONFIRMAR a baixa pelo DETALHE (a ponte bxaCodSeq→fin010).
            // TODO(HAR): `arquivosRetornoDetalhe/list` deu REQUIRED_FILTER_ERROR — descobrir o
            //   conjunto de filtros exigido. Assim que resolver, contar as linhas com bxaCodSeq.
            let baixas = 0;
            try {
                const det = await this.retorno.listDetalhe({
                    filCod: arq.filCod,
                    bncCod: arquivo.bncCod,
                    gtbCodSeq: arquivo.gtbCodSeq,
                    garCodSeq: arquivo.garCodSeq,
                });
                baixas = det.filter((d) => d.bxaCodSeq != null).length;
            } catch {
                // detalhe ainda bloqueado por filtro — não falha o arquivo por isso (TODO HAR).
            }

            // 4) REJEITADOS/PARCIAL: `titulosRejeitados` + `arquivosRetorno/erro`.
            const erros = await this.retorno.listErros({
                filCod: arq.filCod,
                bncCod: arquivo.bncCod,
                gtbCodSeq: arquivo.gtbCodSeq,
                garCodSeq: arquivo.garCodSeq,
            });
            // TODO(analista): tratar retorno rejeitado (sanear cadastro e reenviar) — só
            //   happy-path modelado. `arquivo.titulosRejeitados` sinaliza a contagem.

            // 5) TODO(status): transicionar o lote `RETORNADO`→`BAIXADO` (novo status +
            //   migration + mapeamento lote↔arquivo de retorno). LotePagamento hoje termina
            //   em RETORNADO (ADR-0019). Decidir a chave de correlação lote↔.RET com o analista.

            // TODO(ledger): marcar `settled` com a confirmação; em falha, `error` (reconciliação manual).
            return {
                fileName: arq.fileName,
                status: 'processed',
                dryRun: false,
                garCodSeq: arquivo.garCodSeq,
                baixas,
                rejeitados: arquivo.titulosRejeitados ?? erros.length,
            };
        } catch (e) {
            const erro = e instanceof Error ? e.message : String(e);
            await this.logService.warn({
                type: LOG_TYPE.BUSINESS_WARN,
                message: 'retorno: falha ao processar arquivo',
                data: { fileName: arq.fileName, erro },
            });
            return { fileName: arq.fileName, status: 'error', dryRun: false, erro };
        }
    };

    /**
     * TODO(Ricardo/comercial): lê os `.RET` da pasta/SharePoint de retorno (caminho em aberto).
     * No-op seguro por ora (lista vazia) — o serviço é dormente até o reader existir.
     */
    private listarRetNaPasta = async (): Promise<ArquivoRetPendente[]> => {
        return [];
    };
}
