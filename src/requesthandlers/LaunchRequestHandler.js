// Probably not needed?
module.exports = LaunchRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === "LaunchRequest";
  },
  handle(handlerInput) {
    const { responseBuilder } = handlerInput;

    return responseBuilder
      .speak("Placeholder response Launch Request")
      .withShouldEndSession(true)
      .getResponse();
  }
};
