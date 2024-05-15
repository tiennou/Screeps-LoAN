import winston from "winston"
import 'winston-daily-rotate-file'
import cron from "node-cron"
import Docker from "dockerode"

import express from "express"
const app = express()

const lastErrorTimestamp = 0;

const docker = new Docker();
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.DailyRotateFile({
            filename: `logs/application-%DATE%.log`,
            auditFile: `logs/audit.json`,
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        })
    ],
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
    }));
}

async function executeCommand(container, cmd) {
    const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
    });
    const stream = await exec.start({});
    const finish = new Promise((resolve) => {
        // stream.on("end", resolve)
        // workaround
        const timer = setInterval(async () => {
            const r = await exec.inspect();
            if (!r.Running) {
                clearInterval(timer);
                stream.destroy();
                resolve();
            }
        }, 1e3);
    });
    docker.modem.demuxStream(stream, process.stdout, process.stderr);
    await finish
}

async function update() {
    logger.info("Started update")

    const containerName = 'screepsloan_loan_1'

    const container = docker.getContainer(containerName);
    const commands = [
        ['/bin/sh', '-c', 'flask --app screeps_loan/screeps_loan.py import-users'],
        ['/bin/sh', '-c', 'flask --app screeps_loan/screeps_loan.py import-rankings'],
        ['/bin/sh', '-c', 'flask --app screeps_loan/screeps_loan.py import-user-rankings'],
    ]
    for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        try {
            const startTime = Date.now();
            logger.info(`Starting ${command}`)
            await executeCommand(container, command)

            const endTime = Date.now();
            const timeTakenMilliseconds = endTime - startTime;
            const timeTakenSeconds = Math.round(timeTakenMilliseconds / 1000);
            const timeTakenMinutes = Math.round(timeTakenSeconds / 60);

            logger.info(`Took ${timeTakenSeconds} seconds (${timeTakenMinutes} minutes)`);
        } catch (e) {
            logger.error(`Command: ${command}`)
            logger.error(e)

            lastErrorTimestamp = Date.now();
        }
    }

    logger.info("Finished update")
}

cron.schedule('0 */6 * * *', () => {
    update();
});

async function init() {
    console.log("Starting update...")
    await update();
    console.log("Finished first test")
}
init();

app.get('/', function (req, res) {
    const timeNow = Date.now();
    const timeSinceLastError = timeNow - lastErrorTimestamp;

    const timeSinceLastErrorInSeconds = Math.round(timeSinceLastError / 1000);
    const timeSinceLastErrorInMinutes = Math.round(timeSinceLastErrorInSeconds / 60);
    const timeSinceLastErrorInHours = Math.round(timeSinceLastErrorInMinutes / 60);
    const timeSinceLastErrorInDays = Math.round(timeSinceLastErrorInHours / 24);
    if (timeSinceLastErrorInDays < 1) {
        res.sendStatus(200).send("No errors in the last 24 hours");
    } else {
        res.sendStatus(500).send(`Last error was ${timeSinceLastErrorInDays} days ago`);
    }
})

app.listen(3000)