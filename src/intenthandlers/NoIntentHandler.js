const utilities = require("../utilities");
const states = require("constants/Constants").states;

/**
 * Handles NoIntent.
 * NoIntent is only expected in response to Maps directions being offered to the user. This
 * might change in the future though.
 */
module.exports = NoIntentHandler = {
  canHandle(handlerInput) {
    return utilities.isIntent(handlerInput, 'AMAZON.NoIntent');
  },
  handle(handlerInput) {
    const { attributesManager, responseBuilder } = handlerInput;

    const sessionAttributes = attributesManager.getSessionAttributes();
    const state = sessionAttributes.state;
    if (!state || states.OFFER_DIRECTIONS !== state)
      throw Error(`Session attributes is either missing or invalid state. State: ${state}.`);

    return responseBuilder
      .withShouldEndSession(true)
      .getResponse();
  }
};