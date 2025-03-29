const { loadUsers } = require('../../database/userModel');
const { showMainMenu } = require('./menu');

module.exports = (bot) => {
    bot.command('test', async (ctx) => {
        await ctx.reply('Тестовая команда выполнена!');
    });

    bot.command('listproducers', async (ctx) => {
        const userId = ctx.from.id.toString();
        const users = await loadUsers();
        const producers = Object.entries(users)
            .filter(([_, user]) => user.isApproved && user.position === 'Производитель работ')
            .map(([_, user]) => `${user.fullName} (${user.organization})`);

        if (producers.length === 0) {
            return ctx.reply('Нет зарегистрированных производителей работ.');
        }

        await ctx.reply(`Список производителей работ:\n${producers.join('\n')}`);
    });
};