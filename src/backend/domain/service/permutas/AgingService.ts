import { injectable } from 'tsyringe';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * AgingService — regra `aging-anchor` (P0-8 RESOLVIDO).
 *
 * Ontology: `ontology/business-rules/aging-anchor.md`. `aging = hoje − dataBase`
 * (em dias inteiros), âncora = data-base da D.I/DUIMP.
 *
 * ⏸ GATED-P0-4: quando `dataBase` é `undefined` (campo wire pendente de probe),
 * retorna `undefined` ("pendente") — SEM lançar erro. A candidata não falha por
 * isso; só a coluna aging não popula.
 */
@injectable()
export default class AgingService {
    public compute = (dataBase?: Date, now: Date = new Date()): number | undefined => {
        if (!dataBase) return undefined;
        const diffMs = now.getTime() - dataBase.getTime();
        return Math.floor(diffMs / MS_PER_DAY);
    };
}
