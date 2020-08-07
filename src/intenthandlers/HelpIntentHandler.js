module.exports = HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === "IntentRequest" &&
      handlerInput.requestEnvelope.request.intent.name === "AMAZON.HelpIntent"
    );
  },
  handle(handlerInput) {
    const { responseBuilder } = handlerInput;

    const helpText = `Help Text`;
    const helpRepromptText = `More Help Text`;

    return responseBuilder
      .speak(helpText)
      .reprompt(helpRepromptText)
      .withShouldEndSession(false)
      .withSimpleCard(
        `Restrooms`,
        `Card Text`
      )
      .getResponse();
  }
};
