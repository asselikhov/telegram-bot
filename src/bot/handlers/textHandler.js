const { Markup } = require('telegraf');
const { connectMongo } = require('../../config/mongoConfig');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages, formatDate, parseAndFormatDate } = require('../utils');
const { loadInviteCode, markInviteCodeAsUsed, validateInviteCode } = require('../../database/inviteCodeModel');
const { showObjectSelection } = require('../actions/objects');
const { showProfile, showMainMenu } = require('./menu');
const { saveReport, loadUserReports } = require('../../database/reportModel');
const { ADMIN_ID } = require('../../config/config');
const {
    createOrganization, updateOrganization, organizationExists
} = require('../../database/organizationModel');
const {
    createPosition, updatePosition, positionExists
} = require('../../database/positionModel');
const {
    createObject, updateObject, objectExists
} = require('../../database/objectModel');
const {
    clearConfigCache, getObjectGroups, getGeneralGroupChatIds, getAllOrganizationObjectsMap, getNotificationSettings
} = require('../../database/configService');
const {
    updateNotificationSettings
} = require('../../database/notificationSettingsModel');
const {
    validateTimeFormat
} = require('../utils/notificationHelper');

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
                    caption: index === 0 ? `Добавлено ${state.report.photos.length} фото:` : undefined
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
                if (!fullName) {
                    const message = await ctx.reply('ФИО не может быть пустым. Введите снова:');
                    state.messageIds.push(message.message_id);
                    return;
                }
                users[userId].fullName = fullName;
                await saveUser(userId, users[userId]);
                
                state.step = 'enterPhone';
                const phoneMessage = await ctx.reply('Введите ваш контактный телефон:');
                state.messageIds.push(phoneMessage.message_id);
                break;
                
            case 'enterPhone':
                const phone = ctx.message.text.trim();
                if (!phone) {
                    const message = await ctx.reply('Телефон не может быть пустым. Введите снова:');
                    state.messageIds.push(message.message_id);
                    return;
                }
                users[userId].phone = phone;
                await saveUser(userId, users[userId]);

                const message = await ctx.reply('Ваша заявка на рассмотрении, ожидайте');
                state.messageIds.push(message.message_id);

                const inviteCodeData = await loadInviteCode(userId);
                const creatorId = inviteCodeData?.createdBy;
                const creator = creatorId ? users[creatorId] : null;
                const creatorFullName = creator ? creator.fullName : 'Неизвестно';

                const adminText = `
${users[userId].fullName || 'Не указано'} - ${users[userId].position || 'Не указано'} (${users[userId].organization || 'Не указано'})
📞 Телефон: ${users[userId].phone || 'Не указан'}
Объекты: ${users[userId].selectedObjects.join(', ') || 'Не выбраны'}
Пригласительный код создан: ${creatorFullName}
                `.trim();
                await ctx.telegram.sendMessage(ADMIN_ID, `📝 НОВАЯ ЗАЯВКА\n${adminText}`, Markup.inlineKeyboard([
                    [Markup.button.callback(`✅ Одобрить (${users[userId].fullName || 'Не указано'})`, `approve_${userId}`)],
                    [Markup.button.callback(`❌ Отклонить (${users[userId].fullName || 'Не указано'})`, `reject_${userId}`)]
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

                    await ctx.reply(`Ваше ФИО изменено на "${newFullName}"`);
                    await showProfile(ctx);
                } catch (error) {
                    await ctx.reply('Произошла ошибка при изменении ФИО. Попробуйте снова.');
                }
                break;
                
            case 'editPhoneInput':
                try {
                    const newPhone = ctx.message.text.trim();
                    if (!newPhone) {
                        const message = await ctx.reply('Телефон не может быть пустым. Введите снова:');
                        state.messageIds.push(message.message_id);
                        return;
                    }

                    await clearPreviousMessages(ctx, userId);
                    users[userId].phone = newPhone;
                    await saveUser(userId, users[userId]);

                    state.step = null;
                    state.messageIds = [];

                    await ctx.reply(`Ваш телефон изменен на "${newPhone}"`);
                    await showProfile(ctx);
                } catch (error) {
                    await ctx.reply('Произошла ошибка при изменении телефона. Попробуйте снова.');
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
                await ctx.reply(`Организация изменена на "${newOrg.organization}". Теперь выберите объекты:`);
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

            // Обработка админских шагов
            case 'admin_org_add_name':
                if (userId !== ADMIN_ID) break;
                try {
                    const orgName = ctx.message.text.trim();
                    if (!orgName) {
                        const msg = await ctx.reply('Название не может быть пустым. Введите снова:');
                        state.messageIds.push(msg.message_id);
                        return;
                    }
                    await createOrganization({ name: orgName, chatId: null, reportSources: [] });
                    clearConfigCache();
                    state.step = null;
                    await ctx.reply(`Организация "${orgName}" создана.`);
                    // Имитируем нажатие кнопки для отображения списка организаций
                    const adminModule = require('./admin');
                    if (adminModule.showOrganizationsList) {
                        await adminModule.showOrganizationsList(ctx);
                    } else {
                        await ctx.reply('Организация создана. Используйте кнопку "Управление организациями" для просмотра.');
                    }
                } catch (error) {
                    if (error.code === 11000) {
                        await ctx.reply('Организация с таким названием уже существует.');
                    } else {
                        await ctx.reply('Ошибка при создании организации: ' + error.message);
                    }
                }
                break;
                
            case 'admin_org_edit_name':
                if (userId !== ADMIN_ID) break;
                try {
                    const oldOrgName = state.adminSelectedOrgName;
                    if (!oldOrgName) {
                        await ctx.reply('Ошибка: организация не выбрана.');
                        state.step = null;
                        break;
                    }
                    const newOrgName = ctx.message.text.trim();
                    if (!newOrgName) {
                        const msg = await ctx.reply('Название не может быть пустым. Введите снова:');
                        state.messageIds.push(msg.message_id);
                        return;
                    }
                    
                    // Проверяем, не существует ли организация с таким названием
                    if (newOrgName !== oldOrgName) {
                        const orgExists = await organizationExists(newOrgName);
                        if (orgExists) {
                            const msg = await ctx.reply('Организация с таким названием уже существует. Введите другое название:');
                            state.messageIds.push(msg.message_id);
                            return;
                        }
                    }
                    
                    // Получаем текущую организацию
                    const { getOrganization } = require('../../database/organizationModel');
                    const currentOrg = await getOrganization(oldOrgName);
                    if (!currentOrg) {
                        await ctx.reply('Организация не найдена.');
                        state.step = null;
                        break;
                    }
                    
                    if (newOrgName !== oldOrgName) {
                        // Обновляем название организации
                        await updateOrganization(oldOrgName, { name: newOrgName });
                        // Обновляем у всех пользователей
                        const users = await loadUsers();
                        for (const [uid, user] of Object.entries(users)) {
                            if (user.organization === oldOrgName) {
                                user.organization = newOrgName;
                                await saveUser(uid, user);
                            }
                        }
                    }
                    
                    clearConfigCache();
                    state.step = null;
                    await ctx.reply(`Организация обновлена.${newOrgName !== oldOrgName ? ` Новое название: "${newOrgName}"` : ''}`);
                    const adminModule = require('./admin');
                    if (adminModule.showOrganizationsList) {
                        await adminModule.showOrganizationsList(ctx);
                    }
                } catch (error) {
                    await ctx.reply('Ошибка при редактировании организации: ' + error.message);
                    state.step = null;
                }
                break;
                
            case 'admin_org_edit_chatid':
                if (userId !== ADMIN_ID) break;
                try {
                    const orgName = state.adminSelectedOrgName;
                    if (!orgName) {
                        await ctx.reply('Ошибка: организация не выбрана.');
                        state.step = null;
                        break;
                    }
                    let chatId = ctx.message.text.trim();
                    if (chatId === '/clear') {
                        chatId = null;
                    } else if (chatId) {
                        // Проверяем формат (должно быть число или начинаться с минуса для групп)
                        if (!/^-?\d+$/.test(chatId)) {
                            const msg = await ctx.reply('Неверный формат ID чата. Введите числовой ID (например: -1001234567890) или /clear для очистки:');
                            state.messageIds.push(msg.message_id);
                            return;
                        }
                        chatId = chatId.toString();
                    }
                    
                    await updateOrganization(orgName, { chatId });
                    clearConfigCache();
                    state.step = null;
                    await ctx.reply(`ID чата организации "${orgName}" ${chatId ? `обновлен: ${chatId}` : 'очищен'}.`);
                    const adminModule = require('./admin');
                    if (adminModule.showOrganizationsList) {
                        await adminModule.showOrganizationsList(ctx);
                    }
                } catch (error) {
                    await ctx.reply('Ошибка при редактировании ID чата: ' + error.message);
                    state.step = null;
                }
                break;
                
            case 'admin_obj_edit_groupid':
                if (userId !== ADMIN_ID) break;
                try {
                    const objName = state.adminSelectedObjName;
                    if (!objName) {
                        await ctx.reply('Ошибка: объект не выбран.');
                        state.step = null;
                        break;
                    }
                    let telegramGroupId = ctx.message.text.trim();
                    if (telegramGroupId === '/clear') {
                        telegramGroupId = null;
                    } else if (telegramGroupId) {
                        // Проверяем формат (должно быть число или начинаться с минуса для групп)
                        if (!/^-?\d+$/.test(telegramGroupId)) {
                            const msg = await ctx.reply('Неверный формат ID группы. Введите числовой ID (например: -1001234567890) или /clear для очистки:');
                            state.messageIds.push(msg.message_id);
                            return;
                        }
                        telegramGroupId = telegramGroupId.toString();
                    }
                    
                    await updateObject(objName, { telegramGroupId });
                    clearConfigCache();
                    state.step = null;
                    await ctx.reply(`ID группы объекта "${objName}" ${telegramGroupId ? `обновлен: ${telegramGroupId}` : 'очищен'}.`);
                    // Возвращаемся к списку объектов
                    const adminModule = require('./admin');
                    if (adminModule.showObjectsList) {
                        await adminModule.showObjectsList(ctx);
                    }
                } catch (error) {
                    await ctx.reply('Ошибка при редактировании ID группы: ' + error.message);
                    state.step = null;
                }
                break;
                
            case 'admin_org_pos_add_name':
            case 'admin_pos_add_name': // Для обратной совместимости
                if (userId !== ADMIN_ID) break;
                try {
                    const orgName = state.adminSelectedOrgName;
                    if (!orgName) {
                        await ctx.reply('Ошибка: организация не выбрана.');
                        state.step = null;
                        break;
                    }
                    const posName = ctx.message.text.trim();
                    if (!posName) {
                        const msg = await ctx.reply('Название не может быть пустым. Введите снова:');
                        state.messageIds.push(msg.message_id);
                        return;
                    }
                    // Проверяем существование должности перед созданием
                    const { positionExists } = require('../../database/positionModel');
                    const exists = await positionExists(orgName, posName);
                    if (exists) {
                        await ctx.reply(`Должность "${posName}" уже существует в организации "${orgName}".`);
                        state.step = null;
                        break;
                    }
                    await createPosition({ organization: orgName, name: posName, isAdmin: false });
                    clearConfigCache();
                    state.step = null;
                    await ctx.reply(`Должность "${posName}" создана для организации "${orgName}".`);
                    // Возвращаемся к списку должностей организации
                    // Имитируем нажатие кнопки через отправку callback query
                    try {
                        await ctx.telegram.answerCallbackQuery('dummy');
                        // Создаем фейковый update для вызова обработчика
                        const { Markup } = require('telegraf');
                        const { getAllPositions } = require('../../database/positionModel');
                        await clearPreviousMessages(ctx, userId);
                        const positions = await getAllPositions(orgName);
                        state.adminPositionsList = positions.map(pos => pos.name);
                        state.adminSelectedOrgName = orgName;
                        
                        const buttons = [];
                        for (let index = 0; index < positions.length; index++) {
                            const pos = positions[index];
                            const buttonText = pos.name || `Должность ${index + 1}`;
                            const callbackData = `admin_org_pos_${index}`;
                            buttons.push([Markup.button.callback(buttonText, callbackData)]);
                        }
                        buttons.push([Markup.button.callback('➕ Добавить должность', 'admin_org_pos_add')]);
                        buttons.push([Markup.button.callback('↩️ Назад', 'admin_org_edit')]);
                        const message = await ctx.reply(`💼 Редактирование должностей\nОрганизация: **${orgName}**\n\nВыберите должность:`, {
                            parse_mode: 'Markdown',
                            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
                        });
                        state.messageIds.push(message.message_id);
                    } catch (error) {
                        await ctx.reply('Должность создана. Используйте кнопку "Редактирование должностей" для просмотра.');
                    }
                } catch (error) {
                    if (error.code === 11000) {
                        await ctx.reply('Должность с таким названием уже существует в этой организации.');
                    } else {
                        await ctx.reply('Ошибка при создании должности: ' + error.message);
                    }
                    state.step = null;
                }
                break;
                
            case 'admin_obj_add_name':
                if (userId !== ADMIN_ID) break;
                try {
                    const objName = ctx.message.text.trim();
                    if (!objName) {
                        const msg = await ctx.reply('Название не может быть пустым. Введите снова:');
                        state.messageIds.push(msg.message_id);
                        return;
                    }
                    await createObject({ name: objName, telegramGroupId: null });
                    clearConfigCache();
                    state.step = null;
                    state.nextStep = 'admin_obj_add_group';
                    const msg = await ctx.reply(`Объект "${objName}" создан. Введите ID Telegram группы (или /skip для пропуска):`);
                    state.messageIds.push(msg.message_id);
                } catch (error) {
                    if (error.code === 11000) {
                        await ctx.reply('Объект с таким названием уже существует.');
                    } else {
                        await ctx.reply('Ошибка при создании объекта: ' + error.message);
                    }
                }
                break;
                
            case 'admin_notif_edit_time':
            case 'admin_notif_edit_time_reports':
            case 'admin_notif_edit_time_statistics':
                if (userId !== ADMIN_ID) break;
                try {
                    const timeString = ctx.message.text.trim();
                    if (!validateTimeFormat(timeString)) {
                        const msg = await ctx.reply('Неверный формат времени. Используйте формат HH:mm (например, 19:00):');
                        state.messageIds.push(msg.message_id);
                        return;
                    }
                    const type = state.currentNotificationType || (state.step === 'admin_notif_edit_time' ? 'reports' : state.step.replace('admin_notif_edit_time_', ''));
                    await updateNotificationSettings(type, { time: timeString });
                    clearConfigCache();
                    state.step = null;
                    delete state.currentNotificationType;
                    const botInstance = require('../bot');
                    if (botInstance.setupAllNotificationCrons) await botInstance.setupAllNotificationCrons();
                    await ctx.reply(`Время уведомлений "${type === 'reports' ? 'Отчеты' : 'Статистика'}" изменено на ${timeString}.`);
                    // Возвращаемся к настройкам конкретного типа через имитацию callback
                    const { Markup } = require('telegraf');
                    // Вызываем обработчик выбора типа напрямую
                    if (type === 'reports') {
                        const { clearPreviousMessages } = require('../utils');
                        await clearPreviousMessages(ctx, userId);
                        const { getNotificationSettings } = require('../../database/configService');
                        const settings = await getNotificationSettings(type);
                        const enabledText = settings.enabled ? '✅ Включены' : '❌ Выключены';
                        let settingsText = `🔔 **Настройки уведомлений: Отчеты**\n\n${enabledText}\n⏰ Время: ${settings.time}\n🌍 Часовой пояс: ${settings.timezone}`;
                        if (settings.messageTemplate) {
                            settingsText += `\n📝 Шаблон сообщения:\n${settings.messageTemplate}`;
                        }
                        const buttons = [
                            [Markup.button.callback(settings.enabled ? '❌ Выключить' : '✅ Включить', 'admin_notif_toggle_reports')],
                            [Markup.button.callback('⏰ Изменить время', 'admin_notif_time_reports')],
                            [Markup.button.callback('📝 Изменить текст', 'admin_notif_text_reports')],
                            [Markup.button.callback('👁 Предпросмотр', 'admin_notif_preview_reports')],
                            [Markup.button.callback('↩️ Назад', 'admin_notifications')]
                        ];
                        const message = await ctx.reply(settingsText.trim(), {
                            parse_mode: 'Markdown',
                            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
                        });
                        ctx.state.userStates[userId].messageIds = [message.message_id];
                        ctx.state.userStates[userId].currentNotificationType = type;
                    } else {
                        const { clearPreviousMessages } = require('../utils');
                        await clearPreviousMessages(ctx, userId);
                        const { getNotificationSettings } = require('../../database/configService');
                        const settings = await getNotificationSettings(type);
                        const enabledText = settings.enabled ? '✅ Включены' : '❌ Выключены';
                        const settingsText = `🔔 **Настройки уведомлений: Статистика**\n\n${enabledText}\n⏰ Время: ${settings.time}\n🌍 Часовой пояс: ${settings.timezone}`;
                        const buttons = [
                            [Markup.button.callback(settings.enabled ? '❌ Выключить' : '✅ Включить', 'admin_notif_toggle_statistics')],
                            [Markup.button.callback('⏰ Изменить время', 'admin_notif_time_statistics')],
                            [Markup.button.callback('↩️ Назад', 'admin_notifications')]
                        ];
                        const message = await ctx.reply(settingsText.trim(), {
                            parse_mode: 'Markdown',
                            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
                        });
                        ctx.state.userStates[userId].messageIds = [message.message_id];
                        ctx.state.userStates[userId].currentNotificationType = type;
                    }
                } catch (error) {
                    await ctx.reply('Ошибка при изменении времени: ' + error.message);
                    state.step = null;
                    delete state.currentNotificationType;
                }
                break;
                
            case 'admin_notif_edit_text':
            case 'admin_notif_edit_text_reports':
                if (userId !== ADMIN_ID) break;
                try {
                    const template = ctx.message.text.trim();
                    if (!template) {
                        const msg = await ctx.reply('Текст не может быть пустым. Введите снова:');
                        state.messageIds.push(msg.message_id);
                        return;
                    }
                    const type = state.currentNotificationType || 'reports';
                    if (type !== 'reports') {
                        await ctx.reply('Изменение текста доступно только для уведомлений об отчетах.');
                        state.step = null;
                        delete state.currentNotificationType;
                        break;
                    }
                    await updateNotificationSettings(type, { messageTemplate: template });
                    clearConfigCache();
                    state.step = null;
                    delete state.currentNotificationType;
                    await ctx.reply('Шаблон сообщения обновлен.');
                    // Возвращаемся к настройкам отчетов
                    const { Markup } = require('telegraf');
                    const { clearPreviousMessages } = require('../utils');
                    await clearPreviousMessages(ctx, userId);
                    const { getNotificationSettings } = require('../../database/configService');
                    const settings = await getNotificationSettings('reports');
                    const enabledText = settings.enabled ? '✅ Включены' : '❌ Выключены';
                    let settingsText = `🔔 **Настройки уведомлений: Отчеты**\n\n${enabledText}\n⏰ Время: ${settings.time}\n🌍 Часовой пояс: ${settings.timezone}`;
                    if (settings.messageTemplate) {
                        settingsText += `\n📝 Шаблон сообщения:\n${settings.messageTemplate}`;
                    }
                    const buttons = [
                        [Markup.button.callback(settings.enabled ? '❌ Выключить' : '✅ Включить', 'admin_notif_toggle_reports')],
                        [Markup.button.callback('⏰ Изменить время', 'admin_notif_time_reports')],
                        [Markup.button.callback('📝 Изменить текст', 'admin_notif_text_reports')],
                        [Markup.button.callback('👁 Предпросмотр', 'admin_notif_preview_reports')],
                        [Markup.button.callback('↩️ Назад', 'admin_notifications')]
                    ];
                    const message = await ctx.reply(settingsText.trim(), {
                        parse_mode: 'Markdown',
                        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
                    });
                    ctx.state.userStates[userId].messageIds = [message.message_id];
                    ctx.state.userStates[userId].currentNotificationType = 'reports';
                } catch (error) {
                    await ctx.reply('Ошибка при изменении текста: ' + error.message);
                    state.step = null;
                    delete state.currentNotificationType;
                }
                break;
                
            // ========== АДМИН-ПАНЕЛЬ: РЕДАКТИРОВАНИЕ ПОЛЬЗОВАТЕЛЕЙ ==========
            case 'admin_user_edit_fullname':
                if (userId !== ADMIN_ID) break;
                try {
                    const targetUserId = state.adminSelectedUserId;
                    if (!targetUserId) {
                        await ctx.reply('Ошибка: пользователь не выбран.');
                        state.step = null;
                        break;
                    }
                    const fullName = ctx.message.text.trim();
                    if (!fullName) {
                        const msg = await ctx.reply('ФИО не может быть пустым. Введите снова:');
                        state.messageIds.push(msg.message_id);
                        return;
                    }
                    const users = await loadUsers();
                    if (users[targetUserId]) {
                        const oldValue = users[targetUserId].fullName;
                        users[targetUserId].fullName = fullName;
                        await saveUser(targetUserId, users[targetUserId]);
                        
                        // Логируем изменение
                        const { logUserChange } = require('../../database/auditLogModel');
                        await logUserChange(targetUserId, userId, 'update', 'fullName', oldValue, fullName);
                        
                        state.step = null;
                        await ctx.reply(`ФИО изменено на "${fullName}".`);
                        const adminModule = require('./admin');
                        if (adminModule.showUserDetails) {
                            const returnPage = state.adminUsersReturnPage || 0;
                            await adminModule.showUserDetails(ctx, targetUserId, returnPage);
                        }
                    }
                } catch (error) {
                    await ctx.reply('Ошибка при изменении ФИО: ' + error.message);
                }
                break;
                
            case 'admin_user_edit_phone':
                if (userId !== ADMIN_ID) break;
                try {
                    const targetUserId = state.adminSelectedUserId;
                    if (!targetUserId) {
                        await ctx.reply('Ошибка: пользователь не выбран.');
                        state.step = null;
                        break;
                    }
                    const phone = ctx.message.text.trim();
                    const users = await loadUsers();
                    if (users[targetUserId]) {
                        const oldValue = users[targetUserId].phone;
                        users[targetUserId].phone = phone;
                        await saveUser(targetUserId, users[targetUserId]);
                        
                        // Логируем изменение
                        const { logUserChange } = require('../../database/auditLogModel');
                        await logUserChange(targetUserId, userId, 'update', 'phone', oldValue, phone);
                        
                        state.step = null;
                        await ctx.reply(`Телефон изменен на "${phone}".`);
                        const adminModule = require('./admin');
                        if (adminModule.showUserDetails) {
                            const returnPage = state.adminUsersReturnPage || 0;
                            await adminModule.showUserDetails(ctx, targetUserId, returnPage);
                        }
                    }
                } catch (error) {
                    await ctx.reply('Ошибка при изменении телефона: ' + error.message);
                }
                break;
                
            case 'admin_user_edit_birthdate':
                if (userId !== ADMIN_ID) break;
                try {
                    const targetUserId = state.adminSelectedUserId;
                    if (!targetUserId) {
                        await ctx.reply('Ошибка: пользователь не выбран.');
                        state.step = null;
                        break;
                    }
                    const birthdateInput = ctx.message.text.trim();
                    
                    // Проверка на команду очистки
                    if (birthdateInput === '/clear') {
                        const users = await loadUsers();
                        if (users[targetUserId]) {
                            const oldValue = users[targetUserId].birthdate;
                            users[targetUserId].birthdate = null;
                            await saveUser(targetUserId, users[targetUserId]);
                            
                            // Логируем изменение
                            const { logUserChange } = require('../../database/auditLogModel');
                            await logUserChange(targetUserId, userId, 'update', 'birthdate', oldValue, null);
                            
                            state.step = null;
                            await ctx.reply('Дата рождения очищена.');
                            const adminModule = require('./admin');
                            if (adminModule.showUserDetails) {
                                const returnPage = state.adminUsersReturnPage || 0;
                                await adminModule.showUserDetails(ctx, targetUserId, returnPage);
                            }
                        }
                        break;
                    }
                    
                    // Валидация формата и корректности даты
                    const { validateBirthdate } = require('../utils');
                    const validation = validateBirthdate(birthdateInput);
                    if (!validation.valid) {
                        const msg = await ctx.reply(`${validation.error}\n\nВведите дату в формате ДД.ММ.ГГГГ (например, 15.05.1990) или /clear для очистки:`);
                        state.messageIds.push(msg.message_id);
                        return;
                    }
                    
                    const users = await loadUsers();
                    if (users[targetUserId]) {
                        const oldValue = users[targetUserId].birthdate;
                        users[targetUserId].birthdate = birthdateInput;
                        await saveUser(targetUserId, users[targetUserId]);
                        
                        // Логируем изменение
                        const { logUserChange } = require('../../database/auditLogModel');
                        await logUserChange(targetUserId, userId, 'update', 'birthdate', oldValue, birthdateInput);
                        
                        state.step = null;
                        await ctx.reply(`Дата рождения изменена на "${birthdateInput}".`);
                        const adminModule = require('./admin');
                        if (adminModule.showUserDetails) {
                            const returnPage = state.adminUsersReturnPage || 0;
                            await adminModule.showUserDetails(ctx, targetUserId, returnPage);
                        }
                    }
                } catch (error) {
                    await ctx.reply('Ошибка при изменении даты рождения: ' + error.message);
                    state.step = null;
                }
                break;
                
            // ========== АДМИН-ПАНЕЛЬ: ДОБАВЛЕНИЕ ПОЛЬЗОВАТЕЛЕЙ ==========
            case 'admin_user_add_telegramid':
                if (userId !== ADMIN_ID) break;
                try {
                    const telegramId = ctx.message.text.trim();
                    if (!telegramId || !/^\d+$/.test(telegramId)) {
                        const msg = await ctx.reply('Неверный формат Telegram ID. Введите числовой ID (например, 123456789):');
                        state.messageIds.push(msg.message_id);
                        return;
                    }
                    
                    // Проверяем, существует ли уже пользователь
                    const users = await loadUsers();
                    if (users[telegramId]) {
                        const msg = await ctx.reply('Пользователь с таким Telegram ID уже существует. Введите другой ID:');
                        state.messageIds.push(msg.message_id);
                        return;
                    }
                    
                    if (!state.adminNewUser) {
                        state.adminNewUser = {};
                    }
                    state.adminNewUser.telegramId = telegramId;
                    state.step = 'admin_user_add_fullname';
                    const msg = await ctx.reply('Введите ФИО нового пользователя:', Markup.inlineKeyboard([
                        [Markup.button.callback('↩️ Отмена', 'admin_users')]
                    ]));
                    state.messageIds.push(msg.message_id);
                } catch (error) {
                    await ctx.reply('Ошибка: ' + error.message);
                }
                break;
                
            case 'admin_user_add_fullname':
                if (userId !== ADMIN_ID) break;
                try {
                    const fullName = ctx.message.text.trim();
                    if (!fullName) {
                        const msg = await ctx.reply('ФИО не может быть пустым. Введите снова:');
                        state.messageIds.push(msg.message_id);
                        return;
                    }
                    state.adminNewUser.fullName = fullName;
                    // Сначала выбираем организацию, потом должности этой организации
                    const { getAllOrganizations } = require('../../database/organizationModel');
                    const organizations = await getAllOrganizations();
                    const { Markup } = require('telegraf');
                    const buttons = organizations.map((org, index) => [
                        Markup.button.callback(org.name, `admin_user_add_set_org_${index}`)
                    ]);
                    buttons.push([Markup.button.callback('↩️ Отмена', 'admin_users')]);
                    state.adminAddOrgs = organizations.map(org => org.name);
                    const msg = await ctx.reply('Выберите организацию:', Markup.inlineKeyboard(buttons));
                    state.messageIds.push(msg.message_id);
                    state.step = null; // Сбрасываем step, так как дальше работаем через кнопки
                } catch (error) {
                    await ctx.reply('Ошибка: ' + error.message);
                }
                break;
                
            case 'admin_user_add_phone':
                if (userId !== ADMIN_ID) break;
                try {
                    let phone = ctx.message.text.trim();
                    if (phone === '/skip') {
                        phone = '';
                    }
                    if (!state.adminNewUser) {
                        await ctx.reply('Ошибка: данные пользователя не найдены.');
                        state.step = null;
                        break;
                    }
                    state.adminNewUser.phone = phone;
                    
                    // Создаем пользователя
                    const newUser = {
                        fullName: state.adminNewUser.fullName,
                        position: state.adminNewUser.position,
                        organization: state.adminNewUser.organization,
                        selectedObjects: state.adminNewUser.selectedObjects || [],
                        status: 'В работе',
                        isApproved: 1, // Автоматически одобряем пользователя, добавленного админом
                        nextReportId: 1,
                        reports: {},
                        phone: phone || ''
                    };
                    
                    await saveUser(state.adminNewUser.telegramId, newUser);
                    state.step = null;
                    delete state.adminNewUser;
                    await ctx.reply(`✅ Пользователь "${newUser.fullName}" успешно добавлен.`);
                    
                    // Возвращаемся к списку пользователей
                    const adminModule = require('./admin');
                    if (adminModule.showUsersList) {
                        await adminModule.showUsersList(ctx, {}, 0);
                    }
                } catch (error) {
                    await ctx.reply('Ошибка при создании пользователя: ' + error.message);
                }
                break;
                
            // ========== АДМИН-ПАНЕЛЬ: ПОИСК ПОЛЬЗОВАТЕЛЕЙ ==========
            case 'admin_users_search_input':
                if (userId !== ADMIN_ID) break;
                try {
                    const searchQuery = ctx.message.text.trim();
                    const filters = ctx.state.userStates[userId].adminUserFilters || {};
                    filters.search = searchQuery;
                    ctx.state.userStates[userId].adminUserFilters = filters;
                    ctx.state.userStates[userId].adminUserSearch = searchQuery;
                    state.step = null;
                    await ctx.reply(`Поиск: "${searchQuery}"`);
                    const adminModule = require('./admin');
                    if (adminModule.showUsersList) {
                        await adminModule.showUsersList(ctx, filters, 0);
                    }
                } catch (error) {
                    await ctx.reply('Ошибка при поиске: ' + error.message);
                }
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
            caption: index === 0 ? `Добавлено ${state.report.photos.length} фото:` : undefined
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
        const reportId = `${formattedDate.replace(/\./g, '_')}_${users[userId].nextReportId++}`;
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

        const objectGroups = await getObjectGroups();
        const generalChatIds = await getGeneralGroupChatIds();
        const orgObjectsMap = await getAllOrganizationObjectsMap();
        const groupChatId = objectGroups[report.objectName] || generalChatIds['default']?.chatId || null;
        const userOrg = users[userId].organization;
        const targetOrgs = [
            userOrg,
            ...Object.keys(orgObjectsMap).filter(org => generalChatIds[org]?.reportSources?.includes(userOrg))
        ];
        const allChatIds = [...new Set([groupChatId, ...targetOrgs.map(org => generalChatIds[org]?.chatId || generalChatIds['default']?.chatId).filter(Boolean)])];

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
                        report.messageLink = `https://t.me/c/${chatId.toString().replace('-', '')}/${messages[0].message_id}`;
                    }
                } catch (e) {
                    console.error(`Ошибка отправки медиа-группы в чат ${chatId}:`, e);
                }
            }
        } else {
            for (const chatId of allChatIds) {
                try {
                    const message = await ctx.telegram.sendMessage(chatId, reportText);
                    report.groupMessageIds[chatId] = message.message_id;
                    if (chatId === groupChatId) {
                        report.messageLink = `https://t.me/c/${chatId.toString().replace('-', '')}/${message.message_id}`;
                    }
                } catch (e) {
                    console.error(`Ошибка отправки сообщения в чат ${chatId}:`, e);
                }
            }
        }

        await saveReport(userId, report);
        await saveUser(userId, users[userId]);

        const finalMessage = await ctx.reply(`✅ Ваш отчет опубликован:\n\n${reportText}${report.photos.length > 0 ? '\n(С изображениями)' : ''}`);
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
        const newReportId = `${formattedDate.replace(/\./g, '_')}_${users[userId].nextReportId++}`;
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

        const objectGroups = await getObjectGroups();
        const generalChatIds = await getGeneralGroupChatIds();
        const orgObjectsMap = await getAllOrganizationObjectsMap();
        const newGroupChatId = objectGroups[newReport.objectName] || generalChatIds['default']?.chatId || null;
        const userOrg = users[userId].organization;
        const targetOrgs = [
            userOrg,
            ...Object.keys(orgObjectsMap).filter(org => generalChatIds[org]?.reportSources?.includes(userOrg))
        ];
        const allChatIds = [...new Set([newGroupChatId, ...targetOrgs.map(org => generalChatIds[org]?.chatId || generalChatIds['default']?.chatId).filter(Boolean)])];

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
                        newReport.messageLink = `https://t.me/c/${chatId.toString().replace('-', '')}/${messages[0].message_id}`;
                    }
                } catch (e) {
                    console.error(`Ошибка отправки медиа-группы в чат ${chatId}:`, e);
                }
            }
        } else {
            for (const chatId of allChatIds) {
                try {
                    const message = await ctx.telegram.sendMessage(chatId, newReportText);
                    newReport.groupMessageIds[chatId] = message.message_id;
                    if (chatId === newGroupChatId) {
                        newReport.messageLink = `https://t.me/c/${chatId.toString().replace('-', '')}/${message.message_id}`;
                    }
                } catch (e) {
                    console.error(`Ошибка отправки сообщения в чат ${chatId}:`, e);
                }
            }
        }

        await saveReport(userId, newReport);
        await saveUser(userId, users[userId]);
        await ctx.reply(`✅ Ваш отчёт обновлён:\n\n${newReportText}${newReport.photos.length > 0 ? '\n(С изображениями)' : ''}`, Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Вернуться в личный кабинет', 'profile')]
        ]));
        state.step = null;
        state.report = {};
    });
};