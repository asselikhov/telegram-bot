const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { showMainMenu } = require('./menu');
const { ADMIN_ID } = require('../../config/config');

module.exports = (bot) => {
    bot.start(async (ctx) => {
        const telegramId = ctx.from.id?.toString();
        const chatType = ctx.chat.type;

        if (!telegramId) {
            console.error('No telegramId provided in ctx.from');
            return ctx.reply('Ошибка: не удалось определить ваш ID. Попробуйте снова.');
        }

        if (chatType !== 'private') {
            return ctx.reply('Команда /start доступна только в личных сообщениях с ботом.');
        }

        try {
            const users = await loadUsers();

            // Проверка на администратора
            if (telegramId === ADMIN_ID.toString()) {
                if (!users[telegramId]) {
                    users[telegramId] = {
                        fullName: 'Администратор',
                        position: 'Администратор',
                        organization: 'Администрация',
                        selectedObjects: [],
                        status: 'Одобрено',
                        isApproved: 1,
                        nextReportId: 1,
                        reports: {}
                    };
                    await saveUser(telegramId, users[telegramId]);
                } else if (!users[telegramId].isApproved) {
                    users[telegramId].isApproved = 1;
                    users[telegramId].status = 'Одобрено';
                    await saveUser(telegramId, users[telegramId]);
                }
                ctx.state.userStates = ctx.state.userStates || {};
                ctx.state.userStates[telegramId] = { step: null, messageIds: [] };
                await clearPreviousMessages(ctx, telegramId);
                return await showMainMenu(ctx);
            }

            // Логика для обычных пользователей
            if (!users[telegramId]) {
                users[telegramId] = {
                    fullName: '',
                    position: '',
                    organization: '',
                    selectedObjects: [],
                    status: 'В работе',
                    isApproved: 0,
                    nextReportId: 1,
                    reports: {}
                };
                await saveUser(telegramId, users[telegramId]);

                ctx.state.userStates = ctx.state.userStates || {};
                ctx.state.userStates[telegramId] = {
                    step: 'enterInviteCode',
                    messageIds: []
                };
                await clearPreviousMessages(ctx, telegramId);

                const message = await ctx.reply('Введите пригласительный код для регистрации:');
                ctx.state.userStates[telegramId].messageIds.push(message.message_id);
            } else if (users[telegramId].isApproved) {
                await showMainMenu(ctx);
            } else {
                const user = users[telegramId];
                await clearPreviousMessages(ctx, telegramId);

                if (!user.organization) {
                    ctx.state.userStates[telegramId] = { step: 'enterInviteCode', messageIds: [] };
                    const message = await ctx.reply('Введите пригласительный код для регистрации:');
                    ctx.state.userStates[telegramId].messageIds.push(message.message_id);
                } else if (!user.selectedObjects.length) {
                    ctx.state.userStates[telegramId] = { step: 'selectObjects', messageIds: [] };
                    const { showObjectSelection } = require('../actions/objects');
                    await showObjectSelection(ctx, telegramId, []);
                } else if (!user.position) {
                    ctx.state.userStates[telegramId] = { step: 'selectPosition', messageIds: [] };
                    const { showPositionSelection } = require('../actions/position');
                    await showPositionSelection(ctx, telegramId);
                } else if (!user.fullName) {
                    ctx.state.userStates[telegramId] = { step: 'enterFullName', messageIds: [] };
                    const message = await ctx.reply('Введите ваше ФИО:');
                    ctx.state.userStates[telegramId].messageIds.push(message.message_id);
                } else if (!user.phone) {
                    ctx.state.userStates[telegramId] = { step: 'enterPhone', messageIds: [] };
                    const message = await ctx.reply('Введите ваш контактный телефон:');
                    ctx.state.userStates[telegramId].messageIds.push(message.message_id);
                } else {
                    const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
                    ctx.state.userStates[telegramId] = { step: null, messageIds: [message.message_id] };
                }
            }
        } catch (error) {
            console.error(`Error processing /start for user ${telegramId}:`, error);
            await ctx.reply('Произошла ошибка. Попробуйте снова позже.');
        }
    });
};