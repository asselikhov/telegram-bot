// config.js
require('dotenv').config();

const ORGANIZATIONS_LIST = ['ООО "РСХ"', 'ООО "Строительные Системы"', 'ООО "РемонтСервис"'];

const OBJECTS_LIST_CYRILLIC = [
    'Кольцевой МНПП, 132км',
    'Ярославль-Москва, 201-204км',
    'Ярославль-Кириши1, 115-132км',
    'Никулино-Пенза, 881-886км',
    'Ростовка-Никольское, 595-608км',
    'Журавлинская-Никулино, 706-745км'
];

// Привязка объектов к организациям
const ORGANIZATION_OBJECTS = {
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
};

// Привязка организаций к их общим чатам и источникам отчётов
const GENERAL_GROUP_CHAT_IDS = {
    'ООО "РСХ"': {
        chatId: '-1002266023014', // Чат для ООО "РСХ" (ранее GENERAL_GROUP_CHAT_ID)
        reportSources: ['ООО "РемонтСервис"'] // Получает отчёты от этих организаций
    },
    'ООО "Строительные Системы"': {
        chatId: '-1002669271159', // Пример другого ID чата
        reportSources: ['ООО "РСХ"', 'ООО "РемонтСервис"'] // Получает отчёты от этих организаций
    },
    'ООО "РемонтСервис"': {
        chatId: '-1002669271159', // Пример другого ID чата
        reportSources: ['ООО "РСХ"'] // Получает отчёты от этих организаций
    },
    'default': {
        chatId: '-1002669271159', // Резервный чат
        reportSources: []
    }
};

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    ADMIN_ID: process.env.ADMIN_ID || '942851377',
    DATABASE_URL: process.env.DATABASE_URL,
    PORT: process.env.PORT || 3000,
    OBJECTS_LIST_CYRILLIC,
    BASE_POSITIONS_LIST: ['Производитель работ', 'Руководитель проекта', 'Начальник участка', 'Делопроизводитель', 'Инженер МТО', 'Инженер ПТО', 'Инженер СКК', 'Главный инженер'],
    ORGANIZATIONS_LIST,
    GENERAL_GROUP_CHAT_IDS, // Заменяем старый GENERAL_GROUP_CHAT_ID
    OBJECT_GROUPS: {
        'Кольцевой МНПП, 132км': '-1002394790037',
        'Ярославль-Москва, 201-204км': '-1002318741372',
        'Ярославль-Кириши1, 115-132км': '-1002153878927',
        'Никулино-Пенза, 881-886км': '-1002597582709',
        'Ростовка-Никольское, 595-608км': '-1002627066168',
        'Журавлинская-Никулино, 706-745км': '-1002506378789'
    },
    ORGANIZATION_OBJECTS
};