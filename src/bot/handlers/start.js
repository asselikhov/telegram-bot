const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { showObjectSelection } = require('../actions/objects'); // Импортируем функцию выбора объектов
const { ADMIN_ID } = require('../../config/config');

module.exports = (bot) => {
    bot.start(async (ctx) => {
        const userId = ctx.from.id.toString();
        const chatType = ctx.chat.type;

        if (chatType !== 'private') {
            return ctx.reply('Команда /start доступна только в личных сообщениях с ботом.');
        }

        const users = await loadUsers();

        if (!users[userId]) {
            // Новый пользователь: инициализируем данные и начинаем с выбора объектов
            users[userId] = {
                fullName: '',
                position: '',
                organization: '',
                selectedObjects: [],
                status: 'В работе',
                isApproved: false,
                nextReportId: 1,
                reports: {}
            };
            await saveUser(userId, users[userId]);
            ctx.state.userStates[userId] = {
                step: 'selectObjects',
                selectedObjects: [],
                report: {},
                messageIds: []
            };
            await showObjectSelection(ctx, userId, []); // Начинаем с выбора объектов
        } else if (!users[userId].isApproved) {
            await ctx.reply('Ваша заявка на рассмотрении.');
        } else {
            await require('./menu').showMainMenu(ctx); // Для подтвержденных пользователей
        }
    });
};