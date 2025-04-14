const { Markup } = require('telegraf');
const { connectMongo } = require('../../config/mongoConfig');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages, formatDate, parseAndFormatDate } = require('../utils');
const { loadInviteCode, markInviteCodeAsUsed, validateInviteCode } = require('../../database/inviteCodeModel');
const { showObjectSelection } = require('../actions/objects');
const { showProfile, showMainMenu } = require('./menu');
const { saveReport, loadUserReports } = require('../../database/reportModel');
const { ORGANIZATIONS_LIST, GENERAL_GROUP_CHAT_IDS, OBJECT_GROUPS, ADMIN_ID } = require('../../config/config');

const mediaGroups = new Map();

module.exports = (bot) => {
    bot.use(async (ctx, next) => {
        if (ctx.message && ctx.message.media_group_id) {
            const userId = ctx.from.id.toString();
            const mediaGroupId = ctx.message.media_group_id;
            const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

            if (!mediaGroups.has(mediaGroupId)) {
                mediaGroups.set(mediaGroupId, { photos: [], timeout: null, userId });
            }

            const group = mediaGroups.get(mediaGroupId);
            group.photos.push(photoId);

            clearTimeout(group.timeout);
            group.timeout = setTimeout(async () => {
                const state = ctx.state.userStates[userId];
                if (!state || (state.step !== 'photos' && state.step !== 'editPhotos')) {
                    mediaGroups.delete(mediaGroupId);
                    return;
                }

                state.report.photos = [...(state.report.photos || []), ...group.photos];

                if (state.mediaGroupIds && state.mediaGroupIds.length > 0) {
                    for (const msgId of state.mediaGroupIds) {
                        await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(e => {});
                    }
                    state.mediaGroupIds = [];
                }

                const mediaGroup = state.report.photos.map((photoId, index) => ({
                    type: 'photo',
                    media: photoId,
                    caption: index === 0 ? Добавлено ${state.report.photos.length} фото: : undefined
            }));
                const mediaGroupMessages = await ctx.telegram.sendMediaGroup(ctx.chat.id, mediaGroup);
                state.mediaGroupIds = mediaGroupMessages.map(msg => msg.message_id);

                const text = 'Фото добавлено. Отправьте еще или нажмите "Готово" для завершения.';
                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('Готово', state.step === 'photos' ? 'finish_report' : 'finish_edit_report')]
                ]);

                if (state.messageIds && state.messageIds.length > 0) {
                    const existingMessageId = state.messageIds[0];
                    try {
                        await ctx.telegram.deleteMessage(ctx.chat.id, existingMessageId);
                    } catch (e) {}
                    const newMessage = await ctx.reply(text, keyboard);
                    state.messageIds = [newMessage.message_id];
                } else {
                    const newMessage = await ctx.reply(text, keyboard);
                    state.messageIds = [newMessage.message_id];
                }

                mediaGroups.delete(mediaGroupId);
            }, 500);
        }
        await next();
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];

        if (!state || !state.step) {
            return;
        }

        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();

        switch (state.step) {
            case 'enterInviteCode':
                const code = ctx.message.text.trim();
                const inviteData = await validateInviteCode(code);
                if (!inviteData) {
                    const message = await ctx.reply('Неверный или уже использованный код. Попробуйте снова:');
                    state.messageIds.push(message.message_id);
                    return;
                }
                const { organization, createdBy } = inviteData;
                users[userId].organization = organization;
                await saveUser(userId, users[userId]);
                await markInviteCodeAsUsed(code, userId);
                state.step = 'selectObjects';
                await showObjectSelection(ctx, userId, []);
                break;

            case 'enterFullName':
                const fullName = ctx.message.text.trim();
                users[userId].fullName = fullName;
                await saveUser(userId, users[userId]);

                const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
                state.messageIds.push(message.message_id);

                const inviteCodeData = await loadInviteCode(userId);
                const creatorId = inviteCodeData?.createdBy;
                const creator = creatorId ? users[creatorId] : null;
                const creatorFullName = creator ? creator.fullName : 'Неизвестно';

                const adminText = ${users[userId].fullName || 'Не указано'} - ${users[userId].position || 'Не указано'} (${users[userId].organization || 'Не указано'}) Объекты: ${users[userId].selectedObjects.join(', ') || 'Не выбраны'} Пригласительный код создан: ${creatorFullName}                .trim();
                await ctx.telegram.sendMessage(ADMIN_ID, 📝 НОВАЯ ЗАЯВКА\n${adminText}, Markup.inlineKeyboard([
                [Markup.button.callback(✅ Одобрить (${users[userId].fullName || 'Не указано'}), approve_${userId})],
                [Markup.button.callback(❌ Отклонить (${users[userId].fullName || 'Не указано'}), reject_${userId})]
            ]));
                ctx.state.userStates[userId] = { step: null, messageIds: [] };
                break;

            case 'editFullNameInput':
                try {
                    const newFullName = ctx.message.text.trim();
                    if (!newFullName) {
                        const message = await ctx.reply('ФИО не может быть пустым. Введите снова:');
                        state.messageIds.push(message.message_id);
                        return;
                    }

                    await clearPreviousMessages(ctx, userId);
                    users[userId].fullName = newFullName;
                    await saveUser(userId, users[userId]);

                    state.step = null;
                    state.messageIds = [];

                    await ctx.reply(Ваше ФИО изменено на "${newFullName}");
                    await showProfile(ctx);
                } catch (error) {
                    await ctx.reply('Произошла ошибка при изменении ФИО. Попробуйте снова.');
                }
                break;

            case 'customOrganizationInput':
                users[userId].organization = ctx.message.text.trim();
                users[userId].selectedObjects = [];
                await saveUser(userId, users[userId]);
                state.step = 'selectObjects';
                await showObjectSelection(ctx, userId, []);
                break;

            case 'changeOrganizationInput':
                const orgCode = ctx.message.text.trim();
                const newOrg = await validateInviteCode(orgCode);
                if (!newOrg) {
                    const orgMessage = await ctx.reply('Неверный или уже использованный код. Попробуйте снова:');
                    state.messageIds.push(orgMessage.message_id);
                    return;
                }
                users[userId].organization = newOrg.organization;
                users[userId].selectedObjects = [];
                await saveUser(userId, users[userId]);
                await markInviteCodeAsUsed(orgCode);
                state.step = 'selectObjects';
                await ctx.reply(Организация изменена на "${newOrg.organization}". Теперь выберите объекты:);
                await showObjectSelection(ctx, userId, []);
                break;

            case 'workDone':
                state.report.workDone = ctx.message.text.trim();
                state.step = 'materials';
                const workDoneMessage = await ctx.reply('💡 Введите информацию о поставленных материалах:');
                state.messageIds = [workDoneMessage.message_id];
                break;

            case 'materials':
                state.report.materials = ctx.message.text.trim();
                state.step = 'photos';
                state.mediaGroupIds = [];
                const photoMessage = await ctx.reply(
                    '📸 Прикрепите изображения к отчету или нажмите "Готово" для завершения',
                    Markup.inlineKeyboard([[Markup.button.callback('Готово', 'finish_report')]])
                );
                state.messageIds = [photoMessage.message_id];
                break;

            case 'editWorkDone':
                state.report.workDone = ctx.message.text.trim();
                state.step = 'editMaterials';
                const editWorkDoneMessage = await ctx.reply('💡 Введите новую информацию о поставленных материалах:');
                state.messageIds = [editWorkDoneMessage.message_id];
                break;

            case 'editMaterials':
                state.report.materials = ctx.message.text.trim();
                state.step = 'editPhotos';
                state.mediaGroupIds = [];
                const editMessage = await ctx.reply(
                    '📸 Прикрепите новые изображения к отчету или нажмите "Готово" для завершения',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('Удалить все фото', 'delete_all_photos')],
                        [Markup.button.callback('Готово', 'finish_edit_report')]
                    ])
                );
                state.messageIds = [editMessage.message_id];
                break;

            default:
                break;
        }
    });

    bot.on('photo', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state || (state.step !== 'photos' && state.step !== 'editPhotos') || ctx.message.media_group_id) return;

        const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        state.report.photos = state.report.photos || [];
        state.report.photos.push(photoId);

        if (state.mediaGroupIds && state.mediaGroupIds.length > 0) {
            for (const msgId of state.mediaGroupIds) {
                await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(e => {});
            }
            state.mediaGroupIds = [];
        }

        const mediaGroup = state.report.photos.map((photoId, index) => ({
            type: 'photo',
            media: photoId,
            caption: index === 0 ? Добавлено ${state.report.photos.length} фото: : undefined
    }));
        const mediaGroupMessages = await ctx.telegram.sendMediaGroup(ctx.chat.id, mediaGroup);
        state.mediaGroupIds = mediaGroupMessages.map(msg => msg.message_id);

        const text = 'Фото добавлено. Отправьте еще или нажмите "Готово" для завершения.';
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('Готово', state.step === 'photos' ? 'finish_report' : 'finish_edit_report')]
        ]);

        if (state.messageIds && state.messageIds.length > 0) {
            const existingMessageId = state.messageIds[0];
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, existingMessageId);
            } catch (e) {}
            const newMessage = await ctx.reply(text, keyboard);
            state.messageIds = [newMessage.message_id];
        } else {
            const newMessage = await ctx.reply(text, keyboard);
            state.messageIds = [newMessage.message_id];
        }
    });

    bot.action('finish_report', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state || state.step !== 'photos') return;

        if (state.mediaGroupIds && state.mediaGroupIds.length > 0) {
            for (const msgId of state.mediaGroupIds) {
                await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(e => {});
            }
        }
        await clearPreviousMessages(ctx, userId);
        state.mediaGroupIds = [];
        state.messageIds = [];

        const users = await loadUsers();

        const date = new Date();
        const formattedDate = formatDate(date);
        const timestamp = date.toISOString();
        const reportId = ${formattedDate.replace(/\./g, '_')}_${users[userId].nextReportId++};
        const report = {
            reportId,
            userId,
            objectName: state.report.objectName,
            date: formattedDate,
            timestamp,
            workDone: state.report.workDone,
            materials: state.report.materials,
            groupMessageIds: {},
            messageLink: null,
            fullName: users[userId].fullName,
            photos: state.report.photos || []
        };
        const reportText = `
📅 ОТЧЕТ ЗА ${formattedDate}

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
        const userOrg = users[userId].organization;
        const targetOrgs = [
            userOrg,
            ...ORGANIZATIONS_LIST.filter(org => GENERAL_GROUP_CHAT_IDS[org]?.reportSources?.includes(userOrg))
        ];
        const allChatIds = [...new Set([groupChatId, ...targetOrgs.map(org => GENERAL_GROUP_CHAT_IDS[org]?.chatId || GENERAL_GROUP_CHAT_IDS['default'].chatId])];

        const tempMessage = await ctx.reply('⏳ Отправка отчета в группы...');
        const userMessageIds = [tempMessage.message_id];

        let userMediaGroupIds = [];
        if (report.photos.length > 0) {
            const mediaGroup = report.photos.map((photoId, index) => ({
                type: 'photo',
                media: photoId,
                caption: index === 0 ? reportText.slice(0, 1024) : undefined
            }));
            const userMediaGroup = await ctx.telegram.sendMediaGroup(ctx.chat.id, mediaGroup);
            userMediaGroupIds = userMediaGroup.map(msg => msg.message_id);

            for (const chatId of allChatIds) {
                try {
                    const messages = await ctx.telegram.sendMediaGroup(chatId, mediaGroup);
                    report.groupMessageIds[chatId] = messages[0].message_id;
                    if (chatId === groupChatId) {
                        report.messageLink = https://t.me/c/${chatId.toString().replace('-', '')}/${messages[0].message_id};
                    }
                } catch (e) {
                    console.error(Ошибка отправки медиа-группы в чат ${chatId}:, e);
                }
            }
        } else {
            for (const chatId of allChatIds) {
                try {
                    const message = await ctx.telegram.sendMessage(chatId, reportText);
                    report.groupMessageIds[chatId] = message.message_id;
                    if (chatId === groupChatId) {
                        report.messageLink = https://t.me/c/${chatId.toString().replace('-', '')}/${message.message_id};
                    }
                } catch (e) {
                    console.error(Ошибка отправки сообщения в чат ${chatId}:, e);
                }
            }
        }

        await saveReport(userId, report);
        await saveUser(userId, users[userId]);

        const finalMessage = await ctx.reply(✅ Ваш отчет опубликован:\n\n${reportText}${report.photos.length > 0 ? '\n(С изображениями)' : ''});
        userMessageIds.push(finalMessage.message_id);

        const allUserMessageIds = [...userMessageIds, ...userMediaGroupIds];
        for (const msgId of allUserMessageIds) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, msgId);
            } catch (e) {}
        }

        delete ctx.state.userStates[userId];
        await showMainMenu(ctx);
    });

    bot.action('delete_all_photos', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state || state.step !== 'editPhotos') return;

        if (state.mediaGroupIds && state.mediaGroupIds.length > 0) {
            for (const msgId of state.mediaGroupIds) {
                await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(e => {});
            }
            state.mediaGroupIds = [];
        }
        await clearPreviousMessages(ctx, userId);

        state.report.photos = [];

        const newMessage = await ctx.reply(
            'Все фото удалены. Отправьте новые или нажмите "Готово" для завершения.',
            Markup.inlineKeyboard([
                [Markup.button.callback('Готово', 'finish_edit_report')]
            ])
        );
        state.messageIds = [newMessage.message_id];
    });

    bot.action('finish_edit_report', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state || state.step !== 'editPhotos') return;

        if (state.mediaGroupIds && state.mediaGroupIds.length > 0) {
            for (const msgId of state.mediaGroupIds) {
                await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(e => {});
            }
        }
        await clearPreviousMessages(ctx, userId);
        state.mediaGroupIds = [];
        state.messageIds = [];

        const users = await loadUsers();

        const newTimestamp = new Date().toISOString();
        const formattedDate = parseAndFormatDate(state.report.date);
        const newReportId = ${formattedDate.replace(/\./g, '_')}_${users[userId].nextReportId++};
        const newReport = {
            reportId: newReportId,
            userId,
            objectName: state.report.objectName,
            date: formattedDate,
            timestamp: newTimestamp,
            workDone: state.report.workDone,
            materials: state.report.materials,
            groupMessageIds: {},
            messageLink: null,
            fullName: users[userId].fullName,
            photos: state.report.photos || []
        };
        const newReportText = `
