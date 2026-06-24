import { inject, injectable } from 'tsyringe';
import ConexosClient from '../../client/ConexosClient.js';
import { LOG_TYPE } from '../../interface/log/LogInterface.js';
import EnvironmentProvider from '../../libs/environment/EnvironmentProvider.js';
import PermutaExecucaoRepository, {
    type ExecucaoRow,
    type ExecucaoStatus,
} from '../../repository/permutas/PermutaExecucaoRepository.js';
import LogService from '../LogService.js';

/** Situação viva do borderô no ERP (derivada do `getBordero`). */
export type BorderoSituacao =
    | 'EM_CADASTRO'
    | 'FINALIZADO'
    | 'CANCELADO'
    | 'ESTORNADO'
    | 'REMOVIDO'
    | 'INDISPONIVEL';

/** Uma baixa (par adto→invoice) dentro do borderô — vinda da nossa trilha. */
export interface BaixaResumo {
    invoiceDocCod: string;
    adiantamentoDocCod: string;
    status: ExecucaoStatus;
    valorBaixado?: number;
    juros?: number;
    contaJuros?: number;
    bxaCodSeq?: number;
    criadoEm: string;
}

/** Resumo de um borderô para a tela de gestão (trilha local + status vivo do ERP). */
export interface BorderoResumo {
    borCod: number;
    filCod: number;
    /** Situação VIVA no ERP (em aberto / finalizado / estornado / removido). */
    situacao: BorderoSituacao;
    finalizado: boolean;
    estornado: boolean;
    criadoPor?: string;
    criadoEm: string;
    totalBaixado: number;
    baixas: BaixaResumo[];
    /** Criado por ESTE sistema (tem trilha local)? Habilita as ações de escrita no front. */
    daTrilha: boolean;
}

/**
 * BorderoGestaoService — alimenta a aba de **gestão de borderôs** (Fase 3.1, READ-ONLY).
 *
 * Fonte: a nossa trilha de execução (`permuta_alocacao_execucao`) agrupada por `bor_cod` —
 * são os borderôs que ESTE sistema criou. Enriquece cada um com o **estado vivo do ERP**
 * (`ConexosClient.getBordero`): EM CADASTRO / FINALIZADO / ESTORNADO / REMOVIDO. As AÇÕES
 * de aprovação/exclusão/estorno (escrita) são uma fatia futura — aqui só listamos para revisão.
 */
@injectable()
export default class BorderoGestaoService {
    constructor(
        @inject(ConexosClient) private conexosClient: ConexosClient,
        @inject(EnvironmentProvider) private environmentProvider: EnvironmentProvider,
        @inject(PermutaExecucaoRepository)
        private execucaoRepository: PermutaExecucaoRepository,
        @inject(LogService) private logService: LogService,
    ) {}

    /**
     * Exclui UMA baixa específica de um borderô EM CADASTRO (antes de aprovar) — Fase 3.1.
     * Gated pela escrita (CONEXOS_WRITE_ENABLED). Exclui no ERP (`fin010/baixas/...`) e remove
     * a linha da nossa trilha. `bxaCodSeq`/`filCod` vêm da trilha (não confia no cliente).
     */
    public excluirBaixa = async (params: {
        borCod: number;
        invoiceDocCod: string;
        executadoPor: string;
    }): Promise<{
        borCod: number;
        invoiceDocCod: string;
        excluido: boolean;
        borderoExcluido: boolean;
    }> => {
        const { borCod, invoiceDocCod, executadoPor } = params;
        const env = await this.environmentProvider.getEnvironmentVars();
        if (!env.conexosWriteEnabled) {
            throw new Error('escrita no Conexos desabilitada (CONEXOS_WRITE_ENABLED=false)');
        }
        const row = await this.execucaoRepository.findByBorCodInvoice(borCod, invoiceDocCod);
        if (!row)
            throw new Error(
                `baixa não encontrada na trilha: borderô ${borCod} / invoice ${invoiceDocCod}`,
            );
        if (row.bxaCodSeq === undefined) {
            throw new Error(
                `baixa ${borCod}/${invoiceDocCod} sem bxaCodSeq — não dá para excluir no ERP`,
            );
        }

        await this.conexosClient.excluirBaixa({
            filCod: row.filCod,
            borCod,
            invoiceDocCod: Number(invoiceDocCod),
            titCod: 1,
            bxaCodSeq: row.bxaCodSeq,
        });
        await this.execucaoRepository.deleteByBorCodInvoice(borCod, invoiceDocCod);

        // Se foi a ÚLTIMA baixa, o borderô fica vazio → tenta apagar o borderô no ERP também.
        // BEST-EFFORT: a baixa já foi removida (ação principal); uma falha aqui NÃO derruba a
        // operação — apenas loga e segue (o borderô some da nossa lista de qualquer forma).
        let borderoExcluido = false;
        if ((await this.execucaoRepository.countByBorCod(borCod)) === 0) {
            try {
                await this.conexosClient.excluirBordero({ filCod: row.filCod, borCod });
                borderoExcluido = true;
            } catch (err) {
                await this.logService.warn({
                    type: LOG_TYPE.BUSINESS_WARN,
                    message:
                        'baixa excluída, mas falha ao apagar o borderô vazio no ERP (best-effort)',
                    data: { borCod, erro: err instanceof Error ? err.message : String(err) },
                });
            }
        }

        await this.logService.info({
            type: LOG_TYPE.BUSINESS_INFO,
            message: 'baixa excluída do borderô (fin010)',
            data: {
                borCod,
                invoiceDocCod,
                bxaCodSeq: row.bxaCodSeq,
                borderoExcluido,
                executadoPor,
            },
        });
        return { borCod, invoiceDocCod, excluido: true, borderoExcluido };
    };

