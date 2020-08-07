module.exports = ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error(`Error handled: ${error.message}`);

    return handlerInput.responseBuilder
      .speak("Sorry, I didn't get that. Please try again.")
      .reprompt("Sorry, I didn't get that. Please try again.")
      .withShouldEndSession(true)
      .getResponse();
  }
};
