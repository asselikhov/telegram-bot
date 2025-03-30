// src/bot/actions/application.js
const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { ORGANIZATIONS_LIST, ORGANIZATION_OBJECTS, BASE_POSITIONS_LIST, ADMIN_ID } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');

async function startApplication(ctx, userId) {
    const applicationData = {
        organization: '',
        selectedObjects: [],
        position: '',
        fullName: ''
    };

    // Шаг 1: Выбор организации
    await selectOrganization(ctx, userId, applicationData);
}

async function selectOrganization(ctx, userId, applicationData) {
    await clearPreviousMessages(ctx, userId);
    const buttons = ORGANIZATIONS_LIST.map((org, index) => [Markup.button.callback(org, `app_org_${index}_${userId}`)]);
    buttons.push([Markup.button.callback('Ввести свою организацию', `app_custom_org_${userId}`)]);
    const message = await ctx.reply('Выберите вашу организацию:', Markup.inlineKeyboard(buttons));
    // Сохраняем ID сообщения для последующей очистки
    applicationData.messageId = message.message_id;
}

async function selectObjects(ctx, userId, applicationData) {
    const availableObjects = ORGANIZATION_OBJECTS[applicationData.organization] || [];
    if (!availableObjects.length) {
        await clearPreviousMessages(ctx, userId);
        await ctx.reply('Для вашей организации нет доступных объектов. Обратитесь к администратору.');
        return;
    }

    const buttons = availableObjects.map((obj, index) => {
        const isSelected = applicationData.selectedObjects.includes(obj);
        return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `app_obj_${index}_${userId}`)];
    });
    buttons.push([Markup.button.callback('Готово', `app_confirm_objs_${userId}`)]);
    const message = await ctx.reply('Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
    applicationData.messageId = message.message_id;
}

async function selectPosition(ctx, userId, applicationData) {
    const positions = [...BASE_POSITIONS_LIST];
    if (userId === ADMIN_ID) positions.push('Админ');

    const buttons = positions.map((pos, index) => [Markup.button.callback(pos, `app_pos_${index}_${userId}`)]);
    buttons.push([Markup.button.callback('Ввести свою должность', `app_custom_pos_${userId}`)]);
    const message = await ctx.reply('Выберите вашу должность:', Markup.inlineKeyboard(buttons));
    applicationData.messageId = message.message_id;
}

async function requestFullName(ctx, userId, applicationData) {
    await clearPreviousMessages(ctx, userId);
    const message = await ctx.reply('Введите ваше ФИО:');
    applicationData.messageId = message.message_id;
}

async function submitApplication(ctx, userId, applicationData) {
    await clearPreviousMessages(ctx, userId);

    const users = await loadUsers();
    users[userId].organization = applicationData.organization;
    users[userId].selectedObjects = applicationData.selectedObjects;
    users[userId].position = applicationData.position;
    users[userId].fullName = applicationData.fullName;
    await saveUser(userId, users[userId]);

    const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
    console.log(`Заявка сохранена для userId ${userId}: ${JSON.stringify(users[userId])}`);

    const adminText = `\n${applicationData.fullName} - ${applicationData.position} (${applicationData.organization})\n\n${applicationData.selectedObjects.join(', ') || 'Не выбраны'}`;
    await ctx.telegram.sendMessage(ADMIN_ID, `📝 НОВАЯ ЗАЯВКА${adminText}`, Markup.inlineKeyboard([
        [Markup.button.callback(`✅ Одобрить (${applicationData.fullName})`, `approve_${userId}`)],
        [Markup.button.callback(`❌ Отклонить (${applicationData.fullName})`, `reject_${userId}`)]
    ]));

    console.log(`Заявка от userId ${userId} отправлена администратору`);
}

