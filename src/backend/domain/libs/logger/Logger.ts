export default class Logger {
    public static info = (...message: any) => {
        console.log(`[INFO - ${new Date().toISOString()}]:`, ...message);
    };

    public static warn = (...message: any) => {
        console.warn(`[WARN - ${new Date().toISOString()}]:`, ...message);
    };

    public static error = (...message: any) => {
        console.error(`[ERROR - ${new Date().toISOString()}]:`, ...message);
    };
}
