// src/bot/actions/organization.js
const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { ORGANIZATIONS_LIST, ORGANIZATION_OBJECTS } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');
const { showProfile } = require('../handlers/menu');
const { showObjectSelection } = require('./objects');

async function showOrganizationSelection(ctx, userId) {
    await clearPreviousMessages(ctx, userId);
    const buttons = ORGANIZATIONS_LIST.map((org, index) => [Markup.button.callback(org, `select_organization_${index}_${userId}`)]);
    buttons.push([Markup.button.callback('Ввести свою организацию', `custom_organization_${userId}`)]);
    const message = await ctx.reply('Выберите вашу организацию:', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
}

module.exports = (bot) => {
    bot.action(/select_organization_(\d+)_(\d+)/, async (ctx) => {
        const orgIndex = parseInt(ctx.match[1], 10);
        const userId = ctx.match[2];
        const selectedOrganization = ORGANIZATIONS_LIST[orgIndex];
        if (!selectedOrganization) return;

        await clearPreviousMessages(ctx, userId);

        const users = await loadUsers();
        users[userId].organization = selectedOrganization;
        users[userId].selectedObjects = [];
        await saveUser(userId, users[userId]);

        ctx.state.userStates[userId].step = 'selectObjects';
        await showObjectSelection(ctx, userId, []);
        console.log(`Переход к выбору объектов для userId ${userId} после выбора организации`);
    });

    bot.action(/custom_organization_(\d+)/, async (ctx) => {
        const userId = ctx.match[1];
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
        users[userId].selectedObjects = [];
        await saveUser(userId, users[userId]);

        ctx.state.userStates[userId].step = null;
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
};

module.exports.showOrganizationSelection = showOrganizationSelection;