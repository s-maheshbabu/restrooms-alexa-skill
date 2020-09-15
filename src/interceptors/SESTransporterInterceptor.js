const Mailer = require("gateway/Mailer.js");

module.exports = SESTransporterInterceptor = {
  process(handlerInput) {
    return Mailer.init();
  }
};
