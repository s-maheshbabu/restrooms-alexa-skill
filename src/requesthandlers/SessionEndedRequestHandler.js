const Alexa = require('ask-sdk-core');

module.exports = SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';

  },
  handle(handlerInput) {
    console.log(`Session ended! State when session ended: ${JSON.stringify(handlerInput.attributesManager.getSessionAttributes())}`);

    return handlerInput.responseBuilder.getResponse();
  }
};
