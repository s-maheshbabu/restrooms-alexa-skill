const utilities = require("../utilities");

module.exports = CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return utilities.isIntent(handlerInput, 'AMAZON.CancelIntent') ||
      utilities.isIntent(handlerInput, 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .withShouldEndSession(true)
      .getResponse();
  }
};
