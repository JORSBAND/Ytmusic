const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const cron = require('node-cron');
const axios = require('axios');
const path = require('path');

// --- НАЛАШТУВАННЯ ---
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN; // Токен від BotFather
// Сервісний акаунт Firebase (потрібен для читання бази ботом)
// На Render це буде змінна середовища FIREBASE_SERVICE_ACCOUNT
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

// Ініціалізація
const app = express();
const bot = new TelegramBot(TOKEN, { polling: true });

// Ініціалізація Firebase Admin (для сервера)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} else {
    console.warn("⚠️ УВАГА: FIREBASE_SERVICE_ACCOUNT не знайдено. Нагадування не працюватимуть, поки ви не додасте ключ в Render.");
}

const db = admin.firestore();

// --- 1. ВЕБ-СЕРВЕР (Для Mini App) ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 2. ЛОГІКА БОТА ---
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    // Відповідаємо тільки на старт, бо основна робота в Mini App
    if (msg.text === '/start') {
        bot.sendMessage(chatId, "Привіт! 👋\nЦе менеджер сімейної підписки YouTube.\n\nНатисни кнопку нижче, щоб відкрити додаток.", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🎵 Відкрити Family Music", web_app: { url: process.env.APP_URL } }]
                ]
            }
        });
    }
});

// --- 3. НАГАДУВАННЯ (CRON) ---
// Запускається щодня о 10:00 ранку
cron.schedule('0 10 * * *', async () => {
    console.log('⏰ Перевірка дати для нагадувань...');
    const today = new Date();
    const day = today.getDate();

    // Нагадування 9-го числа (за день) та 10-го числа (в день оплати)
    if (day === 9 || day === 10) {
        try {
            const snapshot = await db.collection('family_members').get();
            
            snapshot.forEach(doc => {
                const user = doc.data();
                // Надсилаємо, якщо є telegramId і баланс менше 30 грн
                if (user.telegramId && user.balance < 30) {
                    let message = "";
                    if (day === 9) {
                        message = `⚠️ <b>Нагадування!</b>\nЗавтра (10-го числа) оплата YouTube Premium.\nВаш баланс: <b>${user.balance}₴</b>.\nБудь ласка, поповніть рахунок!`;
                    } else if (day === 10) {
                        message = `🚨 <b>СЬОГОДНІ ОПЛАТА!</b>\nYouTube Premium списується сьогодні.\nВаш баланс: <b>${user.balance}₴</b>.\nТерміново поповніть, щоб не підвести сім'ю!`;
                    }

                    bot.sendMessage(user.telegramId, message, { parse_mode: 'HTML' })
                        .catch(e => console.error(`Не вдалося надіслати юзеру ${user.name}:`, e.message));
                }
            });
        } catch (error) {
            console.error('Помилка CRON:', error);
        }
    }
}, {
    timezone: "Europe/Kiev"
});

// --- 4. AUTO-PING (Щоб Render не засинав) ---
const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000; // 10 хвилин

setInterval(() => {
    if (process.env.APP_URL) {
        axios.get(process.env.APP_URL)
            .then(() => console.log('Ping successful 📡'))
            .catch(err => console.error('Ping failed:', err.message));
    }
}, KEEP_ALIVE_INTERVAL);

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
