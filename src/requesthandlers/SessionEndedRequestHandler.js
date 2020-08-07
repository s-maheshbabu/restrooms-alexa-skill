const util = require('util');

module.exports = SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === "SessionEndedRequest";
  },
  handle(handlerInput) {
    console.log(`Session ended! State when session ended: ${JSON.stringify(handlerInput.attributesManager.getSessionAttributes())}`);

    return handlerInput.responseBuilder.getResponse();
  }
};