📅 ОТЧЕТ ЗА ${formattedDate} (ОБНОВЛЁН)

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
                    await ctx.telegram.deleteMessage(chatId, msgId).catch(e => {});
                }
                const db = await connectMongo();
                const reportsCollection = db.collection('reports');
                await reportsCollection.deleteOne({ reportid: oldReportId });
            }
        }

        const newGroupChatId = OBJECT_GROUPS[newReport.objectName] || GENERAL_GROUP_CHAT_IDS['default'].chatId;
        const userOrg = users[userId].organization;
        const targetOrgs = [
            userOrg,
            ...ORGANIZATIONS_LIST.filter(org => GENERAL_GROUP_CHAT_IDS[org]?.reportSources?.includes(userOrg))
        ];
        const allChatIds = [...new Set([newGroupChatId, ...targetOrgs.map(org => GENERAL_GROUP_CHAT_IDS[org]?.chatId || GENERAL_GROUP_CHAT_IDS['default'].chatId])];

        if (newReport.photos.length > 0) {
            const mediaGroup = newReport.photos.map((photoId, index) => ({
                type: 'photo',
                media: photoId,
                caption: index === 0 ? newReportText.slice(0, 1024) : undefined
            }));
            for (const chatId of allChatIds) {
                try {
                    const messages = await ctx.telegram.sendMediaGroup(chatId, mediaGroup);
                    newReport.groupMessageIds[chatId] = messages[0].message_id;
                    if (chatId === newGroupChatId) {
                        newReport.messageLink = https://t.me/c/${chatId.toString().replace('-', '')}/${messages[0].message_id};
                    }
                } catch (e) {
                    console.error(Ошибка отправки медиа-группы в чат ${chatId}:, e);
                }
            }
        } else {
            for (const chatId of allChatIds) {
                try {
                    const message = await ctx.telegram.sendMessage(chatId, newReportText);
                    newReport.groupMessageIds[chatId] = message.message_id;
                    if (chatId === newGroupChatId) {
                        newReport.messageLink = https://t.me/c/${chatId.toString().replace('-', '')}/${message.message_id};
                    }
                } catch (e) {
                    console.error(Ошибка отправки сообщения в чат ${chatId}:, e);
                }
            }
        }

        await saveReport(userId, newReport);
        await saveUser(userId, users[userId]);
        await ctx.reply(✅ Ваш отчёт обновлён:\n\n${newReportText}${newReport.photos.length > 0 ? '\n(С изображениями)' : ''}, Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]
        ]));
        state.step = null;
        state.report = {};
    });
};
