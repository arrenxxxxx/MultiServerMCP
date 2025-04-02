import { pino } from 'pino';
import { v4 as uuidv4 } from 'uuid';

const loggerOptions = {
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname,traceId',
            messageFormat: '{level} [{traceId}]: {msg}'
        },
    },
    level: process.env.LOG_LEVEL || 'info',
};

// create logger
const logger = pino(loggerOptions);

// create logger with traceId
export function createLoggerWithTraceId(traceId?: string) {
    const id = traceId || uuidv4();
    return {
        info: (...args: any[]) => logger.info({ traceId: id }, formatArgs(args)),
        error: (...args: any[]) => logger.error({ traceId: id }, formatArgs(args)),
        warn: (...args: any[]) => logger.warn({ traceId: id }, formatArgs(args)),
        debug: (...args: any[]) => logger.debug({ traceId: id }, formatArgs(args)),
        trace: (...args: any[]) => logger.trace({ traceId: id }, formatArgs(args)),
        log: (...args: any[]) => logger.info({ traceId: id }, formatArgs(args)),
        getTraceId: () => id
    };
}

// 导出一个用于替换console的对象
export const log = {
    info: (...args: any[]) => logger.info(formatArgs(args)),
    error: (...args: any[]) => logger.error(formatArgs(args)),
    warn: (...args: any[]) => logger.warn(formatArgs(args)),
    debug: (...args: any[]) => logger.debug(formatArgs(args)),
    trace: (...args: any[]) => logger.trace(formatArgs(args)),
    // 兼容console.log
    log: (...args: any[]) => logger.info(formatArgs(args)),
};

// 格式化参数，处理多参数情况
function formatArgs(args: any[]): any {
    if (args.length === 0) return '';
    if (args.length === 1) return args[0];

    // 如果第一个参数是字符串，且包含格式化占位符，尝试格式化
    if (typeof args[0] === 'string' && args[0].includes('%')) {
        try {
            const message = args[0];
            const formatArgs = args.slice(1);
            return { message, formatArgs };
        } catch (error) {
            return { message: args.join(' ') };
        }
    }

    // 如果第一个参数是Error对象
    if (args[0] instanceof Error) {
        const error = args[0];
        const restMessage = args.slice(1).join(' ');
        return { error, message: restMessage || error.message };
    }

    // 如果有多个参数，将它们组合成一个对象
    if (args.length > 1) {
        const message = typeof args[0] === 'string' ? args[0] : '';
        const data = args.slice(typeof args[0] === 'string' ? 1 : 0);
        return { message, data };
    }

    return args[0];
} 