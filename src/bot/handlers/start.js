const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { showMainMenu } = require('./menu');

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
                isApproved: 0,
                nextReportId: 1,
                reports: {}
            };
            await saveUser(userId, users[userId]);

            ctx.state.userStates[userId] = {
                step: 'enterInviteCode',
                messageIds: []
            };
            await clearPreviousMessages(ctx, userId);

            const message = await ctx.reply('Введите пригласительный код для регистрации:');
            ctx.state.userStates[userId].messageIds.push(message.message_id);
        } else if (users[userId].isApproved) {
            await showMainMenu(ctx);
        } else {
            const user = users[userId];
            await clearPreviousMessages(ctx, userId);

            if (!user.organization) {
                ctx.state.userStates[userId] = { step: 'enterInviteCode', messageIds: [] };
                const message = await ctx.reply('Введите пригласительный код для регистрации:');
                ctx.state.userStates[userId].messageIds.push(message.message_id);
            } else if (!user.selectedObjects.length) {
                ctx.state.userStates[userId] = { step: 'selectObjects', messageIds: [] };
                const { showObjectSelection } = require('../actions/objects');
                await showObjectSelection(ctx, userId, []);
            } else if (!user.position) {
                ctx.state.userStates[userId] = { step: 'selectPosition', messageIds: [] };
                const { showPositionSelection } = require('../actions/position');
                await showPositionSelection(ctx, userId);
            } else if (!user.fullName) {
                ctx.state.userStates[userId] = { step: 'enterFullName', messageIds: [] };
                const message = await ctx.reply('Введите ваше ФИО:');
                ctx.state.userStates[userId].messageIds.push(message.message_id);
            } else {
                const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
                ctx.state.userStates[userId] = { step: null, messageIds: [message.message_id] };
            }
        }
    });
};