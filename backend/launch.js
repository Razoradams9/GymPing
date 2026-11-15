// Starts GymPing in the background (no terminal window to keep open) and opens
// it in the browser. Used by the "Start GymPing" / "Stop GymPing" launchers.
//
//   node launch.js               start if needed, then open the browser
//   node launch.js --background  start if needed, don't open the browser
//   node launch.js --stop        turn GymPing off
//   node launch.js --install     (Windows) add a Desktop icon and start with Windows
//   node launch.js --uninstall   (Windows) remove those again

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3001;
const url = `http://localhost:${PORT}`;
const headers = { 'x-gymping-password': process.env.GYMPING_PASSWORD || '' };
const arg = process.argv[2] || '';

async function isRunning() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/api/status`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

function openBrowser() {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

async function start() {
  if (!fs.existsSync(path.join(root, 'frontend', 'dist', 'index.html'))) {
    console.error('GymPing is not set up yet. Run "Setup GymPing" (or `npm run setup`) first.');
    process.exit(1);
  }
  if (!(await isRunning())) {
    const log = fs.openSync(path.join(__dirname, 'gymping.log'), 'a');
    spawn(process.execPath, ['index.js'], {
      cwd: __dirname,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', log, log]
    }).unref();
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      up = await isRunning();
    }
    if (!up) {
      console.error(`GymPing did not start. See ${path.join(__dirname, 'gymping.log')} for the reason.`);
      process.exit(1);
    }
  }
  console.log(`GymPing is running at ${url}`);
  if (arg !== '--background') openBrowser();
}

async function stop() {
  if (!(await isRunning())) return console.log('GymPing is not running.');
  await fetch(`http://127.0.0.1:${PORT}/api/shutdown`, { method: 'POST', headers }).catch(() => {});
  console.log('GymPing is turned off.');
}

// ---- Windows: Desktop icon + start with Windows ----

function windowsPaths() {
  const oneDriveDesktop = process.env.OneDrive && path.join(process.env.OneDrive, 'Desktop');
  const desktop =
    oneDriveDesktop && fs.existsSync(oneDriveDesktop) ? oneDriveDesktop : path.join(os.homedir(), 'Desktop');
  const startup = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  return {
    desktopIcon: path.join(desktop, 'GymPing.bat'),
    startupEntry: path.join(startup, 'GymPing.bat')
  };
}

function install() {
  if (process.platform !== 'win32') return console.log('--install is for Windows only.');
  const { desktopIcon, startupEntry } = windowsPaths();
  const script = (extra) =>
    `@echo off\r\ncd /d "${root}"\r\nnode backend\\launch.js ${extra}\r\nif errorlevel 1 pause\r\n`;
  fs.writeFileSync(desktopIcon, script(''));
  fs.writeFileSync(startupEntry, script('--background'));
  console.log(`Added a GymPing icon to your Desktop: ${desktopIcon}`);
  console.log('GymPing will now start by itself whenever this computer is turned on.');
}

function uninstall() {
  if (process.platform !== 'win32') return console.log('--uninstall is for Windows only.');
  for (const file of Object.values(windowsPaths())) fs.rmSync(file, { force: true });
  console.log('Removed the Desktop icon and the start-with-Windows entry.');
}

const commands = { '--stop': stop, '--install': install, '--uninstall': uninstall };
Promise.resolve((commands[arg] || start)()).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
