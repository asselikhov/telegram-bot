const { Markup } = require('telegraf');
const { showOrganizationSelection } = require('../actions/organization');

module.exports = (bot) => {
    bot.command('start', async (ctx) => {
        const userId = ctx.from.id.toString();
        console.log(`[Start] Команда /start от userId ${userId}`);
        await ctx.reply('Начинаем регистрацию!');
        await showOrganizationSelection(ctx, userId);
    });
};