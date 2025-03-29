const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { showPositionSelection } = require('../actions/position');
const { showMainMenu } = require('./menu'); // Импорт showMainMenu

module.exports = (bot) => {
    bot.start(async (ctx) => {
        const userId = ctx.from.id.toString();
        const chatType = ctx.chat.type;

        if (chatType !== 'private') {
            return ctx.reply('Команда /start доступна только в личных сообщениях с ботом.');
        }

        const users = await loadUsers();

        if (!users[userId]) {
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
            await showPositionSelection(ctx, userId);
        } else if (!users[userId].isApproved) {
            await ctx.reply('Ваша заявка на рассмотрении.');
        } else {
            await showMainMenu(ctx); // Вызов функции
        }
    });
};