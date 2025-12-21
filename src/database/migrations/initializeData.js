const { createOrganization, organizationExists } = require('../organizationModel');
const { createPosition, positionExists } = require('../positionModel');
const { createObject, objectExists } = require('../objectModel');
const { addObjectToOrganization } = require('../organizationObjectModel');
const { updateNotificationSettings } = require('../notificationSettingsModel');

// Импортируем старые константы из config.js для миграции
const OLD_CONFIG = {
    ORGANIZATIONS_LIST: ['ООО "РСХ"', 'ООО "Строительные Системы"', 'ООО "РемонтСервис"'],
    BASE_POSITIONS_LIST: ['Производитель работ', 'Руководитель проекта', 'Инженер МТО', 'Инженер ПТО', 'Инженер СКК', 'Отдел бухгалтерии', 'Отдел главного механика'],
    OBJECTS_LIST_CYRILLIC: [
        'Кольцевой МНПП, 132км',
        'Ярославль-Москва, 201-204км',
        'Ярославль-Кириши1, 115-132км',
        'Никулино-Пенза, 881-886км',
        'Ростовка-Никольское, 595-608км',
        'Журавлинская-Никулино, 706-745км'
    ],
    ORGANIZATION_OBJECTS: {
        'ООО "РСХ"': [
            'Кольцевой МНПП, 132км',
            'Ярославль-Москва, 201-204км',
            'Ярославль-Кириши1, 115-132км',
            'Никулино-Пенза, 881-886км',
            'Ростовка-Никольское, 595-608км',
            'Журавлинская-Никулино, 706-745км'
        ],
        'ООО "Строительные Системы"': [
            'Кольцевой МНПП, 132км',
            'Ярославль-Москва, 201-204км'
        ],
        'ООО "РемонтСервис"': [
            'Кольцевой МНПП, 132км',
            'Ярославль-Москва, 201-204км'
        ]
    },
    GENERAL_GROUP_CHAT_IDS: {
        'ООО "РСХ"': {
            chatId: '-1002266023014',
            reportSources: ['ООО "РемонтСервис"']
        },
        'ООО "Строительные Системы"': {
            chatId: '-1002669271159',
            reportSources: ['ООО "РСХ"', 'ООО "РемонтСервис"']
        },
        'ООО "РемонтСервис"': {
            chatId: '-1002669271159',
            reportSources: ['ООО "РСХ"']
        }
    },
    OBJECT_GROUPS: {
        'Кольцевой МНПП, 132км': '-1002394790037',
        'Ярославль-Москва, 201-204км': '-1002318741372',
        'Ярославль-Кириши1, 115-132км': '-1002153878927',
        'Никулино-Пенза, 881-886км': '-1002597582709',
        'Ростовка-Никольское, 595-608км': '-1002627066168',
        'Журавлинская-Никулино, 706-745км': '-1002506378789'
    }
};

/**
 * Инициализирует данные в MongoDB из старых констант config.js
 * Выполняется только если данных еще нет в БД
 */
async function initializeData() {
    console.log('Начало инициализации данных...');
    
    try {
        // Миграция организаций
        console.log('Миграция организаций...');
        for (const orgName of OLD_CONFIG.ORGANIZATIONS_LIST) {
            if (!(await organizationExists(orgName))) {
                const orgData = OLD_CONFIG.GENERAL_GROUP_CHAT_IDS[orgName] || {};
                await createOrganization({
                    name: orgName,
                    chatId: orgData.chatId || null,
                    reportSources: orgData.reportSources || []
                });
                console.log(`  Создана организация: ${orgName}`);
            } else {
                console.log(`  Организация уже существует: ${orgName}`);
            }
        }
        
        // Миграция должностей (создаем для каждой организации)
        console.log('Миграция должностей...');
        for (const orgName of OLD_CONFIG.ORGANIZATIONS_LIST) {
            for (const positionName of OLD_CONFIG.BASE_POSITIONS_LIST) {
                // Проверяем, существует ли должность для этой организации
                const existingPos = await positionExists(orgName, positionName);
                if (!existingPos) {
                    await createPosition({
                        organization: orgName,
                        name: positionName,
                        isAdmin: false
                    });
                    console.log(`  Создана должность "${positionName}" для организации "${orgName}"`);
                } else {
                    console.log(`  Должность "${positionName}" уже существует для организации "${orgName}"`);
                }
            }
        }
        
        // Миграция объектов
        console.log('Миграция объектов...');
        for (const objectName of OLD_CONFIG.OBJECTS_LIST_CYRILLIC) {
            if (!(await objectExists(objectName))) {
                const telegramGroupId = OLD_CONFIG.OBJECT_GROUPS[objectName] || null;
                await createObject({
                    name: objectName,
                    telegramGroupId: telegramGroupId
                });
                console.log(`  Создан объект: ${objectName}`);
            } else {
                console.log(`  Объект уже существует: ${objectName}`);
            }
        }
        
        // Миграция связей организация-объекты
        console.log('Миграция связей организация-объекты...');
        for (const [orgName, objects] of Object.entries(OLD_CONFIG.ORGANIZATION_OBJECTS)) {
            for (const objectName of objects) {
                try {
                    await addObjectToOrganization(orgName, objectName);
                    console.log(`  Связь создана: ${orgName} -> ${objectName}`);
                } catch (error) {
                    // Игнорируем ошибки дубликатов
                    if (error.code !== 11000) {
                        console.error(`  Ошибка создания связи ${orgName} -> ${objectName}:`, error.message);
                    }
                }
            }
        }
        
        // Инициализация настроек уведомлений (всегда обновляем, если еще не существует)
        console.log('Инициализация настроек уведомлений...');
        await updateNotificationSettings({
            id: 'default',
            enabled: true,
            time: '19:00',
            timezone: 'Europe/Moscow',
            messageTemplate: '⚠️ Напоминание\n<blockquote>{fullName},\nвы не предоставили отчет за {date}г.\n\nПожалуйста, внесите данные.</blockquote>'
        });
        console.log('  Настройки уведомлений инициализированы');
        
        console.log('Инициализация данных завершена успешно!');
        return true;
    } catch (error) {
        console.error('Ошибка при инициализации данных:', error);
        throw error;
    }
}

/**
 * Проверяет, была ли выполнена инициализация данных
 */
async function isDataInitialized() {
    const { getAllOrganizations } = require('../organizationModel');
    const { getAllPositionsGlobally } = require('../positionModel');
    const { getAllObjects } = require('../objectModel');
    
    const organizations = await getAllOrganizations();
    const positions = await getAllPositionsGlobally();
    const objects = await getAllObjects();
    
    return organizations.length > 0 || positions.length > 0 || objects.length > 0;
}

module.exports = {
    initializeData,
    isDataInitialized
};

