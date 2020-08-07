module.exports = FindRestroomIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === "IntentRequest" &&
      (handlerInput.requestEnvelope.request.intent.name === "FindRestroomIntent")
    );
  },
  handle(handlerInput) {
    const { responseBuilder } = handlerInput;

    return responseBuilder
      .speak("Placeholder response FindRestroomIntentHandler")
      .withShouldEndSession(true)
      .getResponse();
  }
}
