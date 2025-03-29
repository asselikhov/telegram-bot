const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { ORGANIZATIONS_LIST } = require('../../config/config');

async function showOrganizationSelection(ctx, userId) {
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

        const users = await loadUsers();
        users[userId].organization = selectedOrganization;
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId] = { step: 'fullName' };
        await ctx.reply('Введите ваше ФИО:');
    });
    bot.action('custom_organization', async (ctx) => {
        const userId = ctx.from.id.toString();
        ctx.state.userStates[userId] = { step: 'customOrganizationInput' };
        await ctx.reply('Введите название вашей организации:');
    });
};

module.exports.showOrganizationSelection = showOrganizationSelection;