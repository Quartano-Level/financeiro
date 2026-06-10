import 'reflect-metadata';
import axios from 'axios';
import { BcbUnavailableError, CdiNaoDisponivelError } from '../errors/BcbUnavailableError.js';
import BcbClient from './BcbClient.js';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BcbClient.getCdiAnualSnapshot', () => {
    let client: BcbClient;
    let httpGet: jest.Mock;

    beforeEach(() => {
        httpGet = jest.fn();
        mockedAxios.create.mockReturnValue({ get: httpGet } as unknown as ReturnType<
            typeof axios.create
        >);
        client = new BcbClient();
    });

    it('returns {cdiAnual, fonte} on a normal 200 response', async () => {
        httpGet.mockResolvedValueOnce({
            data: [{ data: '30/04/2026', valor: '13.65' }],
        });

        const snap = await client.getCdiAnualSnapshot(new Date('2026-04-30T00:00:00Z'));

        expect(snap.cdiAnual).toBe(13.65);
        expect(snap.fonte).toBe('BCB:SGS:4389@2026-04-30');
        expect(httpGet).toHaveBeenCalledTimes(1);
        // BCB SGS 4389 only publishes on rate-change days, so we query
        // a 30-day lookback range and pick the latest entry on/before
        // dataBase. dataInicial = dataBase - 30d, dataFinal = dataBase.
        expect(httpGet.mock.calls[0][0]).toBe('/bcdata.sgs.4389/dados');
        expect(httpGet.mock.calls[0][1].params.dataInicial).toBe('31/03/2026');
        expect(httpGet.mock.calls[0][1].params.dataFinal).toBe('30/04/2026');
    });

    it('retries once on transient 503 then succeeds', async () => {
        httpGet.mockRejectedValueOnce(new Error('503 Service Unavailable')).mockResolvedValueOnce({
            data: [{ data: '30/04/2026', valor: '13.65' }],
        });

        const snap = await client.getCdiAnualSnapshot(new Date('2026-04-30T00:00:00Z'));
        expect(snap.cdiAnual).toBe(13.65);
        expect(httpGet).toHaveBeenCalledTimes(2);
    });

    it('throws BcbUnavailableError after exhausted retries', async () => {
        httpGet.mockRejectedValue(new Error('503'));
        await expect(
            client.getCdiAnualSnapshot(new Date('2026-04-30T00:00:00Z')),
        ).rejects.toBeInstanceOf(BcbUnavailableError);
    });

    it('throws CdiNaoDisponivelError when SGS returns empty array', async () => {
        httpGet.mockResolvedValueOnce({ data: [] });
        await expect(
            client.getCdiAnualSnapshot(new Date('2026-04-30T00:00:00Z')),
        ).rejects.toBeInstanceOf(CdiNaoDisponivelError);
    });

    it('throws CdiNaoDisponivelError when SGS value is not numeric', async () => {
        httpGet.mockResolvedValueOnce({
            data: [{ data: '30/04/2026', valor: 'NaN' }],
        });
        await expect(
            client.getCdiAnualSnapshot(new Date('2026-04-30T00:00:00Z')),
        ).rejects.toBeInstanceOf(CdiNaoDisponivelError);
    });
});
