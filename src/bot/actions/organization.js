const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { ORGANIZATIONS_LIST, ADMIN_ID } = require('../../config/config');
const { clearPreviousMessages } = require('../utils');

async function showOrganizationSelection(ctx, userId) {
    await clearPreviousMessages(ctx, userId);

    const buttons = ORGANIZATIONS_LIST.map((org, index) => [Markup.button.callback(org, `select_organization_${index}`)]);
    buttons.push([Markup.button.callback('Ввести свою организацию', 'custom_organization')]);
    const message = await ctx.reply('Выберите вашу организацию:', Markup.inlineKeyboard(buttons));
    ctx.state.userStates[userId].messageIds.push(message.message_id);
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

        ctx.state.userStates[userId].step = 'enterFullName';
        const message = await ctx.reply('Введите ваше ФИО:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        console.log(`Шаг enterFullName установлен для userId ${userId}. State:`, ctx.state.userStates[userId]);
    });

    bot.action('custom_organization', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'customOrganizationInput';
        const message = await ctx.reply('Введите название вашей организации:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        console.log(`Шаг customOrganizationInput установлен для userId ${userId}. State:`, ctx.state.userStates[userId]);
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
        await saveUser(userId, users[userId]);
        ctx.state.userStates[userId].step = null;
        const message = await ctx.reply(`Организация обновлена на "${selectedOrganization}".`, Markup.inlineKeyboard([[Markup.button.callback('↩️ Назад', 'profile')]]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.action('custom_org_edit', async (ctx) => {
        const userId = ctx.from.id.toString();
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'customOrgEditInput';
        const message = await ctx.reply('Введите новое название организации:');
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        console.log(`Получен текст от userId ${userId}: "${ctx.message.text}". State:`, state);

        if (!state) {
            console.log(`Нет состояния для userId ${userId}, пропускаем обработку`);
            return;
        }

        if (state.step === 'customOrganizationInput') {
            await clearPreviousMessages(ctx, userId);
            const users = await loadUsers();
            users[userId].organization = ctx.message.text.trim();
            await saveUser(userId, users[userId]);
            state.step = 'enterFullName';
            const message = await ctx.reply('Введите ваше ФИО:');
            state.messageIds.push(message.message_id);
            console.log(`Переход к enterFullName для userId ${userId}. State:`, state);
            return;
        }

        if (state.step === 'enterFullName') {
            try {
                console.log(`Начало обработки шага enterFullName для userId ${userId}`);
                await clearPreviousMessages(ctx, userId);
                console.log(`Предыдущие сообщения очищены для userId ${userId}`);

                const users = await loadUsers();
                console.log(`Пользователи загружены для userId ${userId}:`, users[userId]);

                const fullName = ctx.message.text.trim();
                users[userId].fullName = fullName;
                console.log(`Установлено ФИО для userId ${userId}: ${fullName}`);

                await saveUser(userId, users[userId]);
                console.log(`ФИО сохранено в базе для userId ${userId}`);

                const userMessage = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
                state.messageIds.push(userMessage.message_id);
                console.log(`Сообщение отправлено пользователю для userId ${userId}, messageId: ${userMessage.message_id}`);

                const adminText = `\n${users[userId].fullName || 'ФИО не указано'} - ${users[userId].position || 'Не указана'} (${users[userId].organization || 'Не указана'})\n\n${users[userId].selectedObjects.join(', ') || 'Не выбраны'}`;
                console.log(`Отправляем заявку администратору для userId ${userId}: ${adminText}`);
                const adminMessage = await ctx.telegram.sendMessage(
                    ADMIN_ID,
                    `📝 НОВАЯ ЗАЯВКА${adminText}`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback(`✅ Одобрить (${users[userId].fullName || 'Без имени'})`, `approve_${userId}`)],
                        [Markup.button.callback(`❌ Отклонить (${users[userId].fullName || 'Без имени'})`, `reject_${userId}`)]
                    ])
                );
                console.log(`Заявка успешно отправлена администратору для userId ${userId}. Message ID: ${adminMessage.message_id}`);

                ctx.state.userStates[userId] = { step: null, selectedObjects: [], report: {}, messageIds: [] };
                console.log(`Состояние сброшено для userId ${userId}`);
            } catch (error) {
                console.error(`Ошибка при обработке шага enterFullName для userId ${userId}:`, error.stack);
                await ctx.reply('Произошла ошибка. Попробуйте позже.');
            }
            return;
        }

        if (state.step === 'customOrgEditInput') {
            await clearPreviousMessages(ctx, userId);
            const users = await loadUsers();
            users[userId].organization = ctx.message.text.trim();
            await saveUser(userId, users[userId]);
            state.step = null;
            const message = await ctx.reply(`Организация обновлена на "${users[userId].organization}".`, Markup.inlineKeyboard([[Markup.button.callback('↩️ Назад', 'profile')]]));
            state.messageIds.push(message.message_id);
            return;
        }

        console.log(`Текст от userId ${userId} не обработан, шаг: ${state.step}`);
    });
};

module.exports.showOrganizationSelection = showOrganizationSelection;