const userStates = {};

function getState(userId) {
    if (!userStates[userId]) {
        userStates[userId] = { step: null, selectedObjects: [], report: {}, messageIds: [] };
    }
    return userStates[userId];
}

function resetState(userId) {
    userStates[userId] = { step: null, selectedObjects: [], report: {}, messageIds: [] };
}

module.exports = { getState, resetState };