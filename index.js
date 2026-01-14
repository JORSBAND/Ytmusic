const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const cron = require('node-cron');
const axios = require('axios');
const path = require('path');

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN; 

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

const app = express();
const bot = new TelegramBot(TOKEN, { polling: true });

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Веб-сервер
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Команда /start
bot.on('message', (msg) => {
    if (msg.text === '/start') {
        bot.sendMessage(msg.chat.id, "Привіт! 👋\nЦе менеджер сімейної підписки YouTube.\n\nНатисни кнопку нижче, щоб відкрити додаток.", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🎵 Відкрити Family Music", web_app: { url: process.env.APP_URL } }]
                ]
            }
        });
    }
});

// Нагадування (Оновлене під нову структуру)
cron.schedule('0 10 * * *', async () => {
    console.log('⏰ Перевірка нагадувань...');
    const today = new Date();
    const day = today.getDate();

    if (day === 9 || day === 10) {
        try {
            const snapshot = await db.collection('family_members').get();
            snapshot.forEach(doc => {
                const user = doc.data();
                // Тепер user.uid або doc.id - це і є Telegram ID
                const chatId = user.telegramId || doc.id; 

                if (chatId && user.balance < 30) {
                    let message = "";
                    if (day === 9) message = `⚠️ <b>Нагадування!</b>\nЗавтра оплата.\nБаланс: <b>${user.balance}₴</b>.`;
                    else if (day === 10) message = `🚨 <b>СЬОГОДНІ ОПЛАТА!</b>\nБаланс: <b>${user.balance}₴</b>.`;
                    
                    bot.sendMessage(chatId, message, { parse_mode: 'HTML' }).catch(e => console.log('Error sending:', e.message));
                }
            });
        } catch (error) { console.error(error); }
    }
}, { timezone: "Europe/Kiev" });

// Auto-Ping
setInterval(() => {
    if (process.env.APP_URL) axios.get(process.env.APP_URL).catch(() => {});
}, 10 * 60 * 1000);

app.listen(PORT, () => console.log(`Server started on ${PORT}`));