    /**
     * Exclui o BORDERÔ INTEIRO (em cadastro) — caminho inverso de excluir baixa a baixa. Remove
     * cada baixa no ERP e depois o próprio borderô (`moduleBordero.delete`), além de limpar a
     * trilha. Gated (CONEXOS_WRITE_ENABLED). Só borderô EM CADASTRO (não finalizado/estornado).
     */
    public excluirBordero = async (params: {
        borCod: number;
        executadoPor: string;
        filCod?: number;
    }): Promise<{ borCod: number; excluido: boolean; baixasExcluidas: number }> => {
        const { borCod, executadoPor } = params;
        await this.assertWriteEnabled();
        const filCod = await this.resolveFilCod(borCod, params.filCod);

        // O estado (em cadastro/finalizado) é validado pela LISTA no front (fonte confiável) e,
        // em última instância, pelo próprio ERP (que recusa excluir baixa de borderô finalizado —
        // FIN_IMPOSSIVEL_ALTERAR). NÃO usamos o GET de detalhe aqui: ele é incoerente
        // (borDtaFinalizado persiste após estorno → falso "finalizado").

        // Enumera as baixas DO ERP (fonte da verdade — funciona p/ borderôs fora da trilha),
        // remove cada uma e depois o próprio borderô.
        const baixas = await this.conexosClient.listBaixas({ filCod, borCod });
        for (const b of baixas) {
            await this.conexosClient.excluirBaixa({
                filCod,
                borCod,
                docTip: b.docTip,
                invoiceDocCod: b.docCod,
                titCod: b.titCod,
                bxaCodSeq: b.bxaCodSeq,
            });
        }
        await this.conexosClient.excluirBordero({ filCod, borCod });
        await this.execucaoRepository.deleteByBorCod(borCod); // limpa a trilha (no-op se não houver)

        await this.logService.info({
            type: LOG_TYPE.BUSINESS_INFO,
            message: 'borderô excluído inteiro (fin010)',
            data: { borCod, baixasExcluidas: baixas.length, executadoPor },
        });
        return { borCod, excluido: true, baixasExcluidas: baixas.length };
    };

    /**
     * FINALIZA (aprova) o borderô — confirma a baixa no ERP. Gated; só EM CADASTRO. A trilha é
     * preservada (o borderô passa a FINALIZADO na lista, status vivo do ERP).
     */
    public finalizarBordero = async (params: {
        borCod: number;
        executadoPor: string;
        filCod?: number;
    }): Promise<{ borCod: number; finalizado: boolean }> => {
        const filCod = await this.guardAcaoBordero(params.borCod, params.filCod);
        await this.conexosClient.finalizarBordero({ filCod, borCod: params.borCod });
        await this.logService.info({
            type: LOG_TYPE.BUSINESS_INFO,
            message: 'borderô finalizado/aprovado (fin010)',
            data: { borCod: params.borCod, executadoPor: params.executadoPor },
        });
        return { borCod: params.borCod, finalizado: true };
    };

