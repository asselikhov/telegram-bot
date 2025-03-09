console.log('Скрипт запущен');

const { Telegraf, Markup } = require('telegraf');
const schedule = require('node-schedule');
const { google } = require('googleapis');

// Вывод версии Telegraf для отладки
console.log('Telegraf version:', require('telegraf').version);

// Настройка Google Drive API
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE');
const ADMIN_ID = process.env.ADMIN_ID || 'YOUR_ADMIN_ID_HERE';
const GENERAL_GROUP_CHAT_ID = '-1002266023014';

// Объекты и их транслитерация
const OBJECTS = ['Кольцевой МНПП', 'Ярославль-Москва', 'Ярославль-Кириши 1'];
const OBJECTS_TRANSLIT = {
  'Кольцевой МНПП': 'Kolcevoy_MNPP',
  'Ярославль-Москва': 'Yaroslavl_Moskva',
  'Ярославль-Кириши 1': 'Yaroslavl_Kirishi1',
};
const OBJECTS_TRANSLIT_REVERSE = Object.fromEntries(
    Object.entries(OBJECTS_TRANSLIT).map(([k, v]) => [v, k])
);

// Хранилище пользователей
let users = {};

// Загрузка пользователей из Google Drive при старте
async function loadUsers() {
  try {
    const response = await drive.files.get({
      fileId: '1XUiCno-FuhDHLNrgVMgvXSOPstbsuosB',
      alt: 'media',
    }, { responseType: 'stream' });
    let data = '';
    response.data.on('data', chunk => (data += chunk));
    await new Promise(resolve => response.data.on('end', resolve));
    users = data ? JSON.parse(data) : {};
    console.log('Пользователи загружены из Google Drive');
  } catch (err) {
    console.error('Ошибка загрузки users из Google Drive:', err.response?.data || err.message);
    users = {};
  }
}

// Сохранение пользователей в Google Drive
async function saveUsers() {
  try {
    const fileContent = JSON.stringify(users, null, 2);
    await drive.files.update({
      fileId: '1XUiCno-FuhDHLNrgVMgvXSOPstbsuosB',
      media: {
        mimeType: 'application/json',
        body: fileContent,
      },
    });
    console.log('Данные сохранены в Google Drive (users.json)');
  } catch (err) {
    console.error('Ошибка сохранения users в Google Drive:', err.response?.data || err.message);
  }
}

// Сохранение отчета в Google Drive
async function saveReportToFile(report, userId) {
  const objectName = report.objectName;
  const fileIds = {
    'Kolcevoy_MNPP.txt': '1MENymvBHx17H62uKZ75s50XtZGWOyXqG',
    'Yaroslavl_Moskva.txt': '1Ug7PkIYYp-zgJMYzIiy5cUQyE06ALbYx',
    'Yaroslavl_Kirishi1.txt': '1AsC8LTj-_9lVDXHdWE0YkkxE6Jr1EU9x',
  };
  const fileId = fileIds[objectName];
  const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const reportText =
      `Дата: ${report.date}\n` +
      `Время: ${timestamp}\n` +
      `ИТР: ${users[userId].fullName}\n` +
      `Объект: ${OBJECTS_TRANSLIT_REVERSE[report.objectName]}\n` +
      `Работы: ${report.workDone}\n` +
      `Материалы: ${report.materials}\n` +
      '--------------------------\n';

  try {
    let currentContent = '';
    try {
      const response = await drive.files.get({
        fileId: fileId,
        alt: 'media',
      }, { responseType: 'stream' });
      response.data.on('data', chunk => (currentContent += chunk));
      await new Promise(resolve => response.data.on('end', resolve));
    } catch (err) {
      if (err.response?.status === 404) {
        console.log(`Файл ${objectName}.txt не найден, создаём новый`);
        currentContent = '';
      } else {
        throw err;
      }
    }

    const updatedContent = currentContent + reportText;
    await drive.files.update({
      fileId: fileId,
      media: {
        mimeType: 'text/plain',
        body: updatedContent,
      },
    });
    console.log(`Отчет сохранен в Google Drive: ${objectName}.txt`);
  } catch (err) {
    console.error(`Ошибка сохранения отчета ${objectName} в Google Drive:`, err.response?.data || err.message);
  }
}

// Главное меню
function getMainMenu(userId) {
  const isAdmin = userId === ADMIN_ID;
  const buttons = [['Создать отчет'], ['Выбрать объект', 'Мои объекты'], ['Мои отчеты']];
  if (isAdmin) buttons.push(['Утвердить пользователя']);
  return Markup.keyboard(buttons).resize();
}

// Команда /start
bot.start(async (ctx) => {
  console.log('Команда /start от:', ctx.from.id);
  const userId = ctx.from.id.toString();
  if (!users[userId]) {
    await ctx.reply('Пожалуйста, укажите ваше ФИО:');
    const handler = async (ctx) => {
      if (ctx.from.id.toString() === userId) {
        const fullName = ctx.message.text;
        users[userId] = {
          fullName,
          position: '',
          selectedObjects: [],
          status: 'в работе',
          isApproved: false,
          reports: {},
          nextReportId: 1,
        };
        await saveUsers();
        await ctx.reply('ФИО сохранено. Выберите объект:', Markup.keyboard(OBJECTS).oneTime().resize());
        bot.off('text', handler); // Удаляем обработчик после использования
      }
    };
    bot.on('text', handler);
  } else {
    await ctx.reply('Вы уже зарегистрированы. Выберите действие:', getMainMenu(userId));
  }
});

