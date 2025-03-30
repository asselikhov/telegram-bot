// src/bot/handlers/start.js
const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');

module.exports = (bot) => {
    bot.start(async (ctx) => {
        const userId = ctx.from.id.toString();
        const chatType = ctx.chat.type;

        if (chatType !== 'private') {
            return ctx.reply('Команда /start доступна только в личных сообщениях с ботом.');
        }

        const users = await loadUsers();

        if (!users[userId]) {
            // Новый пользователь: инициализация данных
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

            // Установка начального состояния
            ctx.state.userStates[userId] = {
                step: 'selectOrganization',
                selectedObjects: [],
                report: {},
                messageIds: []
            };
            await clearPreviousMessages(ctx, userId);

            // Начало процесса с выбора организации
            const { showOrganizationSelection } = require('../actions/organization');
            await showOrganizationSelection(ctx, userId);
            console.log(`Новый пользователь ${userId} начал регистрацию с выбора организации`);
        } else if (users[userId].isApproved) {
            // Одобренный пользователь: показываем главное меню
            const { showMainMenu } = require('./menu');
            await showMainMenu(ctx);
        } else {
            // Пользователь в процессе регистрации или ожидает одобрения
            const user = users[userId];
            await clearPreviousMessages(ctx, userId);

            if (!user.organization) {
                ctx.state.userStates[userId] = {
                    step: 'selectOrganization',
                    selectedObjects: [],
                    report: {},
                    messageIds: ctx.state.userStates[userId]?.messageIds || []
                };
                const { showOrganizationSelection } = require('../actions/organization');
                await showOrganizationSelection(ctx, userId);
                console.log(`Пользователь ${userId} возобновил регистрацию с выбора организации`);
            } else if (!user.selectedObjects.length) {
                ctx.state.userStates[userId] = {
                    step: 'selectObjects',
                    selectedObjects: [],
                    report: {},
                    messageIds: ctx.state.userStates[userId]?.messageIds || []
                };
                const { showObjectSelection } = require('../actions/objects');
                await showObjectSelection(ctx, userId, []);
                console.log(`Пользователь ${userId} возобновил регистрацию с выбора объектов`);
            } else if (!user.position) {
                ctx.state.userStates[userId] = {
                    step: 'selectPosition',
                    selectedObjects: [],
                    report: {},
                    messageIds: ctx.state.userStates[userId]?.messageIds || []
                };
                const { showPositionSelection } = require('../actions/position');
                await showPositionSelection(ctx, userId);
                console.log(`Пользователь ${userId} возобновил регистрацию с выбора должности`);
            } else if (!user.fullName) {
                ctx.state.userStates[userId] = {
                    step: 'enterFullName',
                    selectedObjects: [],
                    report: {},
                    messageIds: ctx.state.userStates[userId]?.messageIds || []
                };
                const message = await ctx.reply('Введите ваше ФИО:');
                ctx.state.userStates[userId].messageIds.push(message.message_id);
                console.log(`Пользователь ${userId} возобновил регистрацию с ввода ФИО`);
            } else {
                const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
                ctx.state.userStates[userId].messageIds.push(message.message_id);
                console.log(`Пользователь ${userId} уже заполнил заявку и ожидает подтверждения`);
            }
        }
    });
};