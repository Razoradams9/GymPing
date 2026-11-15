const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let currentQR = null;
let isReady = false;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', async (qr) => {
  try {
    currentQR = await qrcode.toDataURL(qr);
    isReady = false;
    console.log('QR code generated. Open the Settings page to scan it.');
  } catch (err) {
    console.error('Failed to generate QR code:', err);
  }
});

client.on('ready', () => {
  isReady = true;
  currentQR = null;
  console.log('WhatsApp client is ready.');
});

client.on('disconnected', (reason) => {
  isReady = false;
  console.log('WhatsApp client disconnected:', reason);
});

function getQR() {
  return currentQR;
}

function getStatus() {
  return { connected: isReady, qr: currentQR };
}

async function sendMessage(phone, message) {
  const chatId = `${phone.replace(/[^0-9]/g, '')}@c.us`;
  await client.sendMessage(chatId, message);
  return true;
}

client.initialize();

module.exports = { client, getQR, getStatus, sendMessage };