// Выбор объекта
bot.on('text', async (ctx) => {
  const userId = ctx.from.id.toString();
  const text = ctx.message.text;

  if (!users[userId]) return;

  if (OBJECTS.includes(text) && !users[userId].selectedObjects.includes(OBJECTS_TRANSLIT[text])) {
    users[userId].selectedObjects.push(OBJECTS_TRANSLIT[text]);
    await saveUsers();
    await ctx.reply(`Объект "${text}" добавлен. Выберите действие:`, getMainMenu(userId));
  }
});

// Команда "Создать отчет"
bot.hears('Создать отчет', async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!users[userId]?.isApproved) {
    return ctx.reply('Вы не можете создавать отчеты, пока ваш профиль не утвержден администратором.');
  }
  if (!users[userId].selectedObjects.length) {
    return ctx.reply('Сначала выберите хотя бы один объект.');
  }
  await ctx.reply('Выберите объект для отчета:', Markup.keyboard(users[userId].selectedObjects.map(obj => OBJECTS_TRANSLIT_REVERSE[obj])).oneTime().resize());

  const handler = async (ctx) => {
    const userId = ctx.from.id.toString();
    const objectName = OBJECTS_TRANSLIT[ctx.message.text];
    if (users[userId]?.selectedObjects.includes(objectName)) {
      const report = { objectName };
      await ctx.reply('Укажите дату (например, 2025-03-09):');
      const dateHandler = async (ctx) => {
        if (ctx.from.id.toString() === userId) {
          report.date = ctx.message.text;
          await ctx.reply('Укажите выполненные работы:');
          const workHandler = async (ctx) => {
            if (ctx.from.id.toString() === userId) {
              report.workDone = ctx.message.text;
              await ctx.reply('Укажите использованные материалы:');
              const materialsHandler = async (ctx) => {
                if (ctx.from.id.toString() === userId) {
                  report.materials = ctx.message.text;
                  const reportId = users[userId].nextReportId++;
                  users[userId].reports[reportId] = report;
                  await saveUsers();
                  await saveReportToFile(report, userId);
                  await ctx.reply('Отчет сохранен.', getMainMenu(userId));
                  await bot.telegram.sendMessage(GENERAL_GROUP_CHAT_ID, `Новый отчет от ${users[userId].fullName} по объекту ${ctx.message.text}`);
                  bot.off('text', materialsHandler);
                }
              };
              bot.on('text', materialsHandler);
              bot.off('text', workHandler);
            }
          };
          bot.on('text', workHandler);
          bot.off('text', dateHandler);
        }
      };
      bot.on('text', dateHandler);
      bot.off('text', handler);
    }
  };
  bot.on('text', handler);
});

// Команда "Мои объекты"
bot.hears('Мои объекты', async (ctx) => {
  const userId = ctx.from.id.toString();
  const objects = users[userId].selectedObjects.map(obj => OBJECTS_TRANSLIT_REVERSE[obj]).join('\n');
  await ctx.reply(objects || 'Объекты не выбраны.', getMainMenu(userId));
});

// Команда "Мои отчеты"
bot.hears('Мои отчеты', async (ctx) => {
  const userId = ctx.from.id.toString();
  const reports = Object.entries(users[userId].reports)
      .map(([id, r]) => `Отчет #${id}\nОбъект: ${OBJECTS_TRANSLIT_REVERSE[r.objectName]}\nДата: ${r.date}\nРаботы: ${r.workDone}\nМатериалы: ${r.materials}`)
      .join('\n\n');
  await ctx.reply(reports || 'У вас нет отчетов.', getMainMenu(userId));
});

// Команда "Утвердить пользователя" (для админа)
bot.hears('Утвердить пользователя', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  const unapproved = Object.entries(users).filter(([_, u]) => !u.isApproved);
  if (!unapproved.length) return ctx.reply('Все пользователи утверждены.');
  const buttons = unapproved.map(([id, u]) => [Markup.button.callback(`${u.fullName} (${id})`, `approve_${id}`)]);
  await ctx.reply('Выберите пользователя для утверждения:', Markup.inlineKeyboard(buttons));
});

// Обработка утверждения
bot.action(/approve_(.+)/, async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  const userId = ctx.match[1];
  if (users[userId]) {
    users[userId].isApproved = true;
    await saveUsers();
    await ctx.reply(`Пользователь ${users[userId].fullName} утвержден.`);
    await bot.telegram.sendMessage(userId, 'Ваш профиль утвержден администратором. Теперь вы можете создавать отчеты.');
  }
});

// Напоминание в 19:00 (по московскому времени)
schedule.scheduleJob('0 0 19 * * *', async () => {
  const today = new Date().toISOString().split('T')[0];
  for (const [userId, user] of Object.entries(users)) {
    if (user.isApproved && !Object.values(user.reports).some(r => r.date === today)) {
      await bot.telegram.sendMessage(userId, 'Напоминание: вы не создали отчет за сегодня.');
    }
  }
});

// Запуск бота после загрузки данных
loadUsers()
    .then(() => {
      bot.launch()
          .then(() => console.log('Бот успешно запущен'))
          .catch(err => console.error('Ошибка запуска бота:', err));
    })
    .catch(err => console.error('Ошибка при старте:', err));

// Обработка остановки бота
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));