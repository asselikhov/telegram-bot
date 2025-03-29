const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { ORGANIZATIONS_LIST } = require('../../config/config');
const { sendMenu } = require('../utils');

async function showOrganizationSelection(ctx, userId) {
    const buttons = ORGANIZATIONS_LIST.map((org, index) => [Markup.button.callback(org, `select_initial_organization_${index}`)]);
    buttons.push([Markup.button.callback('Ввести свою организацию', 'custom_organization')]);
    await sendMenu(ctx, userId, 'Выберите вашу организацию:', buttons);
}

module.exports = (bot) => {
    bot.action(/select_initial_organization_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const orgIndex = parseInt(ctx.match[1], 10);
        const selectedOrg = ORGANIZATIONS_LIST[orgIndex];
        if (!selectedOrg) return;

        const users = await loadUsers();
        users[userId].organization = selectedOrg;
        await saveUser(userId, users[userId]);
        ctx.state.step = 'enterFullName';
        await ctx.reply('Введите ваше ФИО:');
    });

    bot.action('custom_organization', async (ctx) => {
        const userId = ctx.from.id.toString();
        ctx.state.step = 'customOrganizationInput';
        await ctx.reply('Введите название вашей организации:');
    });

    bot.action('edit_organization', async (ctx) => {
        const userId = ctx.from.id.toString();
        const buttons = ORGANIZATIONS_LIST.map((org, index) => [Markup.button.callback(org, `select_organization_${index}`)]);
        buttons.push([Markup.button.callback('Ввести свою организацию', 'custom_organization_edit')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);
        await sendMenu(ctx, userId, 'Выберите новую организацию:', buttons);
    });

    bot.action(/select_organization_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const orgIndex = parseInt(ctx.match[1], 10);
        const selectedOrg = ORGANIZATIONS_LIST[orgIndex];
        if (!selectedOrg) return;

        const users = await loadUsers();
        users[userId].organization = selectedOrg;
        await saveUser(userId, users[userId]);
        ctx.state.step = null;
        await ctx.reply(`Ваша организация изменена на "${selectedOrg}"`);
        await require('../handlers/menu').showProfile(ctx);
    });

    bot.action('custom_organization_edit', async (ctx) => {
        const userId = ctx.from.id.toString();
        ctx.state.step = 'customOrganizationEditInput';
        await ctx.reply('Введите новое название организации:');
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state;
        if (!state || !['customOrganizationInput', 'customOrganizationEditInput'].includes(state.step)) return;

        const organization = ctx.message.text.trim();
        if (!organization) {
            await ctx.reply('Организация не может быть пустой. Введите снова:');
            return;
        }

        const users = await loadUsers();
        users[userId].organization = organization;
        await saveUser(userId, users[userId]);

        if (state.step === 'customOrganizationInput') {
            state.step = 'enterFullName';
            await ctx.reply('Введите ваше ФИО:');
        } else {
            state.step = null;
            await ctx.reply(`Организация обновлена на "${organization}".`);
            await require('../handlers/menu').showProfile(ctx);
        }
    });
};

module.exports.showOrganizationSelection = showOrganizationSelection;