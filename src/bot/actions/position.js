// src/bot/actions/position.js
const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { BASE_POSITIONS_LIST, ADMIN_ID } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');
const { showObjectSelection } = require('./objects');
const { showProfile } = require('../handlers/menu');

function getPositionsList(userId) {
    const positions = [...BASE_POSITIONS_LIST];
    if (userId === ADMIN_ID) positions.push('Админ');
    return positions;
}

async function showPositionSelection(ctx, userId) {
    await clearPreviousMessages(ctx, userId);

    const positions = getPositionsList(userId);
    const buttons = positions.map((pos, index) => [Markup.button.callback(pos, `select_initial_position_${index}_${userId}`)]);
    buttons.push([Markup.button.callback('Ввести свою должность', `custom_position_${userId}`)]);
    const message = await ctx.reply('Выберите вашу должность:', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

module.exports = (bot) => {
    bot.action(/select_initial_position_(\d+)_(\d+)/, async (ctx) => {
        const positionIndex = parseInt(ctx.match[1], 10);
        const userId = ctx.match[2];
        const selectedPosition = getPositionsList(userId)[positionIndex];
        if (!selectedPosition) return;

        await clearPreviousMessages(ctx, userId);

        const users = await loadUsers();
        users[userId].position = selectedPosition;
        await saveUser(userId, users[userId]);
        console.log(`Сохранена должность для userId ${userId}: ${selectedPosition}`);

        ctx.state.userStates[userId].step = 'enterFullName';
        const message = await ctx.reply('Введите ваше ФИО:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        console.log(`Переход к вводу ФИО для userId ${userId} после выбора должности`);
    });

    bot.action(/custom_position_(\d+)/, async (ctx) => {
        const userId = ctx.match[1];
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'customPositionInput';
        const message = await ctx.reply('Введите название вашей должности:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.action('edit_position', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        const positions = getPositionsList(userId);
        const buttons = positions.map((pos, index) => [Markup.button.callback(pos, `select_position_${index}`)]);
        buttons.push([Markup.button.callback('Ввести свою должность', 'custom_position_edit')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);
        const message = await ctx.reply('Выберите новую должность:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.action(/select_position_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const positionIndex = parseInt(ctx.match[1], 10);
        const selectedPosition = getPositionsList(userId)[positionIndex];
        if (!selectedPosition) return;

        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();
        users[userId].position = selectedPosition;
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId].step = null;
        await ctx.reply(`Ваша должность изменена на "${selectedPosition}"`);
        await showProfile(ctx);
    });

    bot.action('custom_position_edit', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'customPositionEditInput';
        const message = await ctx.reply('Введите новое название должности:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        console.log(`Получен текст от userId ${userId}: "${ctx.message.text}". Контекст: chatId=${ctx.chat?.id}, from=${JSON.stringify(ctx.from)}`);

        if (!ctx.state || !ctx.state.userStates) {
            console.error(`Ошибка: ctx.state.userStates отсутствует для userId ${userId}`);
            await ctx.reply('Произошла ошибка состояния бота. Попробуйте снова или обратитесь к администратору.');
            return;
        }

        const state = ctx.state.userStates[userId];
        if (!state) {
            console.log(`Нет состояния для userId ${userId}`);
            return;
        }

        console.log(`Перед очисткой предыдущих сообщений для userId ${userId}. State: ${JSON.stringify(state)}`);
        if (!ctx.chat || !ctx.chat.id) {
            console.error(`Ошибка: ctx.chat.id отсутствует для userId ${userId}`);
            await ctx.reply('Произошла ошибка доступа к чату. Попробуйте снова или обратитесь к администратору.');
            return;
        }

        try {
            await clearPreviousMessages(ctx, userId);
            console.log(`Очистка предыдущих сообщений завершена для userId ${userId}`);
        } catch (error) {
            console.error(`Ошибка в clearPreviousMessages для userId ${userId}: ${error.message}`);
            console.error(error.stack);
            await ctx.reply('Произошла ошибка при очистке сообщений. Попробуйте снова или обратитесь к администратору.');
            return;
        }

        console.log(`Перед загрузкой пользователей для userId ${userId}`);
        let users;
        try {
            users = await loadUsers();
            console.log(`Пользователи загружены для userId ${userId}`);
        } catch (error) {
            console.error(`Ошибка в loadUsers для userId ${userId}: ${error.message}`);
            console.error(error.stack);
            await ctx.reply('Произошла ошибка при загрузке данных. Попробуйте снова или обратитесь к администратору.');
            return;
        }

        try {
            if (state.step === 'customPositionInput') {
                const position = ctx.message.text.trim();
                users[userId].position = position;
                await saveUser(userId, users[userId]);
                console.log(`Сохранена пользовательская должность для userId ${userId}: ${position}`);

                state.step = 'enterFullName';
                const message = await ctx.reply('Введите ваше ФИО:');
                ctx.state.userStates[userId].messageIds.push(message.message_id);
                console.log(`Переход к вводу ФИО для userId ${userId} после ввода своей должности`);
            } else if (state.step === 'enterFullName') {
                const fullName = ctx.message.text.trim();
                console.log(`Попытка сохранить ФИО для userId ${userId}: ${fullName}`);
                users[userId].fullName = fullName;
                await saveUser(userId, users[userId]);
                console.log(`Сохранено ФИО для userId ${userId}: ${fullName}`);
                const updatedUsers = await loadUsers();
                console.log(`Проверка после сохранения: ФИО в базе для userId ${userId}: ${updatedUsers[userId].fullName}`);

                const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
                state.messageIds.push(message.message_id);
                console.log(`Сообщение отправлено пользователю userId ${userId}`);

                const adminText = `\n${users[userId].fullName || 'Не указано'} - ${users[userId].position || 'Не указано'} (${users[userId].organization || 'Не указано'})\n\n${users[userId].selectedObjects.join(', ') || 'Не выбраны'}`;
                console.log(`Отправка заявки для userId ${userId}: ${adminText}`);

                await ctx.telegram.sendMessage(ADMIN_ID, `📝 НОВАЯ ЗАЯВКА${adminText}`, Markup.inlineKeyboard([
                    [Markup.button.callback(`✅ Одобрить (${users[userId].fullName || 'Не указано'})`, `approve_${userId}`)],
                    [Markup.button.callback(`❌ Отклонить (${users[userId].fullName || 'Не указано'})`, `reject_${userId}`)]
                ]));
                console.log(`Заявка от userId ${userId} отправлена администратору`);

                ctx.state.userStates[userId] = { step: null, messageIds: [] };
            } else if (state.step === 'customPositionEditInput') {
                users[userId].position = ctx.message.text.trim();
                await saveUser(userId, users[userId]);
                state.step = null;
                await ctx.reply(`Должность обновлена на "${users[userId].position}".`);
                await showProfile(ctx);
            } else if (state.step === 'customOrganizationInput') {
                users[userId].organization = ctx.message.text.trim();
                users[userId].selectedObjects = [];
                await saveUser(userId, users[userId]);
                state.step = 'selectObjects';
                await showObjectSelection(ctx, userId, []);
                console.log(`Переход к выбору объектов для userId ${userId} после ввода своей организации`);
            } else if (state.step === 'customOrgEditInput') {
                users[userId].organization = ctx.message.text.trim();
                users[userId].selectedObjects = [];
                await saveUser(userId, users[userId]);
                state.step = null;
                await ctx.reply(`Организация обновлена на "${users[userId].organization}".`);
                await showProfile(ctx);
            } else {
                console.log(`Неизвестный шаг для userId ${userId}: ${state.step}`);
            }
        } catch (error) {
            console.error(`Ошибка при обработке текста для userId ${userId}: ${error.message}`);
            console.error(error.stack);
            await ctx.reply('Произошла ошибка при обработке вашего ввода. Попробуйте снова или обратитесь к администратору.');
        }
    });
};

module.exports.showPositionSelection = showPositionSelection;