    /**
     * CANCELA o borderô (em cadastro) — desfaz sem excluir (vira CANCELADO no ERP). Gated; só EM CADASTRO.
     */
    public cancelarBordero = async (params: {
        borCod: number;
        executadoPor: string;
        filCod?: number;
    }): Promise<{ borCod: number; cancelado: boolean }> => {
        const filCod = await this.guardAcaoBordero(params.borCod, params.filCod);
        await this.conexosClient.cancelarBordero({ filCod, borCod: params.borCod });
        await this.logService.info({
            type: LOG_TYPE.BUSINESS_INFO,
            message: 'borderô cancelado (fin010)',
            data: { borCod: params.borCod, executadoPor: params.executadoPor },
        });
        return { borCod: params.borCod, cancelado: true };
    };

    /**
     * ESTORNA o borderô FINALIZADO — desfaz a finalização; o borderô VOLTA para EM CADASTRO no ERP
     * (pode ser finalizado de novo). Gated; só FINALIZADO. A trilha é preservada.
     */
    public estornarBordero = async (params: {
        borCod: number;
        executadoPor: string;
        filCod?: number;
    }): Promise<{ borCod: number; estornado: boolean }> => {
        const filCod = await this.guardEstornoBordero(params.borCod, params.filCod);
        await this.conexosClient.estornarBordero({ filCod, borCod: params.borCod });
        await this.logService.info({
            type: LOG_TYPE.BUSINESS_INFO,
            message: 'borderô estornado (fin010) — volta para em cadastro',
            data: { borCod: params.borCod, executadoPor: params.executadoPor },
        });
        return { borCod: params.borCod, estornado: true };
    };

    /** Lança se a escrita no Conexos estiver desabilitada (gate de todas as ações). */
    private assertWriteEnabled = async (): Promise<void> => {
        const env = await this.environmentProvider.getEnvironmentVars();
        if (!env.conexosWriteEnabled) {
            throw new Error('escrita no Conexos desabilitada (CONEXOS_WRITE_ENABLED=false)');
        }
    };

    /**
     * Resolve o filCod de um borderô: usa o `filCod` informado (vem do item da lista do ERP);
     * cai pra trilha local; e por fim a filial default do ambiente. Permite agir sobre borderôs
     * que NÃO foram criados por este sistema (sem trilha).
     */
    private resolveFilCod = async (borCod: number, filCodParam?: number): Promise<number> => {
        if (filCodParam !== undefined && Number.isFinite(filCodParam)) return filCodParam;
        const baixas = await this.execucaoRepository.listByBorCod(borCod);
        if (baixas[0]?.filCod !== undefined) return baixas[0].filCod;
        const env = await this.environmentProvider.getEnvironmentVars();
        if (Number.isFinite(env.conexosFilCod)) return env.conexosFilCod;
        throw new Error(`não foi possível resolver a filial do borderô ${borCod}`);
    };

    /**
     * Guard comum de aprovar/cancelar/estornar: escrita habilitada + resolução do filCod. O ESTADO
     * (em cadastro/finalizado) NÃO é checado via GET de detalhe (incoerente) — quem barra é a LISTA
     * no front (habilita o botão pela situação) e o próprio ERP (recusa transições inválidas com
     * mensagem clara, traduzida no route).
     */
    private guardAcaoBordero = (borCod: number, filCodParam?: number): Promise<number> =>
        this.assertWriteEnabled().then(() => this.resolveFilCod(borCod, filCodParam));

    /** Guard do estorno — idêntico (o ERP recusa estornar o que não está finalizado). */
    private guardEstornoBordero = (borCod: number, filCodParam?: number): Promise<number> =>
        this.guardAcaoBordero(borCod, filCodParam);

