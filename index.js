const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const cron = require('node-cron');
const axios = require('axios');
const path = require('path');

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN; 
const APP_URL = process.env.APP_URL || 'https://google.com'; 

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

const app = express();
app.use(express.json());

const bot = new TelegramBot(TOKEN, { polling: true });

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- 1. НАГАДУВАННЯ ПРО БОРГ ---
app.post('/api/notify', async (req, res) => {
    const { telegramId, name, balance } = req.body;
    if (!telegramId) return res.status(400).json({ error: 'No ID' });

    const message = `👋 <b>Привіт, ${name}!</b>\n\nНагадуємо про заборгованість.\nБаланс: <b>${balance} грн</b>.\n\nБудь ласка, поповни рахунок! 👇`;
    try {
        await bot.sendMessage(telegramId, message, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "💸 Поповнити", web_app: { url: APP_URL } }]] } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 2. ПІДТВЕРДЖЕННЯ ОПЛАТИ ---
app.post('/api/confirm-payment', async (req, res) => {
    const { telegramId, name } = req.body;
    if (!telegramId) return res.status(400).json({ error: 'No ID' });

    // Універсальне повідомлення
    const message = `✅ <b>Оплату зараховано, ${name}!</b>\n\nДякуємо за оперативність! 🤝\nТвоє ім'я додано до списку учасників розіграшу знижки в "Колесі Фортуни".\n\nУспіхів! 🍀`;
    try {
        await bot.sendMessage(telegramId, message, { parse_mode: 'HTML' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 3. ПОВІДОМЛЕННЯ ПЕРЕМОЖЦЮ (НОВЕ) ---
app.post('/api/notify-winner', async (req, res) => {
    const { telegramId, name, prize } = req.body;
    if (!telegramId) return res.status(400).json({ error: 'No ID' });

    const message = `🎉 <b>ВІТАЄМО, ${name.toUpperCase()}!</b> 🎉\n\nТи перемагаєш у цьому місяці!\n\n🎁 <b>Твій виграш:</b> ${prize}\n\nДякуємо, що платиш вчасно! Знижка буде врахована адміном.`;
    try {
        await bot.sendMessage(telegramId, message, { parse_mode: 'HTML' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Команда /start
bot.on('message', (msg) => {
    if (msg.text === '/start') {
        bot.sendMessage(msg.chat.id, "Привіт! 👋\nНатисни кнопку, щоб відкрити Family Music.", {
            reply_markup: { inline_keyboard: [[{ text: "🎵 Відкрити", web_app: { url: APP_URL } }]] }
        });
    }
});

// Cron (Нагадування)
cron.schedule('0 10 * * *', async () => {
    const today = new Date();
    const day = today.getDate();
    if (day === 9 || day === 10) {
        const snapshot = await db.collection('family_members').get();
        snapshot.forEach(doc => {
            const u = doc.data();
            if (u.telegramId && u.balance < 30) {
                const txt = day === 9 ? `⚠️ Завтра оплата!` : `🚨 СЬОГОДНІ ОПЛАТА!`;
                bot.sendMessage(u.telegramId, txt).catch(e => console.log(e));
            }
        });
    }
}, { timezone: "Europe/Kiev" });

// Ping
setInterval(() => { if(APP_URL.startsWith('http')) axios.get(APP_URL).catch(()=>{}); }, 600000);

app.listen(PORT, () => console.log(`Running on ${PORT}`));
