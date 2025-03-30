// organization.js
const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { ORGANIZATIONS_LIST, ADMIN_ID, ORGANIZATION_OBJECTS } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');
const { showProfile } = require('../handlers/menu');
const { showObjectSelection } = require('./objects');

async function showOrganizationSelection(ctx, userId) {
    await clearPreviousMessages(ctx, userId);
    const buttons = ORGANIZATIONS_LIST.map((org, index) => [Markup.button.callback(org, `select_organization_${index}`)]);
    buttons.push([Markup.button.callback('Ввести свою организацию', 'custom_organization')]);
    const message = await ctx.reply('Выберите вашу организацию:', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

module.exports = (bot) => {
    bot.action(/select_organization_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const orgIndex = parseInt(ctx.match[1], 10);
        const selectedOrganization = ORGANIZATIONS_LIST[orgIndex];
        if (!selectedOrganization) return;

        await clearPreviousMessages(ctx, userId);

        const users = await loadUsers();
        users[userId].organization = selectedOrganization;
        users[userId].selectedObjects = []; // Сбрасываем объекты
        await saveUser(userId, users[userId]);

        ctx.state.userStates[userId].step = 'selectObjects';
        await showObjectSelection(ctx, userId, []);
        console.log(`Переход к выбору объектов для userId ${userId} после выбора организации`);
    });

    bot.action('custom_organization', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'customOrganizationInput';
        const message = await ctx.reply('Введите название вашей организации:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.action('edit_organization', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        const buttons = ORGANIZATIONS_LIST.map((org, index) => [Markup.button.callback(org, `select_org_edit_${index}`)]);
        buttons.push([Markup.button.callback('Ввести свою организацию', 'custom_org_edit')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);
        const message = await ctx.reply('Выберите новую организацию:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.action(/select_org_edit_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const orgIndex = parseInt(ctx.match[1], 10);
        const selectedOrganization = ORGANIZATIONS_LIST[orgIndex];
        if (!selectedOrganization) return;

        await clearPreviousMessages(ctx, userId);

        const users = await loadUsers();
        users[userId].organization = selectedOrganization;
        users[userId].selectedObjects = []; // Сбрасываем объекты при изменении организации
        await saveUser(userId, users[userId]);

        // Убираем перенаправление на выбор объектов и возвращаем в профиль
        ctx.state.userStates[userId].step = null; // Сбрасываем шаг
        await ctx.reply(`Организация обновлена на "${selectedOrganization}".`);
        await showProfile(ctx);
    });

    bot.action('custom_org_edit', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'customOrgEditInput';
        const message = await ctx.reply('Введите новое название организации:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state) return;

        if (state.step === 'customOrganizationInput') {
            await clearPreviousMessages(ctx, userId);
            const users = await loadUsers();
            users[userId].organization = ctx.message.text.trim();
            users[userId].selectedObjects = []; // Сбрасываем объекты
            await saveUser(userId, users[userId]);
            state.step = 'selectObjects';
            await showObjectSelection(ctx, userId, []);
            console.log(`Переход к выбору объектов для userId ${userId} после ввода своей организации`);
            return;
        }

        if (state.step === 'enterFullName') {
            await clearPreviousMessages(ctx, userId);
            const users = await loadUsers();
            users[userId].fullName = ctx.message.text.trim();
            await saveUser(userId, users[userId]);

            const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
            state.messageIds.push(message.message_id);

            const adminText = `\n${users[userId].fullName} - ${users[userId].position} (${users[userId].organization})\n\n${users[userId].selectedObjects.join(', ') || 'Не выбраны'}`;
            await ctx.telegram.sendMessage(ADMIN_ID, `📝 СПИСОК ЗАЯВОК${adminText}`, Markup.inlineKeyboard([
                [Markup.button.callback(`✅ Одобрить (${users[userId].fullName})`, `approve_${userId}`)],
                [Markup.button.callback(`❌ Отклонить (${users[userId].fullName})`, `reject_${userId}`)]
            ]));

            ctx.state.userStates[userId] = { step: null, selectedObjects: [], report: {}, messageIds: [] };
            return;
        }

        if (state.step === 'customOrgEditInput') {
            await clearPreviousMessages(ctx, userId);
            const users = await loadUsers();
            users[userId].organization = ctx.message.text.trim();
            users[userId].selectedObjects = []; // Сбрасываем объекты
            await saveUser(userId, users[userId]);

            // Убираем перенаправление на выбор объектов и возвращаем в профиль
            state.step = null; // Сбрасываем шаг
            await ctx.reply(`Организация обновлена на "${users[userId].organization}".`);
            await showProfile(ctx);
            return;
        }
    });
};

module.exports.showOrganizationSelection = showOrganizationSelection;