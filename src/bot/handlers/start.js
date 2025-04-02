const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { showMainMenu } = require('./menu');

module.exports = (bot) => {
    bot.start(async (ctx) => {
        const userId = ctx.from.id.toString();
        if (ctx.chat.type !== 'private') return;

        const users = await loadUsers();

        if (!users[userId]) {
            users[userId] = { fullName: '', position: '', organization: '', selectedObjects: [], status: 'В работе', isApproved: 0, nextReportId: 1, reports: {} };
            await saveUser(userId, users[userId]);
            ctx.state.userStates[userId] = { step: 'enterInviteCode', lastMessageId: null };
            await clearPreviousMessages(ctx, userId);
            await ctx.reply('Введите пригласительный код:');
        } else if (users[userId].isApproved) {
            await showMainMenu(ctx);
        } else {
            await clearPreviousMessages(ctx, userId);
            if (!users[userId].organization) {
                ctx.state.userStates[userId] = { step: 'enterInviteCode', lastMessageId: null };
                await ctx.reply('Введите пригласительный код:');
            } else if (!users[userId].selectedObjects.length) {
                ctx.state.userStates[userId] = { step: 'selectObjects', lastMessageId: null };
                const { showObjectSelection } = require('../actions/objects');
                await showObjectSelection(ctx, userId, []);
            } else if (!users[userId].position) {
                ctx.state.userStates[userId] = { step: 'selectPosition', lastMessageId: null };
                const { showPositionSelection } = require('../actions/position');
                await showPositionSelection(ctx, userId);
            } else if (!users[userId].fullName) {
                ctx.state.userStates[userId] = { step: 'enterFullName', lastMessageId: null };
                await ctx.reply('Введите ваше ФИО:');
            } else {
                await ctx.reply('Ваша заявка на рассмотрении.');
            }
        }
    });
};