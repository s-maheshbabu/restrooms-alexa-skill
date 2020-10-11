const Alexa = require('ask-sdk-core');

module.exports = SessionResumedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionResumedRequest';
  },
  handle(handlerInput) {
    console.log("Session Resumed: " + JSON.stringify(handlerInput.requestEnvelope));

    const cause = handlerInput.requestEnvelope.request.cause;
    console.log("Session Resumption Cause:" + cause);

    if (cause != null) {
      console.log("AppLink Primary result: " + JSON.stringify(cause.result.primary));
      console.log("AppLink Fallback result: " + JSON.stringify(cause.result.fallback));

      if (cause.result.primary.status === "FAILURE" && cause.result.fallback.status === "FAILURE") {
        return handlerInput.responseBuilder
          .speak("Sorry, I couldn't load the directions. Please try again later.")
          .withShouldEndSession(true)
          .getResponse();
      }
    }

    return handlerInput.responseBuilder
      .withShouldEndSession(true)
      .getResponse();
  }
};
