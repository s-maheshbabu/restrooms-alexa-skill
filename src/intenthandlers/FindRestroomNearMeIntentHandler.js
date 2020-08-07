module.exports = FindRestroomNearMeIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === "IntentRequest" &&
      (handlerInput.requestEnvelope.request.intent.name === "FindRestroomNearMeIntent")
    );
  }, handle(handlerInput) {
    const { responseBuilder } = handlerInput;

    return responseBuilder
      .speak("Placeholder response FindRestroomNearMeIntent")
      .withShouldEndSession(true)
      .getResponse();
  }
}