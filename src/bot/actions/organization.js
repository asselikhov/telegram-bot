const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { ORGANIZATIONS_LIST } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');
const { showProfile } = require('../handlers/menu');
const { showObjectSelection } = require('./objects');
const { ADMIN_ID } = require('../../config/config');

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

        if (userId === ADMIN_ID) {
            const organizations = ORGANIZATIONS_LIST;
            if (organizations.length === 0) {
                const message = await ctx.reply('Список организаций пуст.');
                ctx.state.userStates[userId].messageIds.push(message.message_id);
                return;
            }

            const buttons = organizations.map((org, index) => [
                Markup.button.callback(org, `admin_select_org_${index}`)
            ]);
            buttons.push([Markup.button.callback('↩️ Назад', 'profile')]);

            const message = await ctx.reply(
                'Выберите новую организацию:',
                Markup.inlineKeyboard(buttons)
            );
            ctx.state.userStates[userId].messageIds.push(message.message_id);
        } else {
            ctx.state.userStates[userId].step = 'enterInviteCode';
            const message = await ctx.reply('Введите пригласительный код для смены организации:');
            ctx.state.userStates[userId].messageIds.push(message.message_id);
        }
    });

    bot.action(/admin_select_org_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const orgIndex = parseInt(ctx.match[1], 10);
        await clearPreviousMessages(ctx, userId);

        const selectedOrg = ORGANIZATIONS_LIST[orgIndex];
        if (!selectedOrg) {
            const message = await ctx.reply('Ошибка: организация не найдена.');
            ctx.state.userStates[userId].messageIds.push(message.message_id);
            return;
        }

        const users = await loadUsers();
        users[userId].organization = selectedOrg;
        users[userId].selectedObjects = [];
        await saveUser(userId, users[userId]);

        await ctx.reply(`Организация изменена на "${selectedOrg}".`);
        await showProfile(ctx);
    });
};

module.exports.showOrganizationSelection = showOrganizationSelection;