    /**
     * Lista os borderôs de permuta — FONTE AUTORITATIVA: o ERP (`fin010/list`, borVldTipo=2), assim
     * a tela SEMPRE reflete o Conexos (mostra cancelados/estornados mesmo que a trilha local não
     * tenha). Enriquece cada borderô com os detalhes de baixa da nossa trilha (invoice/adto/juros).
     * Consulta as filiais presentes na trilha ∪ a filial default do ambiente.
     */
    public listarBorderos = async (): Promise<BorderoResumo[]> => {
        const rows = await this.execucaoRepository.listComBordero();
        // Agrupa as baixas da trilha por borCod (detalhe; o ERP é a fonte da LISTA).
        const trilhaPorBor = new Map<number, ExecucaoRow[]>();
        for (const r of rows) {
            if (r.borCod === undefined) continue;
            const lista = trilhaPorBor.get(r.borCod) ?? [];
            lista.push(r);
            trilhaPorBor.set(r.borCod, lista);
        }

        // Filiais a consultar no ERP: as da trilha ∪ a default do ambiente.
        const env = await this.environmentProvider.getEnvironmentVars();
        const filiais = new Set<number>();
        for (const r of rows) if (Number.isFinite(r.filCod)) filiais.add(r.filCod);
        if (Number.isFinite(env.conexosFilCod)) filiais.add(env.conexosFilCod);

        // Busca os borderôs de permuta no ERP (uma chamada por filial, em paralelo).
        const itensPorFilial = await Promise.all(
            [...filiais].map((filCod) =>
                this.conexosClient.listBorderos({ filCod }).catch(async (err) => {
                    await this.logService.warn({
                        type: LOG_TYPE.BUSINESS_WARN,
                        message: 'falha ao listar borderôs do ERP (filial segue vazia)',
                        data: { filCod, erro: err instanceof Error ? err.message : String(err) },
                    });
                    return [];
                }),
            ),
        );

        const resumos: BorderoResumo[] = [];
        for (const itens of itensPorFilial) {
            for (const item of itens) {
                const baixasRows = trilhaPorBor.get(item.borCod) ?? [];
                const situacao = this.situacaoDoItem(item);
                const baixas: BaixaResumo[] = baixasRows.map((r) => ({
                    invoiceDocCod: r.invoiceDocCod,
                    adiantamentoDocCod: r.adiantamentoDocCod,
                    status: r.status,
                    ...(r.valorBaixado !== undefined ? { valorBaixado: r.valorBaixado } : {}),
                    ...(r.juros !== undefined ? { juros: r.juros } : {}),
                    ...(r.contaJuros !== undefined ? { contaJuros: r.contaJuros } : {}),
                    ...(r.bxaCodSeq !== undefined ? { bxaCodSeq: r.bxaCodSeq } : {}),
                    criadoEm: r.criadoEm.toISOString(),
                }));
                // Total: soma da trilha (detalhe) ou o total líquido do ERP (quando sem trilha).
                const totalTrilha = baixas.reduce((acc, b) => acc + (b.valorBaixado ?? 0), 0);
                const totalBaixado =
                    baixas.length > 0
                        ? Math.round(totalTrilha * 100) / 100
                        : (item.vlrTotalLiquido ?? 0);
                const criadoPor = baixasRows[0]?.executadoPor ?? item.usnDesNomeCad ?? undefined;
                const criadoEm =
                    baixasRows.map((r) => r.criadoEm.toISOString()).sort()[0] ??
                    (item.borDtaMvto ? new Date(item.borDtaMvto).toISOString() : '');
                resumos.push({
                    borCod: item.borCod,
                    filCod: item.filCod,
                    situacao,
                    finalizado: situacao === 'FINALIZADO',
                    estornado: situacao === 'ESTORNADO',
                    ...(criadoPor !== undefined ? { criadoPor } : {}),
                    criadoEm,
                    totalBaixado,
                    baixas,
                    daTrilha: baixasRows.length > 0,
                });
            }
        }

        // Mais recentes primeiro (maior borCod). Dedup por borCod (filiais podem se sobrepor).
        const porBor = new Map<number, BorderoResumo>();
        for (const r of resumos) porBor.set(r.borCod, r);
        return [...porBor.values()].sort((a, b) => b.borCod - a.borCod);
    };

    /**
     * Situação OPERACIONAL do borderô, derivada de `borVldFinalizado` (0/undefined = EM CADASTRO,
     * 1 = FINALIZADO, 2 = CANCELADO). `borCodEstornado` é só VÍNCULO DE AUDITORIA — NÃO é a
     * situação: ao estornar, o ERP devolve o borderô para EM CADASTRO (finalizável de novo), mesmo
     * mantendo o `borCodEstornado` como histórico do estorno.
     */
    private situacaoDoItem = (item: { borVldFinalizado?: number }): BorderoSituacao => {
        if (item.borVldFinalizado === 1) return 'FINALIZADO';
        if (item.borVldFinalizado === 2) return 'CANCELADO';
        return 'EM_CADASTRO';
    };
}
