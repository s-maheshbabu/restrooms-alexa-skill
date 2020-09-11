const hasIn = require("immutable").hasIn;

/**
 * Sanitize the response. Retains the APL directives only if the
 * device supports APL.
 */
module.exports = ResponseSanitizationInterceptor = {
  process(handlerInput, response) {
    const { requestEnvelope } = handlerInput;
    if (
      !hasIn(requestEnvelope, [
        "context",
        "System",
        "device",
        "supportedInterfaces",
        "Alexa.Presentation.APL"
      ])
    ) {
      response.directives = undefined;
    }

    return Promise.resolve();
  }
};
