const Alexa = require('ask-sdk-core');
const { hasIn } = require('immutable');
var wordsToNumbers = require('words-to-numbers').wordsToNumbers;
const applinks = require("constants/Constants").applinks;

const skill_model = require("../skill-package/interactionModels/custom/en-US");
const UnparseableError = require('./errors/UnparseableError');

const slotSynonymsToIdMap = (slotTypeName) => {
    if (!hasIn(skill_model, ['interactionModel', 'languageModel', 'types'])) throw new ReferenceError("Unexpected skill model. Unable to find path to slots.");

    const slotTypes = skill_model.interactionModel.languageModel.types;
    if (!Array.isArray(slotTypes) || slotTypes.length == 0) return new Map();

    let synonymsToIdMap = new Map();
    for (var i = 0; i < slotTypes.length; i++) {
        if (slotTypes[i].name === slotTypeName) {

            const slotValues = slotTypes[i].values;
            slotValues.forEach(element => {
                const id = element.id;
                const synonyms = element.name.synonyms;
                synonyms.forEach(synonym => synonymsToIdMap.set(synonym, id));
            });
        }
    }

    return synonymsToIdMap;
};

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
 * Helper method to find if a request is an intent request.
 */
const isIntentRequest = (handlerInput) => {
    try {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    } catch (e) {
        console.log('Error occurred: ', e);
        return false;
    }
}

/**
 * Helper method to find if a request is an IntentRequest of the specified intent.
 */
const isIntent = (handlerInput, intentName) => {
    try {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === intentName;
    } catch (e) {
        console.log('Error occurred: ', e);
        return false;
    }
}

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
 * Helper method to determine if AppLinks interface is supported.
 */
const isAppLinksSupported = (handlerInput) => {
    return handlerInput.requestEnvelope.context[applinks.APP_LINK_INTERFACE] !== undefined;
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

/**
 * Alexa Conversations currently just gives a raw address string which cannot be 
 * used on Google Maps as is. So, we need to sanitize it a little bit so its looks
 * like a normal address.
 * For ex, 'six oh one union street' will be converted to '601 union street'.
 * @param {*} address to be sanitized.
 */
// This is a temporary measure until Alexa Conversations starts returning entity resolved addresses. 
const sanitizeAddress = (address) => {
    const unparseable_address_strings = [
        "first",
        "second",
        "third",
        "thirteenth",
        "fourth",
        "fourteenth",
        "fifteenth",
        "fifth",
        "sixth",
        "sixteenth",
        "seventeenth",
        "seventh",
        "eighteenth",
        "eighth",
        "nineteenth",
        "ninth",
        "tenth",
        "eleventh",
        "twelfth",
    ];

    if (!address) return '';

    if (unparseable_address_strings.some(unparseable => address.includes(unparseable))) {
        throw new UnparseableError(`${address} is not parseable`);
    }

    // Replace 'oh' with 'zero'
    address = address.replace(/ oh /gi, ' zero ');

    address = wordsToNumbers(address);

    // Remove spaces between adjacent digits.
    return address.replace(/(\d)\s+(?=\d)/g, '$1');
};

/**
 * Calculates the percentage of positive votes. 
 * Returns null if there are no votes registered for the restroom or if
 * either of upvote/downvote field is missing.
 */
function determinePositiveRatingPercentage(restroom) {
    const upvotes = restroom.upvote;
    const downvotes = restroom.downvote;

    if (isNaN(upvotes) || isNaN(downvotes)) return null;
    if (upvotes === 0 && downvotes === 0) return null;
    return Math.floor((upvotes / (upvotes + downvotes)) * 100);
}

module.exports = {
    cleanupForVisualPresentation: cleanupForVisualPresentation,
    determinePositiveRatingPercentage: determinePositiveRatingPercentage,
    getApiArguments: getApiArguments,
    getReadableSlotId: getReadableSlotId,
    getReadableSlotValue: getReadableSlotValue,
    getSlots: getSlots,
    isApiRequest: isApiRequest,
    isAppLinksSupported: isAppLinksSupported,
    isIntent: isIntent,
    isIntentRequest: isIntentRequest,
    sanitizeAddress: sanitizeAddress,
    shuffle: shuffle,
    slotSynonymsToIdMap: slotSynonymsToIdMap,
};