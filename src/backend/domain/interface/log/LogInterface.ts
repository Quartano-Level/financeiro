export type LogLevel = 'INFO' | 'ERROR' | 'WARN' | 'SUCCESS';

export type LogType =
    | 'VALIDATION_ERROR'
    | 'BUSINESS_ERROR'
    | 'CONEXOS_ERROR'
    | 'SYSTEM_ERROR'
    | 'CONEXOS_DEBUG'
    | string;

export interface LoggerMetadata {
    service: string;
    lambdaContext: string;
    lambdaName: string;
    requestId: string;
    environment: string;
    clientName: string;
    messageId?: string;
    eventId?: string;
    flowId?: string;
    parentExecutionId?: string;
}

export interface CreateLogInput {
    level: LogLevel;
    type: LogType;
    message: string;
    stacktrace?: string;
    statusCode?: number;
    qive_id?: string | null;
    caller?: string;
    data?: Record<string, any>;
}

export interface LogInterface extends CreateLogInput, LoggerMetadata {
    timestamp: string;
}

export interface BaseLogParams {
    type: LogType;
    message: string;
    statusCode?: number;
    error?: any;
    qive_id?: null | string;
    data?: Record<string, any>;
}
