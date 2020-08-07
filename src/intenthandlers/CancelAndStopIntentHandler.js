module.exports = CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === "IntentRequest" &&
      (handlerInput.requestEnvelope.request.intent.name ===
        "AMAZON.CancelIntent" ||
        handlerInput.requestEnvelope.request.intent.name ===
        "AMAZON.StopIntent")
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .withShouldEndSession(true)
      .getResponse();
  }
};
