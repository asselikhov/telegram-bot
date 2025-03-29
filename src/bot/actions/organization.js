const { Markup } = require('telegraf');

async function showOrganizationSelection(ctx, userId) {
    const buttons = [
        [Markup.button.callback('Тестовая организация', 'select_organization_0')],
        [Markup.button.callback('Ввести свою', 'custom_organization')]
    ];
    const message = await ctx.reply('Выберите вашу организацию:', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds = [message.message_id];
}

module.exports = (bot) => {
    bot.action(/select_organization_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        ctx.state.userStates[userId] = { step: 'enterFullName', selectedObjects: [], report: {}, messageIds: [] };
        const message = await ctx.reply('Введите ваше ФИО:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        console.log(`Шаг enterFullName установлен для userId ${userId}. State:`, ctx.state.userStates[userId]);
    });
};

module.exports.showOrganizationSelection = showOrganizationSelection;