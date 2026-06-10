import { injectable, singleton } from 'tsyringe';
import type {
    BaseLogParams,
    CreateLogInput,
    LoggerMetadata,
    LogInterface,
    LogLevel,
} from '../interface/log/LogInterface.js';

@singleton()
@injectable()
export default class LogService {
    private metadata!: LoggerMetadata;

    public setMetadata = (metadata: LoggerMetadata): void => {
        this.metadata = metadata;
    };

    private writeLog = async (input: CreateLogInput): Promise<void> => {
        const logBody: LogInterface = {
            ...input,
            ...this.metadata,
            timestamp: new Date().toISOString(),
        };

        process.stdout.write(`${JSON.stringify(logBody)}\n`);
    };

    private getCaller = (): string => {
        const stack = new Error().stack;
        if (!stack) return 'unknown';

        const callerLine = stack
            .split('\n')
            .slice(1)
            .find((line) => !line.includes('LogService'));

        if (!callerLine) return 'unknown';

        const match = callerLine.trim().match(/^at\s+(?:(.+?)\s+\()?(.+):(\d+):\d+\)?$/);
        if (!match) return callerLine.trim();

        const methodInfo = match[1];
        const filePart = match[2].split('/').pop() ?? match[2];
        const lineNo = match[3];

        return methodInfo ? `${methodInfo} (${filePart}:${lineNo})` : `${filePart}:${lineNo}`;
    };

    private log = async (level: LogLevel, params: BaseLogParams): Promise<void> => {
        await this.writeLog({
            level,
            type: params.type,
            message: params.message,
            stacktrace: params.error?.stack,
            statusCode: level === 'ERROR' ? (params.statusCode ?? 500) : params.statusCode,
            qive_id: params.qive_id,
            caller: this.getCaller(),
            data: params.data,
        });
    };

    public success = async (params: BaseLogParams): Promise<void> => {
        await this.log('SUCCESS', params);
    };

    public error = async (params: BaseLogParams): Promise<void> => {
        await this.log('ERROR', params);
    };

    public warn = async (params: BaseLogParams): Promise<void> => {
        await this.log('WARN', params);
    };

    public info = async (params: BaseLogParams): Promise<void> => {
        await this.log('INFO', params);
    };
}
