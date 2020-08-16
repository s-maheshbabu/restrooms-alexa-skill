const Alexa = require('ask-sdk-core');

const getFirstResolvedEntityValue = (element) => {
    const [firstResolution = {}] = element.resolutions.resolutionsPerAuthority || [];
    return firstResolution && firstResolution.status.code === 'ER_SUCCESS_MATCH'
        ? firstResolution.values[0].value.name
        : null;
};

const getFirstResolvedEntityId = (element) => {
    const [firstResolution = {}] = element.resolutions.resolutionsPerAuthority || [];
    return firstResolution && firstResolution.status.code === 'ER_SUCCESS_MATCH'
        ? firstResolution.values[0].value.id
        : null;
};

const getReadableSlotValue = (requestEnvelope, slotName) => {
    const rootSlotValue = Alexa.getSlotValueV2(requestEnvelope, slotName);
    const slotValueStr = !rootSlotValue
        ? 'None'
        : Alexa.getSimpleSlotValues(rootSlotValue)
            .map(
                (slotValue) =>
                    getFirstResolvedEntityValue(slotValue) || `${slotValue.value}`
            )
            .join(' ');
    console.log(JSON.stringify(Alexa.getSimpleSlotValues(rootSlotValue)))
    return `${slotName} ${slotValueStr}`;
};

const getReadableSlotId = (requestEnvelope, slotName) => {
    const rootSlotValue = Alexa.getSlotValueV2(requestEnvelope, slotName);
    const slotIdStr = !rootSlotValue
        ? 'None'
        : Alexa.getSimpleSlotValues(rootSlotValue)
            .map(
                (slotValue) =>
                    getFirstResolvedEntityId(slotValue) || `${slotValue.id}`
            )
            .join(' ');
    return `${slotIdStr}`;
};

/**
 * Helper method to find if a request is for a certain apiName.
 */
const isApiRequest = (handlerInput, apiName) => {
    try {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'Dialog.API.Invoked'
            && handlerInput.requestEnvelope.request.apiRequest.name === apiName;
    } catch (e) {
        console.log('Error occurred: ', e);
        return false;
    }
}

/**
 * Helper method to get API arguments from the request envelope.
 */
const getApiArguments = (handlerInput) => {
    try {
        return handlerInput.requestEnvelope.request.apiRequest.arguments;
    } catch (e) {
        console.log('Error occurred: ', e);
        return false;
    }
}

/**
 * Helper method to get API slots from the request envelope.
 */
const getSlots = (handlerInput) => {
    try {
        return handlerInput.requestEnvelope.request.apiRequest.slots;
    } catch (e) {
        console.log('Error occurred: ', e);
        return false;
    }
}
const shuffle = (array) => {
    var currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
};

const cleanupForVisualPresentation = (input) => {
    const regex = /<.*?>/gi;
    return input.replace(regex, '');
};

module.exports = {
    isApiRequest: isApiRequest,
    getApiArguments: getApiArguments,
    getReadableSlotValue: getReadableSlotValue,
    getReadableSlotId: getReadableSlotId,
    getSlots: getSlots,
    cleanupForVisualPresentation: cleanupForVisualPresentation,
    shuffle: shuffle
};

