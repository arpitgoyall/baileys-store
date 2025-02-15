"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSession = void 0;
const baileys_1 = require("@whiskeysockets/baileys");
const baileys_2 = require("@whiskeysockets/baileys");
const client_1 = require("@prisma/client");
const shared_1 = require("./shared");
const fixId = (id) => id.replace(/\//g, '__').replace(/:/g, '-');
async function useSession(sessionId) {
    const model = (0, shared_1.usePrisma)().session;
    const logger = (0, shared_1.useLogger)();
    const write = async (data, id) => {
        try {
            data = JSON.stringify(data, baileys_2.BufferJSON.replacer);
            id = fixId(id);
            await model.upsert({
                select: { pkId: true },
                create: { data, id, sessionId },
                update: { data },
                where: { sessionId_id: { id, sessionId } },
            });
        }
        catch (e) {
            logger.error(e, 'An error occured during session write');
        }
    };
    const read = async (id) => {
        try {
            const { data } = await model.findUniqueOrThrow({
                select: { data: true },
                where: { sessionId_id: { id: fixId(id), sessionId } },
            });
            return JSON.parse(data, baileys_2.BufferJSON.reviver);
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
                logger.info({ id }, 'Trying to read non existent session data');
            }
            else {
                logger.error(e, 'An error occured during session read');
            }
            return null;
        }
    };
    const del = async (id) => {
        try {
            await model.delete({
                select: { pkId: true },
                where: { sessionId_id: { id: fixId(id), sessionId } },
            });
        }
        catch (e) {
            logger.error(e, 'An error occured during session delete');
        }
    };
    const creds = (await read('creds')) || (0, baileys_2.initAuthCreds)();
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await read(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = baileys_1.proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const sId = `${category}-${id}`;
                            tasks.push(value ? write(value, sId) : del(sId));
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: () => write(creds, 'creds'),
    };
}
exports.useSession = useSession;
