const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { BASE_POSITIONS_LIST, ADMIN_ID } = require('../../config/config');

function getPositionsList(userId) {
    const positions = [...BASE_POSITIONS_LIST];
    if (userId === ADMIN_ID) positions.push('Админ');
    return positions;
}

async function showPositionSelection(ctx, userId) {
    const positions = getPositionsList(userId);
    const buttons = positions.map((pos, index) => [Markup.button.callback(pos, `select_initial_position_${index}`)]);
    buttons.push([Markup.button.callback('Ввести свою должность', 'custom_position')]);
    await ctx.reply('Выберите вашу должность:', Markup.inlineKeyboard(buttons));
}

module.exports = (bot) => {
    bot.action(/select_initial_position_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        const positionIndex = parseInt(ctx.match[1], 10);
        const selectedPosition = getPositionsList(userId)[positionIndex];
        if (!selectedPosition) return;

        const users = await loadUsers();
        users[userId].position = selectedPosition;
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId] = { step: 'selectOrganization' };
        await showOrganizationSelection(ctx, userId);
    });
    bot.action('custom_position', async (ctx) => {
        const userId = ctx.from.id.toString();
        ctx.state.userStates[userId] = { step: 'customPositionInput' };
        await ctx.reply('Введите название вашей должности:');
    });
};

module.exports.showPositionSelection = showPositionSelection;