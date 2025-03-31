const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { validateInviteCode, markInviteCodeAsUsed } = require('../../database/inviteCodeModel');
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
            console.log(`Новый пользователь ${userId} начал регистрацию с ввода пригласительного кода`);
        } else if (users[userId].isApproved) {
            await showMainMenu(ctx);
        } else {
            const user = users[userId];
            await clearPreviousMessages(ctx, userId);

            if (!user.organization) {
                ctx.state.userStates[userId] = { step: 'enterInviteCode', messageIds: [] };
                const message = await ctx.reply('Введите пригласительный код для регистрации:');
                ctx.state.userStates[userId].messageIds.push(message.message_id);
                console.log(`Пользователь ${userId} возобновил регистрацию с ввода пригласительного кода`);
            } else if (!user.selectedObjects.length) {
                ctx.state.userStates[userId] = { step: 'selectObjects', messageIds: [] };
                const { showObjectSelection } = require('../actions/objects');
                await showObjectSelection(ctx, userId, []);
                console.log(`Пользователь ${userId} возобновил регистрацию с выбора объектов`);
            } else if (!user.position) {
                ctx.state.userStates[userId] = { step: 'selectPosition', messageIds: [] };
                const { showPositionSelection } = require('../actions/position');
                await showPositionSelection(ctx, userId);
                console.log(`Пользователь ${userId} возобновил регистрацию с выбора должности`);
            } else if (!user.fullName) {
                ctx.state.userStates[userId] = { step: 'enterFullName', messageIds: [] };
                const message = await ctx.reply('Введите ваше ФИО:');
                ctx.state.userStates[userId].messageIds.push(message.message_id);
                console.log(`Пользователь ${userId} возобновил регистрацию с ввода ФИО`);
            } else {
                const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
                ctx.state.userStates[userId] = { step: null, messageIds: [message.message_id] };
                console.log(`Пользователь ${userId} уже заполнил заявку и ожидает подтверждения`);
            }
        }
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state || state.step !== 'enterInviteCode') return;

        const code = ctx.message.text.trim();
        const organization = await validateInviteCode(code);

        await clearPreviousMessages(ctx, userId);

        if (!organization) {
            const message = await ctx.reply('Неверный или уже использованный код. Попробуйте снова:');
            ctx.state.userStates[userId].messageIds.push(message.message_id);
            return;
        }

        const users = await loadUsers();
        users[userId].organization = organization;
        await saveUser(userId, users[userId]);
        await markInviteCodeAsUsed(code, userId);

        state.step = 'selectObjects';
        const { showObjectSelection } = require('../actions/objects');
        await showObjectSelection(ctx, userId, []);
        console.log(`Пользователь ${userId} перешел к выбору объектов после ввода кода`);
    });
};