module.exports = (bot) => {
    // Выбор организации
    bot.action(/app_org_(\d+)_(\d+)/, async (ctx) => {
        const orgIndex = parseInt(ctx.match[1], 10);
        const userId = ctx.match[2];
        const applicationData = { organization: ORGANIZATIONS_LIST[orgIndex], selectedObjects: [] };
        await clearPreviousMessages(ctx, userId);
        await selectObjects(ctx, userId, applicationData);
    });

    bot.action(/app_custom_org_(\d+)/, async (ctx) => {
        const userId = ctx.match[1];
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Введите название вашей организации:');
        bot.once('text', async (ctx) => {
            const applicationData = { organization: ctx.message.text.trim(), selectedObjects: [] };
            await clearPreviousMessages(ctx, userId);
            await selectObjects(ctx, userId, applicationData);
        });
    });

    // Выбор объектов
    bot.action(/app_obj_(\d+)_(\d+)/, async (ctx) => {
        const objIndex = parseInt(ctx.match[1], 10);
        const userId = ctx.match[2];
        const users = await loadUsers();
        const availableObjects = ORGANIZATION_OBJECTS[users[userId].organization] || [];
        const objectName = availableObjects[objIndex];
        const applicationData = {
            organization: users[userId].organization,
            selectedObjects: users[userId].selectedObjects || []
        };

        const index = applicationData.selectedObjects.indexOf(objectName);
        if (index === -1) applicationData.selectedObjects.push(objectName);
        else applicationData.selectedObjects.splice(index, 1);

        await ctx.telegram.editMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, null,
            'Выберите объекты (можно выбрать несколько):',
            Markup.inlineKeyboard(availableObjects.map((obj, i) => {
                const isSelected = applicationData.selectedObjects.includes(obj);
                return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `app_obj_${i}_${userId}`)];
            }).concat([[Markup.button.callback('Готово', `app_confirm_objs_${userId}`)]]))
        );
    });

    bot.action(/app_confirm_objs_(\d+)/, async (ctx) => {
        const userId = ctx.match[1];
        const users = await loadUsers();
        const applicationData = {
            organization: users[userId].organization,
            selectedObjects: users[userId].selectedObjects
        };

        if (!applicationData.selectedObjects.length) {
            await clearPreviousMessages(ctx, userId);
            await ctx.reply('Выберите хотя бы один объект.');
            await selectObjects(ctx, userId, applicationData);
            return;
        }

        await clearPreviousMessages(ctx, userId);
        await selectPosition(ctx, userId, applicationData);
    });

    // Выбор должности
    bot.action(/app_pos_(\d+)_(\d+)/, async (ctx) => {
        const posIndex = parseInt(ctx.match[1], 10);
        const userId = ctx.match[2];
        const users = await loadUsers();
        const positions = [...BASE_POSITIONS_LIST];
        if (userId === ADMIN_ID) positions.push('Админ');
        const applicationData = {
            organization: users[userId].organization,
            selectedObjects: users[userId].selectedObjects,
            position: positions[posIndex]
        };

        await clearPreviousMessages(ctx, userId);
        await requestFullName(ctx, userId, applicationData);
    });

    bot.action(/app_custom_pos_(\d+)/, async (ctx) => {
        const userId = ctx.match[1];
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Введите название вашей должности:');
        bot.once('text', async (ctx) => {
            const users = await loadUsers();
            const applicationData = {
                organization: users[userId].organization,
                selectedObjects: users[userId].selectedObjects,
                position: ctx.message.text.trim()
            };
            await clearPreviousMessages(ctx, userId);
            await requestFullName(ctx, userId, applicationData);
        });
    });

    // Ввод ФИО и отправка
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        if (users[userId] && !users[userId].isApproved && users[userId].position && !users[userId].fullName) {
            const applicationData = {
                organization: users[userId].organization,
                selectedObjects: users[userId].selectedObjects,
                position: users[userId].position,
                fullName: ctx.message.text.trim()
            };
            await submitApplication(ctx, userId, applicationData);
        }
    });
};

module.exports.startApplication = startApplication;