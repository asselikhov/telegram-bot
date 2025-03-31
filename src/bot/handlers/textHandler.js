const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages } = require('../utils');
const { loadInviteCode, markInviteCodeAsUsed, validateInviteCode } = require('../../database/inviteCodeModel');
const { showObjectSelection } = require('../actions/objects');
const { showProfile } = require('./menu');
const { saveReport, loadUserReports } = require('../../database/reportModel');
const { ORGANIZATIONS_LIST, GENERAL_GROUP_CHAT_IDS, OBJECT_GROUPS, ADMIN_ID } = require('../../config/config');

module.exports = (bot) => {
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        console.log(`[textHandler.js] Получен текст для userId ${userId}: "${ctx.message.text}", state:`, state);

        if (!state || !state.step) {
            console.log(`[textHandler.js] Нет состояния или шага для userId ${userId}`);
            return;
        }

        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();

        switch (state.step) {
            // Регистрация: ввод кода
            case 'enterInviteCode':
                const code = ctx.message.text.trim();
                const inviteData = await validateInviteCode(code);
                if (!inviteData) {
                    const message = await ctx.reply('Неверный или уже использованный код. Попробуйте снова:');
                    state.messageIds.push(message.message_id);
                    return;
                }
                const { organization, createdBy } = inviteData;
                console.log(`[textHandler] Пользователь ${userId} ввел код ${code}, созданный ${createdBy}, организация: ${organization}`);
                users[userId].organization = organization;
                await saveUser(userId, users[userId]);
                await markInviteCodeAsUsed(code, userId);
                state.step = 'selectObjects';
                await showObjectSelection(ctx, userId, []);
                break;

            // Регистрация: ввод ФИО
            case 'enterFullName':
                const fullName = ctx.message.text.trim();
                users[userId].fullName = fullName;
                await saveUser(userId, users[userId]);
                console.log(`Сохранено ФИО для userId ${userId}: ${fullName}`);

                const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
                state.messageIds.push(message.message_id);

                const inviteCodeData = await loadInviteCode(userId);
                const creatorId = inviteCodeData?.createdBy;
                const creator = creatorId ? users[creatorId] : null;
                const creatorFullName = creator ? creator.fullName : 'Неизвестно';

                const adminText = `
${users[userId].fullName || 'Не указано'} - ${users[userId].position || 'Не указано'} (${users[userId].organization || 'Не указано'})
Объекты: ${users[userId].selectedObjects.join(', ') || 'Не выбраны'}
Пригласительный код создан: ${creatorFullName}
                `.trim();
                await ctx.telegram.sendMessage(ADMIN_ID, `📝 НОВАЯ ЗАЯВКА\n${adminText}`, Markup.inlineKeyboard([
                    [Markup.button.callback(`✅ Одобрить (${users[userId].fullName || 'Не указано'})`, `approve_${userId}`)],
                    [Markup.button.callback(`❌ Отклонить (${users[userId].fullName || 'Не указано'})`, `reject_${userId}`)]
                ]));
                ctx.state.userStates[userId] = { step: null, messageIds: [] };
                break;

            // Редактирование ФИО
            case 'editFullNameInput':
                const newFullName = ctx.message.text.trim();
                users[userId].fullName = newFullName;
                await saveUser(userId, users[userId]);
                console.log(`ФИО обновлено для userId ${userId}: ${newFullName}`);
                state.step = null;
                await ctx.reply(`Ваше ФИО изменено на "${newFullName}"`);
                await showProfile(ctx);
                break;

            // Ввод своей организации
            case 'customOrganizationInput':
                users[userId].organization = ctx.message.text.trim();
                users[userId].selectedObjects = [];
                await saveUser(userId, users[userId]);
                state.step = 'selectObjects';
                await showObjectSelection(ctx, userId, []);
                console.log(`Переход к выбору объектов для userId ${userId} после ввода своей организации`);
                break;

            // Ввод кода для смены организации
            case 'enterInviteCode': // Повторное использование этого шага допустимо, так как контекст различается
                const orgCode = ctx.message.text.trim();
                const newOrg = await validateInviteCode(orgCode);
                if (!newOrg) {
                    const message = await ctx.reply('Неверный или уже использованный код. Попробуйте снова:');
                    state.messageIds.push(message.message_id);
                    return;
                }
                users[userId].organization = newOrg.organization; // Используем .organization из результата validateInviteCode
                users[userId].selectedObjects = [];
                await saveUser(userId, users[userId]);
                await markInviteCodeAsUsed(orgCode);
                state.step = 'selectObjects';
                await ctx.reply(`Организация изменена на "${newOrg.organization}". Теперь выберите объекты:`);
                await showObjectSelection(ctx, userId, []);
                break;

            // Создание отчета
            case 'workDone':
                state.report.workDone = ctx.message.text.trim();
                state.step = 'materials';
                await ctx.reply('💡 Введите информацию о поставленных материалах:');
                break;

            case 'materials':
                state.report.materials = ctx.message.text.trim();
                const date = new Date().toISOString().split('T')[0];
                const timestamp = new Date().toISOString();
                const reportId = `${date}_${users[userId].nextReportId++}`;
                const report = {
                    reportId,
                    userId,
                    objectName: state.report.objectName,
                    date,
                    timestamp,
                    workDone: state.report.workDone,
                    materials: state.report.materials,
                    groupMessageIds: {},
                    fullName: users[userId].fullName
                };
                const reportText = `
📅 ОТЧЕТ ЗА ${date}  
🏢 ${report.objectName}  
➖➖➖➖➖➖➖➖➖➖➖ 
👷 ${users[userId].fullName} 

ВЫПОЛНЕННЫЕ РАБОТЫ:  
${report.workDone}  

ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:  
${report.materials}  
➖➖➖➖➖➖➖➖➖➖➖
                `.trim();

                const groupChatId = OBJECT_GROUPS[report.objectName] || GENERAL_GROUP_CHAT_IDS['default'].chatId;
                const groupMessage = await ctx.telegram.sendMessage(groupChatId, reportText);
                report.groupMessageIds[groupChatId] = groupMessage.message_id;

                const userOrg = users[userId].organization;
                const targetOrgs = [
                    userOrg,
                    ...ORGANIZATIONS_LIST.filter(org => GENERAL_GROUP_CHAT_IDS[org]?.reportSources?.includes(userOrg))
                ];
                for (const org of targetOrgs) {
                    const chatId = GENERAL_GROUP_CHAT_IDS[org]?.chatId || GENERAL_GROUP_CHAT_IDS['default'].chatId;
                    try {
                        const msg = await ctx.telegram.sendMessage(chatId, reportText);
                        report.groupMessageIds[chatId] = msg.message_id;
                    } catch (e) {
                        console.log(`Не удалось отправить отчет в чат ${chatId}: ${e.message}`);
                    }
                }

                await saveReport(userId, report);
                await saveUser(userId, users[userId]);
                await ctx.reply(`✅ Ваш отчет опубликован:\n\n${reportText}`);
                state.step = null;
                state.report = {};
                break;

            // Редактирование отчета
            case 'editWorkDone':
                state.report.workDone = ctx.message.text.trim();
                state.step = 'editMaterials';
                await ctx.reply('💡 Введите новую информацию о поставленных материалах:');
                break;

            case 'editMaterials':
                state.report.materials = ctx.message.text.trim();
                const newTimestamp = new Date().toISOString();
                const newReportId = `${state.report.date}_${users[userId].nextReportId++}`;
                const newReport = {
                    reportId: newReportId,
                    userId,
                    objectName: state.report.objectName,
                    date: state.report.date,
                    timestamp: newTimestamp,
                    workDone: state.report.workDone,
                    materials: state.report.materials,
                    groupMessageIds: {},
                    fullName: users[userId].fullName
                };
                const newReportText = `
📅 ОТЧЕТ ЗА ${newReport.date} (ОБНОВЛЁН)  
🏢 ${newReport.objectName}  
➖➖➖➖➖➖➖➖➖➖➖ 
👷 ${users[userId].fullName} 

ВЫПОЛНЕННЫЕ РАБОТЫ:  
${newReport.workDone}  

ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ:  
${newReport.materials}  
➖➖➖➖➖➖➖➖➖➖➖
                `.trim();

                const oldReportId = state.report.originalReportId;
                if (oldReportId) {
                    const userReports = await loadUserReports(userId);
                    const oldReport = userReports[oldReportId];
                    if (oldReport?.groupMessageIds) {
                        for (const [chatId, msgId] of Object.entries(oldReport.groupMessageIds)) {
                            await ctx.telegram.deleteMessage(chatId, msgId).catch(e =>
                                console.log(`Не удалось удалить сообщение ${msgId} в чате ${chatId}: ${e.message}`)
                            );
                        }
                        const client = await require('../../database/db').pool.connect();
                        try {
                            await client.query('DELETE FROM reports WHERE reportId = $1', [oldReportId]);
                        } finally {
                            client.release();
                        }
                    }
                }

                const newGroupChatId = OBJECT_GROUPS[newReport.objectName] || GENERAL_GROUP_CHAT_IDS['default'].chatId;
                const newGroupMsg = await ctx.telegram.sendMessage(newGroupChatId, newReportText);
                newReport.groupMessageIds[newGroupChatId] = newGroupMsg.message_id;

                const targetOrganizations = [
                    users[userId].organization,
                    ...ORGANIZATIONS_LIST.filter(org => GENERAL_GROUP_CHAT_IDS[org]?.reportSources?.includes(users[userId].organization))
                ];
                for (const org of targetOrganizations) {
                    const chatId = GENERAL_GROUP_CHAT_IDS[org]?.chatId || GENERAL_GROUP_CHAT_IDS['default'].chatId;
                    try {
                        const msg = await ctx.telegram.sendMessage(chatId, newReportText);
                        newReport.groupMessageIds[chatId] = msg.message_id;
                    } catch (e) {
                        console.log(`Не удалось отправить отчет в чат ${chatId}: ${e.message}`);
                    }
                }

                await saveReport(userId, newReport);
                await saveUser(userId, users[userId]);
                await ctx.reply(`✅ Ваш отчёт обновлён:\n\n${newReportText}`, Markup.inlineKeyboard([
                    [Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]
                ]));
                state.step = null;
                state.report = {};
                break;

            default:
                console.log(`[textHandler.js] Неизвестный шаг для userId ${userId}: ${state.step}`);
                break;
        }
    });
};