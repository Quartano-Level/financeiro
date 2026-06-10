import 'reflect-metadata';
import SqlBuilder from './SqlBuilder.js';

describe('SqlBuilder', () => {
    let builder: SqlBuilder;

    beforeEach(() => {
        builder = new SqlBuilder();
    });

    describe('build', () => {
        it('substitui um unico named param', () => {
            const { query, params } = builder.build(
                'SELECT * FROM processo WHERE pri_cod = $priCod',
                {
                    priCod: 42,
                },
            );

            expect(query).toBe('SELECT * FROM processo WHERE pri_cod = $1');
            expect(params).toEqual([42]);
        });

        it('substitui multiplos params distintos na ordem de aparencia', () => {
            const { query, params } = builder.build(
                'SELECT * FROM despesa WHERE status = $status AND pri_cod = $priCod',
                { status: 'OK', priCod: 1234 },
            );

            expect(query).toBe('SELECT * FROM despesa WHERE status = $1 AND pri_cod = $2');
            expect(params).toEqual(['OK', 1234]);
        });

        it('param duplicado reutiliza o mesmo indice positional', () => {
            const { query, params } = builder.build(
                'UPDATE t SET a = $val, b = $val WHERE id = $id',
                { val: 'x', id: 99 },
            );

            expect(query).toBe('UPDATE t SET a = $1, b = $1 WHERE id = $2');
            expect(params).toEqual(['x', 99]);
        });

        it('lanca erro quando param esta na query mas ausente no objeto', () => {
            expect(() => builder.build('SELECT * FROM processo WHERE id = $id', {})).toThrow(
                'Named parameter "$id" is referenced in the query but not provided',
            );
        });

        it('lanca erro em query com named e positional params misturados', () => {
            expect(() =>
                builder.build('SELECT * FROM processo WHERE id = $1 AND status = $status', {
                    status: 'x',
                }),
            ).toThrow('Mixed named and positional params are not allowed in the same query');
        });

        it('retorna query inalterada e params vazio quando nao ha named params', () => {
            const raw = 'SELECT * FROM processo WHERE id = $1';
            const { query, params } = builder.build(raw, {});

            expect(query).toBe(raw);
            expect(params).toEqual([]);
        });

        it('identifica corretamente params com underscore como $cnpj_prestador', () => {
            const { query, params } = builder.build(
                'SELECT * FROM fornecedor WHERE cnpj = $cnpj_prestador',
                { cnpj_prestador: '12345678000199' },
            );

            expect(query).toBe('SELECT * FROM fornecedor WHERE cnpj = $1');
            expect(params).toEqual(['12345678000199']);
        });

        it('preserva cast syntax $status::text', () => {
            const { query, params } = builder.build(
                'INSERT INTO log (status) VALUES ($status::text)',
                { status: 'SAVED' },
            );

            expect(query).toBe('INSERT INTO log (status) VALUES ($1::text)');
            expect(params).toEqual(['SAVED']);
        });

        it('aceita valor null', () => {
            const { query, params } = builder.build(
                'UPDATE processo SET obs = $obs WHERE id = $id',
                { obs: null, id: '1' },
            );

            expect(query).toBe('UPDATE processo SET obs = $1 WHERE id = $2');
            expect(params).toEqual([null, '1']);
        });

        it('aceita valor boolean', () => {
            const { query, params } = builder.build(
                'UPDATE processo SET active = $active WHERE id = $id',
                { active: false, id: '1' },
            );

            expect(query).toBe('UPDATE processo SET active = $1 WHERE id = $2');
            expect(params).toEqual([false, '1']);
        });

        it('aceita valor number', () => {
            const { query, params } = builder.build(
                'SELECT * FROM processo LIMIT $limit OFFSET $offset',
                { limit: 10, offset: 20 },
            );

            expect(query).toBe('SELECT * FROM processo LIMIT $1 OFFSET $2');
            expect(params).toEqual([10, 20]);
        });
    });
});
