const zipcodes = require("gateway/Zipcodes");

module.exports = ZipcodesDataLoadInterceptor = {
  process(handlerInput) {
    return zipcodes.init();
  }
};
