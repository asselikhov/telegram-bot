const { Markup } = require('telegraf');
const { loadUsers } = require('../../database/userModel');
const { OBJECTS_LIST_CYRILLIC } = require('../../config/config');

module.exports = (bot) => {
    bot.command('test', (ctx) => ctx.reply('Бот работает!'));

    bot.command('listproducers', async (ctx) => {
        const buttons = OBJECTS_LIST_CYRILLIC.map((obj, index) =>
            [Markup.button.callback(obj, `show_producers_${index}`)]
        );
        await ctx.reply('Выберите объект:', Markup.inlineKeyboard(buttons));
    });

    bot.action(/show_producers_(\d+)/, async (ctx) => {
        const objectIndex = parseInt(ctx.match[1], 10);
        const selectedObject = OBJECTS_LIST_CYRILLIC[objectIndex];
        const users = await loadUsers(); // Используется кэш
        const producers = Object.values(users)
            .filter(u => u.position === 'Производитель работ' && u.isApproved && u.selectedObjects.includes(selectedObject))
            .map(u => `${u.fullName} (${u.organization}) - ${u.status}`);

        const lastMessageId = ctx.state.userStates[ctx.from.id.toString()]?.lastMessageId;
        if (lastMessageId) {
            await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, producers.length ? producers.join('\n') : 'Производители не найдены.')
                .catch(() => ctx.reply(producers.length ? producers.join('\n') : 'Производители не найдены.'));
        } else {
            await ctx.reply(producers.length ? producers.join('\n') : 'Производители не найдены.');
        }
    });
};