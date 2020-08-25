module.exports = ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error(`Error handled: ${error.message}`);

    return handlerInput.responseBuilder
      .speak(`I'm Sorry, I'm having trouble helping you. Please try again later.`)
      .withShouldEndSession(true)
      .getResponse();
  }
};
