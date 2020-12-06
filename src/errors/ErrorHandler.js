module.exports = ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`ERROR: ${error.stack}`);

    return handlerInput.responseBuilder
      .speak(`I'm Sorry, I'm having trouble helping you. Please try again later.`)
      .withShouldEndSession(true)
      .getResponse();
  }
};
