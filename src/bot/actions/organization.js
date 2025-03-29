const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { ORGANIZATIONS_LIST } = require('../../config/config');
const { clearPreviousMessages } = require('../bot');

async function showOrganizationSelection(ctx, userId) {
    await clearPreviousMessages(ctx, userId);

    const buttons = ORGANIZATIONS_LIST.map((org, index) => [Markup.button.callback(org, `select_organization_${index}`)]);
    buttons.push([Markup.button.callback('Ввести свою организацию', 'custom_organization')]);
    await ctx.reply('Выберите вашу организацию:', Markup.inlineKeyboard(buttons));
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
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId] = { step: 'fullName' };
        await ctx.reply('Введите ваше ФИО:');
    });

    bot.action('custom_organization', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId] = { step: 'customOrganizationInput' };
        await ctx.reply('Введите название вашей организации:');
    });

    bot.action('edit_organization', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        const buttons = ORGANIZATIONS_LIST.map((org, index) => [Markup.button.callback(org, `select_org_edit_${index}`)]);
        buttons.push([Markup.button.callback('Ввести свою организацию', 'custom_org_edit')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);
        await ctx.reply('Выберите новую организацию:', Markup.inlineKeyboard(buttons));
    });

    bot.action(/select_org_edit_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const orgIndex = parseInt(ctx.match[1], 10);
        const selectedOrganization = ORGANIZATIONS_LIST[orgIndex];
        if (!selectedOrganization) return;

        await clearPreviousMessages(ctx, userId);

        const users = await loadUsers();
        users[userId].organization = selectedOrganization;
        await saveUser(userId, users[userId]);
        await ctx.reply(`Организация обновлена на "${selectedOrganization}".`);
        await require('../handlers/menu').showProfile(ctx);
    });

    bot.action('custom_org_edit', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId] = { step: 'customOrgEditInput' };
        await ctx.reply('Введите новое название организации:');
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state || (!state.step.includes('customOrganizationInput') && !state.step.includes('customOrgEditInput'))) return;

        await clearPreviousMessages(ctx, userId);

        const users = await loadUsers();
        if (state.step === 'customOrganizationInput') {
            users[userId].organization = ctx.message.text.trim();
            await saveUser(userId, users[userId]);
            ctx.state.userStates[userId] = { step: 'fullName' };
            await ctx.reply('Введите ваше ФИО:');
        } else if (state.step === 'customOrgEditInput') {
            users[userId].organization = ctx.message.text.trim();
            await saveUser(userId, users[userId]);
            await ctx.reply(`Организация обновлена на "${users[userId].organization}".`);
            delete ctx.state.userStates[userId];
            await require('../handlers/menu').showProfile(ctx);
        }
    });
};

module.exports.showOrganizationSelection = showOrganizationSelection;