const RR = require("gateway/refugeeRestrooms");

module.exports = FindRestroomNearMeIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === "IntentRequest" &&
      (handlerInput.requestEnvelope.request.intent.name === "FindRestroomNearMeIntent")
    );
  }, handle(handlerInput) {
    const { responseBuilder } = handlerInput;
    const restrooms = RR.searchRestroomsByLatLon();

    return responseBuilder
      .speak(`Placeholder response ${JSON.stringify(restrooms[0])}`)
      .withShouldEndSession(true)
      .getResponse();
  }
}