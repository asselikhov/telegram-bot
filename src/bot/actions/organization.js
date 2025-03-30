// src/bot/actions/organization.js
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
        } else if (state.step === 'enterFullName') {
            await clearPreviousMessages(ctx, userId);
            const users = await loadUsers();
            const fullName = ctx.message.text.trim();
            users[userId].fullName = fullName; // Явно сохраняем ФИО
            await saveUser(userId, users[userId]);

            console.log(`Сохранено ФИО для userId ${userId}: ${users[userId].fullName}`); // Отладка

            const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
            state.messageIds.push(message.message_id);

            // Проверяем данные перед отправкой
            console.log(`Перед отправкой заявки: fullName=${users[userId].fullName}, position=${users[userId].position}, organization=${users[userId].organization}, objects=${users[userId].selectedObjects}`);

            const adminText = `\n${users[userId].fullName || 'Не указано'} - ${users[userId].position || 'Не указано'} (${users[userId].organization || 'Не указано'})\n\n${users[userId].selectedObjects.join(', ') || 'Не выбраны'}`;
            await ctx.telegram.sendMessage(ADMIN_ID, `📝 НОВАЯ ЗАЯВКА${adminText}`, Markup.inlineKeyboard([
                [Markup.button.callback(`✅ Одобрить (${users[userId].fullName || 'Не указано'})`, `approve_${userId}`)],
                [Markup.button.callback(`❌ Отклонить (${users[userId].fullName || 'Не указано'})`, `reject_${userId}`)]
            ]));

            ctx.state.userStates[userId] = { step: null, selectedObjects: [], report: {}, messageIds: [] };
            console.log(`Заявка от userId ${userId} отправлена администратору`);
        } else if (state.step === 'customOrgEditInput') {
            await clearPreviousMessages(ctx, userId);
            const users = await loadUsers();
            users[userId].organization = ctx.message.text.trim();
            users[userId].selectedObjects = []; // Сбрасываем объекты
            await saveUser(userId, users[userId]);

            state.step = null; // Сбрасываем шаг
            await ctx.reply(`Организация обновлена на "${users[userId].organization}".`);
            await showProfile(ctx);
        }
    });
};

module.exports.showOrganizationSelection = showOrganizationSelection;