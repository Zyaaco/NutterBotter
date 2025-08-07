const chokidar = require('chokidar');
const { spawn } = require('cross-spawn');

let botProcess = null;

function startBot() {
    if (botProcess) botProcess.kill();
    botProcess = spawn('node', ['index.js'], { stdio: 'inherit' });
}

startBot();

chokidar.watch(['./index.js', './commands', './calendar.js'], {
    ignored: /node_modules/,
    ignoreInitial: true
}).on('all', (event, path) => {
    console.log(`[chokidar] ${event} detected in ${path}. Restarting bot...`);
    startBot();
});

process.on('SIGINT', () => {
    if (botProcess) botProcess.kill();
    process.exit();
});
