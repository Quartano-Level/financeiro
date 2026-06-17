export default interface IExecutor {
    execute<T>(fn: () => Promise<T>): Promise<T>;
}
